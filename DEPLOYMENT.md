# Deployment Guide

## 1. Push the collected-data branch

Only do this if you are using `/collect`.

```bash
git checkout -b collected-data
git push origin collected-data
git checkout main
```

Create the token in GitHub: Settings -> Developer settings -> Fine-grained tokens.
Scope it to this repo only and grant Contents: Read and write.

## 2. Deploy the backend

Render free tier:

- New -> Web Service -> connect `HarshDubey23/ProctorIQ`
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`

Environment variables:

```text
ENVIRONMENT=production
REPORT_SIGNING_SECRET=<run: python -c "import secrets; print(secrets.token_hex(32))">
RATE_LIMIT=60/minute
CORS_ORIGINS=["https://your-frontend-domain.vercel.app"]
SESSION_TIMEOUT_MINUTES=60

# Only if using /collect:
COLLECT_GITHUB_TOKEN=<your fine-grained PAT>
COLLECT_GITHUB_REPO=HarshDubey23/ProctorIQ
COLLECT_GITHUB_BRANCH=collected-data

# AI paper generation:
HF_API_TOKEN=<your fine-grained HF token with "Make calls to Inference Providers">
HF_MODEL_ID=openai/gpt-oss-120b:fastest
```

`CORS_ORIGINS` is a JSON array as a string, including brackets and quotes.
For multiple origins, use:

```text
["https://prod.vercel.app","https://preview.vercel.app"]
```

Deploy and confirm health at:

```text
https://<backend>.onrender.com/health
```

Render free tier spins down after about 15 minutes idle and can take roughly 30-60 seconds to wake.

## 3. Deploy the frontend

Vercel:

- New Project -> import repo
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`

Environment variables:

```text
VITE_API_URL=https://<your-backend>.onrender.com
VITE_WS_URL=wss://<your-backend>.onrender.com
```

`vercel.json` already has the SPA rewrite rule. After the first frontend deploy, set Render's `CORS_ORIGINS` to the real Vercel URL and redeploy the backend once more.

## 4. Smoke test

- `GET /health` returns `{"status":"ok","version":"0.1.0"}`
- Self-test panel: webcam and landmark overlay work, and the WebSocket tick stream connects in DevTools -> Network -> WS.
- Full flow: `/builder` -> publish -> `/host` -> create room -> join in a second tab -> complete exam -> submit.
- Results screen shows a server score that does not change if you edit DevTools state.
- Downloaded PDF matches the server score.
- `/builder` AI Paper Drafting generates real questions, not the old fixed template set.

## 5. Optional: turn on /collect

1. Confirm `COLLECT_GITHUB_TOKEN` is set.
2. Submit one test clip via `/collect`.
3. Confirm a commit lands on `collected-data`.
4. Confirm `GET /api/collect/status` reflects it.

When sharing the URL, mention the cap: 30 contributors times 8 clips, plus possible cold-start delay.

## 6. Confirm AI paper generation

1. Confirm `HF_API_TOKEN` and `HF_MODEL_ID` are set.
2. Generate papers for three different subjects that are not hardcoded anywhere.
3. Confirm the questions vary by subject and type.
4. Unset the token locally once and confirm a clean `503`, not a stack trace.

## 7. Training Studio

Studio is local-only and must never be deployed. It has no internet-facing auth by design.

```bash
git fetch origin collected-data
git checkout collected-data -- ml/data/raw
git checkout main
python ml/preprocess.py

cd studio
pip install -r requirements.txt --break-system-packages
uvicorn main:app --reload --port 8001
# open http://localhost:8001
```

`ml/export.py` writes `attention_model.onnx`, PCA artifacts, and `labels.json` straight into `frontend/public/models/`. Commit and push those generated artifacts to ship an updated model.

Never deploy `studio/`, and never link `/collect` to it. It is a local training console only.
