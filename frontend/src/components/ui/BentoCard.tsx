import { useRef, useCallback, type ReactNode } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface BentoCardProps {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
}

export function BentoCard({
  title,
  description,
  children,
  className = '',
  colSpan = 1,
  rowSpan = 1,
}: BentoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  }, [reducedMotion]);

  const gridStyle: React.CSSProperties = {};
  if (colSpan === 2) gridStyle.gridColumn = 'span 2';
  if (rowSpan === 2) gridStyle.gridRow = 'span 2';

  return (
    <div
      ref={cardRef}
      className={`bento-card group relative rounded-xl p-5 flex flex-col gap-2 overflow-hidden ${className}`}
      style={{
        ...gridStyle,
        backgroundColor: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderTop: '1px solid var(--edge-highlight)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseMove={handleMouseMove}
    >
      {reducedMotion ? (
        <div
          className="pointer-events-none absolute inset-0 z-0 rounded-xl"
          style={{ border: '1px solid var(--hairline-strong)', opacity: 0.4 }}
          aria-hidden="true"
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(14,107,92,0.12), transparent 70%)',
          }}
          aria-hidden="true"
        />
      )}
      <div className="relative z-10 flex flex-col gap-2 h-full">
        <h3 className="font-display text-base uppercase tracking-[0.06em]" style={{ color: 'var(--ink)' }}>
          {title}
        </h3>
        <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          {description}
        </p>
        {children && (
          <div className="mt-auto pt-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
