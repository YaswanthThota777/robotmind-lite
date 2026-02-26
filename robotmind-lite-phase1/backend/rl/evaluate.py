from __future__ import annotations

from stable_baselines3 import PPO

from simulation.gym_env import RobotEnv


def evaluate(robot_type: str, env_mode: str, model_path: str, episodes: int = 5) -> None:
    """Evaluate a saved PPO model."""
    env = RobotEnv(robot_type=robot_type, env_mode=env_mode)
    model = PPO.load(model_path)

    for episode in range(episodes):
        obs, _ = env.reset()
        done = False
        truncated = False
        total_reward = 0.0
        while not (done or truncated):
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, done, truncated, _ = env.step(action)
            total_reward += reward
        print(f"Episode {episode + 1}: reward={total_reward:.2f}")
    env.close()
