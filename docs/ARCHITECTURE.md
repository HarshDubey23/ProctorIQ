# Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Browser                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      React App (Vite + TS)                    │   │
│  │                                                               │   │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────┐   │   │
│  │  │ Self-   │  │ Exam     │  │ Report  │  │ Trends /     │   │   │
│  │  │ Test    │  │ Panel    │  │ Panel   │  │ Settings     │   │   │
│  │  └────┬────┘  └────┬─────┘  └────┬────┘  └──────┬───────┘   │   │
│  │       │            │             │              │            │   │
│  │  ┌────▼────────────▼─────────────▼──────────────▼───────┐   │   │
│  │  │              Zustand Store + IndexedDB               │   │   │
│  │  └─────────────────────────┬────────────────────────────┘   │   │
│  │                            │                                │   │
│  │  ┌─────────────────────────▼────────────────────────────┐   │   │
│  │  │              Detection Bridge (detection-bridge.ts)   │   │   │
│  │  │  ┌─────────────────────────────────────────────┐     │   │   │
│  │  │  │           Web Worker (detection.worker.ts)   │     │   │   │
│  │  │  │  ┌──────────┐  ┌──────────┐  ┌───────────┐ │     │   │   │
│  │  │  │  │ MediaPipe │  │ solvePnP │  │ ONNX      │ │     │   │   │
│  │  │  │  │ Landmark  │→ │ + Kalman │  │ Inference │ │     │   │   │
│  │  │  │  │ Detector  │  │ + EAR    │  │ (CNN)     │ │     │   │   │
│  │  │  │  └──────────┘  └──────────┘  └───────────┘ │     │   │   │
│  │  │  └─────────────────────────────────────────────┘     │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────┐  ┌──────────────────────┐   │   │
│  │  │  WebSocket Client (ws.ts)    │  │  Webcam + Demo mode  │   │   │
│  │  └─────────────┬────────────────┘  └──────────────────────┘   │   │
│  └────────────────┼──────────────────────────────────────────────┘   │
│                   │                                                  │
└───────────────────┼──────────────────────────────────────────────────┘
                    │ WebSocket / HTTP
┌───────────────────┼──────────────────────────────────────────────────┐
│                   │                                                  │
│  ┌───────────────▼──────────────────────────────────────────────┐   │
│  │                    FastAPI Backend                            │   │
│  │                                                               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐   │   │
│  │  │ REST API │  │WebSocket │  │ Session  │  │ Report Gen  │   │   │
│  │  │(sessions,│  │ Handler  │  │ Store    │  │ (PDF + Sign)│   │   │
│  │  │ verify,  │  │          │  │(InMemory)│  │             │   │   │
│  │  │ health)  │  └──────────┘  └──────────┘  └─────────────┘   │   │
│  │  └──────────┘                                                 │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
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
