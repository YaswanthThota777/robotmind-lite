from __future__ import annotations

from typing import Tuple

from .base_robot import BaseRobot


class DifferentialDriveRobot(BaseRobot):
    """Differential drive robot with left/right wheel actions."""

    def apply_action(self, action: Tuple[float, float]) -> None:
        left, right = action
        left = max(-1.0, min(1.0, float(left)))
        right = max(-1.0, min(1.0, float(right)))
        linear = (left + right) * 0.5 * self.config.max_speed
        angular = (right - left) * self.config.max_angular_speed
        self.set_velocity(linear, angular)
