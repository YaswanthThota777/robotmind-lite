from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import pymunk


@dataclass
class WorldConfig:
    width: float = 10.0
    height: float = 10.0
    wall_thickness: float = 0.1
    obstacle_count: int = 6
    obstacle_size: Tuple[float, float] = (0.6, 0.4)
    goal_radius: float = 0.35
    dt: float = 1.0 / 30.0


class World:
    """Flat 2D world with walls, obstacles, and optional goal."""

    def __init__(self, mode: str, config: WorldConfig | None = None) -> None:
        self.mode = mode
        self.config = config or WorldConfig()
        self.space = pymunk.Space()
        self.space.damping = 0.98
        self.collision_happened = False
        self.goal_position: Tuple[float, float] | None = None
        self._build_world()

    def _build_world(self) -> None:
        self.space.remove(*self.space.bodies, *self.space.shapes)
        self._add_walls()
        if self.mode in {"obstacle", "maze", "goal"}:
            self._add_obstacles()
        if self.mode == "maze":
            self._add_maze_walls()
        if self.mode == "goal":
            self._add_goal()

    def _add_walls(self) -> None:
        w = self.config.width
        h = self.config.height
        thickness = self.config.wall_thickness
        static = self.space.static_body
        segments = [
            pymunk.Segment(static, (0.0, 0.0), (w, 0.0), thickness),
            pymunk.Segment(static, (w, 0.0), (w, h), thickness),
            pymunk.Segment(static, (w, h), (0.0, h), thickness),
            pymunk.Segment(static, (0.0, h), (0.0, 0.0), thickness),
        ]
        for seg in segments:
            seg.friction = 0.9
            seg.collision_type = 2
        self.space.add(*segments)

    def _add_obstacles(self) -> None:
        w = self.config.width
        h = self.config.height
        obs_w, obs_h = self.config.obstacle_size
        for i in range(self.config.obstacle_count):
            x = (i + 1) * (w / (self.config.obstacle_count + 1))
            y = (h * 0.25) if i % 2 == 0 else (h * 0.75)
            body = pymunk.Body(body_type=pymunk.Body.STATIC)
            body.position = (x, y)
            shape = pymunk.Poly.create_box(body, (obs_w, obs_h))
            shape.friction = 0.9
            shape.collision_type = 3
            self.space.add(body, shape)

    def _add_maze_walls(self) -> None:
        w = self.config.width
        h = self.config.height
        static = self.space.static_body
        segments: List[pymunk.Segment] = []
        segments.append(pymunk.Segment(static, (w * 0.25, 0.0), (w * 0.25, h * 0.7), 0.08))
        segments.append(pymunk.Segment(static, (w * 0.5, h * 0.3), (w * 0.5, h), 0.08))
        segments.append(pymunk.Segment(static, (w * 0.75, 0.0), (w * 0.75, h * 0.7), 0.08))
        for seg in segments:
            seg.friction = 0.9
            seg.collision_type = 2
        self.space.add(*segments)

    def _add_goal(self) -> None:
        w = self.config.width
        h = self.config.height
        self.goal_position = (w * 0.85, h * 0.85)

    def reset(self, mode: str | None = None) -> None:
        if mode:
            self.mode = mode
        self.collision_happened = False
        self.goal_position = None
        self._build_world()

    def step(self) -> None:
        self.space.step(self.config.dt)

    def distance_to_goal(self, position: Tuple[float, float]) -> float | None:
        if not self.goal_position:
            return None
        dx = self.goal_position[0] - position[0]
        dy = self.goal_position[1] - position[1]
        return (dx * dx + dy * dy) ** 0.5
