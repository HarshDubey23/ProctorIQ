import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { pillTransition } from '../../motion.config';

export type StatusState = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi' | 'demo';

interface StatusPillProps {
  state: StatusState;
}

const PILL_CONFIG: Record<StatusState, { icon: string; label: string; color: string; shape: string }> = {
  focused: {
    icon: '\u25CF',
    label: 'Focused',
    color: 'var(--signal-focus)',
    shape: 'circle',
  },
  distracted: {
    icon: '\u25C8',
    label: 'Distracted',
    color: 'var(--signal-alert)',
    shape: 'diamond',
  },
  absent: {
    icon: '\u25CB',
    label: 'No Face',
    color: 'var(--signal-absent)',
    shape: 'empty-circle',
  },
  drowsy: {
    icon: '\u263C',
    label: 'Drowsy',
    color: 'var(--signal-drowsy)',
    shape: 'sun',
  },
  multi: {
    icon: '\u25C9',
    label: 'Multiple',
    color: 'var(--signal-multi)',
    shape: 'circle-dot',
  },
  demo: {
    icon: '\u25A1',
    label: 'Demo Mode',
    color: 'var(--signal-caution)',
    shape: 'square',
  },
};

const ZONE_CLASS: Record<StatusState, string> = {
  focused: 'bg-panel-focused',
  distracted: 'bg-panel-distracted',
  absent: 'bg-panel-absent',
  drowsy: 'bg-panel-distracted',
  multi: 'bg-panel-multi',
  demo: 'bg-panel-neutral',
};

export function StatusPill({ state }: StatusPillProps) {
  const reducedMotion = useReducedMotion();
  const cfg = PILL_CONFIG[state];

  return (
    <motion.div
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 ${ZONE_CLASS[state]}`}
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
        data-shape={cfg.shape}
      >
        {cfg.icon}
      </span>
      <span className="font-sans text-xs font-medium uppercase tracking-[0.1em] text-text-primary">
        {cfg.label}
      </span>
    </motion.div>
  );
}