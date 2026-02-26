"""Environment and model preset catalogs for RobotMind Lite."""

from __future__ import annotations

import json
import random as _random
from copy import deepcopy
from pathlib import Path
from typing import Any

from backend.config import settings


# ── Maze generator ─────────────────────────────────────────────────────────

def _generate_maze_obstacles(
    rows: int,
    cols: int,
    cell_size: int = 70,
    wall_thickness: int = 10,
    margin: int = 25,
    seed: int | None = None,
) -> list[dict[str, float]]:
    """Recursive-backtracking DFS maze → list of rectangular wall obstacles."""
    rng = _random.Random(seed)
    # h_walls[r][c] = True → wall below cell (r,c), i.e. between rows r and r+1
    h_walls = [[True] * cols for _ in range(rows - 1)]
    # v_walls[c][r] = True → wall right of cell (r,c), between cols c and c+1
    v_walls = [[True] * rows for _ in range(cols - 1)]
    visited = [[False] * cols for _ in range(rows)]

    def _unvisited_nbrs(r: int, c: int) -> list[tuple[int, int, str]]:
        out: list[tuple[int, int, str]] = []
        if r > 0 and not visited[r - 1][c]:        out.append((r - 1, c, "N"))
        if r < rows - 1 and not visited[r + 1][c]: out.append((r + 1, c, "S"))
        if c > 0 and not visited[r][c - 1]:        out.append((r, c - 1, "W"))
        if c < cols - 1 and not visited[r][c + 1]: out.append((r, c + 1, "E"))
        return out

    stack = [(0, 0)]
    visited[0][0] = True
    while stack:
        r, c = stack[-1]
        nbrs = _unvisited_nbrs(r, c)
        if not nbrs:
            stack.pop()
            continue
        nr, nc, direction = rng.choice(nbrs)
        if direction == "S":   h_walls[r][c]     = False
        elif direction == "N": h_walls[r - 1][c] = False
        elif direction == "E": v_walls[c][r]     = False
        elif direction == "W": v_walls[c - 1][r] = False
        visited[nr][nc] = True
        stack.append((nr, nc))

    t = wall_thickness
    obstacles: list[dict[str, float]] = []
    # horizontal walls spanning full cell width
    for r in range(rows - 1):
        for c in range(cols):
            if h_walls[r][c]:
                obstacles.append({
                    "x": float(margin + c * cell_size),
                    "y": float(margin + (r + 1) * cell_size - t // 2),
                    "width": float(cell_size),
                    "height": float(t),
                })
    # vertical walls spanning full cell height
    for vc in range(cols - 1):
        for r in range(rows):
            if v_walls[vc][r]:
                obstacles.append({
                    "x": float(margin + (vc + 1) * cell_size - t // 2),
                    "y": float(margin + r * cell_size),
                    "width": float(t),
                    "height": float(cell_size),
                })
    return obstacles


def _make_maze_preset(
    rows: int,
    cols: int,
    cell_size: int = 70,
    wall_thickness: int = 10,
    seed: int | None = None,
) -> dict[str, Any]:
    """Build a full environment-profile dict for a procedurally generated maze."""
    margin = 30
    width  = margin + cols * cell_size + margin
    height = margin + rows * cell_size + margin
    obstacles = _generate_maze_obstacles(rows, cols, cell_size, wall_thickness, margin, seed)
    robot_radius = max(10.0, cell_size * 0.18)
    # Spawn at top-left cell centre; goal at bottom-right cell centre
    spawn_x = float(margin + cell_size * 0.5)
    spawn_y = float(margin + cell_size * 0.5)
    goal_x  = float(margin + cell_size * (cols - 0.5))
    goal_y  = float(margin + cell_size * (rows - 0.5))
    return {
        "label": f"Maze {rows}\u00d7{cols}",
        "description": (
            f"Procedural {rows}\u00d7{cols} maze — navigate from start (top-left) "
            f"to the \u2605 goal (bottom-right). Seed: {seed if seed is not None else 'random'}."
        ),
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "flat_ground_model": "differential",
            "maze_rows": rows,
            "maze_cols": cols,
            "maze_seed": seed,
        },
        "world": {
            "width": float(width),
            "height": float(height),
            "wall_margin": float(margin),
            "obstacles": obstacles,
            "goal": {"x": goal_x, "y": goal_y, "radius": robot_radius + 8.0},
        },
        "sensor": {
            "ray_count": 12,
            "ray_length": float(cell_size * 1.6),
            "ray_fov_degrees": 240.0,
        },
        "dynamics": {
            "sensor_noise_std": 0.01,
            "heading_drift_std": 0.3,
            "speed_noise_std": 0.02,
            "turn_noise_std": 0.3,
            "randomize_spawn": False,
            "speed_scale_min": 1.0,
            "speed_scale_max": 1.0,
            "turn_scale_min": 1.0,
            "turn_scale_max": 1.0,
            "max_steps": rows * cols * 200,
            "spawn_x": spawn_x,
            "spawn_y": spawn_y,
        },
        "robot": {
            "radius": robot_radius,
            "speed": 100.0,
            "turn_rate_degrees": 10.0,
        },
        "visual": {
            "bg": "#0f172a",
            "wall": "#1e3a5f",
            "obstacle": "#1e3a5f",
            "robot": "#22c55e",
            "robot_collision": "#ef4444",
            "ray": "rgba(56,189,248,0.45)",
            "goal": "#f59e0b",
        },
    }


ENVIRONMENT_PROFILES: dict[str, dict[str, Any]] = {
    "arena_basic": {
        "label": "Arena Basic",
        "description": "Balanced obstacle arena for baseline RL experiments.",
        "metadata": {"supported_control_modes": ["discrete", "continuous"]},
        "world": {
            "width": 640,
            "height": 480,
            "wall_margin": 20.0,
            "obstacles": [
                {"x": 180.0, "y": 140.0, "width": 120.0, "height": 30.0},
                {"x": 440.0, "y": 260.0, "width": 60.0, "height": 140.0},
                {"x": 140.0, "y": 360.0, "width": 160.0, "height": 40.0},
            ],
        },
        "sensor": {
            "ray_count": 8,
            "ray_length": 140.0,
            "ray_fov_degrees": 120.0,
        },
        "dynamics": {
            "sensor_noise_std": 0.0,
            "heading_drift_std": 0.0,
            "speed_noise_std": 0.0,
            "turn_noise_std": 0.0,
            "randomize_spawn": False,
            "speed_scale_min": 1.0,
            "speed_scale_max": 1.0,
            "turn_scale_min": 1.0,
            "turn_scale_max": 1.0,
        },
        "robot": {
            "radius": 15.0,
            "speed": 130.0,
            "turn_rate_degrees": 12.0,
        },
        "visual": {
            "bg": "#0f172a",
            "wall": "#1e293b",
            "obstacle": "#1f2937",
            "robot": "#22c55e",
            "robot_collision": "#ef4444",
            "ray": "rgba(56, 189, 248, 0.5)",
        },
    },
    "warehouse_dense": {
        "label": "Warehouse Dense",
        "description": "High-obstacle layout for difficult navigation and collision avoidance.",
        "metadata": {"supported_control_modes": ["discrete", "continuous"]},
        "world": {
            "width": 760,
            "height": 520,
            "wall_margin": 24.0,
            "obstacles": [
                {"x": 120.0, "y": 100.0, "width": 180.0, "height": 36.0},
                {"x": 360.0, "y": 90.0, "width": 70.0, "height": 170.0},
                {"x": 500.0, "y": 140.0, "width": 180.0, "height": 40.0},
                {"x": 170.0, "y": 260.0, "width": 80.0, "height": 180.0},
                {"x": 320.0, "y": 300.0, "width": 230.0, "height": 45.0},
                {"x": 610.0, "y": 280.0, "width": 60.0, "height": 160.0},
            ],
        },
        "sensor": {
            "ray_count": 12,
            "ray_length": 170.0,
            "ray_fov_degrees": 180.0,
        },
        "dynamics": {
            "sensor_noise_std": 0.01,
            "heading_drift_std": 0.4,
            "speed_noise_std": 0.03,
            "turn_noise_std": 0.4,
            "randomize_spawn": True,
            "speed_scale_min": 0.9,
            "speed_scale_max": 1.1,
            "turn_scale_min": 0.9,
            "turn_scale_max": 1.1,
        },
        "robot": {
            "radius": 14.0,
            "speed": 120.0,
            "turn_rate_degrees": 10.0,
        },
        "visual": {
            "bg": "#0b1320",
            "wall": "#334155",
            "obstacle": "#374151",
            "robot": "#14b8a6",
            "robot_collision": "#f97316",
            "ray": "rgba(45, 212, 191, 0.45)",
        },
    },
    "corridor_sprint": {
        "label": "Corridor Sprint",
        "description": "Narrow corridors with longer sensor range and faster robot motion.",
        "metadata": {"supported_control_modes": ["discrete", "continuous"]},
        "world": {
            "width": 840,
            "height": 460,
            "wall_margin": 18.0,
            "obstacles": [
                {"x": 180.0, "y": 40.0, "width": 45.0, "height": 320.0},
                {"x": 340.0, "y": 120.0, "width": 45.0, "height": 322.0},
                {"x": 520.0, "y": 20.0, "width": 45.0, "height": 300.0},
                {"x": 690.0, "y": 130.0, "width": 45.0, "height": 312.0},
            ],
        },
        "sensor": {
            "ray_count": 16,
            "ray_length": 220.0,
            "ray_fov_degrees": 220.0,
        },
        "dynamics": {
            "sensor_noise_std": 0.02,
            "heading_drift_std": 0.8,
            "speed_noise_std": 0.05,
            "turn_noise_std": 0.8,
            "randomize_spawn": True,
            "speed_scale_min": 0.85,
            "speed_scale_max": 1.15,
            "turn_scale_min": 0.85,
            "turn_scale_max": 1.15,
        },
        "robot": {
            "radius": 13.0,
            "speed": 170.0,
            "turn_rate_degrees": 8.0,
        },
        "visual": {
            "bg": "#111827",
            "wall": "#475569",
            "obstacle": "#64748b",
            "robot": "#38bdf8",
            "robot_collision": "#fb7185",
            "ray": "rgba(96, 165, 250, 0.45)",
        },
    },
    "flat_ground_differential_v1": {
        "label": "Flat Ground Differential (V1)",
        "description": "Version 1 flat-ground baseline using differential-drive dynamics with real-world scenarios.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "domain": "flat-ground",
            "flat_ground_model": "differential",
            "version": "v1",
            "training_scenarios": "office, warehouse, corridor, doorway, cluttered",
        },
        "world": {
            "width": 720,
            "height": 520,
            "wall_margin": 20.0,
            "obstacles": [
                # L-shaped corridor (simulates hallway corner)
                {"x": 150.0, "y": 80.0, "width": 180.0, "height": 28.0},
                {"x": 150.0, "y": 80.0, "width": 28.0, "height": 150.0},
                
                # Narrow passage (doorway simulation)
                {"x": 380.0, "y": 180.0, "width": 28.0, "height": 90.0},
                {"x": 380.0, "y": 320.0, "width": 28.0, "height": 90.0},
                
                # Scattered obstacles (furniture/clutter)
                {"x": 500.0, "y": 120.0, "width": 70.0, "height": 45.0},
                {"x": 560.0, "y": 260.0, "width": 60.0, "height": 60.0},
                {"x": 220.0, "y": 350.0, "width": 85.0, "height": 50.0},
                
                # Central obstacle cluster
                {"x": 420.0, "y": 420.0, "width": 50.0, "height": 50.0},
            ],
        },
        "sensor": {"ray_count": 12, "ray_length": 180.0, "ray_fov_degrees": 200.0},
        "dynamics": {
            "sensor_noise_std": 0.015,
            "heading_drift_std": 0.4,
            "speed_noise_std": 0.03,
            "turn_noise_std": 0.4,
            "randomize_spawn": True,
            "speed_scale_min": 0.92,
            "speed_scale_max": 1.08,
            "turn_scale_min": 0.92,
            "turn_scale_max": 1.08,
            "max_steps": 600,
        },
        "robot": {"radius": 14.0, "speed": 140.0, "turn_rate_degrees": 11.0},
        "visual": {
            "bg": "#0f172a",
            "wall": "#475569",
            "obstacle": "#334155",
            "robot": "#22c55e",
            "robot_collision": "#ef4444",
            "ray": "rgba(56, 189, 248, 0.45)",
        },
    },
    "flat_ground_ackermann_v1": {
        "label": "Flat Ground Ackermann (V1)",
        "description": "Version 1 flat-ground profile tuned for ackermann-like steering with parking lot scenarios.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "domain": "flat-ground",
            "flat_ground_model": "ackermann",
            "version": "v1",
            "training_scenarios": "parking, road, lane-keeping, obstacle-course",
        },
        "world": {
            "width": 760,
            "height": 520,
            "wall_margin": 20.0,
            "obstacles": [
                # Parking row (simulates parked cars)
                {"x": 120.0, "y": 100.0, "width": 90.0, "height": 42.0},
                {"x": 240.0, "y": 100.0, "width": 90.0, "height": 42.0},
                {"x": 360.0, "y": 100.0, "width": 90.0, "height": 42.0},
                
                # Road dividers/barriers
                {"x": 150.0, "y": 260.0, "width": 200.0, "height": 28.0},
                {"x": 420.0, "y": 260.0, "width": 200.0, "height": 28.0},
                
                # Street obstacles (poles, signs)
                {"x": 550.0, "y": 370.0, "width": 40.0, "height": 40.0},
                {"x": 180.0, "y": 380.0, "width": 40.0, "height": 40.0},
                
                # U-turn challenge
                {"x": 620.0, "y": 150.0, "width": 32.0, "height": 220.0},
            ],
        },
        "sensor": {"ray_count": 14, "ray_length": 200.0, "ray_fov_degrees": 200.0},
        "dynamics": {
            "sensor_noise_std": 0.018,
            "heading_drift_std": 0.35,
            "speed_noise_std": 0.032,
            "turn_noise_std": 0.35,
            "randomize_spawn": True,
            "speed_scale_min": 0.88,
            "speed_scale_max": 1.12,
            "turn_scale_min": 0.88,
            "turn_scale_max": 1.12,
            "max_steps": 600,
        },
        "robot": {"radius": 13.0, "speed": 150.0, "turn_rate_degrees": 10.0},
        "visual": {
            "bg": "#111827",
            "wall": "#6b7280",
            "obstacle": "#4b5563",
            "robot": "#38bdf8",
            "robot_collision": "#ef4444",
            "ray": "rgba(59, 130, 246, 0.45)",
        },
    },
    "flat_ground_rover_v1": {
        "label": "Flat Ground Rover (V1)",
        "description": "Version 1 flat-ground profile tuned for rover-style skid steering with warehouse scenarios.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "domain": "flat-ground",
            "flat_ground_model": "rover",
            "version": "v1",
            "training_scenarios": "warehouse, loading-dock, pallet-navigation, tight-spaces",
        },
        "world": {
            "width": 760,
            "height": 540,
            "wall_margin": 22.0,
            "obstacles": [
                # Warehouse shelving/racks (parallel rows)
                {"x": 100.0, "y": 110.0, "width": 140.0, "height": 42.0},
                {"x": 100.0, "y": 190.0, "width": 140.0, "height": 42.0},
                {"x": 100.0, "y": 270.0, "width": 140.0, "height": 42.0},
                
                # Pallet stacks (irregular shapes)
                {"x": 320.0, "y": 140.0, "width": 75.0, "height": 60.0},
                {"x": 420.0, "y": 140.0, "width": 60.0, "height": 75.0},
                
                # Loading area obstacles
                {"x": 540.0, "y": 90.0, "width": 110.0, "height": 48.0},
                {"x": 540.0, "y": 320.0, "width": 110.0, "height": 48.0},
                
                # Tight maneuvering zone
                {"x": 280.0, "y": 380.0, "width": 90.0, "height": 45.0},
                {"x": 410.0, "y": 380.0, "width": 90.0, "height": 45.0},
                
                # Center column/pillar
                {"x": 360.0, "y": 260.0, "width": 50.0, "height": 50.0},
            ],
        },
        "sensor": {"ray_count": 16, "ray_length": 195.0, "ray_fov_degrees": 220.0},
        "dynamics": {
            "sensor_noise_std": 0.02,
            "heading_drift_std": 0.45,
            "speed_noise_std": 0.04,
            "turn_noise_std": 0.45,
            "randomize_spawn": True,
            "speed_scale_min": 0.85,
            "speed_scale_max": 1.15,
            "turn_scale_min": 0.85,
            "turn_scale_max": 1.15,
            "max_steps": 600,
        },
        "robot": {"radius": 15.0, "speed": 135.0, "turn_rate_degrees": 12.0},
        "visual": {
            "bg": "#1f2937",
            "wall": "#6b7280",
            "obstacle": "#4b5563",
            "robot": "#f59e0b",
            "robot_collision": "#ef4444",
            "ray": "rgba(245, 158, 11, 0.45)",
        },
    },
    "autonomous_driving_city": {
        "label": "Autonomous Driving City",
        "description": "Road-like navigation with narrow lanes and turns for driving agents.",
        "metadata": {"supported_control_modes": ["continuous"], "domain": "autonomous-driving"},
        "world": {
            "width": 960,
            "height": 560,
            "wall_margin": 24.0,
            "obstacles": [
                {"x": 160.0, "y": 110.0, "width": 620.0, "height": 40.0},
                {"x": 160.0, "y": 390.0, "width": 620.0, "height": 40.0},
                {"x": 160.0, "y": 150.0, "width": 40.0, "height": 240.0},
                {"x": 740.0, "y": 150.0, "width": 40.0, "height": 240.0},
                {"x": 420.0, "y": 240.0, "width": 120.0, "height": 80.0},
            ],
        },
        "sensor": {"ray_count": 20, "ray_length": 260.0, "ray_fov_degrees": 240.0},
        "dynamics": {
            "sensor_noise_std": 0.02,
            "heading_drift_std": 0.7,
            "speed_noise_std": 0.06,
            "turn_noise_std": 0.6,
            "randomize_spawn": True,
            "speed_scale_min": 0.8,
            "speed_scale_max": 1.2,
            "turn_scale_min": 0.8,
            "turn_scale_max": 1.2,
        },
        "robot": {"radius": 12.0, "speed": 190.0, "turn_rate_degrees": 7.0},
        "visual": {
            "bg": "#0b1020",
            "wall": "#94a3b8",
            "obstacle": "#334155",
            "robot": "#38bdf8",
            "robot_collision": "#fb7185",
            "ray": "rgba(56, 189, 248, 0.45)",
        },
    },
    "drone_flight_indoor": {
        "label": "Drone Flight Indoor",
        "description": "Tight indoor obstacle field for agile flight-like control.",
        "metadata": {"supported_control_modes": ["continuous"], "domain": "drone-flight"},
        "world": {
            "width": 900,
            "height": 600,
            "wall_margin": 20.0,
            "obstacles": [
                {"x": 120.0, "y": 120.0, "width": 120.0, "height": 120.0},
                {"x": 300.0, "y": 260.0, "width": 140.0, "height": 120.0},
                {"x": 520.0, "y": 140.0, "width": 140.0, "height": 180.0},
                {"x": 700.0, "y": 320.0, "width": 120.0, "height": 180.0},
                {"x": 420.0, "y": 430.0, "width": 180.0, "height": 70.0},
            ],
        },
        "sensor": {"ray_count": 24, "ray_length": 280.0, "ray_fov_degrees": 280.0},
        "dynamics": {
            "sensor_noise_std": 0.03,
            "heading_drift_std": 1.1,
            "speed_noise_std": 0.08,
            "turn_noise_std": 1.0,
            "randomize_spawn": True,
            "speed_scale_min": 0.75,
            "speed_scale_max": 1.25,
            "turn_scale_min": 0.75,
            "turn_scale_max": 1.25,
        },
        "robot": {"radius": 11.0, "speed": 210.0, "turn_rate_degrees": 9.0},
        "visual": {
            "bg": "#0a1624",
            "wall": "#64748b",
            "obstacle": "#475569",
            "robot": "#22d3ee",
            "robot_collision": "#ef4444",
            "ray": "rgba(34, 211, 238, 0.45)",
        },
    },
    "legged_robot_terrain": {
        "label": "Legged Robot Terrain",
        "description": "Rugged terrain-inspired obstacle map for legged locomotion style training.",
        "metadata": {"supported_control_modes": ["discrete", "continuous"], "domain": "legged-robot"},
        "world": {
            "width": 880,
            "height": 540,
            "wall_margin": 22.0,
            "obstacles": [
                {"x": 120.0, "y": 380.0, "width": 180.0, "height": 40.0},
                {"x": 330.0, "y": 300.0, "width": 140.0, "height": 40.0},
                {"x": 510.0, "y": 220.0, "width": 120.0, "height": 40.0},
                {"x": 660.0, "y": 300.0, "width": 140.0, "height": 40.0},
                {"x": 250.0, "y": 150.0, "width": 90.0, "height": 90.0},
            ],
        },
        "sensor": {"ray_count": 14, "ray_length": 220.0, "ray_fov_degrees": 200.0},
        "dynamics": {
            "sensor_noise_std": 0.02,
            "heading_drift_std": 0.9,
            "speed_noise_std": 0.07,
            "turn_noise_std": 0.9,
            "randomize_spawn": True,
            "speed_scale_min": 0.7,
            "speed_scale_max": 1.15,
            "turn_scale_min": 0.8,
            "turn_scale_max": 1.2,
        },
        "robot": {"radius": 14.0, "speed": 150.0, "turn_rate_degrees": 10.0},
        "visual": {
            "bg": "#1c1917",
            "wall": "#78716c",
            "obstacle": "#57534e",
            "robot": "#84cc16",
            "robot_collision": "#f97316",
            "ray": "rgba(132, 204, 22, 0.45)",
        },
    },
    "humanoid_balance_lab": {
        "label": "Humanoid Balance Lab",
        "description": "Complex central structures and narrow gaps for humanoid-style navigation challenges.",
        "metadata": {"supported_control_modes": ["continuous"], "domain": "humanoid"},
        "world": {
            "width": 920,
            "height": 560,
            "wall_margin": 24.0,
            "obstacles": [
                {"x": 240.0, "y": 140.0, "width": 100.0, "height": 280.0},
                {"x": 420.0, "y": 120.0, "width": 80.0, "height": 320.0},
                {"x": 560.0, "y": 180.0, "width": 120.0, "height": 260.0},
                {"x": 140.0, "y": 260.0, "width": 70.0, "height": 180.0},
                {"x": 730.0, "y": 130.0, "width": 70.0, "height": 210.0},
            ],
        },
        "sensor": {"ray_count": 20, "ray_length": 250.0, "ray_fov_degrees": 240.0},
        "dynamics": {
            "sensor_noise_std": 0.015,
            "heading_drift_std": 0.8,
            "speed_noise_std": 0.06,
            "turn_noise_std": 0.8,
            "randomize_spawn": True,
            "speed_scale_min": 0.8,
            "speed_scale_max": 1.1,
            "turn_scale_min": 0.75,
            "turn_scale_max": 1.15,
        },
        "robot": {"radius": 13.0, "speed": 145.0, "turn_rate_degrees": 9.0},
        "visual": {
            "bg": "#111827",
            "wall": "#6b7280",
            "obstacle": "#4b5563",
            "robot": "#eab308",
            "robot_collision": "#ef4444",
            "ray": "rgba(250, 204, 21, 0.45)",
        },
    },
    "software_anomaly_graph": {
        "label": "Software Anomaly Graph",
        "description": "Abstract graph-like obstacle topology to simulate software/system navigation tasks.",
        "metadata": {"supported_control_modes": ["discrete", "continuous"], "domain": "software-systems"},
        "world": {
            "width": 860,
            "height": 520,
            "wall_margin": 20.0,
            "obstacles": [
                {"x": 120.0, "y": 100.0, "width": 100.0, "height": 60.0},
                {"x": 300.0, "y": 80.0, "width": 120.0, "height": 60.0},
                {"x": 500.0, "y": 110.0, "width": 120.0, "height": 70.0},
                {"x": 210.0, "y": 250.0, "width": 120.0, "height": 70.0},
                {"x": 420.0, "y": 260.0, "width": 130.0, "height": 70.0},
                {"x": 620.0, "y": 300.0, "width": 120.0, "height": 70.0},
            ],
        },
        "sensor": {"ray_count": 16, "ray_length": 210.0, "ray_fov_degrees": 220.0},
        "dynamics": {
            "sensor_noise_std": 0.01,
            "heading_drift_std": 0.5,
            "speed_noise_std": 0.04,
            "turn_noise_std": 0.5,
            "randomize_spawn": True,
            "speed_scale_min": 0.9,
            "speed_scale_max": 1.1,
            "turn_scale_min": 0.9,
            "turn_scale_max": 1.1,
        },
        "robot": {"radius": 12.0, "speed": 160.0, "turn_rate_degrees": 10.0},
        "visual": {
            "bg": "#0f172a",
            "wall": "#64748b",
            "obstacle": "#334155",
            "robot": "#a78bfa",
            "robot_collision": "#fb7185",
            "ray": "rgba(167, 139, 250, 0.45)",
        },
    },
    # ── Goal-oriented environment ──────────────────────────────────────────
    "goal_chase": {
        "label": "Goal Chase 🍎",
        "description": "Navigate to the glowing goal target. +100 reward on reach. Ideal for testing goal-seeking behaviour.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "flat_ground_model": "differential",
        },
        "world": {
            "width": 620.0,
            "height": 480.0,
            "wall_margin": 22.0,
            "obstacles": [
                {"x": 150.0, "y": 100.0, "width": 80.0,  "height": 30.0},
                {"x": 350.0, "y": 180.0, "width": 30.0,  "height": 130.0},
                {"x": 200.0, "y": 330.0, "width": 130.0, "height": 30.0},
                {"x": 420.0, "y": 80.0,  "width": 60.0,  "height": 60.0},
            ],
            "goal": {"x": 520.0, "y": 380.0, "radius": 20.0},
        },
        "sensor": {"ray_count": 12, "ray_length": 180.0, "ray_fov_degrees": 240.0},
        "dynamics": {
            "sensor_noise_std": 0.01, "heading_drift_std": 0.3,
            "speed_noise_std": 0.02, "turn_noise_std": 0.3,
            "randomize_spawn": True,
            "randomize_goal": True,
            "speed_scale_min": 0.95, "speed_scale_max": 1.05,
            "turn_scale_min": 0.95, "turn_scale_max": 1.05,
            "max_steps": 800,
        },
        "robot": {"radius": 13.0, "speed": 130.0, "turn_rate_degrees": 11.0},
        "visual": {
            "bg": "#0f172a", "wall": "#334155", "obstacle": "#1f2937",
            "robot": "#22c55e", "robot_collision": "#ef4444",
            "ray": "rgba(56,189,248,0.45)", "goal": "#ef4444",
        },
    },
    # ── Real-world flat-ground training suite ─────────────────────────────────
    "flat_ground_cluttered_v2": {
        "label": "Cluttered Room V2",
        "description": "Dense scatter of small objects — chairs, boxes, pillars, table legs. Trains collision avoidance in highly cluttered real-world spaces with randomised spawns.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "domain": "flat-ground",
            "flat_ground_model": "differential",
            "version": "v2",
            "training_scenarios": "home, office, lab, cluttered-room",
        },
        "world": {
            "width": 740,
            "height": 520,
            "wall_margin": 20.0,
            "obstacles": [
                # Small box cluster — top-left zone
                {"x": 70.0,  "y": 70.0,  "width": 28.0, "height": 28.0},
                {"x": 110.0, "y": 80.0,  "width": 22.0, "height": 40.0},
                {"x": 150.0, "y": 65.0,  "width": 35.0, "height": 22.0},
                # Narrow pole/pillar column
                {"x": 220.0, "y": 130.0, "width": 16.0, "height": 16.0},
                {"x": 300.0, "y": 90.0,  "width": 16.0, "height": 16.0},
                {"x": 390.0, "y": 110.0, "width": 16.0, "height": 16.0},
                # Furniture row — mid-left
                {"x": 80.0,  "y": 200.0, "width": 55.0, "height": 30.0},
                {"x": 155.0, "y": 195.0, "width": 30.0, "height": 30.0},
                # Stacked items — center
                {"x": 310.0, "y": 210.0, "width": 45.0, "height": 45.0},
                {"x": 370.0, "y": 200.0, "width": 25.0, "height": 55.0},
                # Right side clutter
                {"x": 480.0, "y": 80.0,  "width": 50.0, "height": 30.0},
                {"x": 550.0, "y": 130.0, "width": 30.0, "height": 50.0},
                {"x": 600.0, "y": 90.0,  "width": 20.0, "height": 20.0},
                # Lower-mid zone
                {"x": 120.0, "y": 340.0, "width": 40.0, "height": 40.0},
                {"x": 180.0, "y": 370.0, "width": 55.0, "height": 22.0},
                {"x": 270.0, "y": 350.0, "width": 22.0, "height": 55.0},
                # Bottom-right scatter
                {"x": 440.0, "y": 310.0, "width": 35.0, "height": 35.0},
                {"x": 510.0, "y": 340.0, "width": 50.0, "height": 25.0},
                {"x": 590.0, "y": 300.0, "width": 22.0, "height": 40.0},
                # Narrow poles near walls
                {"x": 640.0, "y": 200.0, "width": 14.0, "height": 14.0},
                {"x": 640.0, "y": 380.0, "width": 14.0, "height": 14.0},
            ],
            "goal": {"x": 650.0, "y": 450.0, "radius": 20.0},
        },
        "sensor": {"ray_count": 16, "ray_length": 160.0, "ray_fov_degrees": 360.0},
        "dynamics": {
            "sensor_noise_std": 0.02,
            "heading_drift_std": 0.5,
            "speed_noise_std": 0.04,
            "turn_noise_std": 0.5,
            "randomize_spawn": True,
            "randomize_goal": True,
            "speed_scale_min": 0.9,
            "speed_scale_max": 1.1,
            "turn_scale_min": 0.9,
            "turn_scale_max": 1.1,
            "max_steps": 900,
        },
        "robot": {"radius": 12.0, "speed": 120.0, "turn_rate_degrees": 12.0},
        "visual": {
            "bg": "#0f172a", "wall": "#334155", "obstacle": "#4b5563",
            "robot": "#22c55e", "robot_collision": "#ef4444",
            "ray": "rgba(56,189,248,0.4)", "goal": "#f59e0b",
        },
    },
    "flat_ground_multi_room": {
        "label": "Multi-Room Navigation",
        "description": "Three connected rooms with narrow doorways. Trains hallway traversal, doorway negotiation and room-to-room goal-seeking — the most common real-world indoor scenario.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "domain": "flat-ground",
            "flat_ground_model": "differential",
            "version": "v1",
            "training_scenarios": "indoor, multi-room, hallway, doorway",
        },
        "world": {
            "width": 800,
            "height": 520,
            "wall_margin": 20.0,
            "obstacles": [
                # ---- Left room right wall (doorway gap at y=220-280) ----
                {"x": 220.0, "y": 35.0,  "width": 22.0, "height": 185.0},
                {"x": 220.0, "y": 280.0, "width": 22.0, "height": 205.0},
                # ---- Left room top wall connecting to arena top ----
                {"x": 35.0,  "y": 35.0,  "width": 185.0, "height": 22.0},
                # ---- Left room bottom wall connecting to arena bottom ----
                {"x": 35.0,  "y": 463.0, "width": 185.0, "height": 22.0},
                # ---- Obstacle inside left room ----
                {"x": 90.0,  "y": 200.0, "width": 50.0,  "height": 30.0},
                # ---- Right room left wall (doorway gap at y=220-280) ----
                {"x": 558.0, "y": 35.0,  "width": 22.0, "height": 185.0},
                {"x": 558.0, "y": 280.0, "width": 22.0, "height": 205.0},
                # ---- Right room top wall connecting to arena top ----
                {"x": 580.0, "y": 35.0,  "width": 185.0, "height": 22.0},
                # ---- Right room bottom wall connecting to arena bottom ----
                {"x": 580.0, "y": 463.0, "width": 185.0, "height": 22.0},
                # ---- Obstacle inside right room ----
                {"x": 640.0, "y": 280.0, "width": 50.0,  "height": 30.0},
                # ---- Corridor divider (central) ----
                {"x": 340.0, "y": 80.0,  "width": 120.0, "height": 22.0},
                {"x": 340.0, "y": 418.0, "width": 120.0, "height": 22.0},
            ],
            "goal": {"x": 680.0, "y": 420.0, "radius": 22.0},
        },
        "sensor": {"ray_count": 14, "ray_length": 200.0, "ray_fov_degrees": 220.0},
        "dynamics": {
            "sensor_noise_std": 0.015,
            "heading_drift_std": 0.4,
            "speed_noise_std": 0.03,
            "turn_noise_std": 0.4,
            "randomize_spawn": True,
            "randomize_goal": True,
            "speed_scale_min": 0.92,
            "speed_scale_max": 1.08,
            "turn_scale_min": 0.92,
            "turn_scale_max": 1.08,
            "max_steps": 1200,
        },
        "robot": {"radius": 13.0, "speed": 130.0, "turn_rate_degrees": 11.0},
        "visual": {
            "bg": "#0b1320", "wall": "#1e3a5f", "obstacle": "#334155",
            "robot": "#38bdf8", "robot_collision": "#ef4444",
            "ray": "rgba(56,189,248,0.45)", "goal": "#f59e0b",
        },
    },
    "flat_ground_stress_test": {
        "label": "Stress Test 🎯",
        "description": "Maximum sensor noise, heading drift, speed variation and randomised goal. Forces the model to generalise beyond memorised paths. Use as the final robustness check before real-world deployment.",
        "metadata": {
            "supported_control_modes": ["discrete", "continuous"],
            "domain": "flat-ground",
            "flat_ground_model": "differential",
            "version": "v1",
            "training_scenarios": "robustness, noise-hardening, sim-to-real",
        },
        "world": {
            "width": 720,
            "height": 520,
            "wall_margin": 20.0,
            "obstacles": [
                # L-shaped corridor corner
                {"x": 140.0, "y": 80.0,  "width": 170.0, "height": 28.0},
                {"x": 140.0, "y": 80.0,  "width": 28.0,  "height": 160.0},
                # Narrow doorway
                {"x": 370.0, "y": 170.0, "width": 28.0, "height": 80.0},
                {"x": 370.0, "y": 310.0, "width": 28.0, "height": 80.0},
                # Tight scatter
                {"x": 490.0, "y": 100.0, "width": 60.0, "height": 45.0},
                {"x": 550.0, "y": 240.0, "width": 55.0, "height": 55.0},
                {"x": 210.0, "y": 350.0, "width": 80.0, "height": 50.0},
                {"x": 410.0, "y": 410.0, "width": 50.0, "height": 50.0},
            ],
            "goal": {"x": 620.0, "y": 440.0, "radius": 22.0},
        },
        "sensor": {"ray_count": 16, "ray_length": 190.0, "ray_fov_degrees": 240.0},
        "dynamics": {
            "sensor_noise_std": 0.04,
            "heading_drift_std": 1.2,
            "speed_noise_std": 0.08,
            "turn_noise_std": 1.0,
            "randomize_spawn": True,
            "randomize_goal": True,
            "speed_scale_min": 0.75,
            "speed_scale_max": 1.25,
            "turn_scale_min": 0.75,
            "turn_scale_max": 1.25,
            "max_steps": 1000,
        },
        "robot": {"radius": 13.0, "speed": 135.0, "turn_rate_degrees": 11.0},
        "visual": {
            "bg": "#0f172a", "wall": "#7c3aed", "obstacle": "#5b21b6",
            "robot": "#f59e0b", "robot_collision": "#ef4444",
            "ray": "rgba(245,158,11,0.45)", "goal": "#22c55e",
        },
    },
    "flat_ground_dead_end_recovery": {
        "label": "Dead-End Recovery ↩",
        "description": "U-shaped dead ends and blind channels force the model to reverse and re-plan. Enables a 4th action: BACKWARD. Train here to prevent real-world robots from getting trapped.",
        "metadata": {
            "supported_control_modes": ["discrete"],
            "domain": "flat-ground",
            "flat_ground_model": "differential",
            "version": "v1",
            "training_scenarios": "dead-end, recovery, reversing, tight-spaces",
            "note": "Uses 4-action discrete space (forward/left/right/backward). Cannot load 3-action models.",
        },
        "world": {
            "width": 720,
            "height": 500,
            "wall_margin": 20.0,
            "obstacles": [
                # U-trap 1 (top-left) — robot must reverse out
                {"x": 90.0,  "y": 120.0, "width": 22.0, "height": 180.0},
                {"x": 200.0, "y": 120.0, "width": 22.0, "height": 180.0},
                {"x": 90.0,  "y": 300.0, "width": 132.0, "height": 22.0},
                # U-trap 2 (top-right) — open at bottom, robot enters from below
                {"x": 450.0, "y": 80.0,  "width": 22.0, "height": 200.0},
                {"x": 560.0, "y": 80.0,  "width": 22.0, "height": 200.0},
                {"x": 450.0, "y": 80.0,  "width": 132.0, "height": 22.0},
                # Blind channel (bottom-center)
                {"x": 280.0, "y": 330.0, "width": 22.0, "height": 130.0},
                {"x": 380.0, "y": 330.0, "width": 22.0, "height": 130.0},
                {"x": 280.0, "y": 458.0, "width": 122.0, "height": 22.0},
                # Extra narrow corridor
                {"x": 160.0, "y": 380.0, "width": 90.0, "height": 22.0},
                {"x": 450.0, "y": 360.0, "width": 90.0, "height": 22.0},
            ],
        },
        "sensor": {"ray_count": 16, "ray_length": 180.0, "ray_fov_degrees": 360.0},
        "dynamics": {
            "sensor_noise_std": 0.015,
            "heading_drift_std": 0.4,
            "speed_noise_std": 0.03,
            "turn_noise_std": 0.4,
            "randomize_spawn": True,
            "reverse_enabled": True,
            "speed_scale_min": 0.9,
            "speed_scale_max": 1.1,
            "turn_scale_min": 0.9,
            "turn_scale_max": 1.1,
            "max_steps": 800,
        },
        "robot": {"radius": 13.0, "speed": 120.0, "turn_rate_degrees": 12.0},
        "visual": {
            "bg": "#1c0a2e", "wall": "#7c3aed", "obstacle": "#5b21b6",
            "robot": "#a78bfa", "robot_collision": "#ef4444",
            "ray": "rgba(167,139,250,0.45)",
        },
    },
    # ── Multi-goal collection ─────────────────────────────────────────────
    "apple_field": {
        "label": "Apple Field 🍏",
        "description": "Open field — reach the goal target quickly with minimal obstacles.",
        "metadata": {"supported_control_modes": ["discrete", "continuous"], "flat_ground_model": "differential"},
        "world": {
            "width": 640.0, "height": 480.0, "wall_margin": 20.0,
            "obstacles": [
                {"x": 200.0, "y": 160.0, "width": 60.0, "height": 60.0},
                {"x": 380.0, "y": 280.0, "width": 60.0, "height": 60.0},
            ],
            "goal": {"x": 540.0, "y": 400.0, "radius": 22.0},
        },
        "sensor": {"ray_count": 12, "ray_length": 200.0, "ray_fov_degrees": 360.0},
        "dynamics": {
            "sensor_noise_std": 0.01, "heading_drift_std": 0.15,
            "speed_noise_std": 0.01, "turn_noise_std": 0.15,
            "randomize_spawn": True,
            "randomize_goal": True,
            "speed_scale_min": 0.95, "speed_scale_max": 1.05,
            "turn_scale_min": 0.95, "turn_scale_max": 1.05,
            "max_steps": 600,
        },
        "robot": {"radius": 13.0, "speed": 130.0, "turn_rate_degrees": 12.0},
        "visual": {
            "bg": "#0f2a1a", "wall": "#14532d", "obstacle": "#166534",
            "robot": "#4ade80", "robot_collision": "#ef4444",
            "ray": "rgba(74,222,128,0.4)", "goal": "#ef4444",
        },
    },
}

