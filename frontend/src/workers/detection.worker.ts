import * as ort from 'onnxruntime-web';
import { KalmanFilter, createPoseFilter, createEARFilter, resetKalman, resetKalmanEAR } from './kalman';
import { estimateHeadPose } from './solvePnP';

const NUM_FRAMES = 30;
const NUM_LANDMARKS = 468;
const FEATURES_PER_FRAME = NUM_LANDMARKS * 2;
const ML_CONFIDENCE = 0.6;
let YAW_THRESHOLD_DEG = 28;
let PITCH_THRESHOLD_DEG = 22;
let EAR_CLOSED = 0.20;
const GAZE_CONSECUTIVE = 6;
const WARMUP_FRAMES = 30;
let BLINK_EAR_THRESH = 0.17;
const BLINK_MIN_FRAMES = 2;
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 480;

let CLASS_NAMES: string[] = ['absent', 'distracted', 'drowsy', 'focused'];
type Attention = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi';

const LEFT_EYE = [33, 159, 158, 133, 153, 145];
const RIGHT_EYE = [362, 386, 385, 263, 374, 380];
const BS_GAZE_CONSECUTIVE = 4;

interface PCAData {
  mean: Float32Array;
  components: Float32Array[];
  nComponents: number;
  nFeatures: number;
}

interface InitMessage {
  type: 'init';
  config: {
    onnxModel?: string;
    pcaData?: string;
    labelsUrl?: string;
  };
}

interface FrameMessage {
  type: 'frame';
  landmarks: number[][];
  faceCount: number;
  blendshapes?: Record<string, number>;
  timestamp: number;
}

interface ThresholdsMessage {
  type: 'thresholds';
  thresholds: {
    earClosed?: number;
    drowsyEarThreshold?: number;
    yawThreshold?: number;
    pitchThreshold?: number;
    baselineEar?: number;
    baselineYaw?: number;
  };
}

type InMessage = InitMessage | FrameMessage | ThresholdsMessage;

export interface DetectionResult {
  attention: Attention;
  confidence: number;
  source: 'rules' | 'ml';
  headPose: { yaw: number; pitch: number; roll: number };
  ear: { left: number; right: number };
  faceCount: number;
  gazeAway: boolean;
  blinkRate: number;
  timestamp: number;
  landmarks?: number[][];
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeEAR(lms: number[][], idx: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lms[i]);
  return (
    (dist(p2[0], p2[1], p6[0], p6[1]) + dist(p3[0], p3[1], p5[0], p5[1])) /
    (2 * dist(p1[0], p1[1], p4[0], p4[1]))
  );
}

function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const exps = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - max);
    sum += exps[i];
  }
  if (sum === 0) sum = 1e-30;
  for (let i = 0; i < logits.length; i++) exps[i] /= sum;
  return exps;
}

function applyPCA(features: Float64Array, pca: PCAData): Float32Array {
  const out = new Float32Array(pca.nComponents);
  for (let i = 0; i < pca.nComponents; i++) {
    const comp = pca.components[i];
    let v = 0;
    for (let j = 0; j < features.length; j++) {
      v += comp[j] * (features[j] - pca.mean[j]);
    }
    out[i] = v;
  }
  return out;
}

function isGazeAway(yawRad: number, pitchRad: number): boolean {
  const yawDeg = Math.abs((yawRad * 180) / Math.PI);
  const pitchDeg = Math.abs((pitchRad * 180) / Math.PI);
  return yawDeg > YAW_THRESHOLD_DEG || pitchDeg > PITCH_THRESHOLD_DEG;
}

interface RuleResult {
  attention: Attention;
  confidence: number;
}

let hysteresisTimer = 0;
let lastRuleAttention: Attention = 'focused';

function ruleResult(
  earLeft: number,
  earRight: number,
  faceCount: number,
  gazeAway: boolean,
): RuleResult {
  const earAvg = (earLeft + earRight) * 0.5;

  if (faceCount === 0) {
    lastRuleAttention = 'absent';
    return { attention: 'absent', confidence: 0.85 };
  }
  if (faceCount > 1) {
    lastRuleAttention = 'multi';
    return { attention: 'multi', confidence: 0.9 };
  }
  if (earAvg < EAR_CLOSED) {
    lastRuleAttention = 'drowsy';
    return { attention: 'drowsy', confidence: 0.75 };
  }
  if (gazeAway) {
    lastRuleAttention = 'distracted';
    return { attention: 'distracted', confidence: 0.7 };
  }

  if (lastRuleAttention === 'distracted' && hysteresisTimer < 15) {
    hysteresisTimer++;
    return { attention: 'distracted', confidence: 0.55 };
  }

  hysteresisTimer = 0;
  lastRuleAttention = 'focused';
  return { attention: 'focused', confidence: 0.65 };
}

