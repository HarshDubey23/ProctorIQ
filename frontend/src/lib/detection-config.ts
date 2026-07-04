import type { DetectionConfig } from './detection-bridge';

/** MediaPipe Face Landmarker float16 — documented in @mediapipe/tasks-vision README */
export const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const MEDIAPIPE_WASM_DIR =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

export const DETECTION_CONFIG: DetectionConfig = {
  faceLandmarkerModel: FACE_LANDMARKER_MODEL,
  onnxModel: '/models/attention_model.onnx',
  pcaData: '/models/pca_meta.json',
  labelsUrl: '/models/labels.json',
  wasmDir: MEDIAPIPE_WASM_DIR,
};

export function isDetectionActive(status: string): boolean {
  return status === 'ml' || status === 'rules';
}
