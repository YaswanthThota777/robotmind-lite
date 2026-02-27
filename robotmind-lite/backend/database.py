"""SQLite helpers for training run metadata."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.config import settings

_DB_LOCK = threading.Lock()


def _get_connection() -> sqlite3.Connection:
    """Return a SQLite connection configured for row access by name."""
    connection = sqlite3.connect(settings.database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    """Initialize database schema if it does not exist."""
    settings.model_dir.mkdir(parents=True, exist_ok=True)
    Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)

    with _DB_LOCK:
        with _get_connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS training_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    status TEXT NOT NULL,
                    steps INTEGER NOT NULL,
                    timesteps_completed INTEGER NOT NULL DEFAULT 0,
                    reward_mean REAL,
                    model_path TEXT,
                    onnx_path TEXT,
                    error_message TEXT,
                    algorithm TEXT,
                    environment TEXT,
                    model_label TEXT
                )
                """
            )
            _ensure_columns(
                connection,
                "training_runs",
                {
                    "algorithm": "TEXT",
                    "environment": "TEXT",
                    "model_label": "TEXT",
                    "deployment_ready": "INTEGER",
                    "memory_mode": "TEXT",
                    "goal_randomize": "INTEGER",
                },
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS training_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    step INTEGER NOT NULL,
                    reward_mean REAL,
                    episode_length INTEGER,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.commit()


def _ensure_columns(
    connection: sqlite3.Connection,
    table: str,
    columns: dict[str, str],
) -> None:
    """Add missing columns to an existing table."""
    existing = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }
    for name, column_type in columns.items():
        if name not in existing:
            connection.execute(
                f"ALTER TABLE {table} ADD COLUMN {name} {column_type}"
            )


def create_training_run(
    steps: int,
    algorithm: str = "PPO",
    environment: str = "RobotEnv",
    model_label: str = "RobotMind PPO",
    memory_mode: str | None = None,
    goal_randomize: bool | None = None,
) -> int:
    """Insert a new training run and return its ID."""
    started_at = datetime.utcnow().isoformat()
    with _DB_LOCK:
        with _get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO training_runs (
                    started_at,
                    status,
                    steps,
                    algorithm,
                    environment,
                    model_label,
                    memory_mode,
                    goal_randomize
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    started_at,
                    "running",
                    steps,
                    algorithm,
                    environment,
                    model_label,
                    memory_mode,
                    None if goal_randomize is None else int(goal_randomize),
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)


def update_training_run(run_id: int, **fields: Any) -> None:
    """Update mutable fields for a training run by ID."""
    if not fields:
        return

    assignments = ", ".join(f"{key} = ?" for key in fields)
    values = list(fields.values())
    values.append(run_id)

    with _DB_LOCK:
        with _get_connection() as connection:
            connection.execute(
                f"UPDATE training_runs SET {assignments} WHERE id = ?",
                values,
            )
            connection.commit()


def get_latest_training_run() -> dict[str, Any] | None:
    """Return the latest training run, if available."""
    with _DB_LOCK:
        with _get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM training_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()

    if row is None:
        return None

    return {key: row[key] for key in row.keys()}


def list_training_runs(limit: int = 20) -> list[dict[str, Any]]:
    """Return a list of recent training runs."""
    with _DB_LOCK:
        with _get_connection() as connection:
            rows = connection.execute(
                "SELECT * FROM training_runs ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [{key: row[key] for key in row.keys()} for row in rows]


def get_training_run(run_id: int) -> dict[str, Any] | None:
    """Return a training run by ID."""
    with _DB_LOCK:
        with _get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM training_runs WHERE id = ?",
                (run_id,),
            ).fetchone()
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def add_training_metric(
    run_id: int,
    step: int,
    reward_mean: float | None,
    episode_length: int | None,
) -> None:
    """Insert a training metric point for a run."""
    created_at = datetime.utcnow().isoformat()
    with _DB_LOCK:
        with _get_connection() as connection:
            connection.execute(
                """
                INSERT INTO training_metrics (run_id, step, reward_mean, episode_length, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, step, reward_mean, episode_length, created_at),
            )
            connection.commit()


def list_training_metrics(run_id: int, limit: int = 200) -> list[dict[str, Any]]:
    """Return recent metrics for a training run."""
    with _DB_LOCK:
        with _get_connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM training_metrics
                WHERE run_id = ?
                ORDER BY step DESC
                LIMIT ?
                """,
                (run_id, limit),
            ).fetchall()
    return [{key: row[key] for key in row.keys()} for row in rows][::-1]


def delete_training_run(run_id: int) -> bool:
    """Delete a training run and its metrics. Returns True if a row was deleted."""
    with _DB_LOCK:
        with _get_connection() as connection:
            connection.execute("DELETE FROM training_metrics WHERE run_id = ?", (run_id,))
            cursor = connection.execute("DELETE FROM training_runs WHERE id = ?", (run_id,))
            connection.commit()
            return cursor.rowcount > 0


def delete_all_training_runs() -> int:
    """Delete all training runs and metrics. Returns the number of runs deleted."""
    with _DB_LOCK:
        with _get_connection() as connection:
            cursor = connection.execute("SELECT COUNT(*) FROM training_runs")
            count = cursor.fetchone()[0]
            connection.execute("DELETE FROM training_metrics")
            connection.execute("DELETE FROM training_runs")
            connection.commit()
            return count
