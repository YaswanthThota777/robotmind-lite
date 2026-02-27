"""ONNX export utilities for trained SB3 policies."""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
from stable_baselines3.common.base_class import BaseAlgorithm


class _PolicyExportWrapper(nn.Module):
    """Thin wrapper for exporting SB3 policy deterministic action outputs."""

    def __init__(self, model: BaseAlgorithm) -> None:
        super().__init__()
        self.policy = model.policy

    def forward(self, observation: torch.Tensor) -> torch.Tensor:
        return self.policy._predict(observation, deterministic=True)


def export_model_to_onnx(model: BaseAlgorithm, output_path: Path, observation_dim: int) -> Path:
    """Export a trained SB3 policy to ONNX format.

    RecurrentPPO (LSTM) policies require stateful hidden inputs that ONNX
    doesn't handle cleanly in a single-input graph.  For those models we
    skip ONNX export and write a placeholder file so the rest of the
    pipeline (manifest, bundle) still works.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Detect LSTM / recurrent policy by checking class name
    policy_class_name = type(model.policy).__name__
    is_recurrent = "Lstm" in policy_class_name or "Recurrent" in policy_class_name

    if is_recurrent:
        # Write a small JSON placeholder instead of a broken ONNX graph.
        # The .zip model is fully usable via SB3 predict(); only ONNX runtime
        # is unavailable for LSTM models.
        import json as _json
        output_path.with_suffix(".onnx")
        placeholder = output_path.parent / (output_path.stem + ".onnx")
        placeholder.write_text(
            _json.dumps({"note": "LSTM policy — ONNX export not supported; use .zip model"}),
            encoding="utf-8",
        )
        return placeholder

    wrapper = _PolicyExportWrapper(model).cpu().eval()
    dummy_input = torch.zeros((1, observation_dim), dtype=torch.float32)

    torch.onnx.export(
        wrapper,
        dummy_input,
        str(output_path),
        export_params=True,
        opset_version=18,
        do_constant_folding=True,
        input_names=["observation"],
        output_names=["action"],
        dynamic_axes={"observation": {0: "batch"}},
        dynamo=False,
    )

    return output_path