let blinkState = {
  inBlink: false,
  blinkFrames: 0,
  blinks: 0,
  frameCount: 0,
  lastRate: 15,
};

function updateBlinkRate(earAvg: number): number {
  blinkState.frameCount++;
  const isClosed = earAvg < BLINK_EAR_THRESH;

  if (isClosed && !blinkState.inBlink) {
    blinkState.inBlink = true;
    blinkState.blinkFrames = 1;
  } else if (isClosed && blinkState.inBlink) {
    blinkState.blinkFrames++;
  } else if (!isClosed && blinkState.inBlink) {
    if (blinkState.blinkFrames >= BLINK_MIN_FRAMES) {
      blinkState.blinks++;
    }
    blinkState.inBlink = false;
    blinkState.blinkFrames = 0;
  }

  const windowFrames = 1800;
  if (blinkState.frameCount > windowFrames) {
    blinkState.lastRate = blinkState.blinks * 30;
    blinkState.blinks = 0;
    blinkState.frameCount = 0;
  }

  return blinkState.lastRate;
}

let session: ort.InferenceSession | null = null;
let pcaData: PCAData | null = null;
let kalmanPose: KalmanFilter;
let kalmanEAR: KalmanFilter;
let ruleOnly = false;
let mlEnabled = false;
let consecutiveInferenceFailures = 0;
let faceWasPresent = false;
let gazeOffCount = 0;
let bsGazeOffCount = 0;
let firstFrame = true;
let warmupFrames = 0;

const frameBuffer: Float64Array[] = new Array(NUM_FRAMES);
let bufIdx = 0;
let bufFilled = false;

for (let i = 0; i < NUM_FRAMES; i++) {
  frameBuffer[i] = new Float64Array(FEATURES_PER_FRAME);
}

function pushBuffer(features: Float64Array): boolean {
  frameBuffer[bufIdx].set(features);
  bufIdx = (bufIdx + 1) % NUM_FRAMES;
  if (bufIdx === 0) bufFilled = true;
  return bufFilled;
}

function flattenBuffer(): Float64Array {
  const out = new Float64Array(NUM_FRAMES * FEATURES_PER_FRAME);
  const start = bufFilled ? bufIdx : 0;
  for (let i = 0; i < NUM_FRAMES; i++) {
    const src = (start + i) % NUM_FRAMES;
    out.set(frameBuffer[src], i * FEATURES_PER_FRAME);
  }
  return out;
}

async function loadONNX(url: string): Promise<void> {
  try {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    session = await ort.InferenceSession.create(buf);
    mlEnabled = true;
    if (import.meta.env.DEV) console.log('[worker] ONNX loaded');
  } catch (err) {
    console.warn('[worker] ONNX load failed, rule-only:', err);
    ruleOnly = true;
  }
}

async function loadPCA(url: string): Promise<void> {
  try {
    const metaResp = await fetch(url);
    if (!metaResp.ok) throw new Error(`HTTP ${metaResp.status}`);
    const raw = (await metaResp.json()) as {
      dtype: 'float32';
      n_components: number;
      n_features: number;
      mean_offset: number;
      components_offset: number;
      binary: string;
    };
    if (raw.dtype !== 'float32') throw new Error(`Unsupported PCA dtype ${raw.dtype}`);
    const binaryUrl = new URL(raw.binary, metaResp.url).toString();
    const binResp = await fetch(binaryUrl);
    if (!binResp.ok) throw new Error(`HTTP ${binResp.status}`);
    const floats = new Float32Array(await binResp.arrayBuffer());
    const expectedLength = raw.components_offset + raw.n_components * raw.n_features;
    if (floats.length < expectedLength) {
      throw new Error(`PCA binary too short: got ${floats.length}, expected ${expectedLength}`);
    }
    const mean = floats.subarray(raw.mean_offset, raw.mean_offset + raw.n_features);
    const compRaw = floats.subarray(raw.components_offset, expectedLength);
    const components: Float32Array[] = [];
    const stride = raw.n_features;
    for (let i = 0; i < raw.n_components; i++) {
      components.push(compRaw.subarray(i * stride, (i + 1) * stride));
    }
    pcaData = {
      mean,
      components,
      nComponents: raw.n_components,
      nFeatures: raw.n_features,
    };
    if (import.meta.env.DEV) console.log('[worker] PCA loaded:', raw.n_components, 'components');
  } catch (err) {
    console.warn('[worker] PCA load failed, rule-only:', err);
    ruleOnly = true;
  }
}

