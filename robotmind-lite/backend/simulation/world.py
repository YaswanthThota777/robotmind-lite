"""Pymunk simulation world and wall collision handling."""

from __future__ import annotations

import pymunk

from backend.simulation.robot import Robot


class SimulationWorld:
    """2D world with static walls and one mobile robot."""

    def __init__(
        self,
        width: int = 640,
        height: int = 480,
        wall_margin: float = 20.0,
        obstacles: list[dict[str, float]] | None = None,
        goal: dict[str, float] | None = None,
    ) -> None:
        self.width = width
        self.height = height
        self.wall_margin = wall_margin
        self.space = pymunk.Space()
        self.space.gravity = (0.0, 0.0)
        # Velocity damping forces the robot to actively maintain speed each step.
        # Without this, one move_forward() action sustains velocity forever,
        # allowing degenerate policies (spin + coast) to achieve high reward.
        self.space.damping = 0.75
        self._obstacle_defs = obstacles or []

        self._wall_shapes: list[pymunk.Segment] = []
        self._obstacle_shapes: list[pymunk.Poly] = []
        self.obstacles: list[dict[str, float]] = []
        self._create_boundary_walls()
        self._create_obstacles()

        # Optional goal target
        self.goal_x: float | None = None
        self.goal_y: float | None = None
        self.goal_radius: float = 18.0
        if goal:
            self.goal_x = float(goal.get("x", 0.0))
            self.goal_y = float(goal.get("y", 0.0))
            self.goal_radius = float(goal.get("radius", 18.0))

        self.robot = Robot(self.space, x=width / 2, y=height / 2)

    def _create_boundary_walls(self) -> None:
        """Create rectangle boundary walls."""
        body = self.space.static_body
        margin = self.wall_margin
        corners = [
            (margin, margin),
            (self.width - margin, margin),
            (self.width - margin, self.height - margin),
            (margin, self.height - margin),
        ]

        segments = [
            pymunk.Segment(body, corners[0], corners[1], 2.0),
            pymunk.Segment(body, corners[1], corners[2], 2.0),
            pymunk.Segment(body, corners[2], corners[3], 2.0),
            pymunk.Segment(body, corners[3], corners[0], 2.0),
        ]

        for shape in segments:
            shape.elasticity = 1.0
            shape.friction = 0.9
            self._wall_shapes.append(shape)

        self.space.add(*segments)

    def _create_obstacles(self) -> None:
        """Create static rectangular obstacles.

        Each obstacle gets its own STATIC Body so that moving one body does not
        accidentally shift the shared static_body (which would also displace the
        boundary wall segments and break all collision geometry).
        """
        self._obstacle_bodies: list[pymunk.Body] = []
        for obstacle in self._obstacle_defs:
            x = obstacle["x"]
            y = obstacle["y"]
            w = obstacle["width"]
            h = obstacle["height"]
            # Individual static body — position can be set freely without side-effects
            body = pymunk.Body(body_type=pymunk.Body.STATIC)
            body.position = (x + w / 2, y + h / 2)
            poly = pymunk.Poly.create_box(body, (w, h))
            poly.elasticity = 1.0
            poly.friction = 0.5
            self._obstacle_bodies.append(body)
            self._obstacle_shapes.append(poly)
            self.obstacles.append(obstacle)

        if self._obstacle_bodies:
            self.space.add(*self._obstacle_bodies, *self._obstacle_shapes)

    def reset(self, angle_degrees: float = 0.0) -> None:
        """Reset world state to defaults."""
        self.robot.reset(x=self.width / 2, y=self.height / 2, angle_degrees=angle_degrees)

    def check_goal_reached(self) -> bool:
        """Return True if the robot centre is within the goal radius."""
        if self.goal_x is None:
            return False
        dx = self.robot.x - self.goal_x
        dy = self.robot.y - self.goal_y
        dist = (dx * dx + dy * dy) ** 0.5
        return dist <= (self.goal_radius + self.robot.config.radius)

    def step(self, dt: float = 1 / 30) -> bool:
        """Step the world and return collision flag for the robot."""
        self.space.step(dt)
        collisions = self.space.shape_query(self.robot.shape)
        for collision in collisions:
            if collision.shape in self._wall_shapes or collision.shape in self._obstacle_shapes:
                return True
        return False
