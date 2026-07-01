import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { DetectionResult } from '../workers/detection.worker';

export interface DetectionConfig {
  faceLandmarkerModel: string;
  faceDetectorModel?: string;
  onnxModel?: string;
  pcaData?: string;
  labelsUrl?: string;
  wasmDir?: string;
}

export type DetectionStatus = 'loading' | 'ready' | 'error' | 'ml' | 'rules';

export type ResultCallback = (result: DetectionResult) => void;
export type StatusCallback = (status: DetectionStatus) => void;
export type ErrorCallback = (error: Error) => void;
export type LandmarksCallback = (landmarks: number[][], faceCount: number) => void;
export type BlendshapeMap = Record<string, number>;

async function initFaceLandmarker(modelUrl: string, wasmDir: string): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmDir);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numFaces: 5,
    outputFaceBlendshapes: true,
  });
}

export class DetectionBridge {
  private worker: Worker;
  private faceLandmarker: FaceLandmarker | null = null;
  private onResultCb: ResultCallback | null = null;
  private onStatusCb: StatusCallback | null = null;
  private onErrorCb: ErrorCallback | null = null;
  private onLandmarksCb: LandmarksCallback | null = null;
  private destroyed = false;
  private restarts = 0;
  private maxRestarts = 3;
  private workerMode: DetectionStatus | null = null;
  private landmarkerReady = false;

  constructor(private config: DetectionConfig) {
    this.worker = this.createWorker();
    void this.initFaceLandmarker();
  }

  private emitCombinedStatus(): void {
    if (this.destroyed || !this.onStatusCb) return;
    if (!this.landmarkerReady || this.workerMode === null) {
      this.onStatusCb('loading');
      return;
    }
    if (this.workerMode === 'error') {
      this.onStatusCb('error');
      return;
    }
    this.onStatusCb(this.workerMode === 'ml' ? 'ml' : 'rules');
  }

  private createWorker(): Worker {
    const w = new Worker(new URL('../workers/detection.worker.ts', import.meta.url), {
      type: 'module',
    });

    w.onmessage = (e: MessageEvent) => {
      if (this.destroyed) return;
      const msg = e.data;
      switch (msg.type) {
        case 'result':
          this.onResultCb?.(msg.data as DetectionResult);
          break;
        case 'status': {
          const mode = msg.mode as DetectionStatus;
          if (mode === 'loading') {
            this.workerMode = null;
          } else if (mode === 'ml' || mode === 'rules' || mode === 'error') {
            this.workerMode = mode;
          }
          this.emitCombinedStatus();
          break;
        }
        case 'error':
          this.onErrorCb?.(new Error(msg.message as string));
          break;
      }
    };

    w.onerror = (e: ErrorEvent) => {
      if (this.destroyed) return;
      this.onErrorCb?.(new Error(e.message || 'Unhandled worker error'));
      void this.tryRestart();
    };

    w.postMessage({
      type: 'init',
      config: {
        onnxModel: this.config.onnxModel,
        pcaData: this.config.pcaData,
        labelsUrl: this.config.labelsUrl,
      },
    });
    return w;
  }

  private async initFaceLandmarker(): Promise<void> {
    try {
      this.faceLandmarker = await initFaceLandmarker(
        this.config.faceLandmarkerModel,
        this.config.wasmDir ?? '',
      );
      this.landmarkerReady = true;
      this.emitCombinedStatus();
    } catch (err) {
      console.error('[bridge] FaceLandmarker init failed:', err);
      this.onErrorCb?.(new Error('FaceLandmarker initialization failed'));
      this.onStatusCb?.('error');
    }
  }

  private async tryRestart(): Promise<void> {
    if (this.restarts >= this.maxRestarts) return;
    this.restarts++;
    this.workerMode = null;
    this.worker.terminate();
    this.worker = this.createWorker();
  }

  private extractLandmarks(lmResult: FaceLandmarkerResult): { landmarks: number[][]; faceCount: number; blendshapes: BlendshapeMap } {
    const faceLandmarks = lmResult.faceLandmarks;
    if (!faceLandmarks || faceLandmarks.length === 0) {
      return { landmarks: [], faceCount: 0, blendshapes: {} };
    }
    const landmarks = faceLandmarks[0].map((l) => [l.x, l.y, l.z ?? 0]);
    const blendshapes: BlendshapeMap = {};
    const blends = lmResult.faceBlendshapes;
    if (blends && blends.length > 0) {
      for (const cat of blends[0].categories) {
        blendshapes[cat.categoryName] = cat.score;
      }
    }
    return { landmarks, faceCount: faceLandmarks.length, blendshapes };
  }

  setThresholds(thresholds: {
    earClosed?: number;
    drowsyEarThreshold?: number;
    yawThreshold?: number;
    pitchThreshold?: number;
    baselineEar?: number;
    baselineYaw?: number;
  }): void {
    this.worker.postMessage({ type: 'thresholds', thresholds });
  }

  sendFrame(video: HTMLVideoElement, timestamp: number): void {
    if (this.destroyed) return;
    const fl = this.faceLandmarker;
    if (!fl) return;

    try {
      const lmResult = fl.detectForVideo(video, timestamp);
      const { landmarks, faceCount, blendshapes } = this.extractLandmarks(lmResult);
      this.onLandmarksCb?.(landmarks, faceCount);
      this.worker.postMessage({ type: 'frame', landmarks, faceCount, blendshapes, timestamp });
    } catch (err) {
      console.warn('[bridge] detectForVideo failed:', err);
    }
  }

  onResult(cb: ResultCallback): this {
    this.onResultCb = cb;
    return this;
  }

  onStatus(cb: StatusCallback): this {
    this.onStatusCb = cb;
    return this;
  }

  onError(cb: ErrorCallback): this {
    this.onErrorCb = cb;
    return this;
  }

  onLandmarks(cb: LandmarksCallback): this {
    this.onLandmarksCb = cb;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
    this.worker.terminate();
    this.faceLandmarker?.close();
    this.faceLandmarker = null;
    this.onResultCb = null;
    this.onStatusCb = null;
    this.onErrorCb = null;
    this.onLandmarksCb = null;
  }
}

export function initDetection(config: DetectionConfig): DetectionBridge {
  return new DetectionBridge(config);
}

export type { DetectionResult };
