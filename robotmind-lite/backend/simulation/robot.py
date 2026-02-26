"""Robot body and motion controls for the simulation."""

from __future__ import annotations

from dataclasses import dataclass
from math import cos, radians, sin

import pymunk


@dataclass
class RobotConfig:
    """Configuration for the robot body."""

    radius: float = 15.0
    speed: float = 130.0
    turn_rate_degrees: float = 12.0


class Robot:
    """Simple circular robot with heading and movement actions."""

    def __init__(self, space: pymunk.Space, x: float, y: float, config: RobotConfig | None = None) -> None:
        self.space = space
        self.config = config or RobotConfig()
        self.angle_degrees = 0.0

        mass = 1.0
        moment = pymunk.moment_for_circle(mass, 0, self.config.radius)
        self.body = pymunk.Body(mass, moment)
        self.body.position = (x, y)

        self.shape = pymunk.Circle(self.body, self.config.radius)
        self.shape.elasticity = 0.1
        self.shape.friction = 0.8
        self.shape.filter = pymunk.ShapeFilter(group=1)

        self.space.add(self.body, self.shape)

    def reset(self, x: float, y: float) -> None:
        """Reset robot state to initial pose."""
        self.body.position = (x, y)
        self.body.velocity = (0.0, 0.0)
        self.angle_degrees = 0.0

    def move_forward(self) -> None:
        """Apply forward velocity along heading."""
        heading = radians(self.angle_degrees)
        self.body.velocity = (
            self.config.speed * cos(heading),
            self.config.speed * sin(heading),
        )

    def rotate_left(self) -> None:
        """Rotate robot left in degrees."""
        self.angle_degrees = (self.angle_degrees - self.config.turn_rate_degrees) % 360.0

    def rotate_right(self) -> None:
        """Rotate robot right in degrees."""
        self.angle_degrees = (self.angle_degrees + self.config.turn_rate_degrees) % 360.0

    @property
    def x(self) -> float:
        return float(self.body.position.x)

    @property
    def y(self) -> float:
        return float(self.body.position.y)
