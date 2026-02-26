from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import pymunk


@dataclass
class RaySensorConfig:
    num_rays: int = 7
    fov_degrees: float = 150.0
    max_range: float = 6.0


class RaySensorArray:
    """Cast fixed rays in a flat 2D world and return normalized distances."""

    def __init__(self, config: RaySensorConfig) -> None:
        self.config = config

    def sense(
        self,
        space: pymunk.Space,
        position: Tuple[float, float],
        angle: float,
        ignore_shape: Optional[pymunk.Shape] = None,
    ) -> List[float]:
        start = pymunk.Vec2d(position)
        fov_rad = self.config.fov_degrees * 3.14159265 / 180.0
        if self.config.num_rays <= 1:
            ray_angles = [0.0]
        else:
            step = fov_rad / (self.config.num_rays - 1)
            ray_angles = [(-fov_rad / 2.0) + step * i for i in range(self.config.num_rays)]

        distances: List[float] = []
        for rel_angle in ray_angles:
            direction = pymunk.Vec2d(1.0, 0.0).rotated(angle + rel_angle)
            end = start + direction * self.config.max_range
            query = space.segment_query_first(start, end, 0.0, pymunk.ShapeFilter())
            if query and query.shape is not None and query.shape is not ignore_shape:
                hit_distance = (query.point - start).length
                distances.append(max(0.0, min(1.0, hit_distance / self.config.max_range)))
            else:
                distances.append(1.0)
        return distances
