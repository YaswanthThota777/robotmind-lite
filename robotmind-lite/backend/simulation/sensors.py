"""Ray-based distance sensors for the robot."""

from __future__ import annotations

from math import cos, radians, sin
from typing import Iterable

import pymunk


def cast_rays(
    space: pymunk.Space,
    origin: tuple[float, float],
    heading_degrees: float,
    ray_count: int = 5,
    ray_length: float = 140.0,
    fov_degrees: float = 120.0,
) -> list[float]:
    """Cast sensor rays and return normalized distances in [0, 1]."""
    if ray_count < 2:
        raise ValueError("ray_count must be >= 2")

    angle_start = heading_degrees - fov_degrees / 2
    angle_step = fov_degrees / (ray_count - 1)

    distances: list[float] = []
    query_filter = pymunk.ShapeFilter(group=1)

    for ray_index in range(ray_count):
        angle = radians(angle_start + ray_index * angle_step)
        end_x = origin[0] + ray_length * cos(angle)
        end_y = origin[1] + ray_length * sin(angle)
        hit = space.segment_query_first(origin, (end_x, end_y), 0.0, query_filter)

        if hit is None:
            distances.append(1.0)
        else:
            distances.append(max(0.0, min(1.0, hit.alpha)))

    return distances


def mean_distance(distances: Iterable[float]) -> float:
    """Return mean distance for quick telemetry."""
    values = list(distances)
    if not values:
        return 0.0
    return float(sum(values) / len(values))
