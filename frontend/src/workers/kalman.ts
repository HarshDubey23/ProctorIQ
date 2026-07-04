const { abs } = Math;

function matMul(A: Float64Array, B: Float64Array, n: number): Float64Array {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i * n + k] * B[k * n + j];
      C[i * n + j] = s;
    }
  return C;
}

function matTranspose(A: Float64Array, n: number): Float64Array {
  const AT = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      AT[i * n + j] = A[j * n + i];
  return AT;
}

function matAdd(A: Float64Array, B: Float64Array, n: number): Float64Array {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) C[i] = A[i] + B[i];
  return C;
}

function matIdentity(n: number): Float64Array {
  const I = new Float64Array(n * n);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  return I;
}

function matInvert(A: Float64Array, n: number): Float64Array {
  const w = 2 * n;
  const aug = new Float64Array(n * w);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i * w + j] = A[i * n + j];
    aug[i * w + n + i] = 1;
  }
  for (let col = 0; col < n; col++) {
    let mr = col;
    for (let r = col + 1; r < n; r++)
      if (abs(aug[r * w + col]) > abs(aug[mr * w + col])) mr = r;
    if (mr !== col)
      for (let j = 0; j < w; j++) { const t = aug[col * w + j]; aug[col * w + j] = aug[mr * w + j]; aug[mr * w + j] = t; }
    const pv = aug[col * w + col];
    if (abs(pv) < 1e-15) continue;
    for (let j = 0; j < w; j++) aug[col * w + j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r * w + col];
      for (let j = 0; j < w; j++) aug[r * w + j] -= f * aug[col * w + j];
    }
  }
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      inv[i * n + j] = aug[i * w + n + j];
  return inv;
}

function matVecMul(A: Float64Array, x: Float64Array, n: number, m: number): Float64Array {
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[i * n + j] * x[j];
    y[i] = s;
  }
  return y;
}

export class KalmanFilter {
  constructor(
    readonly n: number,
    readonly m: number,
    public x: Float64Array,
    public P: Float64Array,
    private readonly F: Float64Array,
    private readonly H: Float64Array,
    private readonly Q: Float64Array,
    private readonly R: Float64Array,
  ) {}

  predict(): void {
    this.x = matVecMul(this.F, this.x, this.n, this.n);
    const FPF = matMul(matMul(this.F, this.P, this.n), matTranspose(this.F, this.n), this.n);
    this.P = matAdd(FPF, this.Q, this.n);
  }

  update(z: Float64Array): void {
    const HP = matMul(this.H, this.P, this.n);
    const HPH = matMul(HP, matTranspose(this.H, this.n), this.m);
    const S = matAdd(HPH, this.R, this.m);
    const Sinv = matInvert(S, this.m);
    const K = matMul(matTranspose(HP, this.n), Sinv, this.m);
    const y = new Float64Array(this.m);
    const Hx = matVecMul(this.H, this.x, this.n, this.m);
    for (let i = 0; i < this.m; i++) y[i] = z[i] - Hx[i];
    const Ky = matVecMul(K, y, this.m, this.n);
    for (let i = 0; i < this.n; i++) this.x[i] += Ky[i];
    const I = matIdentity(this.n);
    const KH = matMul(K, this.H, this.n);
    const IminusKH = new Float64Array(this.n * this.n);
    for (let i = 0; i < this.n * this.n; i++) IminusKH[i] = I[i] - KH[i];
    this.P = matMul(IminusKH, this.P, this.n);
  }
}

export function resetKalman(kf: KalmanFilter): void {
  for (let i = 0; i < kf.x.length; i++) kf.x[i] = 0;
  for (let i = 0; i < kf.P.length; i++) kf.P[i] = 0;
  for (let i = 0; i < kf.n; i++) kf.P[i * kf.n + i] = 10;
}

export function resetKalmanEAR(kf: KalmanFilter): void {
  for (let i = 0; i < kf.x.length; i++) kf.x[i] = 0.3;
  for (let i = 0; i < kf.P.length; i++) kf.P[i] = 0;
  kf.P[0] = 1; kf.P[1 * kf.n + 1] = 1;
}

export function createEARFilter(): KalmanFilter {
  const n = 2, m = 2;
  const F = matIdentity(n);
  const H = new Float64Array(m * n);
  for (let i = 0; i < n; i++) H[i * n + i] = 1;
  const Q = new Float64Array(n * n);
  Q[0 * n + 0] = 0.05; Q[1 * n + 1] = 0.05;
  const R = new Float64Array(m * m);
  R[0 * m + 0] = 0.02;  R[1 * m + 1] = 0.02;
  const x0 = new Float64Array([0.3, 0.3]);
  const P0 = matIdentity(n);
  P0[0 * n + 0] = 1; P0[1 * n + 1] = 1;
  return new KalmanFilter(n, m, x0, P0, F, H, Q, R);
}

export function createPoseFilter(): KalmanFilter {
  const n = 2, m = 2; // state: [yaw, pitch]
  const F = matIdentity(n);
  const H = new Float64Array(m * n);
  for (let i = 0; i < n; i++) H[i * n + i] = 1;
  const Q = new Float64Array(n * n);
  Q[0 * n + 0] = 0.005; Q[1 * n + 1] = 0.005; // process noise
  const R = new Float64Array(m * m);
  R[0 * m + 0] = 0.02;  R[1 * m + 1] = 0.02;   // measurement noise
  const x0 = new Float64Array([0, 0]);
  const P0 = matIdentity(n);
  P0[0 * n + 0] = 1; P0[1 * n + 1] = 1;
  return new KalmanFilter(n, m, x0, P0, F, H, Q, R);
}

export { matMul, matTranspose, matIdentity, matInvert, matVecMul };
