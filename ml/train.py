"""Train the 1D-CNN attention classifier on PCA-reduced face landmarks.

Architecture:
    Conv1d(1, 32, k5) -> ReLU -> Conv1d(32, 64, k3) -> ReLU ->
    AdaptiveAvgPool1d(16) -> Flatten -> Dropout(0.35) ->
    Linear(1024, 128) -> ReLU -> Dropout(0.2) -> Linear(128, 4)

Training:
    Adam lr=3e-4, CosineAnnealing, balanced class weights,
    80 epochs, early stop patience 12 on val loss,
    save best by val macro-F1.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import f1_score
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
    parser = argparse.ArgumentParser(description="Train 1D-CNN attention classifier")
    parser.add_argument("--data", type=str, default="data/processed",
                        help="Processed data directory (default: data/processed)")
    parser.add_argument("--output", type=str, default="data/models",
                        help="Model output directory (default: data/models)")
    parser.add_argument("--epochs", type=int, default=80, help="Max epochs (default: 80)")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size (default: 64)")
    parser.add_argument("--lr", type=float, default=3e-4, help="Learning rate (default: 3e-4)")
    parser.add_argument("--patience", type=int, default=12, help="Early stop patience (default: 12)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser.parse_args()


def set_seed(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
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

    print(f"Loaded: train {X_train.shape}, val {X_val.shape}")
    print(f"Device: {DEVICE}")

    # Add channel dim: (batch, n_features) -> (batch, 1, n_features)
    X_train_t = torch.tensor(X_train, dtype=torch.float32).unsqueeze(1)
    y_train_t = torch.tensor(y_train, dtype=torch.long)
    X_val_t = torch.tensor(X_val, dtype=torch.float32).unsqueeze(1)
    y_val_t = torch.tensor(y_val, dtype=torch.long)

    train_dataset = TensorDataset(X_train_t, y_train_t)
    val_dataset = TensorDataset(X_val_t, y_val_t)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size)

    # Balanced class weights
    classes = np.unique(y_train)
    class_counts = np.array([(y_train == c).sum() for c in classes], dtype=np.float32)
    weights = class_counts.sum() / (len(classes) * class_counts)
    weight_tensor = torch.tensor(weights, dtype=torch.float32, device=DEVICE)
    print(f"Class weights: {dict(zip(CLASSES, weights.tolist()))}")

    model = AttentionCNN(num_classes=len(CLASSES)).to(DEVICE)
    criterion = nn.CrossEntropyLoss(weight=weight_tensor)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_val_f1 = 0.0
    best_epoch = -1
    epochs_no_improve = 0
    best_state: dict[str, torch.Tensor] | None = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
            optimizer.zero_grad()
            logits = model(X_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * X_batch.size(0)
        train_loss /= len(train_loader.dataset)
        scheduler.step()

        model.eval()
        val_loss = 0.0
        all_preds: list[int] = []
        all_targets: list[int] = []
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
                logits = model(X_batch)
                loss = criterion(logits, y_batch)
                val_loss += loss.item() * X_batch.size(0)
                preds = logits.argmax(dim=1).cpu().numpy()
                all_preds.extend(preds.tolist())
                all_targets.extend(y_batch.cpu().numpy().tolist())
        val_loss /= len(val_loader.dataset)
        val_f1 = f1_score(all_targets, all_preds, average="macro")

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_epoch = epoch
            epochs_no_improve = 0
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        else:
            epochs_no_improve += 1

        print(f"Epoch {epoch:3d}/{args.epochs}  "
              f"Train loss: {train_loss:.4f}  Val loss: {val_loss:.4f}  "
              f"Val macro-F1: {val_f1:.4f}  "
              f"{'*' if val_f1 >= best_val_f1 else ' '}  "
              f"LR: {scheduler.get_last_lr()[0]:.6f}")

        if epochs_no_improve >= args.patience:
            print(f"Early stopping at epoch {epoch} (no improvement for {args.patience} epochs)")
            break

    print(f"\nBest val macro-F1: {best_val_f1:.4f} at epoch {best_epoch}")

    if best_state is not None:
        model.load_state_dict(best_state)
        torch.save(
            {
                "epoch": best_epoch,
                "model_state_dict": best_state,
                "val_macro_f1": best_val_f1,
                "class_names": CLASSES,
            },
            output_dir / "best_model.pt",
        )
        print(f"Saved best model to {output_dir / 'best_model.pt'}")

    # Also save full training state
    torch.save(model.state_dict(), output_dir / "model_final.pt")
    print("Saved final model state.")


if __name__ == "__main__":
    main()