MODEL_PROFILES: dict[str, dict[str, Any]] = {
    "fast": {
        "label": "Fast",
        "description": "Small network for quick iterations.",
        "policy_kwargs": {"net_arch": [64, 64]},
        "learning_rate": 3e-4,
        "gamma": 0.99,
        "ent_coef": 0.01,
    },
    "balanced": {
        "label": "Balanced",
        "description": "Default medium network for stable training.",
        "policy_kwargs": {"net_arch": [128, 128]},
        "learning_rate": 2.5e-4,
        "gamma": 0.99,
        "ent_coef": 0.01,
    },
    "deep": {
        "label": "Deep",
        "description": "Larger network for complex layouts.",
        "policy_kwargs": {"net_arch": [256, 256, 128]},
        "learning_rate": 1.5e-4,
        "gamma": 0.995,
        "ent_coef": 0.005,
    },
}

CUSTOM_PROFILE_FILE = settings.backend_dir / "custom_profiles.json"


def _default_custom_store() -> dict[str, dict[str, dict[str, Any]]]:
    return {
        "environment_profiles": {},
        "model_profiles": {},
    }


def _load_custom_store() -> dict[str, dict[str, dict[str, Any]]]:
    if not Path(CUSTOM_PROFILE_FILE).exists():
        return _default_custom_store()
    try:
        content = json.loads(Path(CUSTOM_PROFILE_FILE).read_text(encoding="utf-8"))
        env_profiles = content.get("environment_profiles", {})
        model_profiles = content.get("model_profiles", {})
        if not isinstance(env_profiles, dict) or not isinstance(model_profiles, dict):
            return _default_custom_store()
        return {
            "environment_profiles": env_profiles,
            "model_profiles": model_profiles,
        }
    except Exception:
        return _default_custom_store()


