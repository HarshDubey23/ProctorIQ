import { motion } from 'framer-motion';
import { ApertureGauge } from '../../components/ui/ApertureGauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { pillTransition } from '../../motion.config';
import { Eye } from 'lucide-react';

interface ProctorOverlayProps {
  score: number;
  attentionLabel: string;
  isVisible: boolean;
}

export function ProctorOverlay({ score, attentionLabel, isVisible }: ProctorOverlayProps) {
  const reducedMotion = useReducedMotion();
  const openness = score / 100;

  return (
    <motion.div
      className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2"
      initial={false}
      animate={isVisible ? { x: 0, opacity: 1 } : { x: 120, opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : pillTransition}
      aria-hidden={!isVisible}
    >
      <div
        className="rounded-2xl p-3"
        style={{
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--hairline)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="w-[100px]">
          <ApertureGauge openness={openness} size={100} />
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Eye size={12} style={{ color: 'var(--ink-faint)' }} />
          <span className="font-display text-[22px] leading-none tabular-nums" style={{ color: 'var(--ink)' }}>
            {Math.round(score)}
          </span>
          <StatusPill state={attentionLabel as StatusState} />
        </div>
      </div>
    </motion.div>
  );
}
