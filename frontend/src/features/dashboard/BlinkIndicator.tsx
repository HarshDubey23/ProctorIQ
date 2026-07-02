interface BlinkIndicatorProps {
  earLeft: number;
  earRight: number;
}

export function BlinkIndicator({ earLeft, earRight }: BlinkIndicatorProps) {
  const avg = (earLeft + earRight) / 2;
  const isClosed = avg < 0.21;

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--surface-1)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 rounded-full transition-colors duration-200"
          style={{ backgroundColor: isClosed ? 'var(--ochre)' : 'var(--jade)' }}
          aria-label={isClosed ? 'Eyes closed' : 'Eyes open'}
        />
        <span className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
          Eyes
        </span>
      </div>
      <div className="flex gap-4 ml-auto">
        <div className="text-center">
          <div className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--ink)' }}>
            {earLeft.toFixed(3)}
          </div>
          <div className="font-sans text-[9px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
            L EAR
          </div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--ink)' }}>
            {earRight.toFixed(3)}
          </div>
          <div className="font-sans text-[9px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
            R EAR
          </div>
        </div>
      </div>
    </div>
  );
}
