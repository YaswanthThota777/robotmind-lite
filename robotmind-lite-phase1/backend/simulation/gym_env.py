from __future__ import annotations

from typing import Dict, Tuple

import gymnasium as gym
import numpy as np
import pymunk

from .ackermann_drive import AckermannRobot
from .base_robot import RobotConfig
from .differential_drive import DifferentialDriveRobot
from .rover_robot import RoverRobot
from .sensors import RaySensorArray, RaySensorConfig
from .world import World


class RobotEnv(gym.Env):
    """Gymnasium environment for flat-ground robot navigation."""

    metadata = {"render_modes": ["human"], "render_fps": 30}

    def __init__(
        self,
        robot_type: str = "diff",
        env_mode: str = "arena",
        max_steps: int = 500,
        reward_config: Dict[str, float] | None = None,
        render_mode: str | None = None,
    ) -> None:
        super().__init__()
        self.robot_type = robot_type
        self.env_mode = env_mode
        self.max_steps = max_steps
        self.render_mode = render_mode
        self.reward_config = reward_config or {
            "forward": 0.5,
            "time": -0.01,
            "collision": -10.0,
            "goal": 10.0,
            "distance": 1.0,
        }
        self.world = World(env_mode)
        self.robot = self._create_robot()
        self.sensors = RaySensorArray(RaySensorConfig())
        self.step_count = 0
        self.collision = False
        self.prev_goal_dist = None

        self.action_space = gym.spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=np.float32)
        obs_size = self.sensors.config.num_rays + 6
        self.observation_space = gym.spaces.Box(low=-1.0, high=1.0, shape=(obs_size,), dtype=np.float32)
        self._setup_collision_handlers()

    def _create_robot(self):
        config = RobotConfig()
        start = (self.world.config.width * 0.15, self.world.config.height * 0.15)
        if self.robot_type == "ackermann":
            return AckermannRobot(self.world.space, start, config)
        if self.robot_type == "rover":
            return RoverRobot(self.world.space, start, config)
        return DifferentialDriveRobot(self.world.space, start, config)

    def _setup_collision_handlers(self) -> None:
        def on_collision(*_args):
            self.collision = True
            return True

        handler_wall = self.world.space.add_collision_handler(1, 2)
        handler_obs = self.world.space.add_collision_handler(1, 3)
        handler_wall.begin = on_collision
        handler_obs.begin = on_collision

    def _get_obs(self) -> np.ndarray:
        state = self.robot.get_state()
        sensors = self.sensors.sense(
            self.world.space,
            (state["x"], state["y"]),
            state["angle"],
            ignore_shape=self.robot.shape,
        )
        width = self.world.config.width
        height = self.world.config.height
        x = (state["x"] / width) * 2.0 - 1.0
        y = (state["y"] / height) * 2.0 - 1.0
        angle = state["angle"]
        vx = max(-1.0, min(1.0, state["vx"] / self.robot.config.max_speed))
        vy = max(-1.0, min(1.0, state["vy"] / self.robot.config.max_speed))
        obs = np.array(
            sensors
            + [
                x,
                y,
                float(np.cos(angle)),
                float(np.sin(angle)),
                vx,
                vy,
            ],
            dtype=np.float32,
        )
        return obs

    def reset(self, *, seed: int | None = None, options: dict | None = None) -> Tuple[np.ndarray, dict]:
        super().reset(seed=seed)
        self.world.reset(self.env_mode)
        self.robot = self._create_robot()
        self.collision = False
        self.step_count = 0
        self.prev_goal_dist = None
        self._setup_collision_handlers()
        obs = self._get_obs()
        info = {}
        return obs, info

    def step(self, action: np.ndarray):
        self.robot.apply_action((float(action[0]), float(action[1])))
        self.world.step()
        self.step_count += 1

        obs = self._get_obs()
        done = False
        reward = 0.0

        heading = np.array([np.cos(self.robot.body.angle), np.sin(self.robot.body.angle)], dtype=np.float32)
        velocity = np.array([self.robot.body.velocity.x, self.robot.body.velocity.y], dtype=np.float32)
        forward_speed = float(np.dot(heading, velocity) / max(1e-6, self.robot.config.max_speed))
        reward += self.reward_config["forward"] * max(0.0, forward_speed)
        reward += self.reward_config["time"]

        if self.world.goal_position:
            dist = self.world.distance_to_goal((self.robot.body.position.x, self.robot.body.position.y))
            if dist is not None:
                if self.prev_goal_dist is not None:
                    reward += self.reward_config["distance"] * (self.prev_goal_dist - dist)
                self.prev_goal_dist = dist
                if dist <= self.world.config.goal_radius:
                    reward += self.reward_config["goal"]
                    done = True

        if self.collision:
            reward += self.reward_config["collision"]
            done = True

        truncated = self.step_count >= self.max_steps
        info = {"collision": self.collision}
        return obs, reward, done, truncated, info

    def render(self):
        if self.render_mode != "human":
            return None
        import matplotlib.pyplot as plt
        from matplotlib.patches import Circle, Rectangle

        fig, ax = plt.subplots(figsize=(5, 5))
        ax.set_xlim(0, self.world.config.width)
        ax.set_ylim(0, self.world.config.height)
        ax.set_aspect("equal")
        ax.set_title("RobotMind Lite - Flat Ground")

        for shape in self.world.space.shapes:
            if isinstance(shape, pymunk.Poly) and shape.body.body_type == pymunk.Body.STATIC:
                bb = shape.bb
                ax.add_patch(Rectangle((bb.left, bb.bottom), bb.right - bb.left, bb.top - bb.bottom, color="gray"))

        if self.world.goal_position:
            ax.add_patch(Circle(self.world.goal_position, self.world.config.goal_radius, color="green", alpha=0.5))

        ax.add_patch(Circle(self.robot.body.position, self.robot.config.radius, color="blue"))
        plt.show()
        return fig
