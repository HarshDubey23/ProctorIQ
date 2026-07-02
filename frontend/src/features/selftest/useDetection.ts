import { useEffect, useRef, useState, type RefObject } from 'react';
import { createDemoStream } from '../../lib/demo';
import {
  initDetection,
  DetectionBridge,
  type DetectionStatus,
} from '../../lib/detection-bridge';
import type { DetectionResult } from '../../workers/detection.worker';
import { DETECTION_CONFIG, isDetectionActive } from '../../lib/detection-config';
import { setBridge } from './detectionGlobals';

interface UseDetectionOptions {
  enabled?: boolean;
  isDemo?: boolean;
}

interface UseDetectionReturn {
  result: DetectionResult | null;
  status: DetectionStatus;
  landmarks: number[][] | null;
  videoRef: RefObject<HTMLVideoElement>;
  modelFailure: boolean;
}

export function useDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  options: UseDetectionOptions = {},
): UseDetectionReturn {
  const { enabled = true, isDemo = false } = options;
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [status, setStatus] = useState<DetectionStatus>('loading');
  const [landmarks, setLandmarks] = useState<number[][] | null>(null);
  const [modelFailure, setModelFailure] = useState(false);
  const bridgeRef = useRef<DetectionBridge | null>(null);
  const rafRef = useRef(0);
  const lastFrameTime = useRef(0);

  useEffect(() => {
    if (!enabled || isDemo) {
      setStatus('loading');
      return;
    }

    setModelFailure(false);
    const bridge = initDetection(DETECTION_CONFIG);
    bridgeRef.current = bridge;
    setBridge(bridge);

    bridge.onResult(setResult);
    bridge.onStatus(setStatus);
    bridge.onError(() => setStatus('error'));
    bridge.onLandmarks((lm) => setLandmarks(lm));
    bridge.onModelFailure(() => setModelFailure(true));

    return () => {
      bridge.destroy();
      bridgeRef.current = null;
      setBridge(null);
    };
  }, [enabled, isDemo]);

  useEffect(() => {
    if (!enabled || isDemo || !isDetectionActive(status)) return;

    const video = videoRef.current;
    if (!video) return;

    let running = true;

    function tick(now: number): void {
      if (!running || !video) return;
      const br = bridgeRef.current;
      if (!br) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (now - lastFrameTime.current < 33) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTime.current = now;
      br.sendFrame(video, now);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, isDemo, status, videoRef]);

  useEffect(() => {
    if (!enabled || !isDemo) return;
    const cleanup = createDemoStream(setResult);
    setStatus('rules');
    return cleanup;
  }, [enabled, isDemo]);

  return { result, status, landmarks, videoRef, modelFailure };
}

export function computeAttentionScore(result: DetectionResult): number {
  const base = (() => {
    switch (result.attention) {
      case 'focused': return 85;
      case 'distracted': return 45;
      case 'absent': return 5;
      case 'drowsy': return 35;
      case 'multi': return 20;
    }
  })();
  const jitter = result.confidence * 10 - 5;
  return Math.max(0, Math.min(100, Math.round(base + jitter)));
}
