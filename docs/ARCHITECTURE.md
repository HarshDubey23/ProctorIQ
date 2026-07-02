# Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Client Browser                                     │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │                      React App (Vite + TypeScript)                        │   │
│  │                                                                           │   │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │   │
│  │  │  Host    │  │  Join     │  │  Self-   │  │  Exam    │  │  Report /  │  │   │
│  │  │  Exam    │  │  Exam     │  │  Test    │  │  Panel   │  │  Trends /  │  │   │
│  │  │(Create / │  │(No-Signup│  │(Calibrat)│  │(Proctore)│  │  Settings  │  │   │
│  │  │ Share /  │  │  Flow)   │  │          │  │          │  │           │  │   │
│  │  │ Mission  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │   │
│  │  │ Control) │       │            │             │               │         │   │
│  │  └────┬─────┘       │            │             │               │         │   │
│  │       │             └────────────┼─────────────┼───────────────┘         │   │
│  │       │                          │             │                          │   │
│  │  ┌────▼──────────────────────────▼─────────────▼──────────────────────┐  │   │
│  │  │              Zustand Store + IndexedDB (idb)                       │  │   │
│  │  └──────────────────────────────────┬──────────────────────────────────┘  │   │
│  │                                     │                                     │   │
│  │  ┌──────────────────────────────────▼──────────────────────────────────┐  │   │
│  │  │              Detection Bridge (detection-bridge.ts)                  │  │   │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │  │   │
│  │  │  │              Web Worker (detection.worker.ts)                 │  │  │   │
│  │  │  │  ┌──────────────┐  ┌───────────┐  ┌──────────────────────┐  │  │  │   │
│  │  │  │  │  MediaPipe   │  │  solvePnP  │  │  ONNX Runtime        │  │  │  │   │
│  │  │  │  │  FaceLandmark│─>│  + Kalman  │  │  Web (1D-CNN)        │  │  │  │   │
│  │  │  │  │  er (WASM)   │  │  + EAR     │  │  (quantized)         │  │  │  │   │
│  │  │  │  └──────────────┘  └───────────┘  └──────────────────────┘  │  │  │   │
│  │  │  └──────────────────────────────────────────────────────────────┘  │  │   │
│  │  └────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                           │   │
│  │  ┌──────────────────────────────┐  ┌────────────────────────────────┐   │   │
│  │  │  WebSocket Client (ws.ts)    │  │  Host WS Client (room_handler) │   │   │
│  │  └─────────────┬────────────────┘  └───────────────┬────────────────┘   │   │
│  └────────────────┼──────────────────────────────────┼──────────────────────┘   │
│                   │                                  │                          │
└───────────────────┼──────────────────────────────────┼──────────────────────────┘
                    │ WebSocket / HTTP                 │
┌───────────────────┼──────────────────────────────────┼──────────────────────────┐
│                   │                                  │                          │
│  ┌───────────────▼──────────────────────────────────▼──────────────────────┐   │
│  │                          FastAPI Backend (Python)                        │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  ┌────────────┐   │   │
│  │  │  REST API    │  │  WebSocket    │  │  Session    │  │  Report    │   │   │
│  │  │  /health     │  │  /ws/{id}     │  │  Store      │  │  Gen       │   │   │
│  │  │  /api/session│  │  /ws/room/{id}│  │  (InMemory) │  │  (PDF +    │   │   │
│  │  │  /api/verify │  │               │  │             │  │  Sign)     │   │   │
│  │  │  /api/rooms  │  │               │  │             │  │            │   │   │
│  │  │  (create,    │  │               │  │             │  │            │   │   │
│  │  │  close,      │  │               │  │             │  │            │   │   │
│  │  │  reports)    │  │               │  │             │  │            │   │   │
│  │  └──────────────┘  └───────────────┘  └─────────────┘  └────────────┘   │   │
│  │                                                                          │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Room Store (InMemoryRoomStore)                                  │   │   │
│  │  │  - Host-token auth (constant-time)                              │   │   │
│  │  │  - Max participants enforcement                                 │   │   │
│  │  │  - Duration-based auto-close (background cleanup)                │   │   │
│  │  │  - Per-app rate limiting (room creation: 10/hr, join: 20/min)   │   │   │
│  │  └──────────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. In-browser MediaPipe vs Server-side Rendering

