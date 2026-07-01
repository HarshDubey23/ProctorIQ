import { motion } from 'framer-motion';
import { Gauge } from '../../components/ui/Gauge';
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

  return (
    <motion.div
      className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2"
      initial={false}
      animate={isVisible ? { x: 0, opacity: 1 } : { x: 120, opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : pillTransition}
      aria-hidden={!isVisible}
    >
      <div
        className="rounded-2xl bg-[rgba(10,22,40,0.85)] backdrop-blur-md border border-white/[0.08] p-3"
      >
        <div className="w-[100px]">
          <Gauge score={score} attentionLabel={attentionLabel} />
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Eye size={12} className="text-text-muted" />
          <span className="font-display text-[22px] leading-none tabular-nums text-text-primary">
            {Math.round(score)}
          </span>
          <StatusPill state={attentionLabel as StatusState} />
        </div>
      </div>
    </motion.div>
  );
}
