"""Background training orchestration for SB3 RL runs."""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import torch
from gymnasium.wrappers import RecordEpisodeStatistics
from stable_baselines3 import A2C, DDPG, DQN, PPO, SAC, TD3
from stable_baselines3.common.base_class import BaseAlgorithm
from stable_baselines3.common.callbacks import BaseCallback, CallbackList
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

try:
    from sb3_contrib import RecurrentPPO as _RecurrentPPO
    _LSTM_AVAILABLE = True
except ImportError:
    _RecurrentPPO = None  # type: ignore[assignment]
    _LSTM_AVAILABLE = False

from backend.config import settings
from backend.database import (
    add_training_metric,
    create_training_run,
    get_latest_training_run,
    get_training_run,
    update_training_run,
)
from backend.rl.deployment import (
    bundle_path_for,
    create_deployment_bundle,
    manifest_path_for,
    validate_onnx_runtime,
    validate_sb3_model_runtime,
    write_deployment_manifest,
)
from backend.rl.export import export_model_to_onnx
from backend.rl.live_render_callback import LiveRenderCallback
from backend.simulation.gym_env import ContinuousRobotEnv, CurriculumRobotEnv, RobotEnv, VisitedGridWrapper
from backend.simulation.presets import get_environment_profile, get_model_profile
from backend.ws import training_stream

SUPPORTED_ALGORITHMS: dict[str, dict[str, object]] = {
    "PPO": {
        "class": PPO,
        "model_label": "RobotMind PPO",
        "artifact_prefix": "ppo",
        "control_mode": "discrete",
    },
    "PPO_LSTM": {
        "class": _RecurrentPPO,  # falls back to PPO if sb3-contrib not installed
        "model_label": "RobotMind PPO+LSTM",
        "artifact_prefix": "ppo_lstm",
        "control_mode": "discrete",
    },
    "A2C": {
        "class": A2C,
        "model_label": "RobotMind A2C",
        "artifact_prefix": "a2c",
        "control_mode": "discrete",
    },
    "DQN": {
        "class": DQN,
        "model_label": "RobotMind DQN",
        "artifact_prefix": "dqn",
        "control_mode": "discrete",
    },
    "SAC": {
        "class": SAC,
        "model_label": "RobotMind SAC",
        "artifact_prefix": "sac",
        "control_mode": "continuous",
    },
    "TD3": {
        "class": TD3,
        "model_label": "RobotMind TD3",
        "artifact_prefix": "td3",
        "control_mode": "continuous",
    },
    "DDPG": {
        "class": DDPG,
        "model_label": "RobotMind DDPG",
        "artifact_prefix": "ddpg",
        "control_mode": "continuous",
    },
}

# Per-algorithm default hyperparameters that improve learning stability.
# These are merged with model-profile params; user algorithm_params override everything.
ALGORITHM_DEFAULTS: dict[str, dict[str, object]] = {
    "PPO": {
        # n_steps: how many env steps are collected per update.  Match or exceed
        # typical episode length (700 steps) so rollout buffers contain complete
        # episodes and the value-function baseline is stable.
        "n_steps": 2048,
        "batch_size": 64,
        "gae_lambda": 0.95,
        "gamma": 0.995,        # higher gamma → robot values future survival highly
        "ent_coef": 0.015,     # encourages exploration; prevents premature convergence
        "clip_range": 0.2,
        "n_epochs": 10,
    },
    "A2C": {
        "gae_lambda": 0.95,
        "gamma": 0.995,
        "ent_coef": 0.015,
        "n_steps": 16,         # A2C updates more frequently
    },
    "DQN": {
        # DQN needs a large replay buffer and long exploration to learn in
        # sparse-reward environments.  Old defaults (exploration_fraction=0.3)
        # exhausted random exploration after only ~3k steps / 6 episodes.
        "buffer_size": 100_000,
        "learning_starts": 3_000,       # wait for more diverse experience
        "batch_size": 64,
        "exploration_fraction": 0.5,    # explore for half of total steps
        "exploration_final_eps": 0.05,
        "gamma": 0.995,
        "train_freq": 4,
        "target_update_interval": 1_000,
    },
    "SAC": {
        "buffer_size": 100_000,
        "learning_starts": 1_000,
        "batch_size": 256,
        "gamma": 0.995,
        "ent_coef": "auto",
        "train_freq": 1,
        "gradient_steps": 1,
    },
    "TD3": {
        "buffer_size": 100_000,
        "learning_starts": 1_000,
        "batch_size": 256,
        "gamma": 0.995,
    },
    "DDPG": {
        "buffer_size": 100_000,
        "learning_starts": 1_000,
        "batch_size": 256,
        "gamma": 0.995,
    },
    # RecurrentPPO (LSTM) defaults — uses n_steps per env (single env),
    # smaller batch to fit LSTM sequences, higher gamma for long-horizon planning.
    "PPO_LSTM": {
        "n_steps": 2048,
        "batch_size": 128,
        "gae_lambda": 0.95,
        "gamma": 0.9995,
        "ent_coef": 0.02,
        "clip_range": 0.2,
        "n_epochs": 10,
    },
}


