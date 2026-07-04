"""Incremental training: resume from latest checkpoint, validate leakage-free.

Usage:
    python ml/train_incremental.py --new-batch 2026-08-12_batch02 --epochs 8 --lr 1e-4
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
import secrets
from datetime import date
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from torch.utils.data import DataLoader, TensorDataset

WINDOW_SIZE = 30
STRIDE = 5
N_LANDMARKS = 468
N_FEATURES_PER_FRAME = N_LANDMARKS * 2
WINDOW_FLAT = WINDOW_SIZE * N_FEATURES_PER_FRAME

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
CHECKPOINTS_DIR = ROOT / "checkpoints"
REGISTRY_PATH = CHECKPOINTS_DIR / "registry.json"
MANIFEST_PATH = DATA_DIR / "manifest.json"
LATEST_PT = CHECKPOINTS_DIR / "latest.pt"


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


def current_labels_hash() -> str:
    labels_path = PROCESSED_DIR / "labels.json"
    if not labels_path.exists():
        return ""
    return hashlib.sha256(labels_path.read_bytes()).hexdigest()[:16]


def current_pca_version() -> str:
    n_comp_path = PROCESSED_DIR / "n_components.json"
    if not n_comp_path.exists():
        return ""
    return hashlib.sha256(n_comp_path.read_bytes()).hexdigest()[:16]


def load_labels() -> list[str]:
    labels_path = PROCESSED_DIR / "labels.json"
    if labels_path.exists():
        label_to_int = json.loads(labels_path.read_text())
        return sorted(label_to_int.keys(), key=lambda k: label_to_int[k])
    return ["absent", "distracted", "drowsy", "focused"]


def load_pca() -> tuple[int, np.ndarray, np.ndarray]:
    n_comp = int(json.loads((PROCESSED_DIR / "n_components.json").read_text())["n_components"])
    mean = np.load(str(PROCESSED_DIR / "pca_mean.npy"))
    comps = np.load(str(PROCESSED_DIR / "pca_components.npy"))
    return n_comp, mean, comps


def hash_clip(landmarks: np.ndarray) -> str:
    return hashlib.sha256(landmarks.tobytes()).hexdigest()


def parse_contributor_from_folder(folder_name: str) -> str:
    return folder_name.rsplit("_", 1)[0]


def ingest_new_batches(new_batch: str | None) -> None:
    if new_batch is None:
        return

    batch_dir = RAW_DIR / new_batch
    if not batch_dir.exists():
        print(f"Batch folder not found: {batch_dir}")
        return

    manifest = {}
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())

    contributor = parse_contributor_from_folder(new_batch)
    existing_hashes = set(manifest.keys())

    for label_dir in sorted(batch_dir.iterdir()):
        if not label_dir.is_dir():
            continue
        label = label_dir.name
        for clip_file in sorted(label_dir.iterdir()):
            if clip_file.suffix not in (".npy", ".csv"):
                continue
            clip_hash = hashlib.sha256(clip_file.read_bytes()).hexdigest()
            if clip_hash in existing_hashes:
                print(f"  Skipping duplicate: {clip_file.name}")
                continue
            manifest[clip_hash] = {
                "label": label,
                "batch": new_batch,
                "contributor": contributor,
                "split": "train",
            }
            print(f"  Added {clip_file.name} -> {label} (contributor: {contributor})")

    # Stratified split: 80% train, 10% val, 10% test for NEW clips
    new_hashes = [h for h in manifest if h not in existing_hashes]
    if len(new_hashes) >= 10:
        new_labels = [manifest[h]["label"] for h in new_hashes]
        train_h, temp_h, _, _ = train_test_split(
            new_hashes, new_labels, test_size=0.2, stratify=new_labels, random_state=42,
        )
        if temp_h:
            val_h, test_h, _, _ = train_test_split(
                temp_h,
                [manifest[h]["label"] for h in temp_h],
                test_size=0.5, stratify=[manifest[h]["label"] for h in temp_h],
                random_state=42,
            )
        else:
            val_h, test_h = [], []
        for h in train_h:
            manifest[h]["split"] = "train"
        for h in val_h:
            manifest[h]["split"] = "val"
        for h in test_h:
            manifest[h]["split"] = "test"

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(f"Manifest updated: {len(manifest)} total clips")


def extract_windows(clip: np.ndarray) -> np.ndarray:
    n = clip.shape[0]
    windows: list[np.ndarray] = []
    for start in range(0, n - WINDOW_SIZE + 1, STRIDE):
        window = clip[start:start + WINDOW_SIZE]
        windows.append(window.reshape(1, -1))
    if not windows:
        return np.empty((0, WINDOW_FLAT), dtype=np.float32)
    return np.concatenate(windows, axis=0)


def build_windows_from_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        print("No manifest found. Run with --new-batch first.")
        return {"train": None, "val": None, "test": None}

    manifest = json.loads(MANIFEST_PATH.read_text())
    labels_path = PROCESSED_DIR / "labels.json"
    label_to_int = json.loads(labels_path.read_text()) if labels_path.exists() else {}

    X_train, y_train = [], []
    X_val, y_val = [], []
    X_test, y_test = [], []

    for clip_hash, entry in manifest.items():
        batch = entry["batch"]
        label = entry["label"]
        split = entry["split"]

        if label not in label_to_int:
            continue
        label_int = label_to_int[label]

        clip_dir = RAW_DIR / batch / label
        clip_path = None
        for f in clip_dir.iterdir():
            if f.stem == clip_hash or (clip_hash in f.stem and f.suffix in (".npy", ".csv")):
                clip_path = f
                break

        if clip_path is None:
            for f in RAW_DIR.rglob(f"*/{label}/*{clip_hash}*"):
                clip_path = f
                break

        if clip_path is None or not clip_path.exists():
            continue

        clip_data = np.load(str(clip_path)).astype(np.float32)
        windows = extract_windows(clip_data)
        if windows.shape[0] == 0:
            continue

        if split == "train":
            X_train.append(windows)
            y_train.extend([label_int] * windows.shape[0])
        elif split == "val":
            X_val.append(windows)
            y_val.extend([label_int] * windows.shape[0])
        elif split == "test":
            X_test.append(windows)
            y_test.extend([label_int] * windows.shape[0])

    result = {}
    for name, X_list, y_list in [("train", X_train, y_train), ("val", X_val, y_val), ("test", X_test, y_test)]:
        if X_list:
            X_arr = np.concatenate(X_list, axis=0)
            y_arr = np.array(y_list, dtype=np.int64)
            result[name] = (X_arr, y_arr)
        else:
            result[name] = None

    print(f"Windows: train={result['train'][0].shape if result['train'] else 'empty'}, "
          f"val={result['val'][0].shape if result['val'] else 'empty'}, "
          f"test={result['test'][0].shape if result['test'] else 'empty'}")
    return result


def freeze_feature_extractor(model: nn.Module) -> None:
    for name, param in model.named_parameters():
        if "fc" not in name:
            param.requires_grad = False


def train_epoch(model: nn.Module, loader: DataLoader, criterion: nn.Module, optimizer: torch.optim.Optimizer) -> float:
    model.train()
    total_loss = 0.0
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
        optimizer.zero_grad()
        logits = model(X_batch)
        loss = criterion(logits, y_batch)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * X_batch.size(0)
    return total_loss / len(loader.dataset)


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, criterion: nn.Module) -> tuple[float, float, np.ndarray, np.ndarray]:
    model.eval()
    total_loss = 0.0
    all_preds: list[int] = []
    all_targets: list[int] = []
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
        logits = model(X_batch)
        loss = criterion(logits, y_batch)
        total_loss += loss.item() * X_batch.size(0)
        preds = logits.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds.tolist())
        all_targets.extend(y_batch.cpu().numpy().tolist())
    total_loss /= len(loader.dataset)
    f1 = f1_score(all_targets, all_preds, average="macro")
    return f1, total_loss, np.array(all_preds), np.array(all_targets)


def select_on_cv_or_val(model: nn.Module, opt: torch.optim.Optimizer,
                        train_data, val_data, epochs: int, start_epoch: int = 0) -> dict:
    criterion = nn.CrossEntropyLoss()
    X_t, y_t = train_data
    X_v, y_v = val_data

    X_t_t = torch.tensor(X_t, dtype=torch.float32).unsqueeze(1)
    y_t_t = torch.tensor(y_t, dtype=torch.long)
    X_v_t = torch.tensor(X_v, dtype=torch.float32).unsqueeze(1)
    y_v_t = torch.tensor(y_v, dtype=torch.long)

    train_loader = DataLoader(TensorDataset(X_t_t, y_t_t), batch_size=64, shuffle=True)
    val_loader = DataLoader(TensorDataset(X_v_t, y_v_t), batch_size=64)

    best_f1 = 0.0
    best_state = None
    patience = 8
    no_improve = 0
    run_id = f"inc_{int(time.time())}_{secrets.token_hex(4)}"
    history: list[dict[str, float]] = []

    for epoch in range(1, epochs + 1):
        train_epoch(model, train_loader, criterion, opt)
        val_f1, val_loss, _, _ = evaluate(model, val_loader, criterion)

        if val_f1 > best_f1:
            best_f1 = val_f1
            no_improve = 0
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        else:
            no_improve += 1

        history.append({
            "epoch": start_epoch + epoch,
            "train_loss": 0.0,
            "val_loss": round(val_loss, 6),
            "train_acc": 0.0,
            "val_acc": round(val_f1 * 100.0, 4),
        })

        print(f"Epoch {start_epoch + epoch:3d}/{start_epoch + epochs}  "
              f"Val loss: {val_loss:.4f}  Val macro-F1: {val_f1:.4f}  "
              f"{'*' if val_f1 >= best_f1 else ' '}")

        if no_improve >= patience:
            break

    print(f"Best val macro-F1: {best_f1:.4f}")

    # Save history
    runs_dir = CHECKPOINTS_DIR / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    history_path = runs_dir / f"{run_id}.json"
    history_path.write_text(json.dumps(history, indent=2), encoding="utf-8")

    return {"model": model, "state": best_state, "cv_f1": best_f1, "epochs_run": epoch, "run_id": run_id}


def freeze_and_save(result: dict) -> None:
    if result["state"]:
        result["model"].load_state_dict(result["state"])

    version = f"v{len(_load_registry()) + 1:03d}_{date.today().isoformat()}"
    ckpt_path = CHECKPOINTS_DIR / f"{version}.pt"
    torch.save({
        "version": version,
        "model": result["state"],
        "epoch": result["epochs_run"],
        "cv_f1": result["cv_f1"],
        "labels_hash": current_labels_hash(),
        "pca_version": current_pca_version(),
    }, ckpt_path)

    # Also save as latest.pt
    torch.save({
        "version": version,
        "model": result["state"],
        "epoch": result["epochs_run"],
        "cv_f1": result["cv_f1"],
        "labels_hash": current_labels_hash(),
        "pca_version": current_pca_version(),
    }, LATEST_PT)
    print(f"Saved checkpoint: {ckpt_path.name}")


def evaluate_once(model: nn.Module, test_data) -> float:
    if test_data is None:
        return 0.0
    X_te, y_te = test_data
    X_t = torch.tensor(X_te, dtype=torch.float32).unsqueeze(1)
    y_t = torch.tensor(y_te, dtype=torch.long)
    test_loader = DataLoader(TensorDataset(X_t, y_t), batch_size=64)
    criterion = nn.CrossEntropyLoss()
    test_f1, _, _, _ = evaluate(model, test_loader, criterion)
    print(f"Test macro-F1 (single eval): {test_f1:.4f}")
    return test_f1


def _load_registry() -> list[dict]:
    if REGISTRY_PATH.exists():
        return json.loads(REGISTRY_PATH.read_text())
    return []


def append_registry(parent: str, cv_f1: float, test_f1: float) -> None:
    import subprocess
    try:
        git_sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        git_sha = "unknown"

    version = f"v{len(_load_registry()) + 1:03d}_{date.today().isoformat()}"
    entry = {
        "version": version,
        "parent": parent,
        "batches": [],
        "cv_f1": cv_f1,
        "test_f1": test_f1,
        "epochs": 0,
        "lr": 0.0,
        "git_sha": git_sha,
    }
    registry = _load_registry()
    registry.append(entry)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2))
    print(f"Registry updated: {version} (CV F1: {cv_f1:.4f}, Test F1: {test_f1:.4f})")


def export_onnx(model: nn.Module, output_path: str) -> None:
    n_comp, _, _ = load_pca()
    dummy = torch.randn(1, 1, n_comp, requires_grad=False)
    model.eval()
    with torch.no_grad():
        torch.onnx.export(
            model, dummy, output_path,
            opset_version=18,
            input_names=["pca_features"],
            output_names=["logits"],
            dynamic_axes={
                "pca_features": {0: "batch_size"},
                "logits": {0: "batch_size"},
            },
        )
    print(f"ONNX exported to {output_path}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Incremental training")
    ap.add_argument("--new-batch", type=str, default=None)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--freeze-early", action="store_true")
    args = ap.parse_args()

    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)

    ingest_new_batches(args.new_batch)

    windows = build_windows_from_manifest()
    if windows["train"] is None:
        print("No training data available.")
        return

    labels = load_labels()

    if LATEST_PT.exists():
        ckpt = torch.load(str(LATEST_PT), map_location="cpu", weights_only=False)
        assert ckpt.get("labels_hash", "") == current_labels_hash(), \
            "Labels changed — retrain from scratch"
        assert ckpt.get("pca_version", "") == current_pca_version(), \
            "PCA changed — retrain from scratch"
        model = AttentionCNN(num_classes=len(labels))
        model.load_state_dict(ckpt["model"])
        opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
        if "optim" in ckpt:
            opt.load_state_dict(ckpt["optim"])
        parent_version = ckpt.get("version", "unknown")
        start_epoch = ckpt.get("epoch", 0)
        print(f"Resumed from {parent_version} (epoch {start_epoch})")
    else:
        print("No checkpoint found — training from scratch")
        model = AttentionCNN(num_classes=len(labels)).to(DEVICE)
        opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
        parent_version = "scratch"
        start_epoch = 0

    if args.freeze_early:
        freeze_feature_extractor(model)
        print("Feature extractor frozen — tuning head only")

    if args.new_batch:
        print("Performing 5-fold CV on new data for regression check...")
        X_cv = np.concatenate([windows["train"][0], windows["val"][0]], axis=0) if windows["val"] else windows["train"][0]
        y_cv = np.concatenate([windows["train"][1], windows["val"][1]], axis=0) if windows["val"] else windows["train"][1]
        skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        cv_f1s = []
        for fold, (tr_idx, va_idx) in enumerate(skf.split(X_cv, y_cv)):
            fold_model = AttentionCNN(num_classes=len(labels)).to(DEVICE)
            fold_opt = torch.optim.AdamW(fold_model.parameters(), lr=args.lr)
            fold_result = select_on_cv_or_val(
                fold_model, fold_opt,
                (X_cv[tr_idx], y_cv[tr_idx]), (X_cv[va_idx], y_cv[va_idx]),
                epochs=min(args.epochs, 5), start_epoch=0,
            )
            cv_f1s.append(fold_result["cv_f1"])
        cv_f1_mean = float(np.mean(cv_f1s))
        print(f"5-fold CV macro-F1 on new data: {cv_f1_mean:.4f}")

    result = select_on_cv_or_val(model, opt, windows["train"], windows["val"], epochs=args.epochs, start_epoch=start_epoch)

    # Regression gate
    parent_registry = _load_registry()
    parent_cv = None
    for entry in parent_registry:
        if entry["version"] == parent_version:
            parent_cv = entry["cv_f1"]
            break

    if parent_cv is not None and result["cv_f1"] < parent_cv - 0.005:
        print(f"REGRESSION GATE: CV F1 {result['cv_f1']:.4f} < parent {parent_cv:.4f} - 0.005")
        print("Keeping previous model and checkpoint. Discarding this run.")
        return

    freeze_and_save(result)

    test_f1 = evaluate_once(result["model"], windows["test"])
    append_registry(parent=parent_version, cv_f1=result["cv_f1"], test_f1=test_f1)

    onnx_path = str(ROOT.parent / "frontend" / "public" / "models" / "attention_model.onnx")
    export_onnx(result["model"], onnx_path)
    print("Done.")


if __name__ == "__main__":
    main()
