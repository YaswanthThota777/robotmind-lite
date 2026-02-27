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


def cast_rays_at_angles(
    space: pymunk.Space,
    origin: tuple[float, float],
    heading_degrees: float,
    angles_relative_degrees: list[float],
    ray_length: float = 140.0,
) -> list[float]:
    """Cast rays at specific robot-relative angles and return normalized [0,1] distances.

    Args:
        space: The pymunk physics space to query.
        origin: (x, y) world-space position of the robot centre.
        heading_degrees: Current robot heading in degrees.
        angles_relative_degrees: Robot-relative offsets (0° = straight ahead,
            90° = right, 180° = rear, 270°/-90° = left).
        ray_length: Maximum ray travel distance in world units.

    Returns:
        Normalized distances in [0, 1] — 1.0 means no obstacle within ray_length.
    """
    distances: list[float] = []
    query_filter = pymunk.ShapeFilter(group=1)

    for angle_rel in angles_relative_degrees:
        angle = radians(heading_degrees + angle_rel)
        end_x = origin[0] + ray_length * cos(angle)
        end_y = origin[1] + ray_length * sin(angle)
        hit = space.segment_query_first(origin, (end_x, end_y), 0.0, query_filter)

        if hit is None:
            distances.append(1.0)
        else:
            distances.append(max(0.0, min(1.0, hit.alpha)))

    return distances


def direction_label(angle_rel_degrees: float) -> str:
    """Convert a robot-relative angle to a human-readable cardinal label.

    Args:
        angle_rel_degrees: Angle relative to robot heading in degrees.
            0 = front, 90 = right, 180 = rear, 270/-90 = left.

    Returns:
        Human-readable string such as "Front", "Right", "Rear-Left".
    """
    a = angle_rel_degrees % 360.0
    if a > 180.0:
        a -= 360.0  # normalize to -180 .. +180
    if -22.5 <= a < 22.5:
        return "Front"
    elif 22.5 <= a < 67.5:
        return "Front-Right"
    elif 67.5 <= a < 112.5:
        return "Right"
    elif 112.5 <= a < 157.5:
        return "Rear-Right"
    elif a >= 157.5 or a < -157.5:
        return "Rear"
    elif -157.5 <= a < -112.5:
        return "Rear-Left"
    elif -112.5 <= a < -67.5:
        return "Left"
    else:
        return "Front-Left"


def mean_distance(distances: Iterable[float]) -> float:
    """Return mean distance for quick telemetry."""
    values = list(distances)
    if not values:
        return 0.0
    return float(sum(values) / len(values))