@dataclass
class TrainingState:
    run_id: int | None = None
    status: str = "idle"
    total_steps: int = 0
    completed_steps: int = 0
    progress: float = 0.0
    model_path: str | None = None
    onnx_path: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    metrics: dict[str, object] = field(default_factory=dict)
    error_message: str | None = None
    algorithm: str | None = None
    environment: str | None = None
    model_label: str | None = None
    eta_seconds: float | None = None
    steps_per_second: float | None = None
    gpu_info: dict[str, object] = field(default_factory=dict)
    training_env_state: dict[str, object] | None = None
    episode_count: int = 0
    last_reward: float = 0.0
    last_loss: float = 0.0
    deployment_ready: bool = False
    deployment_manifest_path: str | None = None
    deployment_bundle_path: str | None = None


class _ProgressCallback(BaseCallback):
    def __init__(self, manager: "TrainingManager", run_id: int, total_steps: int) -> None:
        super().__init__()
        self.manager = manager
        self.run_id = run_id
        self.total_steps = total_steps
        self.last_persisted_step = 0
        self.last_loss = 0.0

    def _on_step(self) -> bool:
        current = int(self.num_timesteps)
        self.manager.update_progress_threadsafe(self.run_id, current, self.total_steps)

        env_state: dict = {}
        try:
            training_env = getattr(self, "training_env", None)
            if training_env is not None and hasattr(training_env, "envs"):
                env = training_env.envs[0]
                target = env.env if hasattr(env, "env") else env
                if hasattr(target, "get_state"):
                    env_state = target.get_state()
                    self.manager.update_env_state_threadsafe(env_state)
        except Exception:
            pass

        infos = self.locals.get("infos", [])
        for info in infos:
            episode = info.get("episode") if isinstance(info, dict) else None
            if episode:
                reward = float(episode.get("r", 0.0))
                length = int(episode.get("l", 0))
                add_training_metric(self.run_id, current, reward, length)
                self.manager.update_episode_threadsafe(reward, self.last_loss)

        # Push step progress + current training env state to WebSocket every 50 steps
        if current % 50 == 0 or current - self.last_persisted_step >= 100:
            training_stream.enqueue({
                "completed_steps": current,
                "total_steps": self.total_steps,
                "progress": min(1.0, current / max(self.total_steps, 1)),
                "episode": self.manager._state.episode_count,
                "reward": self.manager._state.last_reward,
                "loss": self.last_loss,
                "env_state": env_state,  # full env snapshot for canvas rendering
            })

        if current - self.last_persisted_step >= 100:
            update_training_run(self.run_id, timesteps_completed=current)
            self.last_persisted_step = current
        # Returning False tells SB3 to stop model.learn() immediately.
        # This is the only reliable way to interrupt a blocking SB3 training thread.
        return not self.manager._stop_event.is_set()

    def _on_rollout_end(self) -> None:
        metrics = getattr(self.logger, "name_to_value", {})
        loss = metrics.get("train/loss") or metrics.get("train/value_loss") or metrics.get("train/policy_loss")
        if loss is None:
            return
        try:
            self.last_loss = float(loss)
            self.manager.update_loss_threadsafe(self.last_loss)
        except (TypeError, ValueError):
            return


