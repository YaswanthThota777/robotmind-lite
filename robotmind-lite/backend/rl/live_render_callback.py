"""LiveRenderCallback — renderers the robot's world during training.

Architecture contract:
  - ONE environment instance only.
  - Training (SB3) and rendering share the SAME physics world.
  - render() only reads world state; it never steps or resets.
  - Never creates a second RobotEnv / ContinuousRobotEnv.
"""

from __future__ import annotations

import gymnasium as gym
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import VecEnv


def _unwrap_to_base(env: gym.Env) -> gym.Env:
    """Walk down gymnasium wrapper chain to the raw environment.

    DummyVecEnv → RecordEpisodeStatistics → RobotEnv (or ContinuousRobotEnv)
    """
    while hasattr(env, "env"):
        env = env.env
    return env


def _extract_inner_env(vec_env: VecEnv) -> gym.Env:
    """Return the first (and only) raw env from a DummyVecEnv wrapper stack."""
    # vec_env.envs[0] is the outermost gymnasium wrapper (e.g. RecordEpisodeStatistics)
    return _unwrap_to_base(vec_env.envs[0])


class LiveRenderCallback(BaseCallback):
    """Renders the training environment every ``render_freq`` timesteps.

    Uses the SAME environment object that SB3 is training on.
    Does NOT create a second simulator.

    Args:
        vec_env:      The DummyVecEnv passed to model.learn().
        render_freq:  Call env.render() every this many *total* timesteps.
                      Default: 100 steps.  Lower = smoother but slower.
        verbose:      SB3 verbosity level.
    """

    def __init__(
        self,
        vec_env: VecEnv,
        render_freq: int = 100,
        verbose: int = 0,
    ) -> None:
        super().__init__(verbose=verbose)
        self._vec_env = vec_env
        self.render_freq = render_freq
        # Unwrap once at construction time so we never do it in the hot loop
        self._inner_env = _extract_inner_env(vec_env)

    # ------------------------------------------------------------------
    # SB3 callback interface
    # ------------------------------------------------------------------

    def _on_training_start(self) -> None:
        if self.verbose >= 1:
            print(
                f"[LiveRenderCallback] rendering every {self.render_freq} steps "
                f"on env type: {type(self._inner_env).__name__}"
            )

    def _on_step(self) -> bool:
        """Called after every environment step by SB3.

        Returns True  → keep training.
        Returns False → stop training (e.g. user closed the window).
        """
        # Only render every render_freq calls to keep training fast
        if self.num_timesteps % self.render_freq != 0:
            return True

        try:
            self._inner_env.render()
        except Exception:
            # Never let a render error abort training
            pass

        return True  # Always continue training

    def _on_training_end(self) -> None:
        """Clean up the pygame window once training is done."""
        try:
            if hasattr(self._inner_env, "close_render"):
                self._inner_env.close_render()
        except Exception:
            pass

    def _on_rollout_start(self) -> None:  # required by BaseCallback
        pass

    def _on_rollout_end(self) -> None:  # required by BaseCallback
        pass