**Decision**: All face landmark extraction runs in-browser via MediaPipe WASM.

**Rationale**: Latency (0ms vs 100ms+ RTT), privacy (no video leaves the device), offline capability, cost (no GPU server). The server only receives structured events, never raw video.

### 2. Web Worker vs Main Thread

**Decision**: MediaPipe and ONNX run in a dedicated Web Worker.

**Rationale**: Face landmark extraction + solvePnP + optional ONNX inference per frame easily exceeds 16ms (60fps budget). Running on the main thread would cause visible UI jank. The worker communicates results via postMessage with zero-copy transfer.

### 3. 1D-CNN vs LSTM

**Decision**: 1D-CNN over PCA-reduced windows.

**Rationale**: Landmark windows are 30 frames (~1s) — not long enough to benefit from LSTM's temporal memory. 1D-CNN is ~3× faster in ONNX runtime WebAssembly. Ablation study confirms matching accuracy (0.992 F1 on test set) at lower latency.

### 4. Hybrid (Rule + ML) vs Pure ML

**Decision**: Rule engine runs every frame, ML runs every 30 frames with confidence gating.

**Rationale**: Rule engine provides instant feedback — critical for real-time gauge response. ML buffer fills over 1s, during which rules handle detection. When ML confidence drops below 0.6, the system falls back to rules. Confidence-gated switch, not an ensemble.

### 5. Kalman Filter on Landmarks

**Decision**: Kalman filter smooths both head pose (6-D state: angles + velocities) and EAR (2-D state: value + velocity).

**Rationale**: Raw MediaPipe landmarks jitter by ±2-3° per frame. Kalman filtering reduces this to ±0.5°, which is critical for stable threshold-based detection. In the ablation study, removing Kalman leaves ML-only F1 unchanged (0.946) — the benefit is purely in real-time rule detection.

### 6. Zustand vs Redux

**Decision**: Zustand for client state management.

**Rationale**: The app has <15 state values. Zustand provides TypeScript-native stores with zero boilerplate. Redux would add 8KB+ of framework code for no benefit at this scale.

### 7. WebSocket vs Polling

**Decision**: WebSocket for server communication.

**Rationale**: The gauge updates every frame (30fps). Even 100ms polling creates visible latency in the needle response. WebSocket provides push-based updates with <5ms server-to-client latency.

### 8. IndexedDB vs Backend Database

**Decision**: IndexedDB for session storage.

**Rationale**: In Focus Coach mode, no session data ever leaves the browser. IndexedDB stores the last ~100 sessions (bounded by ~50MB storage limit) — sufficient for the trends feature.

### 9. Horizontal Carousel Navigation vs Traditional Dashboard

**Decision**: Horizontal carousel panel navigation.

**Rationale**: The entire product is seen in 5 seconds — landing → session → report → trends → settings. A recruiter evaluating the project sees all five panels immediately. This is a portfolio positioning decision, not just a UX choice.

### 10. Quantized ONNX vs Full-Precision

**Decision**: Dynamic quantization to int8.

**Rationale**: Model size drops from 2.1MB to 0.6MB (74% reduction). Quantized ONNX matches fp32 accuracy within measurement noise (0.992 F1). The size reduction is critical for initial page load — the model is the largest asset downloaded.

### 11. HMAC-SHA256 Report Signing vs Server Database as Source of Truth

**Decision**: Verdicts and scores are server-computed from raw events and HMAC-SHA256 signed.

**Rationale**: A PATCH to `/api/sessions/{id}` can update the session record, but the report includes a signature over the *server-computed* score, not the stored value. The verification endpoint re-computes the expected signature, so even if the database row is tampered with, the report authenticity check fails. This is the defense against the self-grading attack described in the E2E integrity regression tests.

### 12. InMemoryStore Protocol vs Redis Backend

**Decision**: Session and Room stores implement a `typing.Protocol` interface, currently backed by `InMemorySessionStore` and `InMemoryRoomStore`.

