"""Training API endpoints."""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path

import gymnasium as gym
import numpy as np

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.database import (
    delete_all_training_runs,
    delete_training_run,
    get_training_run,
    list_training_metrics,
    list_training_runs,
    update_training_run,
)
from backend.rl.export import export_model_to_onnx
from backend.rl.trainer import SUPPORTED_ALGORITHMS, training_manager
from backend.rl.templates import get_training_template, list_training_templates
from backend.simulation.gym_env import ContinuousRobotEnv, CurriculumRobotEnv, RobotEnv, VisitedGridWrapper
from backend.simulation.presets import (
    list_environment_profiles,
    list_model_profiles,
    register_environment_profile,
    register_model_profile,
)

router = APIRouter(tags=["training"])


class _TrimObsWrapper(gym.ObservationWrapper):
    """Trims observations to the first `n` dims so old models can run in larger-obs envs."""

    def __init__(self, env: gym.Env, n: int) -> None:
        super().__init__(env)
        low = env.observation_space.low[:n]
        high = env.observation_space.high[:n]
        self.observation_space = gym.spaces.Box(
            low=low, high=high, dtype=env.observation_space.dtype
        )
        self._n = n

    def observation(self, obs: np.ndarray) -> np.ndarray:  # type: ignore[override]
        return np.asarray(obs[: self._n], dtype=np.float32)

    # Delegate custom methods that the underlying RobotEnv exposes
    def get_state(self) -> dict[str, object]:  # type: ignore[override]
        return self.env.get_state()  # type: ignore[attr-defined]


class _PadObsWrapper(gym.ObservationWrapper):
    """Pads observations with zeros to reach `n` dims.

    Used when a model was trained with more observation dimensions than the
    current environment provides (e.g. model trained with visited-grid or goal
    dims that the chosen test profile does not expose).  Padding with zeros is
    neutral for every feature type used here:
      - ray distances     → 0.0 means "wall right here" (safe pessimistic)
      - goal dims         → 0.0 distance / direction means goal straight ahead
      - visited-grid bits → 0 means "not yet visited" (safe neutral)
    """

    def __init__(self, env: gym.Env, n: int) -> None:
        super().__init__(env)
        base_low  = env.observation_space.low
        base_high = env.observation_space.high
        pad_len = n - len(base_low)
        self.observation_space = gym.spaces.Box(
            low=np.concatenate([base_low,  np.zeros(pad_len, dtype=np.float32)]),
            high=np.concatenate([base_high, np.ones(pad_len,  dtype=np.float32)]),
            dtype=np.float32,
        )
        self._n = n

    def observation(self, obs: np.ndarray) -> np.ndarray:  # type: ignore[override]
        obs_flat = np.asarray(obs, dtype=np.float32).flatten()
        if len(obs_flat) >= self._n:
            return obs_flat[: self._n]
        padded = np.zeros(self._n, dtype=np.float32)
        padded[: len(obs_flat)] = obs_flat
        return padded

    def get_state(self) -> dict[str, object]:  # type: ignore[override]
        return self.env.get_state()  # type: ignore[attr-defined]


class StartTrainingRequest(BaseModel):
    """Request payload to start RL training."""

    steps: int = Field(default=5000, ge=200, le=5_000_000)
    algorithm: str = Field(default="PPO", pattern="(?i)^(PPO|A2C|DQN|SAC|TD3|DDPG)$")
    environment_profile: str = Field(default="arena_basic")
    model_profile: str = Field(default="balanced")
    custom_environment: dict[str, object] | None = None
    custom_model: dict[str, object] | None = None
    algorithm_params: dict[str, object] | None = None
    template_key: str | None = None
    memory_mode: str | None = Field(default=None, pattern="^(standard|visited_grid)$")
    goal_randomize: bool | None = None


class CreateCustomProfileRequest(BaseModel):
    key: str = Field(..., min_length=3, max_length=64, pattern="^[a-zA-Z0-9_-]+$")
    label: str = Field(..., min_length=2, max_length=120)
    description: str = Field(default="Custom profile", max_length=500)
    config: dict[str, object]


