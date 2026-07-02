import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useBenchmark, type BenchmarkResult } from './useBenchmark';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface BenchmarkModalProps {
  open: boolean;
  onClose: () => void;
}

function BenchmarkTable({ result }: { result: BenchmarkResult }) {
  if (result.perClass.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
            <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Class</th>
            <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Precision</th>
            <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Recall</th>
            <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2">F1</th>
          </tr>
        </thead>
        <tbody>
          {result.perClass.map((c) => (
            <tr key={c.name} style={{ borderBottom: '1px solid var(--hairline)' }}>
              <td className="font-sans text-[13px] text-text-primary py-2 pr-4 capitalize">{c.name}</td>
              <td className="font-mono text-[11px] tabular-nums text-text-mono py-2 pr-4">{c.precision.toFixed(3)}</td>
              <td className="font-mono text-[11px] tabular-nums text-text-mono py-2 pr-4">{c.recall.toFixed(3)}</td>
              <td className="font-mono text-[11px] tabular-nums text-text-mono py-2">{c.f1.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 rounded-lg px-4 py-3" style={{ backgroundColor: 'var(--surface-1)' }}>
        <span className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary">Macro F1</span>
        <span className="font-display text-xl tabular-nums text-signal-focus">
          {result.macroF1.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

export function BenchmarkModal({ open, onClose }: BenchmarkModalProps) {
  const reducedMotion = useReducedMotion();
  const benchmark = useBenchmark();

  if (!open) return null;

  const { stage, currentStageIdx, countdownValue, stageTimeLeft, currentStage, totalStages, result, startBenchmark, reset } = benchmark;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--hairline)', borderTop: '1px solid var(--edge-highlight)', boxShadow: 'var(--shadow-sm)' }}
            initial={reducedMotion ? { opacity: 1 } : { scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { scale: 0.92, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg uppercase tracking-[0.08em] text-text-primary">
                Benchmark
              </h2>
              <button
                onClick={() => { reset(); onClose(); }}
                className="rounded-lg p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {stage === 'idle' && (
              <div className="flex flex-col gap-4">
                <p className="font-sans text-[13px] text-text-secondary leading-relaxed">
                  This 30-second benchmark evaluates detection accuracy across 5 scenarios.
                  Follow the on-screen instructions for each stage.
                </p>
                <div className="flex flex-col gap-2">
                  {['Focused', 'Distracted', 'Drowsy', 'Absent', 'Focused'].map((s, i) => (
                    <div key={i} className="flex items-center gap-3 font-sans text-[12px] text-text-secondary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-text-muted" style={{ backgroundColor: 'var(--surface-2)' }}>
                        {i + 1}
                      </span>
                      {s}
                    </div>
                  ))}
                </div>
                <button
                  onClick={startBenchmark}
                  className="mt-2 rounded-xl bg-signal-focus/[0.15] px-6 py-3 font-sans text-[13px] uppercase tracking-[0.1em] text-signal-focus transition-colors hover:bg-signal-focus/[0.25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
                >
                  Start Benchmark
                </button>
              </div>
            )}

            {stage === 'countdown' && (
              <div className="flex flex-col items-center justify-center py-12">
                <motion.span
                  key={countdownValue}
                  className="font-display text-[clamp(4rem,15vw,8rem)] tabular-nums text-signal-focus"
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {countdownValue}
                </motion.span>
                <span className="font-sans text-[13px] text-text-secondary mt-4">
                  Get ready...
                </span>
              </div>
            )}

            {stage === 'recording' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-signal-alert animate-pulse" />
                  <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-signal-alert">
                    Recording
                  </span>
                </div>
                <span className="font-display text-xl uppercase tracking-[0.05em] text-text-primary text-center">
                  {currentStage.label}
                </span>
                <div className="flex items-center gap-2 font-mono text-[13px] tabular-nums text-text-mono">
                  <span>{stageTimeLeft}s</span>
                  <span className="text-text-muted">·</span>
                  <span>Stage {currentStageIdx + 1} of {totalStages}</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {Array.from({ length: totalStages }).map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                      i < currentStageIdx ? 'w-4 bg-signal-drowsy' :
                      i === currentStageIdx ? 'w-8 bg-signal-focus' :
                      'w-2'
                    }`} style={i > currentStageIdx ? { backgroundColor: 'var(--hairline-strong)' } : undefined} />
                  ))}
                </div>
              </div>
            )}

            {stage === 'computing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-focus border-t-transparent" />
                <span className="font-sans text-[13px] text-text-secondary mt-4">
                  Computing results...
                </span>
              </div>
            )}

            {stage === 'done' && result && (
              <div className="flex flex-col gap-4">
                <BenchmarkTable result={result} />
                <button
                  onClick={() => { reset(); onClose(); }}
                  className="mt-2 rounded-xl px-6 py-3 font-sans text-[13px] uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
                  style={{ backgroundColor: 'var(--surface-2)', color: 'var(--ink)' }}
                >
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
