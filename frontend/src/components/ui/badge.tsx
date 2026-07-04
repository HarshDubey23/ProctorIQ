import * as React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'stamp' | 'ledger' | 'ochre' | 'graphite';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-paper-2 text-ink',
    stamp: 'bg-stamp text-paper',
    ledger: 'bg-ledger text-paper',
    ochre: 'bg-ochre text-ink',
    graphite: 'bg-graphite text-paper',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center border-2 border-ink px-2 py-0.5 font-label text-label uppercase',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
