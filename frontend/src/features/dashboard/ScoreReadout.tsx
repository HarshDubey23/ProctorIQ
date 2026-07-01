import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { scoreSpring } from '../../motion.config';

interface ScoreReadoutProps {
  score: number;
}

function scoreColor(score: number): string {
  if (score >= 85) return 'var(--jade)';
  if (score >= 60) return 'var(--ochre)';
  if (score >= 30) return 'var(--plum)';
  return 'var(--clay)';
}

export function ScoreReadout({ score }: ScoreReadoutProps) {
  const reducedMotion = useReducedMotion();
  const color = scoreColor(score);

  return (
    <motion.span
      className="font-display text-[clamp(3rem,10vw,6rem)] leading-none tabular-nums"
      style={{ color }}
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
