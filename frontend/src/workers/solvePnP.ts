/**
 * 6-point head pose via iterative PnP (browser port of backend/cv/head_pose.py).
 * Pure TypeScript linear algebra — no OpenCV.
 */

const MODEL_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [0, -330, -65],
  [-225, 170, -135],
  [225, 170, -135],
  [-150, -150, -125],
  [150, -150, -125],
];

const LANDMARK_INDICES = [1, 152, 33, 263, 61, 291] as const;

const DEG2RAD = Math.PI / 180;

function buildCameraMatrix(w: number, h: number): Float64Array {
  const f = w;
  const cx = w * 0.5;
  const cy = h * 0.5;
  return new Float64Array([f, 0, cx, 0, f, cy, 0, 0, 1]);
}

function rodrigues(r: Float64Array): Float64Array {
  const theta = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
  const R = new Float64Array(9);
  R[0] = 1; R[4] = 1; R[8] = 1;
  if (theta < 1e-8) return R;
  const k = 1 / theta;
  const rx = r[0] * k;
  const ry = r[1] * k;
  const rz = r[2] * k;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const v = 1 - c;
  R[0] = c + rx * rx * v;
  R[1] = rx * ry * v - rz * s;
  R[2] = rx * rz * v + ry * s;
  R[3] = ry * rx * v + rz * s;
  R[4] = c + ry * ry * v;
  R[5] = ry * rz * v - rx * s;
  R[6] = rz * rx * v - ry * s;
  R[7] = rz * ry * v + rx * s;
  R[8] = c + rz * rz * v;
  return R;
}

function matVec(R: Float64Array, v: [number, number, number]): [number, number, number] {
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
  ];
}

function project(
  R: Float64Array,
  t: Float64Array,
  K: Float64Array,
  pt: [number, number, number],
): [number, number] {
  const cam = matVec(R, pt);
  const x = cam[0] + t[0];
  const y = cam[1] + t[1];
  const z = cam[2] + t[2];
  if (Math.abs(z) < 1e-6) return [0, 0];
  const u = K[0] * (x / z) + K[2];
  const v = K[4] * (y / z) + K[5];
  return [u, v];
}

function rotationToAngles(R: Float64Array): { yaw: number; pitch: number; roll: number } {
  const forward = [R[2], R[5], R[8]] as const;
  const up = [R[1], R[4], R[7]] as const;
  const yaw = Math.atan2(forward[0], -forward[2]);
  const pitch = Math.atan2(-forward[1], -forward[2]);
  const roll = Math.atan2(-up[0], -up[1]);
  return { yaw, pitch, roll };
}

export interface HeadPoseEstimate {
  yaw: number;
  pitch: number;
  roll: number;
  success: boolean;
}

export function estimateHeadPose(
  landmarks: number[][],
  imageWidth = 640,
  imageHeight = 480,
): HeadPoseEstimate {
  if (landmarks.length < 468) {
    return { yaw: 0, pitch: 0, roll: 0, success: false };
  }

  const imagePoints: [number, number][] = LANDMARK_INDICES.map((idx) => [
    landmarks[idx][0] * imageWidth,
    landmarks[idx][1] * imageHeight,
  ]);

  const K = buildCameraMatrix(imageWidth, imageHeight);
  const rvec = new Float64Array(3);
  const tvec = new Float64Array([0, 0, 300]);

  const nPts = MODEL_POINTS.length;
  const nParams = 6;
  const eps = 1e-4;

  for (let iter = 0; iter < 24; iter++) {
    const R = rodrigues(rvec);
    const JtJ = new Float64Array(nParams * nParams);
    const Jtr = new Float64Array(nParams);
    const Jrow = new Float64Array(nParams);

    for (let i = 0; i < nPts; i++) {
      const proj = project(R, tvec, K, MODEL_POINTS[i]);
      const rx = imagePoints[i][0] - proj[0];
      const ry = imagePoints[i][1] - proj[1];

      for (let p = 0; p < nParams; p++) {
        const dr = new Float64Array(rvec);
        const dt = new Float64Array(tvec);
        if (p < 3) dr[p] += eps;
        else dt[p - 3] += eps;
        const Rp = rodrigues(dr);
        const pp = project(Rp, dt, K, MODEL_POINTS[i]);
        Jrow[p] = (pp[0] - proj[0]) / eps;
      }
      for (let p = 0; p < nParams; p++) {
        for (let q = 0; q < nParams; q++) JtJ[p * nParams + q] += Jrow[p] * Jrow[q];
        Jtr[p] += Jrow[p] * rx;
      }

      for (let p = 0; p < nParams; p++) {
        const dr = new Float64Array(rvec);
        const dt = new Float64Array(tvec);
        if (p < 3) dr[p] += eps;
        else dt[p - 3] += eps;
        const Rp = rodrigues(dr);
        const pp = project(Rp, dt, K, MODEL_POINTS[i]);
        Jrow[p] = (pp[1] - proj[1]) / eps;
      }
      for (let p = 0; p < nParams; p++) {
        for (let q = 0; q < nParams; q++) JtJ[p * nParams + q] += Jrow[p] * Jrow[q];
        Jtr[p] += Jrow[p] * ry;
      }
    }

    for (let i = 0; i < nParams; i++) JtJ[i * nParams + i] += 1e-3;

    const delta = solve6(JtJ, Jtr);
    if (!delta) break;
    for (let i = 0; i < 3; i++) {
      rvec[i] += delta[i];
      tvec[i] += delta[i + 3];
    }
    let stepNorm = 0;
    for (let i = 0; i < nParams; i++) stepNorm += delta[i] * delta[i];
    if (Math.sqrt(stepNorm) < 1e-6) break;
  }

  const R = rodrigues(rvec);
  const angles = rotationToAngles(R);
  return { ...angles, success: true };
}

function solve6(A: Float64Array, b: Float64Array): Float64Array | null {
  const n = 6;
  const aug = new Float64Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i * (n + 1) + j] = A[i * n + j];
    aug[i * (n + 1) + n] = b[i];
  }
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row * (n + 1) + col]) > Math.abs(aug[maxRow * (n + 1) + col])) {
        maxRow = row;
      }
    }
    for (let j = 0; j <= n; j++) {
      const tmp = aug[col * (n + 1) + j];
      aug[col * (n + 1) + j] = aug[maxRow * (n + 1) + j];
      aug[maxRow * (n + 1) + j] = tmp;
    }
    const pivot = aug[col * (n + 1) + col];
    if (Math.abs(pivot) < 1e-12) return null;
    for (let j = col; j <= n; j++) aug[col * (n + 1) + j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row * (n + 1) + col];
      for (let j = col; j <= n; j++) {
        aug[row * (n + 1) + j] -= factor * aug[col * (n + 1) + j];
      }
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = aug[i * (n + 1) + n];
  return x;
}

export { DEG2RAD, LANDMARK_INDICES };
