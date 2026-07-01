import { useState, useCallback, useRef } from 'react';
import { saveBenchmark } from '../../lib/db';

export interface BenchmarkResult {
  perClass: Array<{
    name: string;
    precision: number;
    recall: number;
    f1: number;
  }>;
  macroF1: number;
  rawPredictions: Array<{ frame: number; predicted: string; truth: string }>;
}

export type BenchmarkStage = 'idle' | 'countdown' | 'recording' | 'computing' | 'done';

interface StageConfig {
  label: string;
  groundTruth: string;
  durationSec: number;
}

const STAGES: StageConfig[] = [
  { label: 'Look straight ahead and stay still.', groundTruth: 'focused', durationSec: 5 },
  { label: 'Turn your head to the right.', groundTruth: 'distracted', durationSec: 5 },
  { label: 'Close your eyes.', groundTruth: 'drowsy', durationSec: 5 },
  { label: 'Step out of frame.', groundTruth: 'absent', durationSec: 5 },
  { label: 'Look straight ahead again.', groundTruth: 'focused', durationSec: 5 },
];

export function useBenchmark() {
  const [stage, setStage] = useState<BenchmarkStage>('idle');
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [stageTimeLeft, setStageTimeLeft] = useState(0);
  const predictionsRef = useRef<Array<{ frame: number; predicted: string; truth: string }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);

  const startBenchmark = useCallback(() => {
    setResult(null);
    setCurrentStageIdx(0);
    predictionsRef.current = [];
    frameCountRef.current = 0;
    setStage('countdown');
    setCountdownValue(3);

    const countInterval = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          clearInterval(countInterval);
          setStage('recording');
          setStageTimeLeft(STAGES[0].durationSec);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countInterval);
  }, []);

  const recordPrediction = useCallback((predictedState: string) => {
    if (stage !== 'recording') return;
    const truth = STAGES[currentStageIdx].groundTruth;
    predictionsRef.current.push({ frame: frameCountRef.current++, predicted: predictedState, truth });
  }, [stage, currentStageIdx]);

  const advanceStage = useCallback(() => {
    const nextIdx = currentStageIdx + 1;
    if (nextIdx >= STAGES.length) {
      setStage('computing');

      const rawPredictions = predictionsRef.current;
      const classes = ['focused', 'distracted', 'drowsy', 'absent'];
      const perClass = classes.map((cls) => {
        const tp = rawPredictions.filter((p) => p.predicted === cls && p.truth === cls).length;
        const fp = rawPredictions.filter((p) => p.predicted === cls && p.truth !== cls).length;
        const fn = rawPredictions.filter((p) => p.predicted !== cls && p.truth === cls).length;
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
        return { name: cls, precision: Math.round(precision * 1000) / 1000, recall: Math.round(recall * 1000) / 1000, f1: Math.round(f1 * 1000) / 1000 };
      });
      const macroF1 = Math.round(perClass.reduce((s, c) => s + c.f1, 0) / perClass.length * 1000) / 1000;

      const benchmarkData = { perClass, macroF1, rawPredictions };
      setResult(benchmarkData);
      setStage('done');

      void saveBenchmark({ modelLatencyMs: 0, inferenceCount: rawPredictions.length, pcaLatencyMs: 0 });
      return;
    }

    setCurrentStageIdx(nextIdx);
    setStageTimeLeft(STAGES[nextIdx].durationSec);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setStageTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          advanceStage();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [currentStageIdx]);

  const reset = useCallback(() => {
    setStage('idle');
    setCurrentStageIdx(0);
    setResult(null);
    predictionsRef.current = [];
    frameCountRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return {
    stage,
    currentStageIdx,
    countdownValue,
    stageTimeLeft,
    currentStage: STAGES[currentStageIdx] ?? STAGES[0],
    totalStages: STAGES.length,
    result,
    startBenchmark,
    recordPrediction,
    advanceStage,
    reset,
  };
}
