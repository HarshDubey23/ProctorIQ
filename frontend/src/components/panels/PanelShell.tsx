import { type ReactNode, useId } from 'react';

interface PanelShellProps {
  ghostLabel: string;
  isActive: boolean;
  children: ReactNode;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

export function PanelShell({ ghostLabel, isActive, children, ctaLabel, onCtaClick }: PanelShellProps) {
  const filterId = useId();

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Layer 1: Ghost text — lowest, strictly decorative */}
      <div
        className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center"
        aria-hidden="true"
      >
        <span className="font-display text-[clamp(5.625rem,28vw,23.75rem)] leading-none tracking-tighter text-white/[0.04]">
          {ghostLabel}
        </span>
      </div>

      {/* Layer 2: Grain overlay */}
      <svg
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full opacity-40"
        style={{ backgroundSize: '200px', filter: 'contrast(1.2)' }}
        aria-hidden="true"
      >
        <filter id={filterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="4"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} opacity="0.08" />
      </svg>

      {/* Layer 3: Panel content — above ghost + grain */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {children}
      </div>

      {isActive && ctaLabel && (
        <button
          className="absolute bottom-8 right-8 z-20 rounded-xl bg-white/10 px-6 py-3 font-display text-[clamp(1.25rem,4vw,3.5rem)] uppercase tracking-widest text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
          aria-label="Call to action"
          tabIndex={0}
          onClick={onCtaClick}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}