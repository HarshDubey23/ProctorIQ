import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { confidenceSpring } from '../../motion.config';

interface ConfidenceBarProps {
  value: number;
  label?: string;
}

function barColor(v: number): string {
  if (v >= 0.85) return 'var(--jade)';
  if (v >= 0.6) return 'var(--ochre)';
  if (v >= 0.3) return 'var(--plum)';
  return 'var(--clay)';
}

export function ConfidenceBar({ value, label }: ConfidenceBarProps) {
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);
  const color = barColor(clamped);

  return (
    <div className="flex flex-col gap-1">
      {(label ?? true) && (
        <div className="flex items-baseline justify-between">
          <span className="font-sans text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-muted)' }}>
            {label ?? 'Confidence'}
          </span>
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color }}
          >
            {pct}%
          </span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--hairline)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reducedMotion ? { duration: 0 } : confidenceSpring}
        />
      </div>
    </div>
  );
}
