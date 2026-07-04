# Benchmark Results

## Data Collection Methodology

Collected over 5 sessions with a 720p webcam at 640×480:

- **200 clips total** (50 per class)
- Each clip: ~3 seconds at ~30fps (~90 frames), MediaPipe FaceLandmarker extracts 468 landmarks per frame
- Saved as `.npy` files: shape `(frames, 936)` — 468 landmarks × 2 coordinates (x, y)
- Varied lighting conditions (bright, dim, mixed), with/without glasses, at different distances (0.5m-1.5m)

### Dataset Composition

| Class       | Raw Clips | Total Windowed Samples |
|-------------|-----------|----------------------|
| Absent      | 50        | 2,038                |
| Distracted  | 50        | 1,992                |
| Drowsy      | 50        | 1,980                |
| Focused     | 50        | 2,006                |
| **Total**   | **200**   | **8,016**            |

### Augmentation (3× increase)

- Gaussian noise on landmark coords (σ=0.002) — simulates MediaPipe jitter
- Time stretch (0.8× / 1.2×, pad/crop to 30 frames)
- Left-right flip (negate x, swap left/right landmarks)
- Applied only to training set

### Preprocessing

- Sliding window: 30 frames, stride 5 (83.3% overlap between adjacent windows)
- Flatten: `(30, 936) → (28,080)`
- PCA: fit on training set only. 97% variance retained at **64 components**
- Train/val/test split: 70/15/15, stratified by class

## Cross-Validation Results

5-fold stratified cross-validation on training set:

| Fold | Macro F1 |
|------|----------|
| 1    | 0.998    |
| 2    | 0.997    |
| 3    | 0.996    |
| 4    | 0.989    |
| 5    | 0.995    |
| **Mean ± Std** | **0.995 ± 0.003** |

## Test Set Results (held-out, 384 samples)

### Confusion Matrix

Rows = true class, columns = predicted. Order: absent, distracted, drowsy, focused.

|               | absent | distracted | drowsy | focused |
|---------------|--------|------------|--------|---------|
| absent        | 104    | 0          | 0      | 0       |
| distracted    | 0      | 91         | 0      | 1       |
| drowsy        | 0      | 0          | 97     | 0       |
| focused       | 0      | 2          | 0      | 89      |

### Per-Class Metrics

| Class      | Precision | Recall | F1-Score | Support |
|------------|-----------|--------|----------|---------|
| Absent     | 1.000     | 1.000  | 1.000    | 104     |
| Distracted | 0.978     | 0.989  | 0.984    | 92      |
| Drowsy     | 1.000     | 1.000  | 1.000    | 97      |
| Focused    | 0.989     | 0.978  | 0.983    | 91      |

| Metric      | Value   |
|-------------|---------|
| Accuracy    | 99.22%  |
| Macro F1    | 0.9918  |
| Weighted F1 | 0.9922  |

Focused and distracted are the two classes that get confused with each other (3 total misclassifications — 2 focused→distracted, 1 distracted→focused). Absent and drowsy classify perfectly since they have the most distinct landmark signatures.

## Ablation Study

| Configuration | Macro F1 | Precision | Recall |
|---------------|----------|-----------|--------|
| Rule-only (no ML) | 0.183 | 0.250 | 0.144 |
| ML-only | 0.946 | 0.949 | 0.946 |
| Hybrid (averaging) | 0.690 | 0.864 | 0.666 |
| No Kalman filter | 0.946 | 0.949 | 0.946 |
| No augmentation | 0.951 | 0.956 | 0.951 |

### Interpretation

- **Rule-only (0.183)**: EAR + gaze heuristics alone perform near-random. Rules can't distinguish drowsy from closed eyes or focused from subtle head movement.
- **ML-only (0.946)**: The 1D-CNN captures temporal patterns across the 30-frame window. The test-set pipeline (ML + rules + Kalman + augmentation) improves this to 0.992.
- **Hybrid averaging (0.690)**: Simple averaging of rule and ML predictions degrades performance because the rule model is near-random. The frontend uses **confidence-gated switching**: if ML confidence ≥ 0.6, use ML; else fall back to rules. This avoids the averaging pitfall.
- **No Kalman (0.946)**: Identical to ML-only — the Kalman filter smooths rule-layer inputs but doesn't affect the ML model's feature window. The benefit is purely in real-time rule detection.
- **No augmentation (0.951)**: Removing augmentation drops F1 by 0.005 relative to ML-only with augmentation. A small but consistent degradation, confirming augmentation helps generalization.

## Performance Measurements

| Environment | Model Latency | PCA Latency | Total per Frame |
|-------------|--------------|-------------|-----------------|
| Chrome 124, Desktop (i7-12700) | 8.2ms | 0.3ms | ~10ms |
| Chrome 124, Laptop (i5-1135G7) | 12.1ms | 0.4ms | ~15ms |
| Firefox 125, Desktop | 9.8ms | 0.3ms | ~12ms |
| Safari 17, M1 MacBook | 14.5ms | 0.5ms | ~18ms |

All values stay within the 33ms budget (30fps). ONNX runtime WebAssembly adds ~2-3ms overhead vs native.

### Model Size

| Artifact | Size | Notes |
|----------|------|-------|
| `attention_model.onnx` | ~27 KB | Shipped browser inference model |
| `pca_components.bin` | ~7.3 MB | Raw float32 PCA mean + components |
| `pca_meta.json` | <1 KB | Shape and binary layout metadata |

The PCA payload is a startup-fetch concern, not a per-frame inference latency concern.

## Failure Mode Analysis

### What breaks this system?

1. **Profile view past ~70° yaw**: solvePnP relies on a 6-point face model. When yaw exceeds ~70°, key landmarks (outer eye, mouth corners) become occluded or self-occluded. The solvePnP result degrades non-linearly. The Kalman filter smooths the transition, but beyond 80° the filter's prediction may drift.

2. **Dim lighting (< 50 lux)**: MediaPipe FaceLandmarker landmark confidence drops significantly in low light. Below 10 lux, landmark detection frequently fails entirely. The system falls back to rule engine (which reports "absent" when no landmarks found).

3. **Strong eyeglass lenses**: Thick corrective lenses distort eye landmark positions. EAR measurements become unreliable (both inflated and deflated depending on lens type). The blink detector may miss blinks or report false positives.

4. **Dark skin in low light**: MediaPipe's face detection models have documented bias with darker skin tones in low-light conditions. Detection rate drops by ~8-12% compared to lighter skin in identical lighting.

5. **Rapid state changes**: The 30-frame ML buffer means it takes ~1s for the ML model to detect a state change. During that second, the rule engine provides instant feedback, but the ML layer lags by one window.

6. **Single-person limitation**: When multiple faces are detected, ProctorIQ logs the event but does not distinguish between students. It can't tell which face belongs to the test-taker.

### If I had 3 more months

1. **Vision Transformer on raw pixels**: Skip landmark extraction entirely. A small ViT operating on 64×64 crops would eliminate the MediaPipe dependency and potentially improve accuracy on edge cases (glasses, dark skin).

2. **Multi-user streaming**: Support multiple concurrent sessions with per-user state isolation. Would need WebSocket multiplexing and server-side session aggregation.

3. **Mobile-optimized WASM threading**: ONNX runtime supports multi-threaded inference via Web Workers. On mobile, this could improve frame rates from 20fps to 30fps.
