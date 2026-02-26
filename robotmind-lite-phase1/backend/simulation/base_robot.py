from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Tuple

import pymunk


@dataclass
class RobotConfig:
    radius: float = 0.3
    max_speed: float = 2.0
    max_angular_speed: float = 3.0
    wheel_base: float = 0.6
    mass: float = 5.0
    friction: float = 0.8


class BaseRobot(ABC):
    """Abstract robot base for flat-ground 2D simulation."""

    def __init__(self, space: pymunk.Space, position: Tuple[float, float], config: RobotConfig) -> None:
        self.space = space
        self.config = config
        self.body = pymunk.Body()
        self.body.position = position
        self.body.angle = 0.0
        self.shape = pymunk.Circle(self.body, config.radius)
        self.shape.mass = config.mass
        self.shape.friction = config.friction
        self.shape.collision_type = 1
        self.space.add(self.body, self.shape)

    @abstractmethod
    def apply_action(self, action: Tuple[float, float]) -> None:
        """Apply normalized action values in range [-1, 1]."""

    def get_state(self) -> dict:
        """Return robot pose and velocity state."""
        vx, vy = self.body.velocity
        return {
            "x": float(self.body.position.x),
            "y": float(self.body.position.y),
            "angle": float(self.body.angle),
            "vx": float(vx),
            "vy": float(vy),
        }

    def reset(self, position: Tuple[float, float], angle: float = 0.0) -> None:
        """Reset robot pose and motion state."""
        self.body.position = position
        self.body.angle = angle
        self.body.velocity = (0.0, 0.0)
        self.body.angular_velocity = 0.0

    def set_velocity(self, speed: float, angular_speed: float) -> None:
        """Set forward speed and angular velocity using current heading."""
        heading = pymunk.Vec2d(1.0, 0.0).rotated(self.body.angle)
        self.body.velocity = heading * speed
        self.body.angular_velocity = angular_speed
