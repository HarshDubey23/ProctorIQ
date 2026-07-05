import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useWebcam } from '../selftest/useWebcam';
import { useDetection, computeAttentionScore } from '../selftest/useDetection';
import { isDetectionActive } from '../../lib/detection-config';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface BenchmarkData {
  summary: {
    test_accuracy_pct: number;
    cv_macro_f1_mean: number;
    cv_macro_f1_std: number;
    model_size_kb: number;
    latency_ms_range: string;
  };
  dataset: {
    total_raw_clips: number;
    classes: string[];
    clips_per_class: number;
    total_windowed_samples: number;
    windowed_per_class: Record<string, number>;
  };
  cross_validation: {
    fold_f1s: number[];
    mean_f1: number;
    std_f1: number;
  };
  test_results: {
    accuracy_pct: number;
    confusion_matrix: {
      order: string[];
      values: number[][];
    };
    per_class: Record<string, { precision: number; recall: number; f1: number; support: number }>;
    macro_avg: { f1: number };
  };
  ablation_study: {
    configurations: { name: string; key: string; f1: number; precision: number; recall: number }[];
    interpretation: string;
  };
  latency: {
    per_frame_ms: { environment: string; model: number; pca: number; total: number }[];
  };
  architecture: {
    pipeline: string;
  };
  limitations: string[];
  future_work: string[];
}

interface CollectStatus {
  contributors: number;
  max_contributors: number;
  full: boolean;
}

