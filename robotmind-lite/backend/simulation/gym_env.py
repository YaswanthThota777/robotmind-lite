"""Custom Gymnasium environment for RobotMind Lite."""

from __future__ import annotations

from collections import deque
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from backend.simulation.presets import get_environment_profile
from backend.simulation.robot import RobotConfig
from backend.simulation.sensors import cast_rays, cast_rays_at_angles, direction_label
from backend.simulation.world import SimulationWorld


def _resolve_flat_ground_model(profile_config: dict[str, Any]) -> str:
    metadata = profile_config.get("metadata", {})
    if isinstance(metadata, dict):
        model = metadata.get("flat_ground_model")
        if isinstance(model, str) and model.strip():
            normalized = model.strip().lower()
            if normalized in {"differential", "ackermann", "rover"}:
                return normalized
    return "differential"


def _apply_forward_velocity(world: SimulationWorld, speed_scale: float = 1.0) -> None:
    world.robot.move_forward()
    vx = float(world.robot.body.velocity.x)
    vy = float(world.robot.body.velocity.y)
    world.robot.body.velocity = (vx * speed_scale, vy * speed_scale)


class VisitedGridWrapper(gym.Wrapper):
    """Adds a coarse visited-cell memory grid to the observation.

    Also adds a small reward bonus for entering new cells to encourage
    exploration instead of stopping/spinning in place.
    """

    def __init__(self, env: gym.Env, grid_size: int = 6) -> None:
        super().__init__(env)
        self.grid_size = max(3, int(grid_size))
        self._visited = np.zeros((self.grid_size, self.grid_size), dtype=np.float32)

        base_low = np.asarray(self.observation_space.low, dtype=np.float32)
        base_high = np.asarray(self.observation_space.high, dtype=np.float32)
        extra_low = np.zeros(self.grid_size * self.grid_size, dtype=np.float32)
        extra_high = np.ones(self.grid_size * self.grid_size, dtype=np.float32)
        self.observation_space = spaces.Box(
            low=np.concatenate([base_low, extra_low]),
            high=np.concatenate([base_high, extra_high]),
            dtype=np.float32,
        )

    def _cell_for_position(self) -> tuple[int, int] | None:
        if hasattr(self.env, "get_state"):
            state = self.env.get_state()  # type: ignore[attr-defined]
            try:
                x = float(state.get("x", 0.0))
                y = float(state.get("y", 0.0))
                w = float(state.get("world_width", 0.0))
                h = float(state.get("world_height", 0.0))
            except Exception:
                return None
        else:
            return None

        if w <= 0 or h <= 0:
            return None
        gx = int(np.clip((x / w) * self.grid_size, 0, self.grid_size - 1))
        gy = int(np.clip((y / h) * self.grid_size, 0, self.grid_size - 1))
        return gx, gy

    def _mark_and_bonus(self) -> float:
        cell = self._cell_for_position()
        if cell is None:
            return 0.0
        gx, gy = cell
        if self._visited[gy, gx] < 0.5:
            self._visited[gy, gx] = 1.0
            return 0.02
        return -0.003

    def _augment_obs(self, obs: np.ndarray) -> np.ndarray:
        return np.concatenate([np.asarray(obs, dtype=np.float32), self._visited.flatten()])

    def get_state(self) -> dict[str, Any]:  # type: ignore[override]
        if hasattr(self.env, "get_state"):
            return self.env.get_state()  # type: ignore[attr-defined]
        return {}

    def reset(self, **kwargs: Any) -> tuple[np.ndarray, dict[str, Any]]:  # type: ignore[override]
        obs, info = self.env.reset(**kwargs)
        self._visited.fill(0.0)
        self._mark_and_bonus()
        return self._augment_obs(obs), info

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:  # type: ignore[override]
        obs, reward, terminated, truncated, info = self.env.step(action)
        reward += self._mark_and_bonus()
        return self._augment_obs(obs), reward, terminated, truncated, info


