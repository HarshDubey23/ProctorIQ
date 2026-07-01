interface BlinkIndicatorProps {
  earLeft: number;
  earRight: number;
}

export function BlinkIndicator({ earLeft, earRight }: BlinkIndicatorProps) {
  const avg = (earLeft + earRight) / 2;
  const isClosed = avg < 0.21;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full transition-colors duration-200 ${
            isClosed ? 'bg-signal-caution' : 'bg-signal-drowsy'
          }`}
          aria-label={isClosed ? 'Eyes closed' : 'Eyes open'}
        />
        <span className="font-sans text-[11px] uppercase tracking-[0.1em] text-text-secondary">
          Eyes
        </span>
      </div>
      <div className="flex gap-4 ml-auto">
        <div className="text-center">
          <div className="font-mono text-[13px] tabular-nums text-text-primary">
            {earLeft.toFixed(3)}
          </div>
          <div className="font-sans text-[9px] uppercase tracking-[0.1em] text-text-muted">
            L EAR
          </div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[13px] tabular-nums text-text-primary">
            {earRight.toFixed(3)}
          </div>
          <div className="font-sans text-[9px] uppercase tracking-[0.1em] text-text-muted">
            R EAR
          </div>
        </div>
      </div>
    </div>
  );
}
