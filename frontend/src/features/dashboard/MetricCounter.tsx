import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { scoreSpring } from '../../motion.config';

interface MetricCounterProps {
  value: number;
  label: string;
  suffix?: string;
  color?: string;
}

export function MetricCounter({ value, label, suffix = '', color = 'var(--ink)' }: MetricCounterProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl p-3" style={{ backgroundColor: 'var(--surface-1)' }}>
      <motion.span
        className="font-display text-[22px] leading-none tabular-nums"
        style={{ color }}
        key={Math.round(value)}
        initial={false}
        animate={{ scale: [1, 1.06, 1] }}
        transition={reducedMotion ? { duration: 0 } : scoreSpring}
      >
        {value}{suffix}
      </motion.span>
      <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-center" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </span>
    </div>
  );
}