class RobotEnv(gym.Env[np.ndarray, int]):
    """Beginner-friendly RL environment with shaped reward for stable learning."""

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        max_steps: int | None = None,
        ray_count: int = 8,
        profile: str = "arena_basic",
    ) -> None:
        super().__init__()
        self.profile = profile
        self.profile_config = get_environment_profile(profile)
        world_cfg = self.profile_config["world"]
        robot_cfg = self.profile_config["robot"]
        sensor_cfg = self.profile_config["sensor"]
        dynamics_cfg = self.profile_config.get("dynamics", {})

        self.world = SimulationWorld(
            width=int(world_cfg["width"]),
            height=int(world_cfg["height"]),
            wall_margin=float(world_cfg["wall_margin"]),
            obstacles=list(world_cfg["obstacles"]),
            goal=world_cfg.get("goal"),
        )
        self.world.robot.config = RobotConfig(
            radius=float(robot_cfg["radius"]),
            speed=float(robot_cfg["speed"]),
            turn_rate_degrees=float(robot_cfg["turn_rate_degrees"]),
        )
        self.world.robot.shape.unsafe_set_radius(self.world.robot.config.radius)
        # Explicit max_steps arg overrides profile; profile overrides built-in default of 500
        _profile_max_steps = int(dynamics_cfg.get("max_steps", 500))
        self.max_steps = max_steps if max_steps is not None else _profile_max_steps
        # Fixed-angle sensors: list of robot-relative offsets (degrees) defined in preset.
        # Overrides ray_count / ray_fov_degrees when present.
        raw_sensor_angles = sensor_cfg.get("sensor_angles")
        self.sensor_angles: list[float] | None = (
            [float(a) for a in raw_sensor_angles] if raw_sensor_angles else None
        )
        if self.sensor_angles is not None:
            self.ray_count = len(self.sensor_angles)
        else:
            self.ray_count = max(ray_count, int(sensor_cfg["ray_count"]))
        self.ray_length = float(sensor_cfg["ray_length"])
        self.ray_fov_degrees = float(sensor_cfg["ray_fov_degrees"])
        self.sensor_noise_std = float(dynamics_cfg.get("sensor_noise_std", 0.0))
        self.heading_drift_std = float(dynamics_cfg.get("heading_drift_std", 0.0))
        self.speed_noise_std = float(dynamics_cfg.get("speed_noise_std", 0.0))
        self.turn_noise_std = float(dynamics_cfg.get("turn_noise_std", 0.0))
        self.randomize_spawn = bool(dynamics_cfg.get("randomize_spawn", False))
        self.speed_scale_min = float(dynamics_cfg.get("speed_scale_min", 1.0))
        self.speed_scale_max = float(dynamics_cfg.get("speed_scale_max", 1.0))
        self.turn_scale_min = float(dynamics_cfg.get("turn_scale_min", 1.0))
        self.turn_scale_max = float(dynamics_cfg.get("turn_scale_max", 1.0))
        # Optional fixed spawn position (used by maze environments)
        self._fixed_spawn_x: float | None = (
            float(dynamics_cfg["spawn_x"]) if "spawn_x" in dynamics_cfg else None
        )
        self._fixed_spawn_y: float | None = (
            float(dynamics_cfg["spawn_y"]) if "spawn_y" in dynamics_cfg else None
        )
        self.has_goal = self.world.goal_x is not None
        self._base_speed = self.world.robot.config.speed
        self._base_turn_rate = self.world.robot.config.turn_rate_degrees
        self.flat_ground_model = _resolve_flat_ground_model(self.profile_config)
        # Per-episode goal randomisation: re-place goal inside arena on every reset.
        # Requires the profile to have a goal defined (has_goal=True).
        self.randomize_goal = bool(dynamics_cfg.get("randomize_goal", False))
        # Reverse action: expands discrete action space to 4 (add backward motion).
        # Only enable for profiles that explicitly set this — existing 3-action models
        # cannot be loaded into these environments.
        self.reverse_enabled = bool(dynamics_cfg.get("reverse_enabled", False))
        self._goal_radius = self.world.goal_radius if self.has_goal else 0.0
        self.current_step = 0
        self.episode_count = 0
        self.last_reward = 0.0
        self.last_collision = False
        self._consecutive_collisions = 0
        self._last_x = 0.0
        self._last_y = 0.0
        self._last_goal_dist = 0.0  # initialised properly on first reset()
        # ── Intelligent navigation memory ──────────────────────────────────────
        # Heading history for spin detection (window = 20 steps).
        # With turn_rate ~12 deg/step, 20 steps = max ~240 deg of rotation.
        # Threshold of 80 deg fires after only ~7 consecutive turning steps,
        # fixing the original bug where threshold=360 was physically unreachable.
        self._heading_history: deque[float] = deque(maxlen=20)
        # Visited-cell exploration map: 16x16 coarse grid of the arena.
        self._visited_cells: set[tuple[int, int]] = set()
        self._visit_grid_size = 16
        # Stagnation detector: penalise the robot if it hasn't gotten meaningfully
        # closer to the goal in the last 50 steps.  Prevents wall-hugging orbits
        # and spinning loops where the robot never commits to reaching the goal.
        self._stagnation_best_dist: float = float("inf")
        self._stagnation_steps: int = 0

        n_actions = 4 if self.reverse_enabled else 3
        self.action_space = spaces.Discrete(n_actions)
        # Observation: [ray_0..ray_N, sin(heading), cos(heading)]
        # If environment has a goal: append [goal_dist_norm, goal_sin, goal_cos]
        extra = 3 if self.has_goal else 0
        self.observation_space = spaces.Box(
            low=np.array([0.0] * self.ray_count + [-1.0, -1.0] + [-1.0] * extra, dtype=np.float32),
            high=np.array([1.0] * self.ray_count + [1.0,  1.0] + [1.0]  * extra, dtype=np.float32),
            dtype=np.float32,
        )

    def _random_spawn(self) -> None:
        margin = self.world.wall_margin + self.world.robot.config.radius + 4.0
        for _ in range(32):
            x = float(self.np_random.uniform(margin, self.world.width - margin))
            y = float(self.np_random.uniform(margin, self.world.height - margin))
            overlaps = False
            for obstacle in self.world.obstacles:
                ox = float(obstacle["x"])
                oy = float(obstacle["y"])
                ow = float(obstacle["width"])
                oh = float(obstacle["height"])
                closest_x = min(max(x, ox), ox + ow)
                closest_y = min(max(y, oy), oy + oh)
                dx = x - closest_x
                dy = y - closest_y
                if dx * dx + dy * dy <= (self.world.robot.config.radius + 2.0) ** 2:
                    overlaps = True
                    break
            if not overlaps:
                self.world.robot.body.position = (x, y)
                self.world.robot.body.velocity = (0.0, 0.0)
                return

    def _random_goal(self) -> None:
        """Re-place goal at a random collision-free position each episode.
        Ensures the model learns genuine goal-directed navigation, not path memorisation.
        """
        clearance = self._goal_radius + self.world.robot.config.radius + 30.0
        margin = self.world.wall_margin + self._goal_radius + 10.0
        for _ in range(64):
            gx = float(self.np_random.uniform(margin, self.world.width - margin))
            gy = float(self.np_random.uniform(margin, self.world.height - margin))
            blocked = False
            for obstacle in self.world.obstacles:
                ox, oy = float(obstacle["x"]), float(obstacle["y"])
                ow, oh = float(obstacle["width"]), float(obstacle["height"])
                if (ox - self._goal_radius) <= gx <= (ox + ow + self._goal_radius) and \
                   (oy - self._goal_radius) <= gy <= (oy + oh + self._goal_radius):
                    blocked = True
                    break
            rdx = gx - self.world.robot.x
            rdy = gy - self.world.robot.y
            if not blocked and (rdx * rdx + rdy * rdy) >= clearance ** 2:
                self.world.goal_x = gx
                self.world.goal_y = gy
                return
        # Fallback: far corner of the arena
        self.world.goal_x = self.world.width - margin
        self.world.goal_y = self.world.height - margin

    def _get_observation(self) -> np.ndarray:
        if self.sensor_angles is not None:
            distances = cast_rays_at_angles(
                self.world.space,
                (self.world.robot.x, self.world.robot.y),
                self.world.robot.angle_degrees,
                self.sensor_angles,
                self.ray_length,
            )
        else:
            distances = cast_rays(
                self.world.space,
                (self.world.robot.x, self.world.robot.y),
                self.world.robot.angle_degrees,
                ray_count=self.ray_count,
                ray_length=self.ray_length,
                fov_degrees=self.ray_fov_degrees,
            )
        if self.sensor_noise_std > 0:
            noise = self.np_random.normal(0.0, self.sensor_noise_std, size=len(distances))
            distances = [float(np.clip(dist + noise_val, 0.0, 1.0)) for dist, noise_val in zip(distances, noise)]
        # sin/cos gives a continuous, cycle-correct heading signal to the policy
        angle_rad = float(np.deg2rad(self.world.robot.angle_degrees))
        obs_sin = float(np.sin(angle_rad))
        obs_cos = float(np.cos(angle_rad))
        base = [*distances, obs_sin, obs_cos]
        if self.has_goal:
            dx = (self.world.goal_x or 0.0) - self.world.robot.x
            dy = (self.world.goal_y or 0.0) - self.world.robot.y
            raw_dist = (dx * dx + dy * dy) ** 0.5
            max_dist = (self.world.width ** 2 + self.world.height ** 2) ** 0.5
            dist_norm = float(np.clip(raw_dist / max_dist, 0.0, 1.0))
            goal_angle = float(np.arctan2(dy, dx))
            # Relative bearing to goal is easier for policies to learn than absolute angle.
            rel_angle = goal_angle - angle_rad
            rel_angle = float(np.arctan2(np.sin(rel_angle), np.cos(rel_angle)))
            base += [dist_norm, float(np.sin(rel_angle)), float(np.cos(rel_angle))]
        return np.array(base, dtype=np.float32)

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        self.current_step = 0
        self.episode_count += 1

        # Randomise heading every episode — the single most important thing for
        # spatial generalisation. Robot cannot memorise a fixed turn sequence.
        random_heading = float(self.np_random.uniform(0.0, 360.0))
        self.world.reset(angle_degrees=random_heading)

        # Spawn logic: fixed position > randomize > center (with overlap fallback)
        if self.randomize_spawn:
            self._random_spawn()
        elif self._fixed_spawn_x is not None:
            self.world.robot.body.position = (self._fixed_spawn_x, self._fixed_spawn_y)
            self.world.robot.body.velocity = (0.0, 0.0)
        else:
            rx, ry = self.world.robot.x, self.world.robot.y
            r = self.world.robot.config.radius
            for obs in self.world.obstacles:
                ox, oy, ow, oh = obs["x"], obs["y"], obs["width"], obs["height"]
                cx = min(max(rx, ox), ox + ow)
                cy = min(max(ry, oy), oy + oh)
                if (rx - cx) ** 2 + (ry - cy) ** 2 <= (r + 4) ** 2:
                    self._random_spawn()
                    break
        speed_scale = float(self.np_random.uniform(self.speed_scale_min, self.speed_scale_max))
        turn_scale = float(self.np_random.uniform(self.turn_scale_min, self.turn_scale_max))
        self.world.robot.config.speed = self._base_speed * speed_scale
        self.world.robot.config.turn_rate_degrees = self._base_turn_rate * turn_scale
        # Randomise goal position every episode for stronger generalisation
        if self.randomize_goal and self.has_goal:
            self._random_goal()
        self.last_reward = 0.0
        self.last_collision = False
        self._consecutive_collisions = 0
        self._last_x = self.world.robot.x
        self._last_y = self.world.robot.y
        # Reset navigation memory each episode
        self._heading_history.clear()
        self._heading_history.append(self.world.robot.angle_degrees)
        self._visited_cells.clear()
        # Mark starting cell as visited immediately
        _gs = self._visit_grid_size
        _sx = int(np.clip((self.world.robot.x / self.world.width) * _gs, 0, _gs - 1))
        _sy = int(np.clip((self.world.robot.y / self.world.height) * _gs, 0, _gs - 1))
        self._visited_cells.add((_sx, _sy))
        # Track distance to goal so step() can compute delta-distance reward
        if self.has_goal:
            gx = self.world.goal_x or 0.0
            gy = self.world.goal_y or 0.0
            dx0 = gx - self.world.robot.x
            dy0 = gy - self.world.robot.y
            self._last_goal_dist = float(np.sqrt(dx0 * dx0 + dy0 * dy0))
        else:
            self._last_goal_dist = 0.0
        self._stagnation_best_dist = self._last_goal_dist
        self._stagnation_steps = 0
        return self._get_observation(), {"status": "reset"}

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        self.current_step += 1

        if self.flat_ground_model == "ackermann":
            if action == 0:
                _apply_forward_velocity(self.world)
            elif action == 1:
                self.world.robot.angle_degrees = (
                    self.world.robot.angle_degrees - self.world.robot.config.turn_rate_degrees * 0.7
                ) % 360.0
                _apply_forward_velocity(self.world, speed_scale=0.9)
            elif action == 2:
                self.world.robot.angle_degrees = (
                    self.world.robot.angle_degrees + self.world.robot.config.turn_rate_degrees * 0.7
                ) % 360.0
                _apply_forward_velocity(self.world, speed_scale=0.9)
        elif self.flat_ground_model == "rover":
            if action == 0:
                _apply_forward_velocity(self.world)
            elif action == 1:
                self.world.robot.angle_degrees = (
                    self.world.robot.angle_degrees - self.world.robot.config.turn_rate_degrees * 0.85
                ) % 360.0
                _apply_forward_velocity(self.world, speed_scale=0.75)
            elif action == 2:
                self.world.robot.angle_degrees = (
                    self.world.robot.angle_degrees + self.world.robot.config.turn_rate_degrees * 0.85
                ) % 360.0
                _apply_forward_velocity(self.world, speed_scale=0.75)
        else:
            if action == 0:
                self.world.robot.move_forward()
            elif action == 1:
                self.world.robot.rotate_left()
                # Stop translating when purely rotating (correct diff-drive physics)
                self.world.robot.body.velocity = (0.0, 0.0)
            elif action == 2:
                self.world.robot.rotate_right()
                self.world.robot.body.velocity = (0.0, 0.0)
            elif action == 3 and self.reverse_enabled:
                # Reverse: move backward at reduced speed (60 % of forward)
                angle_rad = float(np.deg2rad(self.world.robot.angle_degrees))
                rev_speed = self.world.robot.config.speed * 0.6
                self.world.robot.body.velocity = (
                    -float(np.cos(angle_rad)) * rev_speed,
                    -float(np.sin(angle_rad)) * rev_speed,
                )

        if self.heading_drift_std > 0:
            self.world.robot.angle_degrees = (
                self.world.robot.angle_degrees + float(self.np_random.normal(0.0, self.heading_drift_std))
            ) % 360.0

        if self.turn_noise_std > 0 and action in {1, 2}:
            self.world.robot.angle_degrees = (
                self.world.robot.angle_degrees + float(self.np_random.normal(0.0, self.turn_noise_std))
            ) % 360.0

        if self.speed_noise_std > 0 and action in {0, 1, 2}:
            vx = float(self.world.robot.body.velocity.x)
            vy = float(self.world.robot.body.velocity.y)
            scale = 1.0 + float(self.np_random.normal(0.0, self.speed_noise_std))
            self.world.robot.body.velocity = (vx * scale, vy * scale)

        # Capture position before physics step to measure actual displacement
        prev_x = self.world.robot.x
        prev_y = self.world.robot.y

        collided = self.world.step()
        observation = self._get_observation()

        if collided:
            self._consecutive_collisions += 1
            # Strong collision penalty. Episode does NOT end on first hit —
            # the agent must recover. Only terminate after 4 consecutive collisions.
            reward = -40.0
        else:
            self._consecutive_collisions = 0
            dx = self.world.robot.x - prev_x
            dy = self.world.robot.y - prev_y
            displacement = float(np.sqrt(dx * dx + dy * dy))

            ray_distances = observation[: self.ray_count]
            min_dist = float(np.min(ray_distances))
            mean_dist = float(np.mean(ray_distances))
            front_min = min_dist
            left_min = min_dist
            right_min = min_dist

            if self.ray_count >= 3:
                if self.sensor_angles is not None and len(self.sensor_angles) == self.ray_count:
                    normalized_angles = [((float(a) + 180.0) % 360.0) - 180.0 for a in self.sensor_angles]
                    front_idx = [i for i, angle in enumerate(normalized_angles) if abs(angle) <= 35.0]
                    left_idx = [i for i, angle in enumerate(normalized_angles) if angle > 20.0]
                    right_idx = [i for i, angle in enumerate(normalized_angles) if angle < -20.0]
                else:
                    center = (self.ray_count - 1) / 2.0
                    front_span = max(1, int(round(self.ray_count * 0.22)))
                    front_idx = [i for i in range(self.ray_count) if abs(i - center) <= front_span]
                    left_idx = [i for i in range(self.ray_count) if i > center + 0.5]
                    right_idx = [i for i in range(self.ray_count) if i < center - 0.5]

                if front_idx:
                    front_min = float(np.min(ray_distances[front_idx]))
                if left_idx:
                    left_min = float(np.min(ray_distances[left_idx]))
                if right_idx:
                    right_min = float(np.min(ray_distances[right_idx]))

            # ── Per-step survival bonus ───────────────────────────────────────
            # Staying alive is ALWAYS better than dying.  This small constant
            # ensures the agent accumulates positive signal over a full episode
            # (+5.0 over 500 steps) vs losing −40 per collision hit.
            # Without this the agent has no incentive to survive past the point
            # where avoidance becomes hard, so it just rushes forward.
            reward = 0.01

            # ── Proximity penalty — two-stage gradient ───────────────────────
            # CALIBRATION: ray_length=160 in 640x480 arena means even the arena
            # center has min_dist≈0.4.  Old thresholds (0.45/0.65) fired on 70%
            # of all positions, drowning out goal rewards completely.
            # New thresholds are calibrated to ray_length: genuinely close to
            # a wall means < 32px clearance (0.20) or < 56px (0.35).
            # Stage 1 (warning): 0.20 < min_dist < 0.35 → mild negative gradient
            # Stage 2 (danger):  min_dist <= 0.20        → strong negative gradient
            danger = min_dist < 0.35
            if min_dist <= 0.20:
                # Deep danger zone — imminent collision, net-negative reward.
                reward += -0.02 - (0.20 - min_dist) * 5.0
            elif min_dist < 0.35:
                # Warning zone — moderate penalty; survival still slightly positive
                reward += -0.005 - (0.35 - min_dist) * 1.2
            else:
                # Clear space — reward forward movement
                reward += displacement * 0.025
                # Clearance bonus: encourage maintaining distance from walls
                if min_dist > 0.40:
                    reward += 0.015
                # Open-space exploration bonus: moving well in fully-open space
                if mean_dist > 0.60 and displacement > 0.5:
                    reward += 0.04
                # Idle penalty: discourage stopping in open space (but not turning near walls)
                if mean_dist > 0.60 and displacement < 0.3:
                    reward -= 0.015
                    if action in {1, 2}:
                        reward -= 0.008

            # ── Directional sensor-action coupling ───────────────────────────
            # Make obstacle handling explicit: moving forward into short front
            # clearance is strongly punished; turning toward the safer side is
            # rewarded in danger.
            if action == 0 and front_min < 0.18:
                reward -= 0.25 + (0.18 - front_min) * 2.0

            if action in {1, 2} and front_min < 0.25:
                turned_to_safer_side = (action == 1 and left_min > right_min) or (
                    action == 2 and right_min > left_min
                )
                if turned_to_safer_side:
                    reward += 0.05 + max(0.0, 0.25 - front_min) * 0.4
                else:
                    reward -= 0.03

            if action == 3 and self.reverse_enabled and front_min < 0.20:
                reward += 0.08

            # ── Goal-directed rewards (only for goal environments) ────────────
            if self.has_goal:
                gx = self.world.goal_x or 0.0
                gy = self.world.goal_y or 0.0
                curr_x = self.world.robot.x
                curr_y = self.world.robot.y
                curr_dist = float(np.sqrt((curr_x - gx) ** 2 + (curr_y - gy) ** 2))

                delta = self._last_goal_dist - curr_dist  # positive = closer
                if delta > 0:
                    # Approach reward: strongest signal in the reward function.
                    # Every pixel of genuine progress toward goal pays clearly.
                    reward += delta * 2.0
                else:
                    # Moving away penalty — symmetric with approach reward so any
                    # lateral or backward movement is clearly less profitable.
                    reward += delta * 1.2
                self._last_goal_dist = curr_dist

                # ── Goal-alignment bonus (movement-gated) ────────────────────────
                # Original bug: alignment reward fired even when standing still,
                # making spinning-to-face-goal a profitable strategy.
                # Fix: full bonus ONLY when the robot is actually moving forward.
                # When stationary, only a tiny nudge so the gradient still points
                # in the right direction without rewarding motionless turning.
                goal_angle_rad = float(np.arctan2(gy - curr_y, gx - curr_x))
                robot_angle_rad = float(np.deg2rad(self.world.robot.angle_degrees))
                angle_diff = goal_angle_rad - robot_angle_rad
                angle_diff = float(np.arctan2(np.sin(angle_diff), np.cos(angle_diff)))
                alignment = float(np.cos(angle_diff))
                if displacement > 0.3:
                    reward += alignment * 0.15   # reward moving in the right direction
                else:
                    reward += alignment * 0.008  # tiny orientation nudge only

                # Proximity urgency: strong pull when very close to goal
                if curr_dist < 80.0:
                    reward += (80.0 - curr_dist) * 0.003

            # ── Position tracking, exploration & spin detection ──────────────
            curr_x_ = self.world.robot.x
            curr_y_ = self.world.robot.y
            pos_change = float(np.sqrt(
                (curr_x_ - self._last_x) ** 2 + (curr_y_ - self._last_y) ** 2
            ))

            # ── Count-based exploration bonus (Go-Explore / NGU style) ────────
            # Reward for entering a never-visited region of the arena.
            # This directly solves the circling problem: the robot is rewarded
            # for going to NEW places rather than re-visiting its starting area.
            _gs = self._visit_grid_size
            _cell = (
                int(np.clip((curr_x_ / self.world.width) * _gs, 0, _gs - 1)),
                int(np.clip((curr_y_ / self.world.height) * _gs, 0, _gs - 1)),
            )
            if _cell not in self._visited_cells:
                self._visited_cells.add(_cell)
                reward += 0.015  # small bonus: exploration helpful but goal must dominate

            # ── Heading history for smart spin detection ──────────────────────
            self._heading_history.append(self.world.robot.angle_degrees)

            # If robot spun >360° in last 12 steps but barely moved → spinning
            # This is the exact locomotion penalty used in DeepMind's DM Control
            # Locomotion tasks to punish in-place spinning as unproductive.
            if len(self._heading_history) >= 10:
                _total_turn = 0.0
                _h = list(self._heading_history)
                for _i in range(1, len(_h)):
                    _diff = (_h[_i] - _h[_i - 1] + 180.0) % 360.0 - 180.0
                    _total_turn += abs(_diff)
                # BUG FIX: original threshold=360 deg was physically impossible
                # to trigger (robot can only rotate ~133 deg in 12 steps at 12
                # deg/step turn rate).  New threshold=80 deg fires after only
                # ~7 consecutive turning steps — catches spinning reliably.
                if _total_turn > 80.0 and pos_change < 3.0:
                    reward -= 0.50  # hard spin penalty: spinning never reaches goal

            # ── Soft stuck penalty (open space only) ─────────────────────────
            if pos_change < 2.0 and not danger:
                stuck_frac = min(self.current_step / max(1, self.max_steps), 0.6)
                # Raised from 0.025 to 0.08: stuck penalty now clearly outweighs
                # the +0.01 survival bonus so doing nothing is never profitable.
                reward -= 0.08 * (1.0 + stuck_frac)

            self._last_x = curr_x_
            self._last_y = curr_y_

        # Goal reached — large reward, end episode cleanly
        goal_reached = self.has_goal and self.world.check_goal_reached()
        if goal_reached:
            reward += 100.0

        self.last_reward = reward
        self.last_collision = collided

        # 2 consecutive wall hits = terminated (faster feedback loop than 4).
        # The model learns wall avoidance more efficiently with quick termination.
        terminated = self._consecutive_collisions >= 2
        truncated = self.current_step >= self.max_steps or goal_reached

        # ── Episode survival completion bonus ─────────────────────────────────
        # Awarded when the robot survives ALL max_steps without dying.
        # This is the single most important signal for "learn to survive":
        # completing a full episode earns +12 regardless of other rewards.
        # Compare: dying 4× = −160; surviving 700 steps ≈ +7 survival + +12 bonus = +19.
        if self.current_step >= self.max_steps and not terminated:
            reward += 12.0

        self.last_reward = reward

        info: dict[str, Any] = {
            "x": self.world.robot.x,
            "y": self.world.robot.y,
            "angle": self.world.robot.angle_degrees,
            "collision": collided,
            "goal_reached": goal_reached,
        }
        return observation, reward, terminated, truncated, info

    def step_auto(self) -> dict[str, Any]:
        """Autonomous step for live preview (rotate + move forward)."""
        self.world.robot.rotate_right()
        if self.turn_noise_std > 0:
            self.world.robot.angle_degrees = (
                self.world.robot.angle_degrees + float(self.np_random.normal(0.0, self.turn_noise_std))
            ) % 360.0
        self.world.robot.move_forward()
        if self.speed_noise_std > 0:
            vx = float(self.world.robot.body.velocity.x)
            vy = float(self.world.robot.body.velocity.y)
            scale = 1.0 + float(self.np_random.normal(0.0, self.speed_noise_std))
            self.world.robot.body.velocity = (vx * scale, vy * scale)
        collided = self.world.step()
        if collided:
            reward = -5.0
            # Reset to centre so it doesn't get stuck
            self.world.robot.reset(x=self.world.width / 2, y=self.world.height / 2)
        else:
            reward = 0.1
        self.last_reward = reward
        self.last_collision = collided
        return self.get_state()

    def get_state(self) -> dict[str, Any]:
        """Return a snapshot of the simulation for UI rendering."""
        origin = (self.world.robot.x, self.world.robot.y)
        heading = self.world.robot.angle_degrees
        if self.sensor_angles is not None:
            distances = cast_rays_at_angles(
                self.world.space, origin, heading, self.sensor_angles, self.ray_length
            )
            # Absolute world-space angles so the canvas can draw rays correctly
            sensor_angles_abs = [
                (heading + rel_a) % 360.0 for rel_a in self.sensor_angles
            ]
            sensor_angle_labels = [direction_label(a) for a in self.sensor_angles]
        else:
            distances = cast_rays(
                self.world.space,
                origin,
                heading,
                ray_count=self.ray_count,
                ray_length=self.ray_length,
                fov_degrees=self.ray_fov_degrees,
            )
            sensor_angles_abs = None
            sensor_angle_labels = None
        return {
            "x": self.world.robot.x,
            "y": self.world.robot.y,
            "angle": self.world.robot.angle_degrees,
            "collision": self.last_collision,
            "reward": self.last_reward,
            "episode_count": self.episode_count,
            "rays": distances,
            "sensor_distances": distances,
            "ray_count": self.ray_count,
            "ray_length": self.ray_length,
            "ray_fov_degrees": self.ray_fov_degrees,
            # Fixed-angle sensor info (None when using FOV fan mode)
            "sensor_angles_abs": sensor_angles_abs,
            "sensor_angle_labels": sensor_angle_labels,
            "world_width": self.world.width,
            "world_height": self.world.height,
            "wall_margin": self.world.wall_margin,
            "robot_radius": self.world.robot.config.radius,
            "obstacles": self.world.obstacles,
            "goal_x": self.world.goal_x,
            "goal_y": self.world.goal_y,
            "goal_radius": self.world.goal_radius if self.has_goal else None,
            "profile": self.profile,
            "profile_label": self.profile_config["label"],
            "flat_ground_model": self.flat_ground_model,
            "visual": self.profile_config["visual"],
            "dynamics": self.profile_config.get("dynamics", {}),
            "control_mode": "discrete",
        }

    def render(self) -> None:
        """Draw the current world state into a pygame window.
        
        Uses the SAME world/physics instance already running.
        Never creates a duplicate environment.
        Called by LiveRenderCallback every N steps.
        """
        import math
        try:
            import pygame
        except ImportError:
            return  # pygame not installed, skip render silently

        try:
            # ---- Lazy pygame initialisation (once per env instance) ----
            if not hasattr(self, "_pg_screen") or self._pg_screen is None:
                if not pygame.get_init():
                    pygame.init()
                self._pg_screen = pygame.display.set_mode(
                    (self.world.width, self.world.height)
                )
                pygame.display.set_caption(
                    f"RobotMind – Live Training [{self.flat_ground_model.upper()}]"
                )
                self._pg_clock = pygame.time.Clock()
                self._pg_font = pygame.font.SysFont("monospace", 13)

            # ---- Pump OS events so window doesn't freeze ----
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    # User closed window – mark for teardown but keep training
                    self._pg_screen = None
                    pygame.quit()
                    return

            screen = self._pg_screen
            W, H = self.world.width, self.world.height
            m = int(self.world.wall_margin)

            # ---- Background ----
            screen.fill((12, 17, 27))

            # ---- Arena boundary ----
            pygame.draw.rect(screen, (35, 50, 70), (m, m, W - 2 * m, H - 2 * m), 2)

            # ---- Obstacles ----
            for obs in self.world.obstacles:
                ox, oy = int(obs["x"]), int(obs["y"])
                ow, oh = int(obs["width"]), int(obs["height"])
                pygame.draw.rect(screen, (40, 60, 90), (ox, oy, ow, oh))
                pygame.draw.rect(screen, (70, 100, 140), (ox, oy, ow, oh), 1)

            # ---- Sensor rays (draw before robot so robot is on top) ----
            rx, ry = self.world.robot.x, self.world.robot.y
            from backend.simulation.sensors import cast_rays
            distances = cast_rays(
                self.world.space,
                (rx, ry),
                self.world.robot.angle_degrees,
                ray_count=self.ray_count,
                ray_length=self.ray_length,
                fov_degrees=self.ray_fov_degrees,
            )
            half_fov = math.radians(self.ray_fov_degrees / 2.0)
            base_angle = math.radians(self.world.robot.angle_degrees) - half_fov
            angle_step = (
                math.radians(self.ray_fov_degrees) / max(self.ray_count - 1, 1)
            )
            for i, dist_norm in enumerate(distances):
                angle = base_angle + i * angle_step
                end_x = rx + math.cos(angle) * dist_norm * self.ray_length
                end_y = ry + math.sin(angle) * dist_norm * self.ray_length
                # Green when clear, red when near obstacle
                intensity = int(255 * dist_norm)
                ray_color = (255 - intensity, intensity, 80)
                pygame.draw.line(
                    screen, ray_color,
                    (int(rx), int(ry)), (int(end_x), int(end_y)), 1
                )

            # ---- Robot body ----
            r = int(self.world.robot.config.radius)
            body_color = (220, 55, 60) if self.last_collision else (40, 210, 140)
            pygame.draw.circle(screen, body_color, (int(rx), int(ry)), r)
            pygame.draw.circle(screen, (255, 255, 255), (int(rx), int(ry)), r, 1)

            # ---- Heading arrow ----
            head_rad = math.radians(self.world.robot.angle_degrees)
            arrow_x = rx + math.cos(head_rad) * r * 1.6
            arrow_y = ry + math.sin(head_rad) * r * 1.6
            pygame.draw.line(
                screen, (240, 240, 100),
                (int(rx), int(ry)), (int(arrow_x), int(arrow_y)), 2
            )

            # ---- HUD ----
            reward_color = (70, 230, 120) if self.last_reward > 0 else (230, 70, 70)
            hud_lines = [
                (f"Episode  {self.episode_count}", (160, 190, 220)),
                (f"Step     {self.current_step}", (160, 190, 220)),
                (f"Reward   {self.last_reward:+.1f}", reward_color),
                (f"Model    {self.flat_ground_model.upper()}", (120, 160, 200)),
            ]
            for idx, (text, color) in enumerate(hud_lines):
                surf = self._pg_font.render(text, True, color)
                screen.blit(surf, (8, 8 + idx * 16))

            pygame.display.flip()
            self._pg_clock.tick(30)  # Cap render at 30 fps

        except Exception:
            pass  # Never let rendering crash the training loop

    def close_render(self) -> None:
        """Tear down the pygame window if it was created."""
        try:
            import pygame
            if hasattr(self, "_pg_screen") and self._pg_screen is not None:
                self._pg_screen = None
                pygame.quit()
        except Exception:
            pass


