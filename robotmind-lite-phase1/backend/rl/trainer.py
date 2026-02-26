from __future__ import annotations

from pathlib import Path

from stable_baselines3 import PPO

from simulation.gym_env import RobotEnv


def train(robot_type: str, env_mode: str, steps: int, model_path: str) -> str:
    """Train PPO policy for the selected robot and environment."""
    env = RobotEnv(robot_type=robot_type, env_mode=env_mode)
    model = PPO("MlpPolicy", env, verbose=1)
    model.learn(total_timesteps=steps)

    output = Path(model_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(output))
    env.close()
    print(f"Saved model to {output}")
    return str(output)
