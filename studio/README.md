# ProctorIQ Training Studio

A local-only UI for training and exporting the cheating-detection model.

## How to run

```bash
cd studio
pip install -r requirements.txt --break-system-packages
uvicorn main:app --reload --port 8001
```

Open http://localhost:8001.

## What it does

- Trains or incrementally trains `ml/train.py` / `ml/train_incremental.py`
- Exports the attention model to ONNX via `ml/export.py`
- Writes `attention_model.onnx`, PCA artifacts, and `labels.json` directly into `frontend/public/models/`

## Never deploy

Studio has no internet-facing authentication. It connects to your local `ml/checkpoints/` and is designed to run only on your dev machine.

See [DEPLOYMENT.md](../DEPLOYMENT.md) → Step 7 for the full workflow.
