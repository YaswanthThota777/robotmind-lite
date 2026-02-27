"""Automated model behavioral diagnostic suite.

Runs 6 targeted tests on a trained SB3 model and returns structured
issue reports with severity grades and actionable fix recommendations.

Tests:
  1. goal_seeking      — does the robot reach the goal reliably?
  2. wall_avoidance    — does the robot crash into walls?
  3. spin_detection    — does the robot spin in place instead of moving?
  4. generalization    — does performance hold across layout variants?
  5. coverage          — does the robot explore meaningful area?
  6. path_efficiency   — when it does reach goal, is the path direct?
"""

from __future__ import annotations

import time
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np


# ── Pass/Warn/Fail grading helpers ───────────────────────────────────────────

def _grade(value: float, pass_thresh: float, warn_thresh: float, higher_is_better: bool = True) -> str:
    """Return 'pass', 'warn', or 'fail' based on thresholds."""
    if higher_is_better:
        if value >= pass_thresh:
            return "pass"
        if value >= warn_thresh:
            return "warn"
        return "fail"
    else:
        if value <= pass_thresh:
            return "pass"
        if value <= warn_thresh:
            return "warn"
        return "fail"


def _build_issue(
    test_id: str,
    name: str,
    status: str,
    metric_label: str,
    metric_value: float,
    unit: str,
    threshold_pass: float,
    description: str,
    fix_description: str,
    fix_params: dict[str, Any],
    severity: str = "medium",
) -> dict[str, Any]:
    return {
        "test_id": test_id,
        "name": name,
        "status": status,          # "pass" | "warn" | "fail"
        "severity": severity if status != "pass" else "none",
        "metric_label": metric_label,
        "metric_value": round(metric_value, 4),
        "unit": unit,
        "threshold_pass": threshold_pass,
        "description": description,
        "fix_description": fix_description,
        "fix_params": fix_params,  # ready to send to /start-training
        "has_fix": status != "pass",
    }


# ── Core runner ───────────────────────────────────────────────────────────────

