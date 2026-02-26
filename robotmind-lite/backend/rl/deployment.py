"""Deployment validation and packaging utilities for trained RL models."""

from __future__ import annotations

import json
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from stable_baselines3.common.base_class import BaseAlgorithm


def validate_sb3_model_runtime(model: BaseAlgorithm, observation_dim: int) -> dict[str, Any]:
    """Run a minimal inference pass on the trained SB3 model."""
    observation = np.zeros((1, observation_dim), dtype=np.float32)
    action, _ = model.predict(observation, deterministic=True)
    action_array = np.asarray(action)
    return {
        "ok": True,
        "action_shape": list(action_array.shape),
        "observation_dim": observation_dim,
    }


def validate_onnx_runtime(onnx_path: Path, observation_dim: int) -> dict[str, Any]:
    """Run an ONNX Runtime inference pass to verify export correctness."""
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inputs = session.get_inputs()
    if not inputs:
        raise ValueError("ONNX model has no inputs")

    input_name = inputs[0].name
    observation = np.zeros((1, observation_dim), dtype=np.float32)
    outputs = session.run(None, {input_name: observation})
    output_shapes = [list(np.asarray(output).shape) for output in outputs]

    return {
        "ok": True,
        "input_name": input_name,
        "output_shapes": output_shapes,
        "observation_dim": observation_dim,
    }


def manifest_path_for(onnx_path: Path) -> Path:
    return onnx_path.with_suffix(".manifest.json")


def bundle_path_for(onnx_path: Path) -> Path:
    return onnx_path.with_suffix(".deployment.zip")


def write_deployment_manifest(
    *,
    model_path: Path,
    onnx_path: Path,
    metadata: dict[str, Any],
    sb3_validation: dict[str, Any],
    onnx_validation: dict[str, Any],
) -> Path:
    """Write deployment manifest containing training and validation metadata."""
    manifest = {
        "generated_at": datetime.utcnow().isoformat(),
        "model_artifacts": {
            "sb3_zip": str(model_path),
            "onnx": str(onnx_path),
        },
        "metadata": metadata,
        "validation": {
            "sb3_runtime": sb3_validation,
            "onnx_runtime": onnx_validation,
        },
    }

    output = manifest_path_for(onnx_path)
    output.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return output


def create_deployment_bundle(
    *,
    model_path: Path,
    onnx_path: Path,
    manifest_path: Path,
) -> Path:
    """Create a downloadable deployment bundle for real-world usage."""
    bundle_path = bundle_path_for(onnx_path)
    with zipfile.ZipFile(bundle_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(model_path, arcname=model_path.name)
        archive.write(onnx_path, arcname=onnx_path.name)
        archive.write(manifest_path, arcname=manifest_path.name)
    return bundle_path