class ContinuousRobotEnv(gym.Env[np.ndarray, np.ndarray]):
    """Continuous-action variant for SAC/TD3/DDPG training with shaped reward."""

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        max_steps: int | None = None,
        ray_count: int = 8,
        profile: str = "arena_basic",
    ) -> None:
        super().__init__()
        self.profile = profile
        self.profile_config = get_environment_profile(profile)
        world_cfg = self.profile_config["world"]
        robot_cfg = self.profile_config["robot"]
        sensor_cfg = self.profile_config["sensor"]
        dynamics_cfg = self.profile_config.get("dynamics", {})

        self.world = SimulationWorld(
            width=int(world_cfg["width"]),
            height=int(world_cfg["height"]),
            wall_margin=float(world_cfg["wall_margin"]),
            obstacles=list(world_cfg["obstacles"]),
            goal=world_cfg.get("goal"),
        )
        self.world.robot.config = RobotConfig(
            radius=float(robot_cfg["radius"]),
            speed=float(robot_cfg["speed"]),
            turn_rate_degrees=float(robot_cfg["turn_rate_degrees"]),
        )
        self.world.robot.shape.unsafe_set_radius(self.world.robot.config.radius)
        # Explicit max_steps arg overrides profile; profile overrides built-in default of 500
        _profile_max_steps = int(dynamics_cfg.get("max_steps", 500))
        self.max_steps = max_steps if max_steps is not None else _profile_max_steps
        self.sensor_angles: list[float] | None = None  # continuous env uses FOV fan only
        self.ray_count = max(ray_count, int(sensor_cfg["ray_count"]))
        self.ray_length = float(sensor_cfg["ray_length"])
        self.ray_fov_degrees = float(sensor_cfg["ray_fov_degrees"])
        self.sensor_noise_std = float(dynamics_cfg.get("sensor_noise_std", 0.0))
        self.heading_drift_std = float(dynamics_cfg.get("heading_drift_std", 0.0))
        self.speed_noise_std = float(dynamics_cfg.get("speed_noise_std", 0.0))
        self.turn_noise_std = float(dynamics_cfg.get("turn_noise_std", 0.0))
        self.randomize_spawn = bool(dynamics_cfg.get("randomize_spawn", False))
        self.speed_scale_min = float(dynamics_cfg.get("speed_scale_min", 1.0))
        self.speed_scale_max = float(dynamics_cfg.get("speed_scale_max", 1.0))
        self.turn_scale_min = float(dynamics_cfg.get("turn_scale_min", 1.0))
        self.turn_scale_max = float(dynamics_cfg.get("turn_scale_max", 1.0))
        self._fixed_spawn_x: float | None = (
            float(dynamics_cfg["spawn_x"]) if "spawn_x" in dynamics_cfg else None
        )
        self._fixed_spawn_y: float | None = (
            float(dynamics_cfg["spawn_y"]) if "spawn_y" in dynamics_cfg else None
        )
        self.has_goal = self.world.goal_x is not None
        self._base_speed = self.world.robot.config.speed
        self._base_turn_rate = self.world.robot.config.turn_rate_degrees
        self.flat_ground_model = _resolve_flat_ground_model(self.profile_config)
        self.current_step = 0
        self.episode_count = 0
        self.last_reward = 0.0
        self.last_collision = False

        self.action_space = spaces.Box(
            low=np.array([-1.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )
        extra = 3 if self.has_goal else 0
        self.observation_space = spaces.Box(
            low=np.array([0.0] * self.ray_count + [-1.0, -1.0] + [-1.0] * extra, dtype=np.float32),
            high=np.array([1.0] * self.ray_count + [1.0,  1.0] + [1.0]  * extra, dtype=np.float32),
            dtype=np.float32,
        )

    def _random_spawn(self) -> None:
        margin = self.world.wall_margin + self.world.robot.config.radius + 4.0
        for _ in range(32):
            x = float(self.np_random.uniform(margin, self.world.width - margin))
            y = float(self.np_random.uniform(margin, self.world.height - margin))
            overlaps = False
            for obstacle in self.world.obstacles:
                ox = float(obstacle["x"])
                oy = float(obstacle["y"])
                ow = float(obstacle["width"])
                oh = float(obstacle["height"])
                closest_x = min(max(x, ox), ox + ow)
                closest_y = min(max(y, oy), oy + oh)
                dx = x - closest_x
                dy = y - closest_y
                if dx * dx + dy * dy <= (self.world.robot.config.radius + 2.0) ** 2:
                    overlaps = True
                    break
            if not overlaps:
                self.world.robot.body.position = (x, y)
                self.world.robot.body.velocity = (0.0, 0.0)
                return

    def _get_observation(self) -> np.ndarray:
        distances = cast_rays(
            self.world.space,
            (self.world.robot.x, self.world.robot.y),
            self.world.robot.angle_degrees,
            ray_count=self.ray_count,
            ray_length=self.ray_length,
            fov_degrees=self.ray_fov_degrees,
        )
        if self.sensor_noise_std > 0:
            noise = self.np_random.normal(0.0, self.sensor_noise_std, size=len(distances))
            distances = [float(np.clip(dist + noise_val, 0.0, 1.0)) for dist, noise_val in zip(distances, noise)]
        angle_rad = float(np.deg2rad(self.world.robot.angle_degrees))
        obs_sin = float(np.sin(angle_rad))
        obs_cos = float(np.cos(angle_rad))
        base = [*distances, obs_sin, obs_cos]
        if self.has_goal:
            dx = (self.world.goal_x or 0.0) - self.world.robot.x
            dy = (self.world.goal_y or 0.0) - self.world.robot.y
            raw_dist = (dx * dx + dy * dy) ** 0.5
            max_dist = (self.world.width ** 2 + self.world.height ** 2) ** 0.5
            dist_norm = float(np.clip(raw_dist / max_dist, 0.0, 1.0))
            goal_angle = float(np.arctan2(dy, dx))
            base += [dist_norm, float(np.sin(goal_angle)), float(np.cos(goal_angle))]
        return np.array(base, dtype=np.float32)

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        self.current_step = 0
        self.episode_count += 1

        # Randomise heading every episode for spatial generalisation
        random_heading = float(self.np_random.uniform(0.0, 360.0))
        self.world.reset(angle_degrees=random_heading)

        # Spawn logic: fixed position > randomize > center (with overlap fallback)
        if self.randomize_spawn:
            self._random_spawn()
        elif self._fixed_spawn_x is not None:
            self.world.robot.body.position = (self._fixed_spawn_x, self._fixed_spawn_y)
            self.world.robot.body.velocity = (0.0, 0.0)
        else:
            rx, ry = self.world.robot.x, self.world.robot.y
            r = self.world.robot.config.radius
            for obs in self.world.obstacles:
                ox, oy, ow, oh = obs["x"], obs["y"], obs["width"], obs["height"]
                cx = min(max(rx, ox), ox + ow)
                cy = min(max(ry, oy), oy + oh)
                if (rx - cx) ** 2 + (ry - cy) ** 2 <= (r + 4) ** 2:
                    self._random_spawn()
                    break
        speed_scale = float(self.np_random.uniform(self.speed_scale_min, self.speed_scale_max))
        turn_scale = float(self.np_random.uniform(self.turn_scale_min, self.turn_scale_max))
        self.world.robot.config.speed = self._base_speed * speed_scale
        self.world.robot.config.turn_rate_degrees = self._base_turn_rate * turn_scale
        self.last_reward = 0.0
        self.last_collision = False
        self._last_x = self.world.robot.x
        self._last_y = self.world.robot.y
        return self._get_observation(), {"status": "reset"}

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        self.current_step += 1

        throttle = float(np.clip(action[0], -1.0, 1.0))
        turn = float(np.clip(action[1], -1.0, 1.0))

        turn_gain = 1.0
        speed_gain = 1.0
        if self.flat_ground_model == "ackermann":
            turn_gain = 0.75
            speed_gain = 0.95
        elif self.flat_ground_model == "rover":
            turn_gain = 0.9
            speed_gain = 0.85 * (1.0 - 0.25 * abs(turn))

        turn_delta = turn * self.world.robot.config.turn_rate_degrees * turn_gain
        if self.turn_noise_std > 0:
            turn_delta += float(self.np_random.normal(0.0, self.turn_noise_std))
        if self.heading_drift_std > 0:
            turn_delta += float(self.np_random.normal(0.0, self.heading_drift_std))
        self.world.robot.angle_degrees = (self.world.robot.angle_degrees + turn_delta) % 360.0

        heading = np.deg2rad(self.world.robot.angle_degrees)
        speed = self.world.robot.config.speed * throttle * speed_gain
        if self.speed_noise_std > 0:
            speed *= 1.0 + float(self.np_random.normal(0.0, self.speed_noise_std))
        self.world.robot.body.velocity = (speed * np.cos(heading), speed * np.sin(heading))

        # Capture position before physics step
        prev_x = self.world.robot.x
        prev_y = self.world.robot.y

        collided = self.world.step()
        observation = self._get_observation()

        if collided:
            # Heavy penalty — a well-trained model should never reach this because
            # sensors detect obstacles long before any physical contact occurs.
            reward = -50.0
        else:
            dx = self.world.robot.x - prev_x
            dy = self.world.robot.y - prev_y
            displacement = float(np.sqrt(dx * dx + dy * dy))

            ray_distances = observation[: self.ray_count]
            min_dist = float(np.min(ray_distances))

            # Suppress displacement reward in danger zone so the model learns that
            # moving forward while close to an obstacle is NOT beneficial.
            danger = min_dist < 0.5
            reward = (displacement * 0.02 - 0.01) * (0.0 if danger else 1.0) - 0.01 * danger

            # Proximity penalty: fires early (0.5) so the model steers away with plenty
            # of room to spare. Coefficient 4.0 makes it clearly outweigh the +0.07
            # forward step reward, so the model learns avoidance before contact.
            if min_dist < 0.5:
                # Scales from 0 at dist=0.5 up to -2.0 at dist=0.0
                reward -= (0.5 - min_dist) * 4.0

            # Clearance bonus: encourage keeping all sensors well clear.
            if min_dist > 0.7:
                reward += 0.02

        goal_reached = self.has_goal and self.world.check_goal_reached()
        if goal_reached:
            reward += 100.0

        self.last_reward = reward
        self.last_collision = collided

        terminated = collided
        truncated = self.current_step >= self.max_steps or goal_reached
        info: dict[str, Any] = {
            "x": self.world.robot.x,
            "y": self.world.robot.y,
            "angle": self.world.robot.angle_degrees,
            "collision": collided,
            "goal_reached": goal_reached,
        }
        return observation, reward, terminated, truncated, info

    def get_state(self) -> dict[str, Any]:
        origin = (self.world.robot.x, self.world.robot.y)
        heading = self.world.robot.angle_degrees
        distances = cast_rays(
            self.world.space, origin, heading,
            ray_count=self.ray_count, ray_length=self.ray_length,
            fov_degrees=self.ray_fov_degrees,
        )
        return {
            "x": self.world.robot.x,
            "y": self.world.robot.y,
            "angle": self.world.robot.angle_degrees,
            "collision": self.last_collision,
            "reward": self.last_reward,
            "episode_count": self.episode_count,
            "rays": distances,
            "sensor_distances": distances,
            "ray_count": self.ray_count,
            "ray_length": self.ray_length,
            "ray_fov_degrees": self.ray_fov_degrees,
            "sensor_angles_abs": None,
            "sensor_angle_labels": None,
            "world_width": self.world.width,
            "world_height": self.world.height,
            "wall_margin": self.world.wall_margin,
            "robot_radius": self.world.robot.config.radius,
            "obstacles": self.world.obstacles,
            "goal_x": self.world.goal_x,
            "goal_y": self.world.goal_y,
            "goal_radius": self.world.goal_radius if self.has_goal else None,
            "profile": self.profile,
            "profile_label": self.profile_config["label"],
            "flat_ground_model": self.flat_ground_model,
            "visual": self.profile_config["visual"],
            "dynamics": self.profile_config.get("dynamics", {}),
            "control_mode": "continuous",
        }

    def render(self) -> None:
        """Same render implementation as RobotEnv – draws the same shared world."""
        import math
        try:
            import pygame
        except ImportError:
            return

        try:
            if not hasattr(self, "_pg_screen") or self._pg_screen is None:
                if not pygame.get_init():
                    pygame.init()
                self._pg_screen = pygame.display.set_mode(
                    (self.world.width, self.world.height)
                )
                pygame.display.set_caption(
                    f"RobotMind – Live Training [{self.flat_ground_model.upper()} / continuous]"
                )
                self._pg_clock = pygame.time.Clock()
                self._pg_font = pygame.font.SysFont("monospace", 13)

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self._pg_screen = None
                    pygame.quit()
                    return

            screen = self._pg_screen
            W, H = self.world.width, self.world.height
            m = int(self.world.wall_margin)

            screen.fill((12, 17, 27))
            pygame.draw.rect(screen, (35, 50, 70), (m, m, W - 2 * m, H - 2 * m), 2)

            for obs in self.world.obstacles:
                ox, oy = int(obs["x"]), int(obs["y"])
                ow, oh = int(obs["width"]), int(obs["height"])
                pygame.draw.rect(screen, (40, 60, 90), (ox, oy, ow, oh))
                pygame.draw.rect(screen, (70, 100, 140), (ox, oy, ow, oh), 1)

            rx, ry = self.world.robot.x, self.world.robot.y
            from backend.simulation.sensors import cast_rays
            distances = cast_rays(
                self.world.space, (rx, ry),
                self.world.robot.angle_degrees,
                ray_count=self.ray_count,
                ray_length=self.ray_length,
                fov_degrees=self.ray_fov_degrees,
            )
            half_fov = math.radians(self.ray_fov_degrees / 2.0)
            base_angle = math.radians(self.world.robot.angle_degrees) - half_fov
            angle_step = math.radians(self.ray_fov_degrees) / max(self.ray_count - 1, 1)
            for i, dist_norm in enumerate(distances):
                angle = base_angle + i * angle_step
                end_x = rx + math.cos(angle) * dist_norm * self.ray_length
                end_y = ry + math.sin(angle) * dist_norm * self.ray_length
                intensity = int(255 * dist_norm)
                ray_color = (255 - intensity, intensity, 80)
                pygame.draw.line(
                    screen, ray_color,
                    (int(rx), int(ry)), (int(end_x), int(end_y)), 1
                )

            r = int(self.world.robot.config.radius)
            body_color = (220, 55, 60) if self.last_collision else (60, 160, 240)
            pygame.draw.circle(screen, body_color, (int(rx), int(ry)), r)
            pygame.draw.circle(screen, (255, 255, 255), (int(rx), int(ry)), r, 1)

            head_rad = math.radians(self.world.robot.angle_degrees)
            arrow_x = rx + math.cos(head_rad) * r * 1.6
            arrow_y = ry + math.sin(head_rad) * r * 1.6
            pygame.draw.line(
                screen, (240, 240, 100),
                (int(rx), int(ry)), (int(arrow_x), int(arrow_y)), 2
            )

            reward_color = (70, 230, 120) if self.last_reward > 0 else (230, 70, 70)
            hud_lines = [
                (f"Episode  {self.episode_count}", (160, 190, 220)),
                (f"Step     {self.current_step}", (160, 190, 220)),
                (f"Reward   {self.last_reward:+.1f}", reward_color),
                (f"Mode     CONTINUOUS", (160, 130, 240)),
            ]
            for idx, (text, color) in enumerate(hud_lines):
                surf = self._pg_font.render(text, True, color)
                screen.blit(surf, (8, 8 + idx * 16))

            pygame.display.flip()
            self._pg_clock.tick(30)

        except Exception:
            pass

    def close_render(self) -> None:
        try:
            import pygame
            if hasattr(self, "_pg_screen") and self._pg_screen is not None:
                self._pg_screen = None
                pygame.quit()
        except Exception:
            pass


class CurriculumRobotEnv(RobotEnv):
    """RobotEnv that swaps obstacle layouts every episode.

    Gives the agent genuine spatial generalisation: it cannot memorise a single
    map. Instead it must learn to read sensor values and navigate to the goal
    from any configuration.

    The profile's world config must contain a ``layouts`` list — each element is
    a list of obstacle dicts identical in format to ``world.obstacles``.
    If ``layouts`` is absent the default obstacle list is used as a single-layout
    pool, which degrades gracefully to standard RobotEnv behaviour.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        world_cfg = self.profile_config["world"]
        raw_pool = world_cfg.get("layouts")
        if raw_pool and isinstance(raw_pool, list) and len(raw_pool) > 0:
            self._layout_pool: list[list[dict]] = [list(layout) for layout in raw_pool]
        else:
            # Fall back to whatever obstacles were loaded at init
            self._layout_pool = [list(self.world.obstacles)]

    # ── Obstacle hot-swap helpers ──────────────────────────────────────────

    def _swap_layout(self, obstacles: list[dict]) -> None:
        """Remove current obstacles from the pymunk space and add new ones."""
        for shape in list(self.world._obstacle_shapes):
            if shape in self.world.space.shapes:
                self.world.space.remove(shape)
        for body in list(self.world._obstacle_bodies):
            if body in self.world.space.bodies:
                self.world.space.remove(body)
        self.world._obstacle_shapes.clear()
        self.world._obstacle_bodies.clear()
        self.world.obstacles.clear()
        self.world._obstacle_defs = obstacles
        self.world._create_obstacles()

    # ── Overridden reset ───────────────────────────────────────────────────

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        # Seed gymnasium RNG (does NOT call our parent reset logic yet)
        gym.Env.reset(self, seed=seed)
        self.current_step = 0
        self.episode_count += 1

        # 1. Pick a random obstacle layout BEFORE placing anything.
        idx = int(self.np_random.integers(0, len(self._layout_pool)))
        self._swap_layout(list(self._layout_pool[idx]))

        # 2. Reset robot to centre with a random heading.
        random_heading = float(self.np_random.uniform(0.0, 360.0))
        self.world.reset(angle_degrees=random_heading)

        # 3. Randomise spawn so robot never starts from the same spot.
        self._random_spawn()

        # 4. Speed / turn scale variation for robustness.
        speed_scale = float(self.np_random.uniform(self.speed_scale_min, self.speed_scale_max))
        turn_scale = float(self.np_random.uniform(self.turn_scale_min, self.turn_scale_max))
        self.world.robot.config.speed = self._base_speed * speed_scale
        self.world.robot.config.turn_rate_degrees = self._base_turn_rate * turn_scale

        # 5. Randomise goal every episode so the policy cannot memorise a path.
        if self.has_goal:
            self._random_goal()

        # 6. Housekeeping state.
        self.last_reward = 0.0
        self.last_collision = False
        self._consecutive_collisions = 0
        self._last_x = self.world.robot.x
        self._last_y = self.world.robot.y
        if self.has_goal:
            gx = self.world.goal_x or 0.0
            gy = self.world.goal_y or 0.0
            dx0 = gx - self.world.robot.x
            dy0 = gy - self.world.robot.y
            self._last_goal_dist = float(np.sqrt(dx0 * dx0 + dy0 * dy0))
        else:
            self._last_goal_dist = 0.0
        # Reset stagnation tracker and heading history for fresh episode.
        self._stagnation_best_dist = self._last_goal_dist
        self._stagnation_steps = 0
        self._heading_history.clear()

        return self._get_observation(), {"status": "reset"}
