"""Application configuration module."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Centralized runtime settings for RobotMind Lite backend."""

    app_name: str = "RobotMind Lite Backend"
    app_version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000
    database_name: str = "robotmind_lite.db"
    model_dir_name: str = "models"

    @property
    def backend_dir(self) -> Path:
        return Path(__file__).resolve().parent

    @property
    def database_path(self) -> Path:
        return self.backend_dir / self.database_name

    @property
    def model_dir(self) -> Path:
        return self.backend_dir / self.model_dir_name


def load_settings() -> Settings:
    """Load settings from environment variables with safe defaults."""
    return Settings(
        host=os.getenv("ROBOTMIND_HOST", "0.0.0.0"),
        port=int(os.getenv("ROBOTMIND_PORT", "8000")),
        database_name=os.getenv("ROBOTMIND_DB", "robotmind_lite.db"),
        model_dir_name=os.getenv("ROBOTMIND_MODEL_DIR", "models"),
    )


settings = load_settings()
