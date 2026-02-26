"""Training templates for real-world model domains."""

from __future__ import annotations

from typing import Any

TRAINING_TEMPLATES: dict[str, dict[str, Any]] = {
    "flat-ground-differential-v1": {
        "label": "Flat Ground Differential V1",
        "description": "Version 1 baseline on flat ground using differential-drive behavior.",
        "algorithm": "PPO",
        "environment_profile": "flat_ground_differential_v1",
        "model_profile": "balanced",
    },
    "flat-ground-ackermann-v1": {
        "label": "Flat Ground Ackermann V1",
        "description": "Version 1 flat-ground training with ackermann-like steering.",
        "algorithm": "PPO",
        "environment_profile": "flat_ground_ackermann_v1",
        "model_profile": "balanced",
    },
    "flat-ground-rover-v1": {
        "label": "Flat Ground Rover V1",
        "description": "Version 1 flat-ground training with rover/skid-steer behavior.",
        "algorithm": "PPO",
        "environment_profile": "flat_ground_rover_v1",
        "model_profile": "balanced",
    },
    "autonomous-driving-pro": {
        "label": "Autonomous Driving Pro",
        "description": "City-style continuous-control driving with noise and drift.",
        "algorithm": "SAC",
        "environment_profile": "autonomous_driving_city",
        "model_profile": "deep",
        "algorithm_params": {"gamma": 0.995, "learning_starts": 500, "buffer_size": 200000},
        "custom_environment": {
            "dynamics": {
                "sensor_noise_std": 0.03,
                "heading_drift_std": 0.9,
                "speed_noise_std": 0.08,
                "turn_noise_std": 0.8,
                "randomize_spawn": True,
            }
        },
    },
    "drone-flight-pro": {
        "label": "Drone Flight Pro",
        "description": "High-agility indoor navigation with strong randomization.",
        "algorithm": "TD3",
        "environment_profile": "drone_flight_indoor",
        "model_profile": "deep",
        "algorithm_params": {"gamma": 0.99, "learning_starts": 800, "buffer_size": 250000},
        "custom_environment": {
            "dynamics": {
                "sensor_noise_std": 0.04,
                "speed_noise_std": 0.1,
                "turn_noise_std": 1.2,
                "randomize_spawn": True,
            }
        },
    },
    "legged-robot-pro": {
        "label": "Legged Robot Pro",
        "description": "Terrain-heavy locomotion challenge for robust policy learning.",
        "algorithm": "PPO",
        "environment_profile": "legged_robot_terrain",
        "model_profile": "deep",
        "algorithm_params": {"gamma": 0.99, "n_steps": 256, "ent_coef": 0.01},
    },
    "humanoid-balance-pro": {
        "label": "Humanoid Balance Pro",
        "description": "Complex constrained layout for humanoid-like balancing navigation.",
        "algorithm": "SAC",
        "environment_profile": "humanoid_balance_lab",
        "model_profile": "deep",
        "algorithm_params": {"gamma": 0.995, "learning_starts": 800, "buffer_size": 300000},
    },
    "software-anomaly-pro": {
        "label": "Software Anomaly Pro",
        "description": "Abstract topology for system-level planning and anomaly traversal.",
        "algorithm": "DQN",
        "environment_profile": "software_anomaly_graph",
        "model_profile": "balanced",
        "algorithm_params": {"gamma": 0.99, "learning_starts": 300, "target_update_interval": 200},
    },
}


def list_training_templates() -> list[dict[str, str]]:
    return [
        {
            "key": key,
            "label": value["label"],
            "description": value["description"],
        }
        for key, value in TRAINING_TEMPLATES.items()
    ]


def get_training_template(key: str) -> dict[str, Any]:
    if key not in TRAINING_TEMPLATES:
        raise ValueError(f"Unknown training template: {key}")
    return TRAINING_TEMPLATES[key]