def _save_custom_store(data: dict[str, dict[str, dict[str, Any]]]) -> None:
    Path(CUSTOM_PROFILE_FILE).write_text(json.dumps(data, indent=2), encoding="utf-8")


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def register_environment_profile(
    key: str,
    label: str,
    description: str,
    config_override: dict[str, Any],
    base_profile: str = "arena_basic",
) -> str:
    if not key:
        raise ValueError("Environment profile key is required")

    base = get_environment_profile(base_profile)
    merged = _deep_merge(base, config_override)
    merged["label"] = label
    merged["description"] = description

    for required in ("world", "sensor", "robot", "visual"):
        if required not in merged:
            raise ValueError(f"Missing environment section: {required}")

    if "dynamics" not in merged or not isinstance(merged["dynamics"], dict):
        merged["dynamics"] = {
            "sensor_noise_std": 0.0,
            "heading_drift_std": 0.0,
            "speed_noise_std": 0.0,
            "turn_noise_std": 0.0,
            "randomize_spawn": False,
            "speed_scale_min": 1.0,
            "speed_scale_max": 1.0,
            "turn_scale_min": 1.0,
            "turn_scale_max": 1.0,
        }

    metadata = merged.get("metadata")
    if not isinstance(metadata, dict):
        merged["metadata"] = {"supported_control_modes": ["discrete", "continuous"]}
    elif "supported_control_modes" not in metadata:
        merged["metadata"]["supported_control_modes"] = ["discrete", "continuous"]

    custom = _load_custom_store()
    custom["environment_profiles"][key] = merged
    _save_custom_store(custom)
    return key


