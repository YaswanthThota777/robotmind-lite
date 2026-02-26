#!/usr/bin/env python
"""RobotMind CLI Training Script.

Train any RL model with optional live pygame rendering.
Single-process, no server required.

Usage
-----
  # Differential robot, PPO, 50k steps, live render window
  python cli_train.py --robot diff --algo PPO --steps 50000 --render

  # Ackermann robot, SAC (continuous), 30k steps, no render
  python cli_train.py --robot ackermann --algo SAC --steps 30000

  # Rover, DQN, custom render frequency
  python cli_train.py --robot rover --algo DQN --steps 20000 --render --render-freq 50

  # Direct environment profile key
  python cli_train.py --env flat_ground_differential_v1 --algo PPO --steps 15000 --render

Architecture
------------
  - ONE environment instance.  Training + rendering share the same world.
  - LiveRenderCallback draws the current state every N steps.
  - No second RobotEnv is created anywhere.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

# Make sure the backend package is findable when run from the backend folder
_HERE = Path(__file__).resolve().parent
if str(_HERE.parent) not in sys.path:
    sys.path.insert(0, str(_HERE.parent))

from gymnasium.wrappers import RecordEpisodeStatistics
from stable_baselines3 import A2C, DDPG, DQN, PPO, SAC, TD3
from stable_baselines3.common.callbacks import CallbackList
from stable_baselines3.common.vec_env import DummyVecEnv

from backend.rl.live_render_callback import LiveRenderCallback
from backend.rl.export import export_model_to_onnx
from backend.simulation.gym_env import ContinuousRobotEnv, RobotEnv
from backend.simulation.presets import get_environment_profile

# ------------------------------------------------------------------ #
# Mappings                                                            #
# ------------------------------------------------------------------ #

ROBOT_TO_PROFILE: dict[str, str] = {
    "diff":       "flat_ground_differential_v1",
    "differential": "flat_ground_differential_v1",
    "ackermann":  "flat_ground_ackermann_v1",
    "rover":      "flat_ground_rover_v1",
}

ALGORITHMS: dict[str, tuple[type, str]] = {
    "PPO":  (PPO,  "discrete"),
    "A2C":  (A2C,  "discrete"),
    "DQN":  (DQN,  "discrete"),
    "SAC":  (SAC,  "continuous"),
    "TD3":  (TD3,  "continuous"),
    "DDPG": (DDPG, "continuous"),
}

# ------------------------------------------------------------------ #
# CLI argument parsing                                                #
# ------------------------------------------------------------------ #

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="RobotMind CLI Trainer – single-process RL training with live rendering",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    # Robot / environment
    parser.add_argument(
        "--robot",
        choices=list(ROBOT_TO_PROFILE.keys()),
        default=None,
        help="Robot type shortcut (diff | ackermann | rover)",
    )
    parser.add_argument(
        "--env",
        default=None,
        help="Direct environment profile key (overrides --robot)",
    )
    # Algorithm
    parser.add_argument(
        "--algo",
        default="PPO",
        choices=list(ALGORITHMS.keys()),
        help="RL algorithm (default: PPO)",
    )
    # Steps
    parser.add_argument(
        "--steps",
        type=int,
        default=50_000,
        help="Total training timesteps (default: 50000)",
    )
    # Live render
    parser.add_argument(
        "--render",
        action="store_true",
        default=False,
        help="Open a pygame window to watch training live",
    )
    # Kept for backwards-compat: --render true / false
    parser.add_argument(
        "--render-flag",
        dest="render_flag",
        default=None,
        choices=["true", "false", "1", "0"],
        help="Alternative render toggle (true/false)",
    )
    parser.add_argument(
        "--render-freq",
        dest="render_freq",
        type=int,
        default=100,
        help="Render every N timesteps (default: 100)",
    )
    # Model profile
    parser.add_argument(
        "--model-profile",
        dest="model_profile",
        default="balanced",
        choices=["fast", "balanced", "deep"],
        help="Network size profile (default: balanced)",
    )
    # Output directory
    parser.add_argument(
        "--output-dir",
        dest="output_dir",
        default=None,
        help="Where to save models (default: backend/models/)",
    )
    return parser.parse_args()


# ------------------------------------------------------------------ #
# Training                                                            #
# ------------------------------------------------------------------ #

def _progress_header(algo: str, env_key: str, steps: int, render: bool) -> None:
    line = "─" * 60
    print(f"\n{line}")
    print(f"  RobotMind CLI Trainer")
    print(f"  Algorithm  : {algo}")
    print(f"  Environment: {env_key}")
    print(f"  Steps      : {steps:,}")
    print(f"  Live render: {'YES (pygame window)' if render else 'NO'}")
    print(f"{line}\n")


class _CLIProgressCallback:
    """Simple stdout progress printer (not a SB3 BaseCallback)."""

    def __init__(self, total_steps: int, print_every: int = 5_000) -> None:
        self.total_steps = total_steps
        self.print_every = print_every
        self._start = time.perf_counter()
        self._last_print = 0

    def maybe_print(self, step: int, reward: float) -> None:
        if step - self._last_print >= self.print_every or step >= self.total_steps:
            elapsed = time.perf_counter() - self._start
            pct = step / self.total_steps * 100
            sps = step / elapsed if elapsed > 0 else 0
            eta = (self.total_steps - step) / sps if sps > 0 else 0
            print(
                f"  [{pct:5.1f}%] step {step:>8,}/{self.total_steps:,}  "
                f"reward {reward:+7.2f}  "
                f"{sps:.0f} sps  "
                f"eta {eta:.0f}s"
            )
            self._last_print = step


from stable_baselines3.common.callbacks import BaseCallback


class _PrintCallback(BaseCallback):
    """Lightweight SB3 callback that prints progress to stdout."""

    def __init__(self, total_steps: int, print_every: int = 5_000) -> None:
        super().__init__(verbose=0)
        self._total = total_steps
        self._every = print_every
        self._start = time.perf_counter()
        self._last_print = 0

    def _on_step(self) -> bool:
        t = self.num_timesteps
        # Always print at regular intervals; also print once when we first hit/pass target
        should_print = (t - self._last_print >= self._every)
        if not should_print and t >= self._total and self._last_print < self._total:
            should_print = True  # single final line when training ends
        if should_print:
            elapsed = time.perf_counter() - self._start
            pct = min(t / self._total * 100, 100.0)
            sps = t / elapsed if elapsed > 0 else 0
            remaining = max(self._total - t, 0)
            eta = remaining / sps if sps > 0 else 0
            print(
                f"  [{pct:5.1f}%] step {min(t, self._total):>8,}/{self._total:,}  "
                f"{sps:.0f} steps/s  "
                f"eta {eta:.0f}s"
            )
            self._last_print = t
        return True

    def _on_rollout_start(self) -> None: pass
    def _on_rollout_end(self) -> None: pass


def train(args: argparse.Namespace) -> None:
    # ---- Resolve environment profile --------------------------------
    env_key: str
    if args.env:
        env_key = args.env
    elif args.robot:
        env_key = ROBOT_TO_PROFILE[args.robot]
    else:
        print("Error: provide --robot or --env.\n")
        sys.exit(1)

    # Validate profile exists
    try:
        env_profile = get_environment_profile(env_key)
    except KeyError:
        print(f"Error: unknown environment profile '{env_key}'. "
              f"Available: {list(ROBOT_TO_PROFILE.values())}")
        sys.exit(1)

    # ---- Resolve render flag ----------------------------------------
    do_render = args.render
    if args.render_flag in ("true", "1"):
        do_render = True
    elif args.render_flag in ("false", "0"):
        do_render = False

    # ---- Algorithm --------------------------------------------------
    algo_name = args.algo.upper()
    algo_class, control_mode = ALGORITHMS[algo_name]

    _progress_header(algo_name, env_key, args.steps, do_render)

    # ---- Build ONE environment (training + rendering share this) ----
    if control_mode == "continuous":
        raw_env = ContinuousRobotEnv(profile=env_key)
    else:
        raw_env = RobotEnv(profile=env_key)

    # Wrap in RecordEpisodeStatistics → DummyVecEnv (SB3 requirement)
    # raw_env is the SINGLE physics instance.  No duplicate is ever created.
    env = DummyVecEnv([lambda: RecordEpisodeStatistics(raw_env)])

    obs_dim = env.observation_space.shape[0]

    # ---- Model ------------------------------------------------------
    model_kwargs: dict = {"verbose": 0, "device": "cpu"}
    model = algo_class("MlpPolicy", env, **model_kwargs)

    # ---- Callbacks --------------------------------------------------
    print_cb = _PrintCallback(total_steps=args.steps, print_every=max(args.steps // 20, 500))

    if do_render:
        render_cb = LiveRenderCallback(
            vec_env=env, render_freq=args.render_freq, verbose=1
        )
        callback = CallbackList([print_cb, render_cb])
    else:
        callback = print_cb

    # ---- Train ------------------------------------------------------
    print(f"  Starting training…  (Ctrl-C to abort)\n")
    t0 = time.perf_counter()
    try:
        model.learn(total_timesteps=args.steps, callback=callback)
    except KeyboardInterrupt:
        print("\n  Training interrupted by user.")

    elapsed = time.perf_counter() - t0
    print(f"\n  Training complete in {elapsed:.1f}s  "
          f"({args.steps / elapsed:.0f} steps/s)\n")

    # ---- Save -------------------------------------------------------
    output_dir = Path(args.output_dir) if args.output_dir else (
        _HERE / "models"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    prefix = algo_name.lower()
    sb3_path = output_dir / f"{prefix}_cli_{timestamp}.zip"
    onnx_path = output_dir / f"{prefix}_cli_{timestamp}.onnx"

    model.save(str(sb3_path))
    print(f"  SB3 model saved  → {sb3_path}")

    try:
        export_model_to_onnx(model, onnx_path, observation_dim=obs_dim)
        print(f"  ONNX model saved → {onnx_path}")
    except Exception as exc:
        print(f"  ONNX export failed (non-fatal): {exc}")

    # ---- Teardown ---------------------------------------------------
    try:
        if do_render and hasattr(raw_env, "close_render"):
            raw_env.close_render()
        env.close()
    except Exception:
        pass

    print("\n  Done.\n")


# ------------------------------------------------------------------ #
# Entry point                                                         #
# ------------------------------------------------------------------ #

if __name__ == "__main__":
    train(parse_args())
