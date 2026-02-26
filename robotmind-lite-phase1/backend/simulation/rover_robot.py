from __future__ import annotations

from math import tan
from typing import Tuple

from .base_robot import BaseRobot, RobotConfig


class RoverRobot(BaseRobot):
    """Four-wheel rover with conservative speed and steering."""

    max_steer = 0.5

    def __init__(self, space, position, config: RobotConfig) -> None:
        config.max_speed *= 0.8
        config.max_angular_speed *= 0.7
        super().__init__(space, position, config)

    def apply_action(self, action: Tuple[float, float]) -> None:
        throttle, steering = action
        throttle = max(-1.0, min(1.0, float(throttle)))
        steering = max(-1.0, min(1.0, float(steering)))
        speed = throttle * self.config.max_speed
        steer_angle = steering * self.max_steer
        angular = 0.0
        if abs(steer_angle) > 1e-3:
            angular = (speed / self.config.wheel_base) * tan(steer_angle)
        self.set_velocity(speed, max(-self.config.max_angular_speed, min(self.config.max_angular_speed, angular)))
