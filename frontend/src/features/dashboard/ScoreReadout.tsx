import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { scoreSpring } from '../../motion.config';

interface ScoreReadoutProps {
  score: number;
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-signal-focus';
  if (score >= 60) return 'text-signal-caution';
  if (score >= 30) return 'text-signal-alert';
  return 'text-signal-multi';
}

export function ScoreReadout({ score }: ScoreReadoutProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      className={`font-display text-[clamp(3rem,10vw,6rem)] leading-none tabular-nums ${scoreColor(score)}`}
      key={Math.round(score)}
      initial={false}
      animate={{ scale: [1, 1.06, 1] }}
      transition={reducedMotion ? { duration: 0 } : scoreSpring}
      aria-live="polite"
      aria-label={`Attention score ${Math.round(score)}`}
    >
      {score > 0 ? Math.round(score) : '—'}
    </motion.span>
  );
}
