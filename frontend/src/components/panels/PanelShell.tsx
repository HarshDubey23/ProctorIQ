import { type ReactNode } from "react";

interface PanelShellProps {
  ghostLabel: string;
  isActive: boolean;
  children: ReactNode;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

export function PanelShell({ ghostLabel, isActive, children, ctaLabel, onCtaClick }: PanelShellProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      {/* Ghost text layer — decorative */}
      <div
        className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center"
        aria-hidden="true"
      >
        <span
          className="font-display text-[clamp(5.625rem,28vw,23.75rem)] leading-none text-paper-2"
          style={{ opacity: 0.5 }}
        >
          {ghostLabel}
        </span>
      </div>

      {/* Panel content */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {children}
      </div>

      {isActive && ctaLabel && (
        <button
          className="absolute bottom-8 right-8 z-20 border-[3px] border-ink bg-paper px-6 py-3 font-display text-xl uppercase tracking-widest text-ink shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 transition-[transform,box-shadow] duration-[60ms] linear"
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
