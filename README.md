# ProctorIQ

**Exam-integrity analytics that run in the browser. Video never leaves the device.**

[![CI](https://img.shields.io/github/actions/workflow/status/HarshDubey23/ProctorIQ/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/HarshDubey23/ProctorIQ/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

The browser finds 478 face landmarks (MediaPipe WASM) and classifies attention with a 27 KB ONNX
model. Only small events like `{"event_type": "distracted", "timestamp_s": 12.5}` go to the
server, which re-scores them itself and HMAC-signs the report, so editing a score in DevTools
doesn't produce a valid report.

## Try it

**Live (frontend only):** https://proctoriq-exam.vercel.app → **Self-Test**. Allow the camera;
everything runs on your device.
Exams, paper building and signed reports need the API, which isn't hosted yet. Run it locally:

## Run it locally

With Docker (any OS):

```bash
git clone https://github.com/HarshDubey23/ProctorIQ.git
cd ProctorIQ
docker compose up --build
```

Open http://localhost:3000. API health: http://localhost:8000/health.

Without Docker (Python 3.11+, Node 20+), in two terminals:

```bash
# 1 · API (Windows: .venv\Scripts\activate instead of source)
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --port 8000

# 2 · frontend
cd frontend && npm install && npm run dev      # http://localhost:5173
```

No keys are needed. Optional: `HF_API_TOKEN` enables AI question drafting in the paper builder.

| Page | What it does |
|---|---|
| `/` → Self-Test | live attention feedback, fully on-device |
| `/builder` | build an exam paper, publish a link and QR code |
| `/host` | run a live exam and watch every student's status |
| `/model` | model card: data, metrics, live demo of the ONNX model |

## How it works

```
Webcam → MediaPipe (478 landmarks) → head pose + eye openness → ONNX model ──events──► FastAPI
                                                                                   re-score · HMAC sign · PDF
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · scoring: [docs/SCORING.md](docs/SCORING.md).

## Results (read the scope)

| Metric | Value |
|---|---|
| Held-out accuracy | 99.22% (384 windows from 30 held-out clips) |
| Macro F1 | 0.9918 |
| Model size | ~27 KB ONNX |

The data is 200 **acted** 3-second clips from one 720p webcam, split by clip. That shows the
classifier separates four acted states; it does **not** measure accuracy on other people,
cameras or real exams. The raw clips aren't in the repo. Full benchmark: [docs/BENCHMARK.md](docs/BENCHMARK.md).

## Tests

```bash
pytest backend/tests                         # 150 tests
cd frontend && npm run lint && npm test && npm run build
```

## Deploy

API: any Docker host that supports WebSockets (`backend/Dockerfile`). Set
`ENVIRONMENT=production`, a random `REPORT_SIGNING_SECRET`, `CORS_ORIGINS` (JSON list of your
frontend URLs) and `PUBLIC_API_BASE_URL`. Frontend: build `frontend/` with `VITE_API_URL` set to
the API's URL (the WebSocket URL is derived from it). Steps: [DEPLOYMENT.md](DEPLOYMENT.md).

## Limits

- Accuracy across people, cameras and lighting is unmeasured; that needs consenting participants.
- Face video is biometric data. Get consent and check local rules before using this on students.
- Sessions live in memory unless `SQLITE_PATH` points at persistent storage.

MIT licensed.
