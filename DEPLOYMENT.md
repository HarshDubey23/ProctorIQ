# Deployment Guide

## Backend (Render / Railway)

### Prerequisites
- GitHub repo pushed with all changes
- Render or Railway account

### Steps

1. **Create a Web Service** (Render) or **Deploy** (Railway)
   - Root directory: `backend/`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`

2. **Environment Variables**
   ```
   REPORT_SIGNING_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
   RATE_LIMIT=60/minute
   CORS_ORIGINS=https://your-frontend-domain.com
   COLLECT_GITHUB_TOKEN=ghp_...          # optional — for Phase 6 data collection
   COLLECT_GITHUB_REPO=YourUser/ProctorIQ
   COLLECT_GITHUB_BRANCH=collected-data
   ```

3. **Health Check**
   - Verify `GET /api/health` returns 200

---

## Frontend (Vercel / Netlify)

### Steps

1. **Connect repo** to Vercel/Netlify
   - Root directory: `frontend/`
   - Build command: `npm run build`
   - Output directory: `dist/`

2. **Environment Variables**
   ```
   VITE_API_URL=https://your-backend.onrender.com
   VITE_WS_URL=wss://your-backend.onrender.com
   ```

3. **Spa fallback** — add redirect rule:
   - Vercel: auto (default `vercel.json` handles it)
   - Netlify: `/* /index.html 200`

4. **Custom Domain** (optional)
   - Point your DNS to Vercel/Netlify

---

## Studio (Local Only — Not Deployed)

```bash
cd studio
pip install -r requirements.txt
uvicorn main:app --port 8001
open http://localhost:8001
```

Studio connects to your local `ml/checkpoints/` and runs training scripts. It is **never deployed** to production.

---

## Data Collection (Phase 6)

1. Set `COLLECT_GITHUB_TOKEN` on your deployed backend
2. Visit `https://your-frontend.vercel.app/collect`
3. Users submit 8 webcam tasks each (max 30 contributors)
4. Clips are committed to `collected-data` branch on GitHub

---

## Training Pipeline

```bash
# 1. Download collected clips from collected-data branch
# 2. Preprocess
python ml/preprocess.py

# 3. Train from scratch or incrementally
python ml/train.py                          # full training
python ml/train_incremental.py --new-batch <folder>   # incremental

# 4. Export to ONNX
python ml/export.py

# 5. Copy model to frontend
cp ml/checkpoints/model.onnx frontend/public/models/
cp ml/data/processed/labels.json frontend/public/models/
```

Use the **Studio** (`studio/`) for a UI-driven version of the training workflow.