async function loadLabels(url: string): Promise<void> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = (await resp.json()) as Record<string, number>;
    const ordered: string[] = [];
    for (const [label, idx] of Object.entries(raw)) {
      ordered[idx] = label;
    }
    CLASS_NAMES = ordered;
    if (import.meta.env.DEV) console.log('[worker] Labels loaded:', CLASS_NAMES);
  } catch (err) {
    console.warn('[worker] Labels load failed, using defaults:', err);
  }
}

function postReadyStatus(): void {
  const mode = ruleOnly || !mlEnabled ? 'rules' : 'ml';
  self.postMessage({ type: 'status', mode });
}

function inWarmup(): boolean {
  return warmupFrames < WARMUP_FRAMES;
}

function getBlendshapeGaze(blendshapes: Record<string, number>): boolean {
  const lookInL = blendshapes['eyeLookInLeft'] ?? 0;
  const lookOutL = blendshapes['eyeLookOutLeft'] ?? 0;
  const lookInR = blendshapes['eyeLookInRight'] ?? 0;
  const lookOutR = blendshapes['eyeLookOutRight'] ?? 0;
  const leftGaze = Math.max(lookInL, lookOutL);
  const rightGaze = Math.max(lookInR, lookOutR);
  return leftGaze > 0.6 || rightGaze > 0.6;
}