class TestModelRequest(BaseModel):
    run_id: int = Field(..., ge=1)
    episodes: int = Field(default=5, ge=1, le=100)
    environment_profile: str | None = None
    custom_environment: dict[str, object] | None = None
    deterministic: bool = True
    max_steps: int | None = Field(default=None, ge=50, le=50000)
    record_trajectory: bool = True
    record_episode: int = Field(default=0, ge=0)
    frame_skip: int = Field(default=1, ge=1, le=20)
    memory_mode: str | None = Field(default=None, pattern="^(standard|visited_grid)$")
    goal_randomize: bool | None = None


class AutoTestRequest(BaseModel):
    """Request payload for the automated behavioral test suite."""
    run_id: int = Field(..., ge=1)
    environment_profile: str | None = None
    episodes_per_test: int = Field(default=20, ge=5, le=100)
    max_steps: int | None = Field(default=None, ge=50, le=10_000)


class FineTuneRequest(BaseModel):
    run_id: int = Field(..., ge=1)
    steps: int = Field(default=10_000, ge=500, le=500_000)
    environment_profile: str | None = None
    custom_environment: dict[str, object] | None = None
    memory_mode: str | None = Field(default=None, pattern="^(standard|visited_grid)$")


@router.post("/start-training")
async def start_training(payload: StartTrainingRequest) -> dict[str, object]:
    """Start RL training in background."""
    try:
        algorithm = payload.algorithm
        environment_profile = payload.environment_profile
        model_profile = payload.model_profile
        custom_environment = payload.custom_environment
        custom_model = payload.custom_model
        algorithm_params = payload.algorithm_params
        memory_mode = payload.memory_mode
        goal_randomize = payload.goal_randomize

        if payload.template_key:
            template = get_training_template(payload.template_key)
            algorithm = str(template.get("algorithm", algorithm))
            environment_profile = str(template.get("environment_profile", environment_profile))
            model_profile = str(template.get("model_profile", model_profile))
            template_custom_environment = template.get("custom_environment")
            template_custom_model = template.get("custom_model")
            template_algorithm_params = template.get("algorithm_params")
            if isinstance(template_custom_environment, dict):
                custom_environment = template_custom_environment
            if isinstance(template_custom_model, dict):
                custom_model = template_custom_model
            if isinstance(template_algorithm_params, dict):
                algorithm_params = template_algorithm_params

        if goal_randomize is not None:
            if custom_environment is None:
                custom_environment = {"dynamics": {}}
            elif not isinstance(custom_environment, dict):
                raise HTTPException(status_code=422, detail="custom_environment must be a dict")
            dynamics = custom_environment.get("dynamics")
            if not isinstance(dynamics, dict):
                custom_environment["dynamics"] = {}
                dynamics = custom_environment["dynamics"]
            dynamics["randomize_goal"] = bool(goal_randomize)

        if custom_environment is not None:
            generated_env_key = f"custom_env_{environment_profile}"
            environment_profile = register_environment_profile(
                key=generated_env_key,
                label=f"Custom {environment_profile}",
                description="User-provided custom environment",
                config_override=custom_environment,
                base_profile=environment_profile,
            )

        if custom_model is not None:
            generated_model_key = f"custom_model_{model_profile}"
            model_profile = register_model_profile(
                key=generated_model_key,
                label=f"Custom {model_profile}",
                description="User-provided custom model",
                config_override=custom_model,
                base_profile=model_profile,
            )

        return await training_manager.start_training(
            steps=payload.steps,
            algorithm=algorithm,
            environment_profile=environment_profile,
            model_profile=model_profile,
            algorithm_params=algorithm_params,
            memory_mode=memory_mode,
            goal_randomize=goal_randomize,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to start training: {exc}") from exc


@router.get("/training-algorithms")
async def training_algorithms() -> list[dict[str, str]]:
    """Return supported RL algorithms for training jobs."""
    return training_manager.get_supported_algorithms()


@router.get("/training-capabilities")
async def training_capabilities() -> dict[str, object]:
    """Describe flexible training capabilities for clients."""
    return {
        "algorithms": training_manager.get_supported_algorithms(),
        "environment_profiles": list_environment_profiles(),
        "model_profiles": list_model_profiles(),
        "supports_custom_profiles": True,
        "supports_inline_custom_environment": True,
        "supports_inline_custom_model": True,
        "supports_per_run_algorithm_params": True,
        "training_templates": list_training_templates(),
    }


@router.get("/training-templates")
async def training_templates() -> list[dict[str, str]]:
    """Return prebuilt real-world training templates."""
    return list_training_templates()


@router.get("/training-profiles")
async def training_profiles() -> dict[str, list[dict]]:
    """Return available environment and model profiles for training jobs."""
    return {
        "environment_profiles": list_environment_profiles(),
        "model_profiles": list_model_profiles(),
    }


@router.post("/training-profiles/environment")
async def create_environment_profile(payload: CreateCustomProfileRequest) -> dict[str, str]:
    """Create a user-defined environment profile."""
    try:
        key = register_environment_profile(
            key=payload.key,
            label=payload.label,
            description=payload.description,
            config_override=payload.config,
            base_profile="arena_basic",
        )
        return {"key": key, "status": "created"}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/training-profiles/model")
async def create_model_profile(payload: CreateCustomProfileRequest) -> dict[str, str]:
    """Create a user-defined model profile."""
    try:
        key = register_model_profile(
            key=payload.key,
            label=payload.label,
            description=payload.description,
            config_override=payload.config,
            base_profile="balanced",
        )
        return {"key": key, "status": "created"}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/training-status")
async def training_status() -> dict[str, object]:
    """Get current or latest training status."""
    return await training_manager.get_status()


@router.post("/cancel-training")
async def cancel_training() -> dict[str, str]:
    """Cancel ongoing training and reset the task."""
    return await training_manager.cancel_training()


@router.get("/training-runs")
async def training_runs(
    limit: int = Query(default=20, ge=1, le=200),
) -> list[dict[str, object]]:
    """Return recent training runs."""
    runs = list_training_runs(limit=limit)
    # Normalize field names for frontend compatibility
    for run in runs:
        run.setdefault("run_id", run.get("id"))
        run.setdefault("total_steps", run.get("steps", 0))
        run.setdefault("model_profile", run.get("model_label", ""))
        run.setdefault("environment_profile", run.get("environment", ""))
        run.setdefault("deployment_ready", bool(run.get("deployment_ready", 0)))
        run.setdefault("memory_mode", run.get("memory_mode") or "standard")
        run.setdefault("goal_randomize", run.get("goal_randomize"))
    return runs


@router.get("/training-runs/{run_id}")
async def training_run_detail(run_id: int) -> dict[str, object]:
    """Return details for a training run."""
    record = get_training_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Training run not found")
    return record


@router.get("/training-runs/{run_id}/metrics")
async def training_run_metrics(
    run_id: int,
    limit: int = Query(default=200, ge=20, le=2000),
) -> list[dict[str, object]]:
    """Return metrics time series for a training run."""
    return list_training_metrics(run_id, limit=limit)


@router.delete("/training-runs/{run_id}")
async def delete_training_run_endpoint(run_id: int) -> dict[str, object]:
    """Delete a single training run record (and its metrics) by ID."""
    deleted = delete_training_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Training run not found")
    return {"deleted": run_id}


@router.delete("/training-runs")
async def delete_all_training_runs_endpoint() -> dict[str, object]:
    """Delete every training run record and its metrics."""
    count = delete_all_training_runs()
    return {"deleted_count": count}


@router.post("/test-model")
async def test_model(payload: TestModelRequest) -> dict[str, object]:
    """Evaluate a trained model on a chosen environment and return metrics + trajectory."""
    record_episode = max(0, payload.record_episode)
    frame_skip = max(1, payload.frame_skip)

    run = get_training_run(payload.run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Training run not found")

    model_path = run.get("model_path")
    if not model_path:
        raise HTTPException(status_code=404, detail="No trained model available for this run")

    model_file = Path(model_path)
    if not model_file.exists():
        raise HTTPException(status_code=404, detail=f"Model file not found: {model_file}")

    algorithm = str(run.get("algorithm") or "PPO").upper()
    if algorithm not in SUPPORTED_ALGORITHMS:
        raise HTTPException(status_code=422, detail=f"Unsupported algorithm: {algorithm}")

    model_class = SUPPORTED_ALGORITHMS[algorithm]["class"]
    control_mode = str(SUPPORTED_ALGORITHMS[algorithm]["control_mode"])

    env_profile = payload.environment_profile
    if not env_profile:
        env_value = str(run.get("environment") or "")
        if ":" in env_value:
            env_profile = env_value.split(":", 1)[1]
        elif env_value:
            env_profile = env_value
        else:
            env_profile = "arena_basic"

    custom_environment = payload.custom_environment
    if payload.goal_randomize is not None:
        if custom_environment is None:
            custom_environment = {"dynamics": {}}
        elif not isinstance(custom_environment, dict):
            raise HTTPException(status_code=422, detail="custom_environment must be a dict")
        dynamics = custom_environment.get("dynamics")
        if not isinstance(dynamics, dict):
            custom_environment["dynamics"] = {}
            dynamics = custom_environment["dynamics"]
        dynamics["randomize_goal"] = bool(payload.goal_randomize)

    if custom_environment is not None:
        timestamp = datetime.utcnow().strftime("%H%M%S")
        env_profile = register_environment_profile(
            key=f"custom_test_{env_profile}_{payload.run_id}_{timestamp}",
            label=f"Test {env_profile}",
            description="User-provided test environment",
            config_override=custom_environment,
            base_profile=env_profile,
        )

    memory_mode = payload.memory_mode or run.get("memory_mode") or "standard"
    memory_mode = str(memory_mode).lower()

    env_kwargs: dict[str, object] = {"profile": env_profile}
    if payload.max_steps is not None:
        env_kwargs["max_steps"] = payload.max_steps

    if control_mode == "continuous":
        env = ContinuousRobotEnv(**env_kwargs)
    else:
        from backend.simulation.presets import get_environment_profile as _gep
        _env_class_flag = str(
            _gep(env_profile).get("metadata", {}).get("env_class", "")
        ).lower()
        if _env_class_flag == "curriculum":
            env = CurriculumRobotEnv(**env_kwargs)
        else:
            env = RobotEnv(**env_kwargs)

    if memory_mode == "visited_grid":
        env = VisitedGridWrapper(env)

    model = model_class.load(str(model_file))

    # Detect obs-space mismatch (e.g. old model trained without goal dims)
    env_obs_dim = int(env.observation_space.shape[0])
    env_has_goal = bool(getattr(env, "has_goal", False))
    try:
        model_obs_dim = int(model.observation_space.shape[0])
    except Exception:
        model_obs_dim = env_obs_dim

    obs_trimmed = False
    model_has_goal = False
    if model_obs_dim != env_obs_dim:
        if model_obs_dim < env_obs_dim:
            # Trim extra dims (goal, …) the old model doesn't understand
            env = _TrimObsWrapper(env, model_obs_dim)  # type: ignore[assignment]
            obs_trimmed = True
        else:
            # Env provides fewer dims than the model expects.
            # Zero-pad the missing dims so the model can still run.
            # Common cause: model was trained with visited-grid memory or goal
            # dims that are absent in the chosen test environment profile.
            env = _PadObsWrapper(env, model_obs_dim)  # type: ignore[assignment]
    # Model has goal sensing if obs weren't trimmed and env has goal
    model_has_goal = env_has_goal and not obs_trimmed

    episode_rewards: list[float] = []
    episode_steps: list[int] = []
    episode_collisions: list[int] = []
    episode_success: list[int] = []
    episode_goal_reached: list[int] = []
    trajectory: list[dict[str, object]] = []

    try:
        for episode_index in range(payload.episodes):
            try:
                observation, _ = env.reset()
                total_reward = 0.0
                steps = 0
                collided = False
                success = False
                current_trajectory: list[dict[str, object]] = []

                if payload.record_trajectory:
                    current_trajectory.append(env.get_state())

                while True:
                    action, _ = model.predict(observation, deterministic=payload.deterministic)
                    if control_mode != "continuous":
                        try:
                            action = int(action)
                        except (TypeError, ValueError):
                            action = int(action[0])
                    observation, reward, terminated, truncated, info = env.step(action)
                    total_reward += float(reward)
                    steps += 1

                    if payload.record_trajectory:
                        if steps % frame_skip == 0:
                            current_trajectory.append(env.get_state())

                    if terminated or truncated:
                        if isinstance(info, dict):
                            collided = bool(info.get("collision"))
                            if bool(info.get("goal_reached")):
                                episode_goal_reached.append(1)
                            else:
                                episode_goal_reached.append(0)
                        else:
                            episode_goal_reached.append(0)
                        success = bool(truncated) and not collided
                        break

                    if payload.max_steps is not None and steps >= payload.max_steps:
                        success = not collided
                        episode_goal_reached.append(0)
                        break

                episode_rewards.append(total_reward)
                episode_steps.append(steps)
                episode_collisions.append(1 if collided else 0)
                episode_success.append(1 if success else 0)
                if payload.record_trajectory:
                    if len(current_trajectory) > len(trajectory):
                        trajectory = current_trajectory

            except Exception as ep_err:
                # One bad episode: fill with zeros and continue
                episode_rewards.append(0.0)
                episode_steps.append(0)
                episode_collisions.append(0)
                episode_success.append(0)
                episode_goal_reached.append(0)

    except Exception as loop_err:
        env.close()
        raise HTTPException(status_code=500, detail=f"Test failed: {loop_err}") from loop_err

    env.close()

    episodes = max(payload.episodes, 1)
    avg_reward = sum(episode_rewards) / episodes
    avg_steps = sum(episode_steps) / episodes
    collision_rate = sum(episode_collisions) / episodes
    success_rate = sum(episode_success) / episodes
    goal_reach_rate = sum(episode_goal_reached) / episodes if episode_goal_reached else None

    return {
        "run_id": payload.run_id,
        "algorithm": algorithm,
        "environment_profile": env_profile,
        "episodes": payload.episodes,
        "avg_reward": avg_reward,
        "avg_steps": avg_steps,
        "collision_rate": collision_rate,
        "success_rate": success_rate,
        "goal_reach_rate": goal_reach_rate,
        "env_has_goal": env_has_goal,
        "model_has_goal": model_has_goal,
        "obs_trimmed": obs_trimmed,
        "episode_rewards": episode_rewards,
        "episode_steps": episode_steps,
        "episode_collisions": episode_collisions,
        "trajectory": trajectory,
    }


@router.post("/fine-tune-model")
async def fine_tune_model(payload: FineTuneRequest) -> dict[str, object]:
    """Continue training (fine-tune) an existing model for additional steps."""
    run = get_training_run(payload.run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Training run not found")

    model_path = run.get("model_path")
    if not model_path:
        raise HTTPException(status_code=404, detail="No trained model available for this run")

    model_file = Path(model_path)
    if not model_file.exists():
        raise HTTPException(status_code=404, detail=f"Model file not found: {model_file}")

    algorithm = str(run.get("algorithm") or "PPO").upper()
    if algorithm not in SUPPORTED_ALGORITHMS:
        raise HTTPException(status_code=422, detail=f"Unsupported algorithm: {algorithm}")

    model_class = SUPPORTED_ALGORITHMS[algorithm]["class"]
    control_mode = str(SUPPORTED_ALGORITHMS[algorithm]["control_mode"])

    env_profile = payload.environment_profile
    if not env_profile:
        env_value = str(run.get("environment") or "")
        env_profile = env_value.split(":", 1)[1] if ":" in env_value else (env_value or "flat_ground_differential_v1")

    custom_environment = payload.custom_environment
    if custom_environment is not None:
        timestamp = datetime.utcnow().strftime("%H%M%S")
        env_profile = register_environment_profile(
            key=f"finetune_{env_profile}_{payload.run_id}_{timestamp}",
            label=f"FineTune {env_profile}",
            description="Fine-tune environment override",
            config_override=custom_environment,
            base_profile=env_profile,
        )

    def _run_finetune() -> dict[str, object]:
        memory_mode = payload.memory_mode or run.get("memory_mode") or "standard"
        memory_mode = str(memory_mode).lower()

        if control_mode == "continuous":
            env = ContinuousRobotEnv(profile=env_profile)
        else:
            from backend.simulation.presets import get_environment_profile as _gep
            _env_class_flag = str(
                _gep(env_profile).get("metadata", {}).get("env_class", "")
            ).lower()
            if _env_class_flag == "curriculum":
                env = CurriculumRobotEnv(profile=env_profile)  # type: ignore[assignment]
            else:
                env = RobotEnv(profile=env_profile)  # type: ignore[assignment]

        if memory_mode == "visited_grid":
            env = VisitedGridWrapper(env)

        env_obs_dim = int(env.observation_space.shape[0])
        model = model_class.load(str(model_file), env=env)

        try:
            model_obs_dim = int(model.observation_space.shape[0])
        except Exception:
            model_obs_dim = env_obs_dim

        if model_obs_dim != env_obs_dim:
            env.close()
            raise HTTPException(
                status_code=422,
                detail=f"Model obs dim {model_obs_dim} != env obs dim {env_obs_dim}. Use the same environment used during training.",
            )

        model.learn(total_timesteps=payload.steps, reset_num_timesteps=False)
        model.save(str(model_file))

        onnx_path_str = run.get("onnx_path")
        if onnx_path_str:
            onnx_path = Path(str(onnx_path_str))
            try:
                export_model_to_onnx(model, onnx_path, observation_dim=env_obs_dim)
            except Exception:
                pass  # ONNX re-export failure is non-fatal

        existing_steps = int(run.get("timesteps_completed") or run.get("steps") or 0)
        new_total = existing_steps + payload.steps
        update_training_run(
            payload.run_id,
            timesteps_completed=new_total,
            steps=new_total,
            completed_at=datetime.utcnow().isoformat(),
            status="completed",
        )

        env.close()
        return {
            "status": "fine-tuned",
            "run_id": payload.run_id,
            "additional_steps": payload.steps,
            "total_steps": new_total,
        }

    try:
        result = await asyncio.to_thread(_run_finetune)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fine-tune failed: {exc}") from exc


@router.post("/auto-test-model")
async def auto_test_model(payload: AutoTestRequest) -> dict[str, object]:
    """Run automated 6-test behavioral diagnostic suite on a trained model.

    Returns structured issue reports with severity grades and actionable
    fix recommendations for each detected problem.
    """
    run = get_training_run(payload.run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Training run not found")

    model_path = run.get("model_path")
    if not model_path:
        raise HTTPException(status_code=404, detail="No trained model available for this run")

    model_file = Path(model_path)
    if not model_file.exists():
        raise HTTPException(status_code=404, detail=f"Model file not found: {model_file}")

    algorithm = str(run.get("algorithm") or "PPO").upper()
    if algorithm not in SUPPORTED_ALGORITHMS:
        raise HTTPException(status_code=422, detail=f"Unsupported algorithm: {algorithm}")

    control_mode = str(SUPPORTED_ALGORITHMS[algorithm]["control_mode"])

    # Resolve environment profile
    env_profile = payload.environment_profile
    if not env_profile:
        env_value = str(run.get("environment") or "")
        env_profile = env_value.split(":", 1)[1] if ":" in env_value else (env_value or "arena_basic")

    from backend.rl.auto_test import run_auto_test

    try:
        result = await asyncio.to_thread(
            run_auto_test,
            str(model_file),
            algorithm,
            env_profile,
            control_mode,
            payload.episodes_per_test,
            payload.max_steps,
        )
        result["run_id"] = payload.run_id
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Auto-test failed: {exc}") from exc


@router.get("/download-model")
async def download_model(
    format: str = Query(default="zip", pattern="^(zip|onnx|manifest|bundle)$"),
    run_id: int | None = Query(default=None, ge=1),
) -> FileResponse:
    """Download latest trained model artifact."""
    try:
        artifact_path = await training_manager.get_download_path(file_format=format, run_id=run_id)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    media_type = "application/octet-stream"
    return FileResponse(
        path=artifact_path,
        media_type=media_type,
        filename=artifact_path.name,
    )