def register_model_profile(
    key: str,
    label: str,
    description: str,
    config_override: dict[str, Any],
    base_profile: str = "balanced",
) -> str:
    if not key:
        raise ValueError("Model profile key is required")

    base = get_model_profile(base_profile)
    merged = _deep_merge(base, config_override)
    merged["label"] = label
    merged["description"] = description

    if "policy_kwargs" not in merged:
        raise ValueError("Model profile requires policy_kwargs")

    custom = _load_custom_store()
    custom["model_profiles"][key] = merged
    _save_custom_store(custom)
    return key


def get_environment_profile(profile: str) -> dict[str, Any]:
    if profile in ENVIRONMENT_PROFILES:
        return deepcopy(ENVIRONMENT_PROFILES[profile])

    custom = _load_custom_store()
    custom_profiles = custom.get("environment_profiles", {})
    if profile in custom_profiles:
        return deepcopy(custom_profiles[profile])

    return deepcopy(ENVIRONMENT_PROFILES["arena_basic"])


def get_model_profile(profile: str) -> dict[str, Any]:
    if profile in MODEL_PROFILES:
        return deepcopy(MODEL_PROFILES[profile])

    custom = _load_custom_store()
    custom_profiles = custom.get("model_profiles", {})
    if profile in custom_profiles:
        return deepcopy(custom_profiles[profile])

    return deepcopy(MODEL_PROFILES["balanced"])