async function processFrame(
  landmarks: number[][],
  faceCount: number,
  blendshapes: Record<string, number>,
  timestamp: number,
): Promise<void> {
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  let earLeft: number;
  let earRight: number;
  let gazeAway = false;
  let features: Float64Array | null = null;

  const hasFace = landmarks.length >= 468;

  if (hasFace) {
    const pose = estimateHeadPose(landmarks, IMAGE_WIDTH, IMAGE_HEIGHT);
    if (pose.success) {
      yaw = pose.yaw;
      pitch = pose.pitch;
      roll = pose.roll;
    }

    const rawLeft = computeEAR(landmarks, LEFT_EYE);
    const rawRight = computeEAR(landmarks, RIGHT_EYE);

    kalmanPose.predict();
    kalmanPose.update(new Float64Array([yaw, pitch]));
    const smoothedYaw = kalmanPose.x[0];
    const smoothedPitch = kalmanPose.x[1];

    const rawGaze = isGazeAway(smoothedYaw, smoothedPitch);
    const rawBsGaze = getBlendshapeGaze(blendshapes);
    if (inWarmup()) {
      gazeOffCount = 0;
      bsGazeOffCount = 0;
    } else {
      gazeOffCount = rawGaze ? gazeOffCount + 1 : Math.max(0, gazeOffCount - 2);
      bsGazeOffCount = rawBsGaze ? bsGazeOffCount + 1 : Math.max(0, bsGazeOffCount - 2);
    }
    gazeAway = gazeOffCount >= GAZE_CONSECUTIVE || bsGazeOffCount >= BS_GAZE_CONSECUTIVE;

    yaw = smoothedYaw;
    pitch = smoothedPitch;

    kalmanEAR.predict();
    kalmanEAR.update(new Float64Array([rawLeft, rawRight]));
    earLeft = kalmanEAR.x[0];
    earRight = kalmanEAR.x[1];

    faceWasPresent = true;
    updateBlinkRate((earLeft + earRight) * 0.5);

    features = new Float64Array(FEATURES_PER_FRAME);
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      features[i * 2] = landmarks[i][0];
      features[i * 2 + 1] = landmarks[i][1];
    }
  } else {
    if (faceWasPresent || firstFrame) {
      resetKalman(kalmanPose);
      resetKalmanEAR(kalmanEAR);
      faceWasPresent = false;
      gazeOffCount = 0;
      bsGazeOffCount = 0;
      hysteresisTimer = 0;
      lastRuleAttention = 'focused';
      blinkState = {
        inBlink: false,
        blinkFrames: 0,
        blinks: 0,
        frameCount: 0,
        lastRate: 15,
      };
    }
    kalmanPose.predict();
    kalmanEAR.predict();
    earLeft = kalmanEAR.x[0];
    earRight = kalmanEAR.x[1];
  }

  if (firstFrame) {
    warmupFrames = 0;
  } else if (hasFace) {
    warmupFrames++;
  }
  firstFrame = false;

  const rules = ruleResult(earLeft, earRight, faceCount, gazeAway);

  let attention: Attention = rules.attention;
  let confidence = rules.confidence;
  let source: 'rules' | 'ml' = 'rules';

  if (features && !ruleOnly && mlEnabled && pcaData && pushBuffer(features) && session) {
    try {
      const flat = flattenBuffer();
      const pcaOut = applyPCA(flat, pcaData);
      const inputTensor = new ort.Tensor('float32', pcaOut, [1, 1, pcaData.nComponents]);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[session.inputNames[0]] = inputTensor;
      const results = await session.run(feeds);
      const outputTensor = results[session.outputNames[0]] as ort.Tensor;
      const outputData = outputTensor.data as Float32Array;
      const probs = softmax(outputData);
      let maxProb = probs[0];
      let maxIdx = 0;
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i];
          maxIdx = i;
        }
      }
      if (maxProb >= ML_CONFIDENCE) {
        const mlLabel = CLASS_NAMES[maxIdx] as Attention;
        if (rules.attention === 'focused' || mlLabel === rules.attention) {
          attention = mlLabel;
          confidence = maxProb;
          source = 'ml';
          hysteresisTimer = 0;
          lastRuleAttention = attention;
        }
      }
      consecutiveInferenceFailures = 0;
    } catch (err) {
      consecutiveInferenceFailures++;
      if (import.meta.env.DEV) {
        console.error('[worker] ONNX inference failed:', err);
      }
      if (consecutiveInferenceFailures > 10) {
        self.postMessage({ type: 'model_failure' });
      }
    }
  }

  const result: DetectionResult = {
    attention,
    confidence,
    source,
    headPose: { yaw, pitch, roll },
    ear: { left: earLeft, right: earRight },
    faceCount,
    gazeAway,
    blinkRate: blinkState.lastRate,
    timestamp,
    landmarks: landmarks.length >= 468 ? landmarks : undefined,
  };

  self.postMessage({ type: 'result', data: result });
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      self.postMessage({ type: 'status', mode: 'loading' });
      kalmanPose = createPoseFilter();
      kalmanEAR = createEARFilter();
      const cfg = msg.config;
      const promises: Promise<void>[] = [];
      if (cfg.onnxModel) promises.push(loadONNX(cfg.onnxModel));
      if (cfg.pcaData) promises.push(loadPCA(cfg.pcaData));
      if (cfg.labelsUrl) promises.push(loadLabels(cfg.labelsUrl));
      await Promise.all(promises);

      if (!ruleOnly && session && pcaData) {
        try {
          const dummyInput = new Float32Array(pcaData.nComponents);
          const tensor = new ort.Tensor('float32', dummyInput, [1, 1, pcaData.nComponents]);
          const feeds: Record<string, ort.Tensor> = {};
          feeds[session.inputNames[0]] = tensor;
          const results = await session.run(feeds);
          const output = results[session.outputNames[0]] as ort.Tensor;
          if (import.meta.env.DEV) {
            console.log('[worker] Startup self-test OK — output length:', (output.data as Float32Array).length);
          }
        } catch (err) {
          console.error('[worker] Startup self-test FAILED — disabling ML:', err);
          ruleOnly = true;
          mlEnabled = false;
        }
      }

      postReadyStatus();
    } catch (err) {
      console.error('[worker] init failed:', err);
      ruleOnly = true;
      self.postMessage({ type: 'status', mode: 'error' });
      self.postMessage({ type: 'error', message: 'Worker initialization failed' });
    }
  } else if (msg.type === 'frame') {
    processFrame(msg.landmarks, msg.faceCount, msg.blendshapes ?? {}, msg.timestamp).catch(() => {});
  } else if (msg.type === 'thresholds') {
    const t = msg.thresholds;
    if (t.earClosed != null) EAR_CLOSED = t.earClosed;
    if (t.drowsyEarThreshold != null) BLINK_EAR_THRESH = t.drowsyEarThreshold;
    if (t.yawThreshold != null) YAW_THRESHOLD_DEG = t.yawThreshold;
    if (t.pitchThreshold != null) PITCH_THRESHOLD_DEG = t.pitchThreshold;
    if (import.meta.env.DEV) console.log('[worker] thresholds updated:', t);
  }
};
