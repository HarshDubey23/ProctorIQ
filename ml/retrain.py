"""Retrain the 1D-CNN with additional data without starting from scratch.

Usage:
    # Collect new data first
    python collect.py --label focused --clips 10 --duration 5

    # Retrain (loads existing model, adds new data, retrains)
    python retrain.py --epochs 40 --batch-size 32

    # Export updated ONNX
    python export.py
"""

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader, TensorDataset

from train import AttentionCNN, CLASSES, DEVICE, set_seed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Retrain 1D-CNN with additional data")
    parser.add_argument("--data", type=str, default="data/processed",
                        help="Processed data directory")
    parser.add_argument("--model", type=str, default="data/models/best_model.pt",
                        help="Path to existing model checkpoint")
    parser.add_argument("--output", type=str, default="data/models",
                        help="Output directory for retrained model")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    set_seed(args.seed)

    data_dir = Path(args.data)
    model_path = Path(args.model)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    X_train = np.load(str(data_dir / "X_train.npy"))
    y_train = np.load(str(data_dir / "y_train.npy"))
    X_val = np.load(str(data_dir / "X_val.npy"))
    y_val = np.load(str(data_dir / "y_val.npy"))

    print(f"Loaded: train {X_train.shape}, val {X_val.shape}")

    X_train_t = torch.tensor(X_train, dtype=torch.float32).unsqueeze(1)
    y_train_t = torch.tensor(y_train, dtype=torch.long)
    X_val_t = torch.tensor(X_val, dtype=torch.float32).unsqueeze(1)
    y_val_t = torch.tensor(y_val, dtype=torch.long)

    train_loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(TensorDataset(X_val_t, y_val_t), batch_size=args.batch_size)

    classes = np.unique(y_train)
    class_counts = np.array([(y_train == c).sum() for c in classes], dtype=np.float32)
    weights = class_counts.sum() / (len(classes) * class_counts)
    weight_tensor = torch.tensor(weights, dtype=torch.float32, device=DEVICE)

    model = AttentionCNN(num_classes=len(CLASSES)).to(DEVICE)

    if model_path.exists():
        ckpt = torch.load(str(model_path), map_location=DEVICE, weights_only=False)
        if "model_state_dict" in ckpt:
            model.load_state_dict(ckpt["model_state_dict"])
        else:
            model.load_state_dict(ckpt)
        print(f"Loaded existing model from {model_path}")
    else:
        print("No existing model found, training from scratch")

    criterion = nn.CrossEntropyLoss(weight=weight_tensor)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_val_f1 = 0.0
    best_epoch = -1
    best_state = None

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
        all_preds = []
        all_targets = []
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
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        print(f"Epoch {epoch:3d}/{args.epochs}  "
              f"Train loss: {train_loss:.4f}  Val loss: {val_loss:.4f}  "
              f"Val macro-F1: {val_f1:.4f}  "
              f"{'*' if val_f1 >= best_val_f1 else ' '}")

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
        print(f"Saved retrained model to {output_dir / 'best_model.pt'}")

    torch.save(model.state_dict(), output_dir / "model_final.pt")
    print("Saved final model state.")

    print("\n--- Next steps ---")
    print("1. Run: python export.py     (export to ONNX for the browser)")
    print("2. Copy: frontend/public/models/attention_model.onnx")
    print("3. Run: python validate.py   (re-run validation)")


if __name__ == "__main__":
    main()