def _world_summary(profile_value: dict[str, Any]) -> dict[str, Any]:
    """Extract a lightweight world summary for minimap rendering."""
    world = profile_value.get("world", {})
    goal = world.get("goal")
    has_goal = goal is not None
    return {
        "width": float(world.get("width", 640)),
        "height": float(world.get("height", 480)),
        "obstacles": list(world.get("obstacles", [])),
        "goal": goal,
        "has_goal": has_goal,
    }


def list_environment_profiles() -> list[dict[str, Any]]:
    built_in = [
        {
            "key": key,
            "label": value["label"],
            "description": value["description"],
            "world_summary": _world_summary(value),
        }
        for key, value in ENVIRONMENT_PROFILES.items()
    ]
    custom = _load_custom_store()
    custom_list = [
        {
            "key": key,
            "label": value.get("label", key),
            "description": value.get("description", "Custom environment"),
            "world_summary": _world_summary(value),
        }
        for key, value in custom.get("environment_profiles", {}).items()
    ]
    return [*built_in, *custom_list]


def list_model_profiles() -> list[dict[str, str]]:
    built_in = [
        {
            "key": key,
            "label": value["label"],
            "description": value["description"],
        }
        for key, value in MODEL_PROFILES.items()
    ]
    custom = _load_custom_store()
    custom_list = [
        {
            "key": key,
            "label": value.get("label", key),
            "description": value.get("description", "Custom model"),
        }
        for key, value in custom.get("model_profiles", {}).items()
    ]
    return [*built_in, *custom_list]


# ── Procedurally generated maze presets (added after ENVIRONMENT_PROFILES) ──
# These are stable seeds so training is reproducible without regenerating.
ENVIRONMENT_PROFILES["maze_4x4"]  = _make_maze_preset(4,  4,  cell_size=80, seed=42)
ENVIRONMENT_PROFILES["maze_6x6"]  = _make_maze_preset(6,  6,  cell_size=68, seed=7)
ENVIRONMENT_PROFILES["maze_8x8"]  = _make_maze_preset(8,  8,  cell_size=56, seed=13)
ENVIRONMENT_PROFILES["maze_10x10"] = _make_maze_preset(10, 10, cell_size=48, seed=99)


def generate_maze_preset(
    rows: int,
    cols: int,
    cell_size: int = 70,
    seed: int | None = None,
) -> dict[str, Any]:
    """Public API for generating a fresh maze preset on demand."""
    return _make_maze_preset(rows, cols, cell_size=cell_size, seed=seed)
