"""5-fold stratified cross-validation + final test-set evaluation.

Reports mean +/- std macro-F1 from CV,
then trains on full training data and evaluates on held-out test set
with a confusion matrix plot.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import f1_score, confusion_matrix, ConfusionMatrixDisplay
from sklearn.model_selection import StratifiedKFold
from torch.utils.data import DataLoader, TensorDataset


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


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
    parser = argparse.ArgumentParser(description="Validate 1D-CNN with 5-fold CV")
    parser.add_argument("--data", type=str, default="data/processed",
                        help="Processed data directory (default: data/processed)")
    parser.add_argument("--output", type=str, default="data/validation",
                        help="Output directory for validation results (default: data/validation)")
    parser.add_argument("--epochs", type=int, default=60, help="Epochs per fold (default: 60)")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size (default: 64)")
    parser.add_argument("--lr", type=float, default=3e-4, help="Learning rate (default: 3e-4)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser.parse_args()


def train_epoch(
    model: nn.Module, loader: DataLoader,
    criterion: nn.Module, optimizer: torch.optim.Optimizer,
) -> float:
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
def evaluate(
    model: nn.Module, loader: DataLoader, criterion: nn.Module,
) -> tuple[float, float, np.ndarray, np.ndarray]:
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


def main() -> None:
    args = parse_args()
    data_dir = Path(args.data)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    labels_path = data_dir / "labels.json"
    if labels_path.exists():
        label_to_int = json.loads(labels_path.read_text())
        CLASSES = sorted(label_to_int.keys(), key=lambda k: label_to_int[k])
    else:
        CLASSES = ["absent", "distracted", "drowsy", "focused"]
    print(f"Loaded classes from labels.json: {CLASSES}")

    X_train = np.load(str(data_dir / "X_train.npy"))
    y_train = np.load(str(data_dir / "y_train.npy"))
    X_val = np.load(str(data_dir / "X_val.npy"))
    y_val = np.load(str(data_dir / "y_val.npy"))
    X_test = np.load(str(data_dir / "X_test.npy"))
    y_test = np.load(str(data_dir / "y_test.npy"))

    # Combine train + val for CV
    X_full = np.concatenate([X_train, X_val], axis=0)
    y_full = np.concatenate([y_train, y_val], axis=0)

    print(f"Full training set: {X_full.shape}, Test set: {X_test.shape}")
    print(f"Device: {DEVICE}")

    # --- 5-Fold Stratified CV ---
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=args.seed)
    cv_f1s: list[float] = []

    for fold, (train_idx, val_idx) in enumerate(skf.split(X_full, y_full)):
        print(f"\n--- Fold {fold + 1}/5 ---")
        X_t, X_v = X_full[train_idx], X_full[val_idx]
        y_t, y_v = y_full[train_idx], y_full[val_idx]

        X_t_t = torch.tensor(X_t, dtype=torch.float32).unsqueeze(1)
        y_t_t = torch.tensor(y_t, dtype=torch.long)
        X_v_t = torch.tensor(X_v, dtype=torch.float32).unsqueeze(1)
        y_v_t = torch.tensor(y_v, dtype=torch.long)

        train_loader = DataLoader(
            TensorDataset(X_t_t, y_t_t), batch_size=args.batch_size, shuffle=True
        )
        val_loader = DataLoader(
            TensorDataset(X_v_t, y_v_t), batch_size=args.batch_size
        )

        classes = np.unique(y_t)
        class_counts = np.array([(y_t == c).sum() for c in classes], dtype=np.float32)
        weights = class_counts.sum() / (len(classes) * class_counts)

        model = AttentionCNN(num_classes=len(CLASSES)).to(DEVICE)
        criterion = nn.CrossEntropyLoss(
            weight=torch.tensor(weights, dtype=torch.float32, device=DEVICE)
        )
        optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

        best_f1 = 0.0
        patience = 8
        no_improve = 0

        for epoch in range(1, args.epochs + 1):
            train_epoch(model, train_loader, criterion, optimizer)
            val_f1, val_loss, _, _ = evaluate(model, val_loader, criterion)

            if val_f1 > best_f1:
                best_f1 = val_f1
                no_improve = 0
            else:
                no_improve += 1

            if no_improve >= patience:
                break

        print(f"Fold {fold + 1} best val macro-F1: {best_f1:.4f}")
        cv_f1s.append(best_f1)

    cv_mean = float(np.mean(cv_f1s))
    cv_std = float(np.std(cv_f1s))
    print(f"\n{'=' * 50}")
    print(f"5-Fold CV macro-F1: {cv_mean:.4f} +/- {cv_std:.4f}")
    print(f"Individual fold scores: {[f'{f:.4f}' for f in cv_f1s]}")

    # Save CV results
    cv_results = {"mean_f1": cv_mean, "std_f1": cv_std, "fold_f1s": cv_f1s}
    with open(output_dir / "cv_results.json", "w") as f:
        json.dump(cv_results, f, indent=2)

    # --- Final model training (NO test-set peeking) ---
    print(f"\n{'=' * 50}")
    print("Training final model on full train+val set (early stopping on a 20% holdout of train+val)...")

    from sklearn.model_selection import train_test_split as tts
    X_train_sub, X_val_sub, y_train_sub, y_val_sub = tts(
        X_full, y_full, test_size=0.2, stratify=y_full, random_state=args.seed,
    )

    X_ts_t = torch.tensor(X_train_sub, dtype=torch.float32).unsqueeze(1)
    y_ts_t = torch.tensor(y_train_sub, dtype=torch.long)
    X_vs_t = torch.tensor(X_val_sub, dtype=torch.float32).unsqueeze(1)
    y_vs_t = torch.tensor(y_val_sub, dtype=torch.long)

    final_train_loader = DataLoader(
        TensorDataset(X_ts_t, y_ts_t), batch_size=args.batch_size, shuffle=True
    )
    final_val_loader = DataLoader(
        TensorDataset(X_vs_t, y_vs_t), batch_size=args.batch_size
    )
    X_test_t = torch.tensor(X_test, dtype=torch.float32).unsqueeze(1)
    y_test_t = torch.tensor(y_test, dtype=torch.long)
    final_test_loader = DataLoader(
        TensorDataset(X_test_t, y_test_t), batch_size=args.batch_size
    )

    classes = np.unique(y_full)
    class_counts = np.array([(y_full == c).sum() for c in classes], dtype=np.float32)
    weights = class_counts.sum() / (len(classes) * class_counts)

    final_model = AttentionCNN(num_classes=len(CLASSES)).to(DEVICE)
    criterion = nn.CrossEntropyLoss(
        weight=torch.tensor(weights, dtype=torch.float32, device=DEVICE)
    )
    optimizer = torch.optim.Adam(final_model.parameters(), lr=args.lr)

    best_val_f1 = 0.0
    best_val_state: dict[str, torch.Tensor] | None = None
    patience = 12
    no_improve = 0

    for epoch in range(1, args.epochs + 1):
        train_epoch(final_model, final_train_loader, criterion, optimizer)
        val_f1, val_loss, _, _ = evaluate(final_model, final_val_loader, criterion)

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            no_improve = 0
            best_val_state = {
                k: v.cpu().clone() for k, v in final_model.state_dict().items()
            }
        else:
            no_improve += 1

        print(f"Epoch {epoch:3d}/{args.epochs}  Val loss: {val_loss:.4f}  "
              f"Val macro-F1: {val_f1:.4f}  {'*' if val_f1 >= best_val_f1 else ' '}")

        if no_improve >= patience:
            break

    print(f"\nBest val macro-F1: {best_val_f1:.4f}")

    # --- Test set: touched exactly once, AFTER model selection is frozen ---
    if best_val_state is not None:
        final_model.load_state_dict(best_val_state)
    test_f1, test_loss, test_preds, test_targets = evaluate(
        final_model, final_test_loader, criterion
    )
    print(f"\nFinal test macro-F1 (blind, single eval): {test_f1:.4f}")

    # Confusion matrix on test set
    cm = confusion_matrix(test_targets, test_preds)
    disp = ConfusionMatrixDisplay(
        confusion_matrix=cm, display_labels=CLASSES
    )
    fig, ax = plt.subplots(figsize=(8, 6))
    disp.plot(ax=ax, cmap="Blues", values_format="d")
    ax.set_title(f"Confusion Matrix — Test set macro-F1: {test_f1:.4f}")
    plt.tight_layout()
    cm_path = output_dir / "confusion_matrix.png"
    fig.savefig(str(cm_path), dpi=150)
    print(f"Saved confusion matrix to {cm_path}")
    plt.close(fig)

    # Per-class metrics
    from sklearn.metrics import classification_report
    report = classification_report(
        test_targets, test_preds,
        target_names=CLASSES, output_dict=True,
    )
    report_path = output_dir / "test_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Saved classification report to {report_path}")

    print(f"\n{'=' * 50}")
    print("Validation complete.")


if __name__ == "__main__":
    main()
