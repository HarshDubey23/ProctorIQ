# ProctorIQ

**Browser-first, privacy-preserving exam integrity platform.**  
All ML inference runs client-side via MediaPipe WASM + ONNX Runtime Web.  
Only structured attention events — never video — reach the server.

[![Live Demo](https://img.shields.io/badge/Try%20it%20live-00875A?style=for-the-badge&logo=vercel&logoColor=white)](https://proctoriq.vercel.app)
[![CI](https://img.shields.io/github/actions/workflow/status/HarshDubey23/ProctorIQ/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/HarshDubey23/ProctorIQ/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Model accuracy | **99.22%** |
| Macro F1 | **0.9918** |
| Cross-validation (5-fold) | **0.995 ± 0.003** |
| Model size (ONNX) | **~27 KB** |
| Per-frame inference | **<15 ms** (ML) / **~0.5 ms** (rules) |

Full benchmark, confusion matrix, ablation study, and latency data at the [**Model Card**](/model) — or see [docs/BENCHMARK.md](docs/BENCHMARK.md) / [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## The Real Problem: Tamper-Proof Exam Integrity

Most proctoring demos compute the student's score in JavaScript, store it in localStorage, and send it to the server as a claim. Nothing stops the student from opening DevTools, setting `final_score = 0.95`, and downloading a pristine report.

ProctorIQ solves this differently. The client streams structured **events** (focused, distracted, drowsy, absent) over WebSocket — not scores, not verdicts. The server:

1. Re-computes the attention score from the raw event sequence
2. Applies the same scoring rules the client uses
3. HMAC-SHA256 signs the canonical payload (session_id, score, verdict, event list)
4. Stores only the signature; the signed PDF report includes the hash

If someone PATCHes the session record with a forged `quiz_score`, the stored signature will **not** match the re-computed signature at verification time. The report seal reads **"Server-Verified"** only when the hash chain is intact.

> Full reasoning at [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#11-hmac-sha256-report-signing-vs-server-database-as-source-of-truth).

---

## What's New in v2

ProctorIQ v2 introduces a complete visual overhaul and a set of production-ready features:

### Neo-Brutalist Design System
- **Examination Hall Brutalism** — hard edges, thick borders, hard offset shadows, honest materials
- **Printerly ink colors** — Paper (#F4F1EA), Ink (#1A1A17), Stamp Red (#9B2D20), Ledger Green (#2F5D50)
- **Four-font system** — Archivo Expanded (display), Public Sans (UI body), Space Mono (data), Saira Condensed (labels)
- **Zero border-radius** — everything is sharp and structural

### Paper Builder (Teacher Flow)
- Full exam creation with searchable question bank
- Drag-reorder questions, section grouping, live mark summary
- AI Paper Drafting — generate draft questions by topic/difficulty
- Starter Template Gallery — pre-built exam templates (MCQ Quiz, Coding Test, Viva-Style)
- Publish with unique link + downloadable QR code (SVG/PNG)
- Access modes: Open link or Roster-restricted

### Live Host Dashboard
- Control-room style on Ink-Slate surface
- Cohort Pulse Wall of live StampedSeals — one per student
- Four signal-channel colors (Gaze, Head-Pose, Audio Anomaly, Tab-Focus)
- Flagged-student filtering, WebSocket-broadcast updates
- End exam + download signed PDF reports as ZIP

### Student Exam UI (Calm & Fair)
- Minimal chrome, no surveillance feel
- Single centered question card with mono timer
- Auto-save with seamless reconnect (IndexedDB-based)
- Camera/mic permission + calibration flow
- **No Stamp Red, no alert flags** — student-calm guarantee

### Model Card & Research Page
- Published at [`/model`](/model) — a complete Model Card (Google format)
- Hero stats, pipeline diagram, data collection methodology, 5-fold CV chart
- Confusion matrix, per-class metrics, ablation study (interactive toggles)
- Cross-device latency table, limitations, ethical considerations, future work
- **Live demo widget** — runs the real 27 KB ONNX model in your browser
- All numbers sourced from [`ml/checkpoints/benchmark_report.json`](ml/checkpoints/benchmark_report.json)

### Integrity Verification
- SHA-256 HMAC-signed reports
- Server-Verified vs Local Draft seal on every report
- Verification endpoint re-checks the hash chain

### Additional Features
- **Hindi/English UI toggle** — language switcher on landing page
- **Teacher Replay (God View)** — per-student timeline scrubber
- **Accommodation Profiles** — extended time, relaxed proctoring per student
- **StampedSeal** — circular official seal with live confidence waveform
- **Vapour Text Effect** — animated headline cycling through "EXAM / INTEGRITY / PROVEN / PROCTORIQ"

---

## Quick Start

```bash
git clone https://github.com/HarshDubey23/ProctorIQ.git && cd ProctorIQ
python -m venv backend/.venv && backend/.venv/Scripts/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) (or [http://localhost:5173](http://localhost:5173) for Vite dev server).

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
  StampedSeal (live confidence)                      Signed Report (tamper-proof)
```

- **Client**: MediaPipe extracts 478 face landmarks → solvePnP computes head pose (yaw/pitch/roll) + EAR → 6-D Kalman filter smooths → rule engine + optional 1D-CNN → events streamed via WebSocket
- **Server**: Receives events → recomputes score → HMAC-SHA256 signs canonical payload → generates PDF report with embedded timeline
- **No video stored**: The server never receives or stores video frames — only `{"event_type": "distracted", "timestamp_s": 12.5, "confidence": 0.87}`

Full benchmark at [docs/BENCHMARK.md](docs/BENCHMARK.md).

---

## What You Can Do With It

### 1. Build & Publish a Paper (Teacher)

Open the **Paper Builder** at `/builder` to create an exam from scratch or use a starter template. Add questions from a tagged bank, organize into sections, set marks and duration. Publish with a single click — get a unique link and downloadable QR code.

### 2. Host a Live Exam

Click "Host Exam" from the landing page. Share the join link or QR code with participants. The **Mission Control** dashboard (Ink-Slate) shows:
- Live Cohort Pulse Wall with per-student stamped seals
- Sort by flagged participants or search by name
- WebSocket-broadcast updates with <5ms latency
- End the exam and download signed PDF reports as ZIP

### 3. Take an Exam (Student)

Scan the QR or click the link → enter your name → camera permission + calibration → the exam begins. A calm, minimal UI with a mono timer and question cards. **No surveillance feel, no red alerts.**

### 4. Self-Test / Focus Coach

Open the app, grant camera access, and see the **StampedSeal** respond in real time. No signup, no server round-trip — everything runs locally.

### 5. Verify Report Integrity

Each signed PDF report includes a SHA-256 HMAC. The verification endpoint re-computes the expected hash: if it matches, the seal reads **"Server-Verified"** — if not, **"Local Draft"**.

### 6. Explore the Model

Visit [`/model`](/model) to see the full Model Card — hero stats, pipeline diagram, data collection methodology, CV results, confusion matrix, per-class metrics, interactive ablation study, latency table, limitations, and a **live demo widget** that runs the real 27 KB ONNX model in your browser.

### 7. Contribute Data

Help improve the model by contributing face landmark clips at [`/collect`](/collect). Eight short webcam tasks (~3 minutes total). No video is saved — only anonymized landmark patterns are committed to the `collected-data` branch.

See [docs/COLLECTION.md](docs/COLLECTION.md) for details and local collection options.

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Main landing — marketing hero, feature grid, model proof band |
| `/builder` | Paper Builder — create, assemble, and publish exams |
| `/host` | Create a new exam room |
| `/host/{room_id}` | Mission Control dashboard for an existing room |
| `/join/{room_id}` | Participant join page (no signup required) |
| `/cohort/{room_id}` | Live cohort pulse wall |
| `/model` | Model Card — full research page with benchmark, charts, live demo |
| `/collect` | Contribute face landmark clips to improve the model |
| `/styleguide` | Visual design system reference |

---

## Design — "Examination Hall Brutalism"

ProctorIQ v2's visual identity is inspired by official examination documents that behave like live instruments:

- **Exposed structure** — thick visible borders, hard grid lines, stamped forms
- **Honest material** — flat printerly ink colors on paper-white and slate-dark surfaces
- **Heavy mass** — hard offset drop shadows (6px 6px 0 Ink), never soft/glow shadows
- **Four-typeface system** — Archivo Expanded (display), Public Sans (UI body), Space Mono (data), Saira Condensed (labels)
- **StampedSeal** — circular official seal with live confidence waveform ring
- **Zero border-radius** — everything is sharp and structural
- **No neon, no glow, no gradients** — every color is a mature, printerly ink

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
| ML Inference | ONNX Runtime Web (WASM backend, ~27 KB ONNX model) |
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
