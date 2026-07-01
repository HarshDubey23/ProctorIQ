import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { pillTransition } from '../../motion.config';

export type StatusState = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi' | 'demo';

interface StatusPillProps {
  state: StatusState;
}

const PILL_CONFIG: Record<StatusState, { icon: string; label: string; color: string; bgColor: string }> = {
  focused: {
    icon: '\u25CF',
    label: 'Focused',
    color: 'var(--jade)',
    bgColor: 'rgba(14,107,92,0.1)',
  },
  distracted: {
    icon: '\u25C8',
    label: 'Distracted',
    color: 'var(--ochre)',
    bgColor: 'rgba(185,118,58,0.1)',
  },
  absent: {
    icon: '\u25CB',
    label: 'No Face',
    color: 'var(--clay)',
    bgColor: 'rgba(166,61,47,0.1)',
  },
  drowsy: {
    icon: '\u263C',
    label: 'Drowsy',
    color: 'var(--plum)',
    bgColor: 'rgba(107,81,120,0.1)',
  },
  multi: {
    icon: '\u25C9',
    label: 'Multiple',
    color: 'var(--clay)',
    bgColor: 'rgba(166,61,47,0.1)',
  },
  demo: {
    icon: '\u25A1',
    label: 'Demo Mode',
    color: 'var(--ochre)',
    bgColor: 'rgba(185,118,58,0.1)',
  },
};

export function StatusPill({ state }: StatusPillProps) {
  const reducedMotion = useReducedMotion();
  const cfg = PILL_CONFIG[state];

  return (
    <motion.div
      className="inline-flex items-center gap-2 rounded-full px-4 py-1.5"
      style={{ backgroundColor: cfg.bgColor }}
      transition={reducedMotion ? { duration: 0 } : pillTransition}
      layout
      role="status"
      aria-live="polite"
      aria-label={`Attention status: ${cfg.label}`}
    >
      <span
        className="inline-block text-lg leading-none"
        style={{ color: cfg.color }}
        aria-hidden="true"
      >
        {cfg.icon}
      </span>
      <span className="font-sans text-xs font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--ink)' }}>
        {cfg.label}
      </span>
    </motion.div>
  );
}
