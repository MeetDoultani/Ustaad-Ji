import React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'disabled';

interface SalonButtonProps {
  variant: ButtonVariant;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  disabled?: boolean;
  href?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-marigold text-ink border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] hover:bg-saffron transition-all',
  secondary:
    'bg-paper text-maroon border-2 border-maroon shadow-[3px_3px_0px_#7A1F2B] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all',
  destructive:
    'bg-poleRed text-chalk border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all',
  disabled:
    'bg-paper text-steel border-2 border-steel cursor-not-allowed opacity-60',
};

const baseClasses =
  'inline-flex items-center justify-center min-h-[44px] font-label font-bold px-5 py-3 select-none';

export default function SalonButton({
  variant,
  children,
  onClick,
  type = 'button',
  className,
  disabled,
  href,
}: SalonButtonProps) {
  const resolvedVariant: ButtonVariant =
    disabled && variant !== 'disabled' ? 'disabled' : variant;
  const classes = clsx(baseClasses, variantClasses[resolvedVariant], className);

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        onClick={disabled ? (e) => e.preventDefault() : undefined}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled ?? resolvedVariant === 'disabled'}
      className={classes}
    >
      {children}
    </button>
  );
}