**Rationale**: The Protocol abstraction (defined in `session_store.py` and `room_store.py`) was designed from the start for swap-out. An in-memory store was sufficient for development and single-worker deployment. A Redis-backed implementation would require a Redis instance and additional deploy infrastructure, which was outside the initial scope. See [Trade-offs](#trade-offs-and-known-limitations).

---

## Trade-offs and Known Limitations

This section exists because a portfolio project that names its own constraints reads as more credible than one that claims everything is perfect.

### In-Memory Stores Require Single-Worker Deployment

Both `InMemorySessionStore` and `InMemoryRoomStore` store data in Python `dict` objects on the process heap. This means:

- **No process restart survival** — If the server restarts (deploy, crash, scale), all active sessions and rooms are lost.
- **No multi-worker support** — Uvicorn/gunicorn with multiple workers spawns separate processes, each with its own memory space. A room created on worker 1 is invisible to a WebSocket connection on worker 2. The backend is pinned to `--workers 1` in production.
- **Single point of failure** — A process crash during an active exam destroys all state.

**Mitigation**: The deployment uses a single worker. If horizontal scaling or restart resilience becomes necessary, swap the store implementations for Redis-backed versions behind the same Protocol interface — this is exactly what the Protocol abstraction was built for. Estimated effort: ~2 days of focused work.

### Client-Side Detection Trust Boundary

Face landmark extraction, head pose estimation, and even the 1D-CNN inference all run in the browser. This means:

- A sufficiently motivated client could modify the JavaScript to report fabricated landmark data.
- The HMAC signing protects the server-computed *score* from tampering, but it cannot protect against fabricated *input* data.
- The "server-verified" seal means "the server did compute this score from the events it received" — not "the events themselves are guaranteed authentic."

**Mitigation**: This is a fundamental property of client-side detection. Any proctoring system that does not use a locked-down browser environment (e.g., a dedicated kiosk application) faces the same constraint. The report signature makes it possible to *detect* tampering (the seal would read "Local Draft" instead of "Server-Verified" if the report was generated client-side), but cannot prevent it at the sensor level.

### IndexedDB Storage Limits

IndexedDB is typically capped at ~50MB per origin in most browsers. At ~100KB per session (including landmark data), this bounds local history to roughly 500 sessions before the browser starts throwing `QuotaExceededError`.

**Mitigation**: The app catches storage errors gracefully, and the data export feature (Settings panel → "Export all sessions as JSON") lets users back up before hitting limits. A production deployment could sync to a backend database, but that would introduce the privacy exposure the architecture was designed to avoid.

### solvePnP Degradation Past ~70° Yaw

Profile view causes key landmark occlusion. Detection continues with reduced accuracy; the Kalman filter smooths the transition. This is a hardware/facial geometry limitation of monocular 3D pose estimation from sparse landmarks and is common to all implementations that use MediaPipe's 478-point model.

### MediaPipe Bias

MediaPipe's face landmark model has documented ~8-12% lower detection rates for dark skin in low-light conditions (< 50 lux). This is a known issue in the broader face analysis community. The rule-based fallback (reports "absent" when no landmarks are found) means the system degrades to a conservative default rather than producing false positive detections.

---

## Deployment

### Production Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser   │─────>│  Vercel      │      │  Backend     │
│  (user)     │      │  (Frontend)  │─────>│  (Render/    │
│             │<─────│  Static SPA  │      │   Railway)   │
└─────────────┘      └──────────────┘      │  FastAPI     │
                                            │  + uvicorn   │
                                            │  (1 worker)  │
                                            └──────────────┘
```

### Deploy Steps

1. **Backend** (Render / Railway):
   - Set build command: `pip install -r backend/requirements.txt`
   - Set start command: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --workers 1`
   - Set environment variables from `.env.example` — especially `REPORT_SIGNING_SECRET` to a real random value
   - Set `CORS_ORIGINS` to `["https://proctoriq.vercel.app"]`

2. **Frontend** (Vercel):
   - Import the `frontend/` directory as a new project
   - Framework preset: Vite
   - Environment variable: `VITE_API_URL=https://your-backend-url.com`
   - The existing `vercel.json` handles SPA routing

3. **HTTPS**: Both Vercel and Render/Railway provide automatic HTTPS. This is not optional — browsers block `getUserMedia()` camera access on non-localhost HTTP origins.