class TrainingManager:
    def __init__(self) -> None:
        self._state = TrainingState()
        self._state_lock = asyncio.Lock()
        self._thread_lock = threading.Lock()
        self._task: asyncio.Task[None] | None = None
        self._start_time: float | None = None
        # Event that signals the SB3 training thread to stop gracefully.
        # Set by cancel_training(); checked in _ProgressCallback._on_step().
        self._stop_event = threading.Event()

    async def start_training(
        self,
        steps: int,
        algorithm: str = "PPO",
        environment_profile: str = "arena_basic",
        model_profile: str = "balanced",
        algorithm_params: dict[str, object] | None = None,
        memory_mode: str | None = None,
        goal_randomize: bool | None = None,
        live_render: bool = False,
        render_freq: int = 100,
    ) -> dict[str, Any]:
        algorithm_key = algorithm.upper()
        if algorithm_key not in SUPPORTED_ALGORITHMS:
            supported = ", ".join(SUPPORTED_ALGORITHMS.keys())
            raise ValueError(f"Unsupported algorithm '{algorithm}'. Supported: {supported}")

        env_profile = get_environment_profile(environment_profile)
        model_cfg = get_model_profile(model_profile)
        model_label_base = str(SUPPORTED_ALGORITHMS[algorithm_key]["model_label"])
        control_mode = str(SUPPORTED_ALGORITHMS[algorithm_key]["control_mode"])
        supported_modes = env_profile.get("metadata", {}).get(
            "supported_control_modes",
            ["discrete", "continuous"],
        )
        if isinstance(supported_modes, list) and control_mode not in supported_modes:
            raise ValueError(
                f"Environment '{environment_profile}' does not support control mode '{control_mode}'"
            )

        async with self._state_lock:
            if self._task is not None and not self._task.done():
                raise RuntimeError("Training is already running")

            run_id = create_training_run(
                steps=steps,
                algorithm=algorithm_key,
                environment=f"RobotEnv:{environment_profile}",
                model_label=f"{model_label_base} [{model_profile}]",
                memory_mode=memory_mode or "standard",
                goal_randomize=goal_randomize,
            )
            now = datetime.utcnow().isoformat()
            self._state = TrainingState(
                run_id=run_id,
                status="running",
                total_steps=steps,
                started_at=now,
                algorithm=algorithm_key,
                environment=f"RobotEnv:{environment_profile}",
                model_label=f"{model_label_base} [{model_profile}]",
                metrics={
                    "environment_profile": environment_profile,
                    "environment_label": env_profile["label"],
                    "model_profile": model_profile,
                    "model_profile_label": model_cfg["label"],
                    "control_mode": control_mode,
                },
                episode_count=0,
                last_reward=0.0,
                last_loss=0.0,
            )
            self._stop_event.clear()  # allow new training to run
            self._start_time = time.perf_counter()
            self._task = asyncio.create_task(
                self._run_training(
                    run_id=run_id,
                    steps=steps,
                    algorithm=algorithm_key,
                    environment_profile=environment_profile,
                    model_profile=model_profile,
                    algorithm_params=algorithm_params,
                    memory_mode=memory_mode,
                    live_render=live_render,
                    render_freq=render_freq,
                )
            )
            return asdict(self._state)

    async def _run_training(
        self,
        run_id: int,
        steps: int,
        algorithm: str,
        environment_profile: str,
        model_profile: str,
        algorithm_params: dict[str, object] | None,
        memory_mode: str | None,
        live_render: bool = False,
        render_freq: int = 100,
    ) -> None:
        try:
            result = await asyncio.to_thread(
                self._train_sync,
                run_id,
                steps,
                algorithm,
                environment_profile,
                model_profile,
                algorithm_params,
                memory_mode,
                live_render,
                render_freq,
            )
            async with self._state_lock:
                self._state.status = "completed"
                self._state.completed_steps = steps
                self._state.progress = 1.0
                self._state.model_path = result["model_path"]
                self._state.onnx_path = result["onnx_path"]
                self._state.completed_at = result["completed_at"]
                self._state.metrics = result["metrics"]
                self._state.deployment_ready = bool(result.get("deployment_ready", False))
                self._state.deployment_manifest_path = result.get("deployment_manifest_path")
                self._state.deployment_bundle_path = result.get("deployment_bundle_path")
        except Exception as exc:  # noqa: BLE001
            now = datetime.utcnow().isoformat()
            update_training_run(
                run_id,
                status="failed",
                completed_at=now,
                error_message=str(exc),
            )
            async with self._state_lock:
                self._state.status = "failed"
                self._state.error_message = str(exc)
                self._state.completed_at = now

    def _train_sync(
        self,
        run_id: int,
        steps: int,
        algorithm: str,
        environment_profile: str,
        model_profile: str,
        algorithm_params: dict[str, object] | None,
        memory_mode: str | None,
        live_render: bool = False,
        render_freq: int = 100,
    ) -> dict[str, Any]:
        settings.model_dir.mkdir(parents=True, exist_ok=True)
        started = time.perf_counter()

        config = SUPPORTED_ALGORITHMS[algorithm]
        model_class = config["class"]
        artifact_prefix = str(config["artifact_prefix"])
        control_mode = str(config["control_mode"])

        env_profile = get_environment_profile(environment_profile)
        model_profile_cfg = get_model_profile(model_profile)

        memory_mode = (memory_mode or "standard").lower()

        def _make_env() -> Any:
            _env_class_flag = str(
                env_profile.get("metadata", {}).get("env_class", "")
            ).lower()
            if control_mode == "continuous":
                base_env: Any = ContinuousRobotEnv(profile=environment_profile)
            elif _env_class_flag == "curriculum":
                base_env = CurriculumRobotEnv(profile=environment_profile)
            else:
                base_env = RobotEnv(profile=environment_profile)
            if memory_mode == "visited_grid":
                base_env = VisitedGridWrapper(base_env)
            return RecordEpisodeStatistics(base_env)

        # Parallel environments: on-policy algorithms (PPO, A2C) benefit greatly
        # from collecting diverse rollout data across multiple independent
        # environments per update.  4 parallel envs is the standard in OpenAI
        # Baselines and DeepMind Acme research.
        # Off-policy algorithms (DQN, SAC, TD3, DDPG) use a replay buffer and
        # don't gain from this; keep 1 env to avoid buffer complexity.
        # PPO_LSTM (RecurrentPPO) uses 1 env: hidden state is per-env and SB3's
        # recurrent rollout buffer doesn't vectorise cleanly across episodes.
        _ON_POLICY = {"PPO", "A2C"}
        n_envs = 4 if algorithm in _ON_POLICY else 1
        vec_env = DummyVecEnv([_make_env] * n_envs)
        obs_dim = int(vec_env.observation_space.shape[0])

        # VecNormalize: normalise observations to zero-mean/unit-variance and
        # normalise rewards.  This is the single most important training
        # stabilisation technique used in production RL (OpenAI Five, AlphaStar).
        # Without it, raw pixel-distance observations have inconsistent scales
        # that make gradient descent unstable.
        _NORMALIZE_ALGOS = {"PPO", "PPO_LSTM", "A2C"}
        if algorithm in _NORMALIZE_ALGOS:
            env: Any = VecNormalize(
                vec_env,
                norm_obs=True,
                norm_reward=True,
                clip_obs=10.0,
                clip_reward=10.0,
                gamma=0.9995,
            )
        else:
            env = vec_env

        # Strip internal-only flags from policy_kwargs before handing to SB3.
        # 'use_lstm' is our own marker telling the trainer to use MlpLstmPolicy;
        # it is not a valid SB3 policy_kwargs key and would cause an error.
        import copy as _copy
        _policy_kwargs = _copy.deepcopy(dict(model_profile_cfg["policy_kwargs"]))
        _policy_kwargs.pop("use_lstm", None)  # remove if present
        model_kwargs: dict[str, object] = {
            "verbose": 0,
            "device": "cpu",
            "policy_kwargs": _policy_kwargs,
            "learning_rate": model_profile_cfg["learning_rate"],
        }
        # Apply algorithm-specific defaults (stable learning baselines per algorithm)
        algo_defaults = ALGORITHM_DEFAULTS.get(algorithm, {})
        # gamma/ent_coef from model profile override algorithm defaults for tuning
        merged_defaults = {**algo_defaults}
        if "gamma" in model_profile_cfg:
            merged_defaults["gamma"] = model_profile_cfg["gamma"]
        # ent_coef is only valid for on-policy (PPO, PPO_LSTM, A2C) and SAC
        _ent_coef_algorithms = {"PPO", "PPO_LSTM", "A2C", "SAC"}
        if "ent_coef" in model_profile_cfg and algorithm in _ent_coef_algorithms:
            merged_defaults["ent_coef"] = model_profile_cfg["ent_coef"]
        # With 4 parallel envs, PPO collects n_envs*n_steps per update.
        # Keep total rollout batch at ~2048: reduce n_steps to 512 per env.
        if n_envs > 1 and algorithm == "PPO":
            merged_defaults["n_steps"] = 512  # 4 envs × 512 = 2048 total per update
        model_kwargs.update(merged_defaults)
        # User-supplied algorithm_params override everything
        if algorithm_params:
            model_kwargs.update(algorithm_params)

        # PPO_LSTM uses MlpLstmPolicy; all others use MlpPolicy.
        # If sb3-contrib is missing, fall back gracefully to PPO + MlpPolicy.
        if algorithm == "PPO_LSTM":
            if not _LSTM_AVAILABLE:
                import warnings
                warnings.warn("sb3-contrib not found; falling back to PPO MlpPolicy.")
                actual_model_class = PPO
                policy_type = "MlpPolicy"
            else:
                actual_model_class = _RecurrentPPO
                policy_type = "MlpLstmPolicy"
        else:
            actual_model_class = model_class  # type: ignore[assignment]
            policy_type = "MlpPolicy"
        model: BaseAlgorithm = actual_model_class(policy_type, env, **model_kwargs)

        # Build callback list: always include progress callback; optionally live render
        progress_callback = _ProgressCallback(self, run_id=run_id, total_steps=steps)
        if live_render:
            render_callback = LiveRenderCallback(
                vec_env=env, render_freq=render_freq, verbose=1
            )
            callback: BaseCallback = CallbackList([progress_callback, render_callback])
        else:
            callback = progress_callback

        model.learn(total_timesteps=steps, callback=callback)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        model_path = settings.model_dir / f"{artifact_prefix}_robotmind_{timestamp}.zip"
        onnx_path = settings.model_dir / f"{artifact_prefix}_robotmind_{timestamp}.onnx"

        model.save(str(model_path))
        export_model_to_onnx(model, onnx_path, observation_dim=obs_dim)

        sb3_validation = validate_sb3_model_runtime(model, obs_dim)
        onnx_validation = validate_onnx_runtime(onnx_path, obs_dim)
        manifest_metadata = {
            "algorithm": algorithm,
            "control_mode": control_mode,
            "environment_profile": environment_profile,
            "environment_label": env_profile["label"],
            "model_profile": model_profile,
            "model_profile_label": model_profile_cfg["label"],
            "algorithm_params": algorithm_params or {},
            "memory_mode": memory_mode,
            "observation_dim": obs_dim,
        }
        manifest_path = write_deployment_manifest(
            model_path=model_path,
            onnx_path=onnx_path,
            metadata=manifest_metadata,
            sb3_validation=sb3_validation,
            onnx_validation=onnx_validation,
        )
        deployment_bundle_path = create_deployment_bundle(
            model_path=model_path,
            onnx_path=onnx_path,
            manifest_path=manifest_path,
        )

        elapsed = time.perf_counter() - started
        completed_at = datetime.utcnow().isoformat()
        metrics: dict[str, object] = {
            "training_seconds": elapsed,
            "total_timesteps": float(steps),
            "steps_per_second": float(steps / elapsed) if elapsed > 0 else 0.0,
            "algorithm": algorithm,
            "control_mode": control_mode,
            "environment_profile": environment_profile,
            "environment_label": env_profile["label"],
            "model_profile": model_profile,
            "model_profile_label": model_profile_cfg["label"],
            "algorithm_params": algorithm_params or {},
            "sb3_validation": sb3_validation,
            "onnx_validation": onnx_validation,
            "deployment_manifest_path": str(manifest_path),
            "deployment_bundle_path": str(deployment_bundle_path),
        }

        _deployment_ready = bool(sb3_validation.get("ok") and onnx_validation.get("ok"))
        update_training_run(
            run_id,
            status="completed",
            completed_at=completed_at,
            timesteps_completed=steps,
            reward_mean=None,
            model_path=str(model_path),
            onnx_path=str(onnx_path),
            deployment_ready=int(_deployment_ready),
        )

        env.close()

        return {
            "model_path": str(model_path),
            "onnx_path": str(onnx_path),
            "completed_at": completed_at,
            "metrics": metrics,
            "deployment_ready": bool(sb3_validation.get("ok") and onnx_validation.get("ok")),
            "deployment_manifest_path": str(manifest_path),
            "deployment_bundle_path": str(deployment_bundle_path),
        }

    def get_supported_algorithms(self) -> list[dict[str, str]]:
        return [
            {
                "key": key,
                "model_label": str(config["model_label"]),
                "control_mode": str(config["control_mode"]),
            }
            for key, config in SUPPORTED_ALGORITHMS.items()
        ]

    def update_progress_threadsafe(self, run_id: int, current_step: int, total_steps: int) -> None:
        with self._thread_lock:
            if self._state.run_id != run_id:
                return
            self._state.completed_steps = current_step
            self._state.total_steps = total_steps
            self._state.progress = min(1.0, current_step / max(total_steps, 1))
            if self._start_time:
                elapsed = max(time.perf_counter() - self._start_time, 0.001)
                steps_per_second = current_step / elapsed
                remaining = max(total_steps - current_step, 0)
                self._state.steps_per_second = steps_per_second
                self._state.eta_seconds = remaining / steps_per_second if steps_per_second > 0 else None

    def update_env_state_threadsafe(self, state: dict[str, object]) -> None:
        with self._thread_lock:
            self._state.training_env_state = state

    def update_episode_threadsafe(self, reward: float, loss: float) -> None:
        with self._thread_lock:
            self._state.episode_count += 1
            self._state.last_reward = reward
            self._state.last_loss = loss

        training_stream.enqueue(
            {
                "episode": self._state.episode_count,
                "reward": reward,
                "loss": loss,
            }
        )

    def update_loss_threadsafe(self, loss: float) -> None:
        with self._thread_lock:
            self._state.last_loss = loss

    async def get_status(self) -> dict[str, Any]:
        async with self._state_lock:
            status = asdict(self._state)

        status["gpu_info"] = self._get_gpu_info()

        if status["run_id"] is None:
            latest = get_latest_training_run()
            if latest is None:
                return status
            return {
                "run_id": latest["id"],
                "status": latest["status"],
                "total_steps": latest["steps"],
                "completed_steps": latest["timesteps_completed"],
                "progress": (
                    float(latest["timesteps_completed"]) / float(latest["steps"])
                    if latest["steps"]
                    else 0.0
                ),
                "model_path": latest["model_path"],
                "onnx_path": latest["onnx_path"],
                "started_at": latest["started_at"],
                "completed_at": latest["completed_at"],
                "metrics": {},
                "error_message": latest["error_message"],
                "algorithm": latest.get("algorithm"),
                "environment": latest.get("environment"),
                "model_label": latest.get("model_label"),
                "eta_seconds": None,
                "steps_per_second": None,
                "gpu_info": status.get("gpu_info", {}),
                "training_env_state": None,
                "episode_count": 0,
                "last_reward": 0.0,
                "last_loss": 0.0,
                "deployment_ready": (
                    bool(latest.get("onnx_path"))
                    and manifest_path_for(Path(latest["onnx_path"])).exists()
                    and bundle_path_for(Path(latest["onnx_path"])).exists()
                ) if latest.get("onnx_path") else False,
                "deployment_manifest_path": (
                    str(manifest_path_for(Path(latest["onnx_path"])))
                    if latest.get("onnx_path")
                    else None
                ),
                "deployment_bundle_path": (
                    str(bundle_path_for(Path(latest["onnx_path"])))
                    if latest.get("onnx_path")
                    else None
                ),
            }
        return status

    async def cancel_training(self) -> dict[str, str]:
        """Cancel ongoing training and reset the task."""
        run_id_to_cancel: int | None = None
        # Signal the SB3 training thread to stop at the next callback step.
        # This must happen BEFORE we await self._task so the thread unblocks quickly.
        self._stop_event.set()
        async with self._state_lock:
            run_id_to_cancel = self._state.run_id
            if self._task is not None:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            self._task = None
            self._state = TrainingState()
        # Update the DB record so the polling endpoint returns "cancelled" instead of "running"
        if run_id_to_cancel is not None:
            try:
                update_training_run(run_id_to_cancel, status="cancelled")
            except Exception:
                pass
        return {"status": "cancelled", "message": "Training task cleared"}

    def _get_gpu_info(self) -> dict[str, object]:
        if not torch.cuda.is_available():
            return {"available": False}

        device_index = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(device_index)
        memory_reserved = torch.cuda.memory_reserved(device_index)
        memory_allocated = torch.cuda.memory_allocated(device_index)
        return {
            "available": True,
            "name": props.name,
            "total_memory_gb": round(props.total_memory / (1024**3), 2),
            "memory_reserved_gb": round(memory_reserved / (1024**3), 2),
            "memory_allocated_gb": round(memory_allocated / (1024**3), 2),
        }

    async def get_download_path(self, file_format: str = "zip", run_id: int | None = None) -> Path:
        if run_id is not None:
            record = get_training_run(run_id)
            if record is None:
                raise FileNotFoundError("Training run not found")
            model_candidate = record.get("model_path")
            onnx_candidate = record.get("onnx_path")
        else:
            status = await self.get_status()
            model_candidate = status.get("model_path")
            onnx_candidate = status.get("onnx_path")

        if file_format == "onnx":
            candidate = onnx_candidate
        elif file_format == "zip":
            candidate = model_candidate
        elif file_format == "manifest":
            if not onnx_candidate:
                raise FileNotFoundError("No ONNX artifact is available for manifest")
            candidate = str(manifest_path_for(Path(onnx_candidate)))
        elif file_format == "bundle":
            if not onnx_candidate:
                raise FileNotFoundError("No ONNX artifact is available for bundle")
            candidate = str(bundle_path_for(Path(onnx_candidate)))
        else:
            raise FileNotFoundError(f"Unsupported format: {file_format}")

        if file_format in {"zip", "onnx", "manifest", "bundle"}:
            if not onnx_candidate:
                raise FileNotFoundError("No ONNX artifact is available for deployment readiness checks")
            onnx_path = Path(onnx_candidate)
            manifest_exists = manifest_path_for(onnx_path).exists()
            bundle_exists = bundle_path_for(onnx_path).exists()
            if not (manifest_exists and bundle_exists):
                raise PermissionError(
                    "Model is not deployment-ready. Validation artifacts are missing."
                )

        if not candidate:
            raise FileNotFoundError("No trained model is available yet")

        path = Path(candidate)
        if not path.exists():
            raise FileNotFoundError(f"Artifact not found: {path}")
        return path


training_manager = TrainingManager()