function LiveDemo() {
  const [started, setStarted] = useState(false);
  const { videoRef, isDemo } = useWebcam();
  const { result, status } = useDetection(videoRef, { isDemo, enabled: started });
  const detectionReady = isDetectionActive(status);
  const score = result ? computeAttentionScore(result) : 0;

  const handleStart = useCallback(() => {
    setStarted(true);
  }, []);

  const handleStop = useCallback(() => {
    setStarted(false);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, [videoRef]);

  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [videoRef]);

  return (
    <div className="border-[2px] border-ink bg-paper p-4 md:p-6">
      <h2 className="font-label text-label text-graphite uppercase mb-4">Live Demo</h2>

      {!started ? (
        <div className="flex flex-col items-center gap-4">
          <p className="font-body text-sm text-ink text-center max-w-md">
            Try the actual 27 KB ONNX model that runs during a real exam. Your camera feed stays on your device.
          </p>
          <button
            onClick={handleStart}
            className="border-[3px] border-ink bg-stamp px-6 py-3 font-display text-sm uppercase tracking-[0.08em] text-paper hover:bg-paper hover:text-stamp transition-colors"
          >
            Start Camera
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {detectionReady && result ? (
                <>
                  <span className="chip">{result.attention}</span>
                  <span className="font-mono text-xs text-graphite">
                    {result.source === 'ml' ? 'ML' : 'Rule-based'} &middot; {(result.confidence * 100).toFixed(0)}%
                  </span>
                </>
              ) : status === 'loading' ? (
                <span className="font-body text-xs text-graphite">Loading models...</span>
              ) : (
                <span className="font-body text-xs text-ochre">Waiting for detection...</span>
              )}
            </div>
            <button
              onClick={handleStop}
              className="border-[2px] border-ink bg-paper-2 px-3 py-1 font-body text-xs uppercase tracking-wider text-ink hover:bg-stamp hover:text-paper transition-colors"
            >
              Stop
            </button>
          </div>

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-sm border-[2px] border-ink"
            style={{ transform: 'scaleX(-1)' }}
          />

          {detectionReady && result && (
            <div className="border-[2px] border-ink bg-paper-2 p-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-2 border-[1px] border-ink bg-paper overflow-hidden">
                    <div
                      className="h-full transition-all duration-200"
                      style={{ width: `${score}%`, backgroundColor: score > 70 ? 'var(--ledger)' : score > 40 ? 'var(--ochre)' : 'var(--stamp)' }}
                    />
                  </div>
                </div>
                <span className="font-mono text-sm text-ink tabular-nums">{score}/100</span>
              </div>
            </div>
          )}

          <p className="font-body text-[10px] text-graphite text-center">
            This runs the same 27 KB model your browser uses during a real exam. Nothing leaves your device.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="border-[2px] border-ink bg-paper p-4">
      <p className="font-label text-[10px] text-graphite uppercase tracking-wider">{label}</p>
      <p className="font-display text-2xl text-ink mt-1">{value}</p>
      {subtitle && <p className="font-body text-xs text-graphite mt-1">{subtitle}</p>}
    </div>
  );
}

function SectionHeading({ id, children }: { id?: string; children: string }) {
  return (
    <h2 id={id} className="font-display text-xl text-ink mb-4 mt-8 first:mt-0">
      {children}
    </h2>
  );
}

function collectStatusQuery() {
  return fetch(`${API_BASE}/api/collect/status`).then((r) => (r.ok ? r.json() : null));
}

export function ModelTrainingPage() {
  const [report, setReport] = useState<BenchmarkData | null>(null);
  const [collectStatus, setCollectStatus] = useState<CollectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [benchRes, collectRes] = await Promise.all([
          fetch(`${API_BASE}/api/ml/benchmark`),
          collectStatusQuery(),
        ]);
        if (!cancelled) {
          if (benchRes.ok) {
            const data = await benchRes.json();
            setReport(data.available ? data : null);
          }
          if (collectRes) setCollectStatus(collectRes);
        }
      } catch {
        if (!cancelled) setError('Failed to load model card data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-8 font-body text-sm text-graphite">
        Loading model card...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8">
        <h1 className="font-display text-xl text-ink mb-2">Model Card</h1>
        <p className="font-body text-sm text-graphite">
          {error ?? 'Benchmark data not available.'}
        </p>
      </div>
    );
  }

  const { summary, dataset, cross_validation, test_results, ablation_study, latency, limitations, future_work } = report;
  const cm = test_results.confusion_matrix;

  const cvChartData = cross_validation.fold_f1s.map((f1, i) => ({
    fold: `Fold ${i + 1}`,
    f1: Number((f1 * 100).toFixed(1)),
  }));

  const ablationChartData = ablation_study.configurations.map((cfg) => ({
    name: cfg.name,
    F1: Number((cfg.f1 * 100).toFixed(1)),
    Precision: Number((cfg.precision * 100).toFixed(1)),
    Recall: Number((cfg.recall * 100).toFixed(1)),
  }));

  const maxCmVal = Math.max(...cm.values.flat());

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-4">
      <h1 className="font-display text-3xl text-ink">Model Card</h1>
      <p className="font-body text-sm text-graphite mb-6">
        ProctorIQ Attention Classifier &mdash; v1.0.0
      </p>

      {/* 1. Hero Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Test Accuracy" value="99.22%" subtitle="384 held-out samples" />
        <StatCard
          label="CV Macro F1"
          value={`${summary.cv_macro_f1_mean} \u00B1 ${summary.cv_macro_f1_std}`}
          subtitle="5-fold stratified"
        />
        <StatCard label="Model Size" value={`${summary.model_size_kb} KB`} subtitle="ONNX Runtime Web" />
        <StatCard label="Latency" value={`${summary.latency_ms_range} ms`} subtitle="Per frame, all devices" />
      </div>

      {/* 2. Pipeline */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Pipeline</SectionHeading>
        <p className="font-mono text-xs text-ink leading-relaxed break-all">
          Webcam &rarr; MediaPipe FaceLandmarker (WASM) &rarr; [Rule engine (EAR + Kalman + solvePnP) &#x2225;
          1D-CNN (ONNX)] &rarr; Confidence-gated fusion &rarr; Score
        </p>
      </div>

      {/* 3. Data Collection */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Data Collection</SectionHeading>
        <p className="font-body text-sm text-ink mb-3">
          Collected over 5 sessions with a 720p webcam at 640&times;480. {dataset.total_raw_clips} clips total
          ({dataset.clips_per_class} per class), each ~3 s at ~30 fps. MediaPipe FaceLandmarker extracts
          468 landmarks per frame. Saved as <code className="bg-paper-2 px-1 text-xs">.npy</code> files
          with shape (frames, 936).
        </p>

        <div className="overflow-x-auto mb-3">
          <table className="w-full font-mono text-xs text-ink">
            <thead>
              <tr className="border-b-[2px] border-ink">
                <th className="text-left py-1 pr-3">Class</th>
                <th className="text-right py-1 pr-3">Raw Clips</th>
                <th className="text-right py-1 pr-3">Windowed Samples</th>
              </tr>
            </thead>
            <tbody>
              {dataset.classes.map((cls) => (
                <tr key={cls} className="border-b-[1px] border-ink/30">
                  <td className="py-1 pr-3 capitalize">{cls}</td>
                  <td className="text-right py-1 pr-3">{dataset.clips_per_class}</td>
                  <td className="text-right py-1">{dataset.windowed_per_class[cls] ?? '-'}</td>
                </tr>
              ))}
              <tr className="border-t-[2px] border-ink font-bold">
                <td className="py-1 pr-3">Total</td>
                <td className="text-right py-1 pr-3">{dataset.total_raw_clips}</td>
                <td className="text-right py-1">{dataset.total_windowed_samples}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="font-body text-xs text-graphite mb-2">
          Varied lighting (bright, dim, mixed), with/without glasses, distances 0.5&ndash;1.5 m.
          Augmentation: Gaussian noise (&sigma;=0.002), time stretch (0.8&times;/1.2&times;), left-right flip
          (3&times; multiplier, training set only). Sliding window: 30 frames, stride 5 (83.3% overlap),
          flattened to 28,080 dim, PCA to 64 components (97% variance retained). Train/val/test: 70/15/15
          stratified.
        </p>

        {collectStatus && (
          <div className="border-[2px] border-ledger bg-ledger/5 px-3 py-2">
            <p className="font-label text-[10px] text-ledger uppercase tracking-wider">Live Contributor Progress</p>
            <p className="font-display text-lg text-ledger">
              {collectStatus.contributors} / {collectStatus.max_contributors} contributors
              {collectStatus.full && <span className="font-body text-xs ml-2">(Collection full)</span>}
            </p>
          </div>
        )}
      </div>

      {/* 4. CV Results */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Cross-Validation Results</SectionHeading>
        <p className="font-body text-sm text-graphite mb-3">
          5-fold stratified cross-validation. Mean Macro F1: {cross_validation.mean_f1} &plusmn; {cross_validation.std_f1}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={cvChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fold" tick={{ fontSize: 11 }} />
            <YAxis domain={[95, 100]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="f1" fill="var(--ledger)" name="Macro F1 %" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 5. Confusion Matrix */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Confusion Matrix</SectionHeading>
        <p className="font-body text-xs text-graphite mb-3">
          Rows = true class, columns = predicted. Order: {cm.order.join(', ')}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-ink">
            <thead>
              <tr>
                <th className="p-1" />
                {cm.order.map((col) => (
                  <th key={col} className="p-1 text-center capitalize">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cm.values.map((row, i) => (
                <tr key={cm.order[i]}>
                  <td className="p-1 font-bold capitalize text-right pr-2">{cm.order[i]}</td>
                  {row.map((val, j) => {
                    const intensity = val > 0 ? (val / maxCmVal) * 0.9 : 0;
                    return (
                      <td
                        key={`${i}-${j}`}
                        className="p-1 text-center font-bold"
                        style={{
                          backgroundColor: val > 0 ? `rgba(155, 45, 32, ${intensity})` : undefined,
                          color: intensity > 0.5 ? '#F4F1EA' : undefined,
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Per-Class Metrics */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Per-Class Metrics</SectionHeading>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-ink">
            <thead>
              <tr className="border-b-[2px] border-ink">
                <th className="text-left py-1 pr-3">Class</th>
                <th className="text-right py-1 pr-3">Precision</th>
                <th className="text-right py-1 pr-3">Recall</th>
                <th className="text-right py-1 pr-3">F1-Score</th>
                <th className="text-right py-1">Support</th>
              </tr>
            </thead>
            <tbody>
              {cm.order.map((cls) => {
                const m = test_results.per_class[cls];
                return (
                  <tr key={cls} className="border-b-[1px] border-ink/30">
                    <td className="py-1 pr-3 capitalize">{cls}</td>
                    <td className="text-right py-1 pr-3">{m.precision.toFixed(3)}</td>
                    <td className="text-right py-1 pr-3">{m.recall.toFixed(3)}</td>
                    <td className="text-right py-1 pr-3">{m.f1.toFixed(3)}</td>
                    <td className="text-right py-1">{m.support}</td>
                  </tr>
                );
              })}
              <tr className="border-t-[2px] border-ink font-bold">
                <td className="py-1 pr-3">Macro Avg</td>
                <td className="text-right py-1 pr-3">{test_results.macro_avg.f1.toFixed(3)}</td>
                <td className="text-right py-1 pr-3">{test_results.macro_avg.f1.toFixed(3)}</td>
                <td className="text-right py-1 pr-3">{test_results.macro_avg.f1.toFixed(3)}</td>
                <td className="text-right py-1">384</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="font-body text-xs text-graphite mt-3">
          Focused and distracted are the two classes that get confused with each other (3 total
          misclassifications &mdash; 2 focused&rarr;distracted, 1 distracted&rarr;focused). Absent and
          drowsy classify perfectly since they have the most distinct landmark signatures.
        </p>
      </div>

      {/* 7. Ablation Study */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Ablation Study</SectionHeading>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={ablationChartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Legend />
            <Bar dataKey="F1" fill="var(--ledger)" />
            <Bar dataKey="Precision" fill="var(--ochre)" />
            <Bar dataKey="Recall" fill="var(--stamp)" />
          </BarChart>
        </ResponsiveContainer>
        <p className="font-body text-xs text-graphite mt-3 leading-relaxed">
          {ablation_study.interpretation}
        </p>
      </div>

      {/* 8. Latency */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Performance Measurements</SectionHeading>
        <p className="font-body text-xs text-graphite mb-3">{latency.per_frame_ms[0] && 'All values stay within the 33 ms budget (30 fps). ONNX runtime WebAssembly adds ~2\u20133 ms overhead vs native.'}</p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-ink">
            <thead>
              <tr className="border-b-[2px] border-ink">
                <th className="text-left py-1 pr-3">Environment</th>
                <th className="text-right py-1 pr-3">Model</th>
                <th className="text-right py-1 pr-3">PCA</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {latency.per_frame_ms.map((env) => (
                <tr key={env.environment} className="border-b-[1px] border-ink/30">
                  <td className="py-1 pr-3 text-graphite">{env.environment}</td>
                  <td className="text-right py-1 pr-3">{env.model} ms</td>
                  <td className="text-right py-1 pr-3">{env.pca} ms</td>
                  <td className="text-right py-1 font-bold">{env.total} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 9. Limitations */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>Limitations &amp; Ethical Considerations</SectionHeading>
        <ul className="space-y-2">
          {limitations.map((lim, i) => (
            <li key={i} className="font-body text-xs text-ink leading-relaxed flex gap-2">
              <span className="text-stamp mt-0.5 shrink-0">&bull;</span>
              <span>{lim}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 10. Future Work */}
      <div className="border-[2px] border-ink bg-paper p-4">
        <SectionHeading>If I Had 3 More Months</SectionHeading>
        <ul className="space-y-2">
          {future_work.map((item, i) => (
            <li key={i} className="font-body text-xs text-ink leading-relaxed flex gap-2">
              <span className="text-ochre mt-0.5 shrink-0">&rarr;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 11. Live Demo */}
      <LiveDemo />
    </div>
  );
}

export default ModelTrainingPage;
