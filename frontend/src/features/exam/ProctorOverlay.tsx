import { ApertureGauge } from '../../components/ui/ApertureGauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { Eye } from 'lucide-react';

interface ProctorOverlayProps {
  score: number;
  attentionLabel: string;
  isVisible: boolean;
}

export function ProctorOverlay({ score, attentionLabel, isVisible }: ProctorOverlayProps) {
  const openness = score / 100;

  if (!isVisible) return null;

  return (
    <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2" aria-hidden={!isVisible}>
      <div className="border-[3px] border-ink bg-paper-2 p-3 shadow-brutal">
        <div className="w-[100px]">
          <ApertureGauge openness={openness} size={100} />
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Eye size={12} className="text-graphite" />
          <span className="font-display text-[22px] leading-none tabular-nums text-ink">
            {Math.round(score)}
          </span>
          <StatusPill state={attentionLabel as StatusState} />
        </div>
      </div>
    </div>
  );
}
