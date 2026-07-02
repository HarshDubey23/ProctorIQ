# ProctorIQ

**Real-time attention analytics with tamper-proof integrity verification.**  
No video ever leaves the device — all ML inference runs in-browser via WebAssembly.

[![Live Demo](https://img.shields.io/badge/Try%20it%20live-00875A?style=for-the-badge&logo=vercel&logoColor=white)](https://proctoriq.vercel.app)
[![CI](https://img.shields.io/github/actions/workflow/status/HarshDubey23/ProctorIQ/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/HarshDubey23/ProctorIQ/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## Why This Exists: The Self-Grading Problem

Most proctoring demos have a problem: the student's score is computed in JavaScript, stored in localStorage, and sent to the server as a claim. Nothing stops the student from opening DevTools, setting `final_score = 0.95`, and downloading a pristine report.

ProctorIQ solves this differently. The client streams structured **events** (focused, distracted, drowsy, absent) to the server over WebSocket — not scores, not verdicts. The server:

1. Re-computes the attention score from the raw event sequence
2. Applies the same scoring rules the client uses
3. HMAC-SHA256 signs the canonical payload (session_id, score, verdict, event list)
4. Stores only the signature; the signed PDF report includes the hash

If someone PATCHes the session record with a forged `quiz_score`, the stored signature will **not** match the re-computed signature at verification time. The report seal reads "Server-Verified" only when the hash chain is intact. If it reads "Local Draft," you know something was tampered with.

This is the single most technically interesting decision in the project — and the E2E test suite includes a permanent regression test for it.

> For the full reasoning, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#11-hmac-sha256-report-signing-vs-server-database-as-source-of-truth).

---

## Quick Start

```bash
git clone https://github.com/HarshDubey23/ProctorIQ.git && cd ProctorIQ
python -m venv backend/.venv && backend/.venv/Scripts/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) (or [http://localhost:5173](http://localhost:5173) for the Vite dev server).

### Manual start (without Docker)

```bash
# Terminal 1 — Backend
cd backend
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

---

## How It Works

### Architecture at a Glance

```
Browser (MediaPipe WASM → ONNX Runtime Web) ──WebSocket──> FastAPI Backend
       │                                                    │
       │  structured events only (no video)                  │  HMAC-SHA256 sign
       │                                                    │  PDF report generation
       ▼                                                    ▼
  Aperture Gauge (live)                              Signed Report (tamper-proof)
```

- **Client**: MediaPipe extracts 478 face landmarks → solvePnP computes head pose (yaw/pitch/roll) + EAR → 6-D Kalman filter smooths → rule engine + optional 1D-CNN → events streamed via WebSocket
- **Server**: Receives events → recomputes score → HMAC-SHA256 signs canonical payload → generates PDF report with embedded timeline
- **No video stored**: The server never receives or stores video frames. What it receives is `{"event_type": "distracted", "timestamp_s": 12.5, "confidence": 0.87}`

### Key Numbers

| Metric | Value |
|--------|-------|
| Model accuracy | 99.22% |
| Macro F1 | 0.9918 |
| Cross-validation (5-fold) | 0.995 ± 0.003 |
| Model size (quantized) | 0.6 MB |
| Inference latency (ML) | <15ms in Web Worker |
| Per-frame rule latency | ~0.5ms |
| Kalman-filtered jitter | ±0.5° (down from ±2-3°) |

Full benchmark at [docs/BENCHMARK.md](docs/BENCHMARK.md).

---

## What You Can Do With It

### 1. Self-Test / Focus Coach

Open the app, grant camera access, and see the **ApertureGauge** respond in real time. An 8-blade camera-iris diaphragm opens/closes based on attention confidence, interpolating through a six-color semantic palette in OKLCH space. No signup, no server round-trip — everything runs locally.

### 2. Host a Live Exam

Click "Host Exam" from the landing page to create a room. Share the join link (or QR code) with anyone. Participants join without creating accounts. The host dashboard shows:
- Live attention states for every participant in a responsive card grid
- Sort by flagged participants or search by name
- WebSocket-broadcast updates with <5ms latency
- End the exam and download a ZIP of individually signed PDF reports + summary CSV

### 3. Verify Report Integrity

Each signed PDF report includes a SHA-256 HMAC over the server-computed score, verdict, and event sequence. The verification endpoint re-computes the expected hash: if it matches, the report seal reads "Server-Verified." If not, "Local Draft" — meaning the report cannot be trusted.

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Main app — 6-panel carousel (Landing → Exam → Session → Report → Trends → Settings) |
| `/host` | Create a new exam room |
| `/host/{room_id}` | Mission Control dashboard for an existing room |
| `/join/{room_id}` | Participant join page (no signup required) |
| `/cohort/{room_id}` | Live cohort dashboard |

---

## Design — "Aperture"

ProctorIQ's visual system is inspired by premium optical instruments (Leica, Zeiss), executed with restraint:

- **Titanium neutrals** — Cool brushed-metal light grays in light mode; warm charcoal in Night Session
- **Six-color semantic palette** — Each color has exactly one job
- **Three-typeface system** — Fraunces (display serif), Inter Variable (UI sans), Martian Mono (data mono)
- **ApertureGauge** — 8-blade camera-iris diaphragm with Framer Motion spring physics

---

## Test Coverage

| Layer | Tool | What's tested |
|-------|------|---------------|
| Backend unit | pytest + mypy | API routes, session store, signature verification, scoring logic |
| Frontend type/lint | tsc + eslint | TypeScript strict mode, code quality |
| E2E (browser) | Playwright | Self-test flow, host-exam room creation + multi-participant join, API integrity tampering regression |
| Integrity regression | Playwright + API | PATCH with forged score → verify server-computed value prevails; event tampering → signature mismatch |

E2E tests use `--use-fake-device-for-media-stream` so they run in CI without a real webcam.

---

## Limitations

### In-Memory Stores (Single Worker)

Session and room data lives in Python `dict` objects — no process restart survival, no multi-worker support. The backend is pinned to `--workers 1` in production. If horizontal scaling becomes necessary, swap `InMemorySessionStore`/`InMemoryRoomStore` for Redis-backed implementations behind the same `typing.Protocol` interface. Estimated effort: ~2 days.

### Client-Side Detection Trust Boundary

The HMAC signature protects the server-computed *score* from tampering, but cannot prevent fabricated landmark *input*. Any proctoring system without a locked-down browser environment faces the same constraint.

### Other Known Constraints

- **solvePnP degrades past ~70° yaw** — Profile view causes landmark occlusion
- **Low light (< 50 lux)** — MediaPipe landmark confidence drops; rule-based fallback engages
- **Dark skin in low light** — Documented ~8-12% lower detection rate in MediaPipe
- **IndexedDB storage** — ~50MB cap (~500 sessions) before export/clear required
- **Single-person focus** — Multi-face detection logs but does not distinguish individuals

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Face Detection | MediaPipe Tasks-Vision WASM |
| ML Inference | ONNX Runtime Web (quantized int8, 0.6MB) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | Zustand 4 + IndexedDB (idb) |
| Real-time | WebSocket (FastAPI + custom reconnection client) |
| Backend | FastAPI + uvicorn (single worker) |
| PDF Reports | ReportLab + Pillow |
| Signing | SHA-256 HMAC (backend hashlib + frontend Web Crypto) |
| Animation | Framer Motion |
| Charts | Recharts |
| CV | OpenCV (solvePnP) + filterpy (Kalman) |
| ML Training | PyTorch + scikit-learn + ONNX |

---

## API Reference

<details>
<summary>REST endpoints and WebSocket protocol</summary>

### REST Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Health check → `{"status": "ok", "version": "0.1.0"}` |
| `GET` | `/api/sessions` | List sessions (`?limit=10&offset=0`) |
| `POST` | `/api/sessions` | Create session → `201` |
| `GET` | `/api/sessions/{id}` | Get session by ID |
| `PATCH` | `/api/sessions/{id}` | Update session |
| `DELETE` | `/api/sessions/{id}` | Blank session → `204` |
| `GET` | `/api/sessions/{id}/report` | Download signed PDF report |
| `POST` | `/api/rooms` | Create cohort room → `201` |
| `GET` | `/api/rooms/{id}` | Get room details + members |
| `GET` | `/api/rooms/{id}/join-check` | Check if room is joinable |
| `POST` | `/api/rooms/{id}/close` | Close exam (X-Host-Token required) |
| `GET` | `/api/rooms/{id}/reports` | Participant reports (`?format=zip`) |
| `POST` | `/api/verify` | Verify signature → `{valid: bool}` |
| `GET` | `/api/verify/{id}` | Get stored SHA-256 hash |

### WebSocket

- `/ws/{session_id}` — Session event stream (client sends events, server broadcasts ticks)
- `/ws/room/{room_id}` — Cohort broadcast (server broadcasts member updates)

</details>

---

## License

MIT © 2026 Harsh Dubey. See [LICENSE](LICENSE).
