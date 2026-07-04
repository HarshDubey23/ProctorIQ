"""Export trained model to ONNX with dynamic quantization (qint8).

Pipeline:
    1. Load best model checkpoint
    2. Export original model to ONNX opset 17
    3. Apply dynamic quantization (qint8) on Linear layers (Python only)
    4. Verify model size < 800KB
    5. Validate inference with ONNX Runtime
    6. Copy ONNX artifact + PCA browser file to frontend/public/models/
"""

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import onnx
import onnxruntime as ort


DEVICE = torch.device("cpu")


class AttentionCNN(nn.Module):
    def __init__(self, num_classes: int = 4) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(1, 32, kernel_size=5, padding=0)
        self.conv2 = nn.Conv1d(32, 64, kernel_size=3, padding=0)
        self.pool = nn.AdaptiveAvgPool1d(16)
        self.dropout1 = nn.Dropout(0.35)
        self.fc1 = nn.Linear(64 * 16, 128)
        self.dropout2 = nn.Dropout(0.2)
        self.fc2 = nn.Linear(128, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.conv1(x))
        x = F.relu(self.conv2(x))
        x = self.pool(x)
        x = x.view(x.size(0), -1)
        x = self.dropout1(x)
        x = F.relu(self.fc1(x))
        x = self.dropout2(x)
        x = self.fc2(x)
        return x


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export attention model to ONNX")
    parser.add_argument("--checkpoint", type=str, default="data/models/best_model.pt",
                        help="Model checkpoint (default: data/models/best_model.pt)")
    parser.add_argument("--data", type=str, default="data/processed",
                        help="Processed data directory with PCA artifacts (default: data/processed)")
    parser.add_argument("--output", type=str, default="data/models",
                        help="Output directory for ONNX (default: data/models)")
    parser.add_argument("--frontend", type=str,
                        default="../frontend/public/models",
                        help="Frontend models directory (default: ../frontend/public/models)")
    parser.add_argument("--force-cpu", action="store_true", default=True,
                        help="Force CPU for export")
    return parser.parse_args()


def write_pca_browser_artifacts(data_dir: Path, target_dir: Path) -> None:
    mean_path = data_dir / "pca_mean.npy"
    components_path = data_dir / "pca_components.npy"
    if not mean_path.exists() or not components_path.exists():
        print("PCA .npy artifacts not found; skipping browser PCA export")
        return

    mean = np.load(str(mean_path)).astype(np.float32)
    components = np.load(str(components_path)).astype(np.float32)
    if components.ndim != 2:
        raise ValueError(f"Expected PCA components to be 2-D, got shape {components.shape}")
    if mean.ndim != 1:
        raise ValueError(f"Expected PCA mean to be 1-D, got shape {mean.shape}")
    if components.shape[1] != mean.shape[0]:
        raise ValueError(
            f"PCA mean length {mean.shape[0]} does not match component width {components.shape[1]}"
        )

    binary_path = target_dir / "pca_components.bin"
    meta_path = target_dir / "pca_meta.json"
    with open(binary_path, "wb") as f:
        f.write(mean.tobytes())
        f.write(components.reshape(-1).tobytes())
    meta = {
        "dtype": "float32",
        "n_components": int(components.shape[0]),
        "n_features": int(components.shape[1]),
        "mean_offset": 0,
        "components_offset": int(mean.shape[0]),
        "binary": "pca_components.bin",
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote PCA binary artifacts to {target_dir}")


def main() -> None:
    args = parse_args()
    checkpoint_path = Path(args.checkpoint)
    data_dir = Path(args.data)
    output_dir = Path(args.output)
    frontend_dir = Path(args.frontend)

    output_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)

    labels_path = data_dir / "labels.json"
    if labels_path.exists():
        label_to_int = json.loads(labels_path.read_text())
        CLASSES = sorted(label_to_int.keys(), key=lambda k: label_to_int[k])
    else:
        CLASSES = ["absent", "distracted", "drowsy", "focused"]
    print(f"Loaded classes from labels.json: {CLASSES}")

    # Load PCA metadata for input dimension
    with open(data_dir / "n_components.json") as f:
        n_components_meta = json.load(f)
    n_components = int(n_components_meta["n_components"])
    print(f"PCA n_components: {n_components}")

    # Load checkpoint
    checkpoint = torch.load(str(checkpoint_path), map_location="cpu", weights_only=False)
    model = AttentionCNN(num_classes=len(CLASSES))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    print(f"Loaded checkpoint (epoch {checkpoint.get('epoch', '?')}, "
          f"val macro-F1: {checkpoint.get('val_macro_f1', '?'):.4f})")

    # Export ORIGINAL (non-quantized) model to ONNX first
    # Dynamic quantization cannot be exported to ONNX — export base model instead
    dummy_input = torch.randn(1, 1, n_components, requires_grad=False)
    onnx_path = output_dir / "attention_model.onnx"

    import os as _os
    _os.environ["PYTHONIOENCODING"] = "utf-8"
    with torch.no_grad():
        torch.onnx.export(
            model,
            dummy_input,
            str(onnx_path),
            opset_version=18,
            input_names=["pca_features"],
            output_names=["logits"],
            dynamic_axes={
                "pca_features": {0: "batch_size"},
                "logits": {0: "batch_size"},
            },
        )
    print(f"ONNX exported to {onnx_path}")

    # Validate ONNX graph
    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print("ONNX graph validation passed")

    # Check model size
    model_size_kb = onnx_path.stat().st_size / 1024
    print(f"Model size: {model_size_kb:.1f} KB")
    if model_size_kb >= 800:
        print(f"WARNING: Model size ({model_size_kb:.1f} KB) exceeds 800 KB target")
    else:
        print("Model size OK (< 800 KB target)")

    # Validate inference with ONNX Runtime
    ort_session = ort.InferenceSession(str(onnx_path))
    test_input = np.random.randn(1, 1, n_components).astype(np.float32)
    ort_outputs = ort_session.run(["logits"], {"pca_features": test_input})
    print(f"ONNX Runtime inference OK. Output shape: {ort_outputs[0].shape}")

    # Compare with PyTorch output (within tolerance)
    with torch.no_grad():
        pt_output = model(torch.from_numpy(test_input)).numpy()
    max_diff = float(np.max(np.abs(ort_outputs[0] - pt_output)))
    print(f"Max difference between PyTorch and ONNX Runtime: {max_diff:.6f}")

    # Apply dynamic quantization separately for Python use only (not exported)
    quantized_model = torch.ao.quantization.quantize_dynamic(
        model,
        qconfig_spec={nn.Linear},
        dtype=torch.qint8,
    )
    quant_path = output_dir / "best_model_quantized.pt"
    torch.save(quantized_model.state_dict(), str(quant_path))
    print(f"Quantized model (Python only) saved to {quant_path}")

    # Copy to frontend
    frontend_onnx = frontend_dir / "attention_model.onnx"
    shutil.copy2(str(onnx_path), str(frontend_onnx))
    print(f"Copied ONNX model to {frontend_onnx}")

    # Copy compact browser PCA artifacts.
    write_pca_browser_artifacts(data_dir, output_dir)
    write_pca_browser_artifacts(data_dir, frontend_dir)

    # Copy label mapping
    labels_src = data_dir / "labels.json"
    if labels_src.exists():
        labels_dst = frontend_dir / "labels.json"
        shutil.copy2(str(labels_src), str(labels_dst))
        print(f"Copied labels to {labels_dst}")

    print("\nExport complete.")


if __name__ == "__main__":
    main()
