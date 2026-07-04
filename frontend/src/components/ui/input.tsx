import * as React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full border-[3px] border-ink bg-paper-2 px-4 font-body text-base text-ink shadow-brutal-sm',
        'placeholder:text-graphite disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