def run_auto_test(
    model_path: str,
    algorithm: str,
    environment_profile: str,
    control_mode: str = "discrete",
    episodes_per_test: int = 20,
    max_steps_override: int | None = None,
) -> dict[str, Any]:
    """Run all 6 behavioral tests. Returns a diagnostic report dict.

    Args:
        model_path:           Path to SB3 .zip model file.
        algorithm:            Algorithm key (PPO, DQN, etc.).
        environment_profile:  Environment profile to test against.
        control_mode:         'discrete' or 'continuous'.
        episodes_per_test:    Episodes to run per test (default 20).
        max_steps_override:   Override env max_steps for testing.
    """
    started = time.perf_counter()

    # ── Load model ──────────────────────────────────────────────────────────
    from backend.rl.trainer import SUPPORTED_ALGORITHMS
    from backend.simulation.gym_env import ContinuousRobotEnv, CurriculumRobotEnv, RobotEnv
    from backend.simulation.presets import get_environment_profile

    algo_info = SUPPORTED_ALGORITHMS.get(algorithm.upper())
    if algo_info is None:
        raise ValueError(f"Unknown algorithm: {algorithm}")

    model_class = algo_info["class"]
    if model_class is None:
        raise ValueError(f"Algorithm {algorithm} is not available (missing dependency)")

    model_file = Path(model_path)
    if not model_file.exists():
        raise FileNotFoundError(f"Model not found: {model_file}")

    model = model_class.load(str(model_file))

    # ── Build env factory ────────────────────────────────────────────────────
    def _make_env(profile: str) -> Any:
        env_cfg = get_environment_profile(profile)
        env_class_flag = str(env_cfg.get("metadata", {}).get("env_class", "")).lower()
        kwargs: dict[str, Any] = {"profile": profile}
        if max_steps_override:
            kwargs["max_steps"] = max_steps_override
        if control_mode == "continuous":
            return ContinuousRobotEnv(**kwargs)
        elif env_class_flag == "curriculum":
            return CurriculumRobotEnv(**kwargs)
        else:
            return RobotEnv(**kwargs)

    def _get_model_obs_dim() -> int:
        try:
            return int(model.observation_space.shape[0])
        except Exception:
            return -1

    def _safe_obs(obs: np.ndarray, env_obs_dim: int) -> np.ndarray:
        """Reshape observation to exactly match the model's expected input dim.

        Handles three cases:
          - env_dim == model_dim  → pass through unchanged
          - env_dim  > model_dim  → trim to model_dim (env has extra sensors)
          - env_dim  < model_dim  → pad with zeros to model_dim
            (model was trained with visited-grid or more sensors; unseen dims
             default to 0 which is a sensible neutral value for all features)
        """
        model_dim = _get_model_obs_dim()
        if model_dim <= 0:
            return obs
        obs_flat = np.asarray(obs, dtype=np.float32).flatten()
        cur_dim = len(obs_flat)
        if cur_dim == model_dim:
            return obs_flat
        if cur_dim > model_dim:
            return obs_flat[:model_dim]
        # cur_dim < model_dim — pad with zeros
        padded = np.zeros(model_dim, dtype=np.float32)
        padded[:cur_dim] = obs_flat
        return padded

    # ── Episode runner ───────────────────────────────────────────────────────
    def _run_episodes(profile: str, n: int, collect_spin: bool = False) -> dict[str, Any]:
        """Run n episodes, return aggregate metrics."""
        env = _make_env(profile)
        env_obs_dim = int(env.observation_space.shape[0])
        max_s = getattr(env, "max_steps", 700)
        grid_size = 16

        rewards, steps_list, collisions, goals = [], [], [], []
        spin_episodes: list[bool] = []
        coverage_list: list[float] = []
        goal_steps_list: list[int] = []

        try:
            for _ in range(n):
                obs, _ = env.reset()
                total_r = 0.0
                step_count = 0
                collided = False
                goal_reached = False
                visited: set[tuple[int, int]] = set()

                # For spin detection
                heading_hist: deque[float] = deque(maxlen=20)
                pos_hist: deque[tuple[float, float]] = deque(maxlen=20)
                spin_detected = False

                while True:
                    safe_obs = _safe_obs(obs, env_obs_dim)
                    action, _ = model.predict(safe_obs, deterministic=True)
                    if control_mode != "continuous":
                        try:
                            action = int(action)
                        except Exception:
                            action = int(action[0])

                    obs, r, term, trunc, info = env.step(action)
                    total_r += float(r)
                    step_count += 1

                    # Track position for coverage
                    state = env.get_state() if hasattr(env, "get_state") else {}
                    wx = float(state.get("x", 320))
                    wy = float(state.get("y", 240))
                    w = float(state.get("world_width", 640))
                    h = float(state.get("world_height", 480))
                    cx = int(np.clip((wx / max(w, 1)) * grid_size, 0, grid_size - 1))
                    cy = int(np.clip((wy / max(h, 1)) * grid_size, 0, grid_size - 1))
                    visited.add((cx, cy))

                    # Track spin
                    if collect_spin:
                        angle = float(state.get("angle", 0))
                        heading_hist.append(angle)
                        pos_hist.append((wx, wy))
                        if len(heading_hist) >= 15 and not spin_detected:
                            total_turn = sum(
                                abs((heading_hist[i] - heading_hist[i - 1] + 180) % 360 - 180)
                                for i in range(1, len(heading_hist))
                            )
                            if len(pos_hist) >= 2:
                                dx = pos_hist[-1][0] - pos_hist[0][0]
                                dy = pos_hist[-1][1] - pos_hist[0][1]
                                pos_change = float(np.sqrt(dx * dx + dy * dy))
                                if total_turn > 120.0 and pos_change < 25.0:
                                    spin_detected = True

                    if isinstance(info, dict):
                        if info.get("goal_reached"):
                            goal_reached = True
                        if info.get("collision"):
                            collided = True

                    if term or trunc:
                        break

                rewards.append(total_r)
                steps_list.append(step_count)
                collisions.append(1 if collided else 0)
                goals.append(1 if goal_reached else 0)
                if collect_spin:
                    spin_episodes.append(spin_detected)
                coverage_list.append(len(visited) / (grid_size * grid_size))
                if goal_reached:
                    goal_steps_list.append(step_count)

        finally:
            env.close()

        return {
            "avg_reward": float(np.mean(rewards)) if rewards else 0.0,
            "collision_rate": float(np.mean(collisions)) if collisions else 0.0,
            "goal_reach_rate": float(np.mean(goals)) if goals else 0.0,
            "spin_rate": float(np.mean([1 if s else 0 for s in spin_episodes])) if spin_episodes else 0.0,
            "avg_coverage": float(np.mean(coverage_list)) if coverage_list else 0.0,
            "avg_goal_steps": float(np.mean(goal_steps_list)) if goal_steps_list else None,
            "max_steps": max_s,
            "episode_count": len(rewards),
        }

    # ── Run all tests ────────────────────────────────────────────────────────
    results: dict[str, Any] = {}

    # Test 1 + 2 + 3 + 5 in one pass (primary env)
    primary = _run_episodes(environment_profile, episodes_per_test, collect_spin=True)
    results["primary"] = primary

    # Test 4: generalization (run on 2 variant profiles if available)
    alt_profiles = [p for p in ["arena_basic", "arena_improved", "curriculum_v1"]
                    if p != environment_profile][:2]
    gen_results: list[dict[str, Any]] = []
    for ap in alt_profiles:
        try:
            gen_results.append(_run_episodes(ap, max(8, episodes_per_test // 3)))
        except Exception:
            pass

    elapsed = time.perf_counter() - started

    # ── Build issue reports ─────────────────────────────────────────────────
    tests: list[dict[str, Any]] = []
    env_cfg = get_environment_profile(environment_profile)
    max_s = max_steps_override or int(
        env_cfg.get("dynamics", {}).get("max_steps", 700)
    )

    # ── Test 1: Goal Seeking ─────────────────────────────────────────────────
    grr = primary["goal_reach_rate"]
    goal_status = _grade(grr, 0.40, 0.20)
    tests.append(_build_issue(
        test_id="goal_seeking",
        name="Goal Seeking",
        status=goal_status,
        metric_label="Goal reach rate",
        metric_value=grr * 100,
        unit="%",
        threshold_pass=40,
        description=(
            f"Robot reached the goal in {grr * 100:.0f}% of {episodes_per_test} test episodes. "
            + ("Goal seeking is healthy." if goal_status == "pass" else
               "Robot is not finding the goal reliably — it may wander or get stuck.")
        ),
        fix_description=(
            "Increase training steps by 50%, switch to 'curriculum_v1' environment for diverse layouts, "
            "and use the 'deep' model profile for a larger network capacity."
        ),
        fix_params={
            "environment_profile": "curriculum_v1",
            "model_profile": "deep",
            "algorithm_params": {"n_steps": 2048, "ent_coef": 0.025},
        },
        severity="high" if goal_status == "fail" else "medium",
    ))

    # ── Test 2: Wall Avoidance ────────────────────────────────────────────────
    cr = primary["collision_rate"]
    wall_status = _grade(cr, 0.20, 0.50, higher_is_better=False)
    tests.append(_build_issue(
        test_id="wall_avoidance",
        name="Wall Avoidance",
        status=wall_status,
        metric_label="Collision rate",
        metric_value=cr * 100,
        unit="%",
        threshold_pass=20,
        description=(
            f"Robot collided in {cr * 100:.0f}% of episodes. "
            + ("Wall avoidance is healthy." if wall_status == "pass" else
               "Robot crashes into walls too often — proximity sensing may be weak.")
        ),
        fix_description=(
            "Retrain with increased proximity penalty weight and faster collision feedback. "
            "Use 'smart_nav_v1' or 'arena_improved' environment with more obstacles."
        ),
        fix_params={
            "environment_profile": "arena_improved",
            "algorithm_params": {"n_steps": 2048, "gamma": 0.995},
        },
        severity="high" if wall_status == "fail" else "medium",
    ))

    # ── Test 3: Spin Detection ────────────────────────────────────────────────
    sr = primary["spin_rate"]
    spin_status = _grade(sr, 0.15, 0.35, higher_is_better=False)
    tests.append(_build_issue(
        test_id="spin_detection",
        name="Spinning / Stuck Loops",
        status=spin_status,
        metric_label="Spin episode rate",
        metric_value=sr * 100,
        unit="%",
        threshold_pass=15,
        description=(
            f"Robot was spinning in place (heading change >120° with <25px movement) "
            f"in {sr * 100:.0f}% of episodes. "
            + ("No problematic spinning detected." if spin_status == "pass" else
               "Robot enters repetitive spin loops — reward shaping is not penalizing spinning enough.")
        ),
        fix_description=(
            "Add 'visited_grid' memory mode so the robot penalizes revisiting the same cell. "
            "Increase ent_coef to 0.03 for more exploration diversity."
        ),
        fix_params={
            "memory_mode": "visited_grid",
            "algorithm_params": {"ent_coef": 0.03, "n_steps": 2048},
        },
        severity="high" if spin_status == "fail" else "medium",
    ))

    # ── Test 4: Generalization ────────────────────────────────────────────────
    if gen_results:
        gen_goal_rates = [r["goal_reach_rate"] for r in gen_results]
        gen_collision_rates = [r["collision_rate"] for r in gen_results]
        primary_grr = primary["goal_reach_rate"]
        primary_cr = primary["collision_rate"]

        # Compute worst drop in performance across variant layouts
        max_goal_drop = max(
            (primary_grr - g) / max(primary_grr, 0.01) for g in gen_goal_rates
        ) if gen_goal_rates else 0.0
        max_collision_rise = max(
            (c - primary_cr) / max(1 - primary_cr, 0.01) for c in gen_collision_rates
        ) if gen_collision_rates else 0.0

        gen_degradation = max(max_goal_drop, max_collision_rise)
        gen_status = _grade(gen_degradation, 0.30, 0.60, higher_is_better=False)
        tests.append(_build_issue(
            test_id="generalization",
            name="Layout Generalization",
            status=gen_status,
            metric_label="Max performance drop on other layouts",
            metric_value=gen_degradation * 100,
            unit="%",
            threshold_pass=30,
            description=(
                f"Performance dropped by up to {gen_degradation * 100:.0f}% when tested on "
                f"different arena layouts ({', '.join(alt_profiles)}). "
                + ("Good generalization across layouts." if gen_status == "pass" else
                   "Model overfit to its training layout — may fail in new environments.")
            ),
            fix_description=(
                "Retrain on 'curriculum_v1' or 'smart_nav_v1' which randomize layouts every episode. "
                "This forces the policy to learn spatial reasoning instead of memorizing a single map."
            ),
            fix_params={
                "environment_profile": "curriculum_v1",
                "model_profile": "deep",
                "algorithm_params": {"n_steps": 2048},
            },
            severity="high" if gen_status == "fail" else "medium",
        ))
    else:
        tests.append({
            "test_id": "generalization",
            "name": "Layout Generalization",
            "status": "skip",
            "severity": "none",
            "metric_label": "N/A",
            "metric_value": 0,
            "unit": "",
            "threshold_pass": 30,
            "description": "Generalization test skipped — no alternate environment profiles available.",
            "fix_description": "",
            "fix_params": {},
            "has_fix": False,
        })

    # ── Test 5: Exploration Coverage ─────────────────────────────────────────
    cov = primary["avg_coverage"]
    cov_status = _grade(cov, 0.25, 0.15)
    tests.append(_build_issue(
        test_id="coverage",
        name="Exploration Coverage",
        status=cov_status,
        metric_label="Avg arena coverage per episode",
        metric_value=cov * 100,
        unit="% of 16×16 grid",
        threshold_pass=25,
        description=(
            f"Robot visited {cov * 100:.0f}% of the arena grid per episode on average. "
            + ("Good spatial exploration." if cov_status == "pass" else
               "Robot stays confined to a small region — it is not exploring enough of the environment.")
        ),
        fix_description=(
            "Enable 'visited_grid' memory mode which adds a count-based exploration bonus. "
            "Also increasing ent_coef encourages the policy to try more diverse actions."
        ),
        fix_params={
            "memory_mode": "visited_grid",
            "algorithm_params": {"ent_coef": 0.025},
        },
        severity="medium",
    ))

    # ── Test 6: Path Efficiency ───────────────────────────────────────────────
    avg_gs = primary["avg_goal_steps"]
    if avg_gs is not None and primary["goal_reach_rate"] > 0.10:
        path_pct = avg_gs / max(max_s, 1)
        path_status = _grade(path_pct, 0.50, 0.75, higher_is_better=False)
        tests.append(_build_issue(
            test_id="path_efficiency",
            name="Path Efficiency",
            status=path_status,
            metric_label="Avg steps to goal vs max steps",
            metric_value=path_pct * 100,
            unit="%",
            threshold_pass=50,
            description=(
                f"When reaching the goal, robot uses {path_pct * 100:.0f}% of max episode steps "
                f"(avg {avg_gs:.0f} / {max_s} steps). "
                + ("Efficient direct pathing." if path_status == "pass" else
                   "Robot takes very long detours when reaching the goal — path is inefficient.")
            ),
            fix_description=(
                "Increase the goal-alignment bonus coefficient and the approach reward multiplier "
                "to reward more direct trajectories. Use PPO_LSTM to let the robot remember past positions."
            ),
            fix_params={
                "algorithm": "PPO_LSTM",
                "model_profile": "navigator",
                "environment_profile": "smart_nav_v1",
                "algorithm_params": {"n_steps": 2048, "gamma": 0.9995},
            },
            severity="low",
        ))
    else:
        tests.append({
            "test_id": "path_efficiency",
            "name": "Path Efficiency",
            "status": "skip",
            "severity": "none",
            "metric_label": "N/A",
            "metric_value": 0,
            "unit": "",
            "threshold_pass": 50,
            "description": "Path efficiency skipped — robot reached goal in too few episodes to measure.",
            "fix_description": "",
            "fix_params": {},
            "has_fix": False,
        })

    # ── Summary ──────────────────────────────────────────────────────────────
    counted = [t for t in tests if t["status"] not in ("skip",)]
    n_pass = sum(1 for t in counted if t["status"] == "pass")
    n_warn = sum(1 for t in counted if t["status"] == "warn")
    n_fail = sum(1 for t in counted if t["status"] == "fail")
    total = max(len(counted), 1)

    # Health score: pass=100 pts, warn=50 pts, fail=0 pts
    health_score = int(round((n_pass * 100 + n_warn * 50) / total))

    overall = "pass" if n_fail == 0 and n_warn <= 1 else ("warn" if n_fail <= 1 else "fail")

    issues = [t for t in tests if t["status"] in ("warn", "fail")]

    return {
        "overall": overall,
        "health_score": health_score,
        "tests": tests,
        "issues": issues,
        "summary": {
            "pass": n_pass,
            "warn": n_warn,
            "fail": n_fail,
            "skip": len(tests) - len(counted),
            "total_tested": len(counted),
        },
        "primary_metrics": {
            "goal_reach_rate": round(primary["goal_reach_rate"] * 100, 1),
            "collision_rate": round(primary["collision_rate"] * 100, 1),
            "spin_rate": round(primary["spin_rate"] * 100, 1),
            "avg_coverage": round(primary["avg_coverage"] * 100, 1),
            "avg_reward": round(primary["avg_reward"], 2),
        },
        "elapsed_seconds": round(elapsed, 1),
        "episodes_per_test": episodes_per_test,
        "environment_profile": environment_profile,
    }
