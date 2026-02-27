"""Environment API endpoints."""

from __future__ import annotations

import threading

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.simulation.gym_env import CurriculumRobotEnv, RobotEnv
from backend.simulation.presets import (
    generate_maze_preset,
    get_environment_profile,
    list_environment_profiles,
    register_environment_profile,
)

router = APIRouter(prefix="/environment", tags=["environment"])


class LiveProfileRequest(BaseModel):
    profile: str = Field(default="arena_basic")
    custom_environment: dict[str, object] | None = None


def _build_live_env(profile: str) -> RobotEnv:
    """Instantiate the correct env class for the given profile.

    CurriculumRobotEnv is used for profiles whose metadata declares
    ``env_class: curriculum`` (multi-layout, randomised spawn/goal).
    All other profiles use the standard ``RobotEnv``.
    """
    try:
        cfg = get_environment_profile(profile)
        env_class_flag = str(cfg.get("metadata", {}).get("env_class", "")).lower()
    except Exception:
        env_class_flag = ""
    if env_class_flag == "curriculum":
        return CurriculumRobotEnv(profile=profile)
    return RobotEnv(profile=profile)


class LiveEnvManager:
    """Single live environment instance for real-time UI preview."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._profile = "arena_basic"
        self._env = _build_live_env(self._profile)
        self._env.reset()

    def switch_profile(self, profile: str) -> dict[str, object]:
        with self._lock:
            self._profile = profile
            self._env = _build_live_env(profile)
            self._env.reset()
            return self._env.get_state()

    def reset(self) -> dict[str, object]:
        with self._lock:
            self._env.reset()
            return self._env.get_state()

    def step(self, action: int) -> dict[str, object]:
        with self._lock:
            self._env.step(action)
            return self._env.get_state()

    def auto_step(self) -> dict[str, object]:
        """Advance environment with autonomous motion for streaming."""
        with self._lock:
            return self._env.step_auto()

    def state(self) -> dict[str, object]:
        with self._lock:
            return self._env.get_state()


live_env_manager = LiveEnvManager()


@router.post("/create")
async def create_environment() -> dict[str, object]:
    """Initialize a simulation environment and return its initial state."""
    env = RobotEnv()
    observation, _ = env.reset()
    # TODO: Support multiple named environments with lifecycle management.
    return {
        "message": "environment created",
        "observation_shape": list(observation.shape),
        "initial_observation": observation.tolist(),
        "action_space_n": int(env.action_space.n),
    }


@router.get("/profiles")
async def environment_profiles() -> list[dict[str, str]]:
    """Return available environment presets for training and visualization."""
    return list_environment_profiles()


@router.post("/live-profile")
async def live_profile(payload: LiveProfileRequest) -> dict[str, object]:
    """Switch active live environment preset and reset state."""
    try:
        profile_key = payload.profile
        if payload.custom_environment is not None:
            profile_key = register_environment_profile(
                key=f"custom_live_{payload.profile}",
                label=f"Custom Live {payload.profile}",
                description="User-provided custom live environment",
                config_override=payload.custom_environment,
                base_profile=payload.profile,
            )
        return live_env_manager.switch_profile(profile_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/live-reset")
async def live_reset() -> dict[str, object]:
    """Reset the live simulation environment."""
    return live_env_manager.reset()


@router.post("/live-step")
async def live_step(
    action: int = Query(..., ge=0, le=2),
) -> dict[str, object]:
    """Step the live simulation environment with an action."""
    try:
        return live_env_manager.step(action)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/live-state")
async def live_state() -> dict[str, object]:
    """Get the current live simulation state."""
    return live_env_manager.state()


class MazeRequest(BaseModel):
    rows: int = Field(default=5, ge=2, le=20)
    cols: int = Field(default=5, ge=2, le=20)
    cell_size: int = Field(default=70, ge=30, le=150)
    seed: int | None = Field(default=None)


@router.post("/generate-maze")
async def generate_maze(payload: MazeRequest) -> dict[str, object]:
    """Generate a fresh procedural maze and register it as a live environment."""
    try:
        preset = generate_maze_preset(
            rows=payload.rows,
            cols=payload.cols,
            cell_size=payload.cell_size,
            seed=payload.seed,
        )
        profile_key = f"maze_{payload.rows}x{payload.cols}_s{payload.seed or 0}"
        register_environment_profile(
            key=profile_key,
            label=preset["label"],
            description=preset["description"],
            config_override=preset,
        )
        return {"profile_key": profile_key, "preset": preset}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc