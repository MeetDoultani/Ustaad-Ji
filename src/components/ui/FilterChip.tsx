import React from 'react';
import { clsx } from 'clsx';

interface FilterChipProps {
  label: string;
  labelHi?: string;
  active: boolean;
  onClick: () => void;
}

export default function FilterChip({ label, labelHi, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 min-h-[44px] font-label font-bold text-sm px-4 py-2 border-2 transition-colors',
        active
          ? 'bg-marigold border-ink text-ink'
          : 'bg-paper border-steel text-ink hover:border-ink',
      )}
      aria-pressed={active}
    >
      <span>{label}</span>
      {labelHi && (
        <span className={clsx('font-body text-xs', active ? 'text-ink/70' : 'text-steel')}>
          / {labelHi}
        </span>
      )}
    </button>
  );
}
