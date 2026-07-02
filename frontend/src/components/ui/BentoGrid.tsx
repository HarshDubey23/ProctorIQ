import { type ReactNode } from 'react';

interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

export function BentoGrid({ children, className = '' }: BentoGridProps) {
  return (
    <div
      className={`grid w-full gap-3 ${className}`}
      style={{
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridAutoRows: 'auto',
      }}
    >
      {children}
    </div>
  );
}
