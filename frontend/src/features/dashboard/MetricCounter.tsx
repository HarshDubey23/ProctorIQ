import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { scoreSpring } from '../../motion.config';

interface MetricCounterProps {
  value: number;
  label: string;
  suffix?: string;
  color?: string;
}

export function MetricCounter({ value, label, suffix = '', color = 'text-text-primary' }: MetricCounterProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] p-3">
      <motion.span
        className={`font-display text-[22px] leading-none tabular-nums ${color}`}
        key={Math.round(value)}
        initial={false}
        animate={{ scale: [1, 1.06, 1] }}
        transition={reducedMotion ? { duration: 0 } : scoreSpring}
      >
        {value}
        {suffix}
      </motion.span>
      <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-text-secondary text-center">
        {label}
      </span>
    </div>
  );
}
