import { useState, useRef, useCallback } from 'react';
import type { DetectionResult } from '../../workers/detection.worker';

export interface CalibrationData {
  baselineEar: number;
  baselineYaw: number;
  baselinePitch: number;
  baselineRoll: number;
  calibratedAt: number;
}

const CALIBRATION_SECONDS = 5;
const SAMPLES_PER_SECOND = 10;
const TOTAL_SAMPLES = CALIBRATION_SECONDS * SAMPLES_PER_SECOND;

type CalibrationState = 'idle' | 'calibrating' | 'done' | 'failed';

export function useCalibration() {
  const [state, setState] = useState<CalibrationState>('idle');
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<CalibrationData | null>(null);
  const samplesRef = useRef<{ ear: number; yaw: number; pitch: number; roll: number }[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    samplesRef.current = [];
    setProgress(0);
    setState('calibrating');
    setData(null);
    let count = 0;
    intervalRef.current = setInterval(() => {
      count++;
      setProgress(count / TOTAL_SAMPLES);
      if (count >= TOTAL_SAMPLES) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        finishCalibration();
      }
    }, 1000 / SAMPLES_PER_SECOND);
  }, []);

  const addSample = useCallback((result: DetectionResult) => {
    if (state !== 'calibrating') return;
    samplesRef.current.push({
      ear: (result.ear.left + result.ear.right) / 2,
      yaw: result.headPose.yaw,
      pitch: result.headPose.pitch,
      roll: result.headPose.roll,
    });
  }, [state]);

  const finishCalibration = useCallback(() => {
    const samples = samplesRef.current;
    if (samples.length < 5) {
      setState('failed');
      return;
    }
    const earValues = samples.map((s) => s.ear).filter((v) => v > 0.05 && v < 0.5);
    const yawValues = samples.map((s) => s.yaw);
    const pitchValues = samples.map((s) => s.pitch);
    const rollValues = samples.map((s) => s.roll);

    if (earValues.length < 3) {
      setState('failed');
      return;
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const cal: CalibrationData = {
      baselineEar: avg(earValues),
      baselineYaw: avg(yawValues),
      baselinePitch: avg(pitchValues),
      baselineRoll: avg(rollValues),
      calibratedAt: Date.now(),
    };
    setData(cal);
    setState('done');
  }, []);

  const getThresholds = useCallback((cal: CalibrationData) => ({
    drowsyThreshold: cal.baselineEar * 0.75,
    yawThreshold: 20,
    pitchThreshold: 22,
    earClosed: cal.baselineEar * 0.6,
    baselineEar: cal.baselineEar,
    baselineYaw: cal.baselineYaw,
  }), []);

  const cancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState('idle');
    setProgress(0);
  }, []);

  return { state, progress, data, start, addSample, getThresholds, cancel };
}
