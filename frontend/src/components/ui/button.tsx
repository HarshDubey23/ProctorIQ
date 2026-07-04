import * as React from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'default' | 'primary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 border-[3px] border-ink px-5 py-3 font-body font-semibold ' +
      'select-none transition-[transform,box-shadow] duration-[60ms] ease-linear ' +
      'hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1';
    const variants: Record<ButtonVariant, string> = {
      default:
        'bg-paper text-ink shadow-brutal hover:shadow-[8px_8px_0_0_#1A1A17] active:shadow-[2px_2px_0_0_#1A1A17]',
      primary:
        'bg-stamp text-paper shadow-brutal hover:shadow-[8px_8px_0_0_#1A1A17] active:shadow-[2px_2px_0_0_#1A1A17]',
      ghost: 'border-transparent bg-transparent text-ink shadow-none hover:bg-paper-2',
    };

    return <button ref={ref} className={cn(base, variants[variant], className)} {...props} />;
  },
);
Button.displayName = 'Button';
