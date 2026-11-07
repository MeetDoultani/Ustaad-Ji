import React from 'react';
import { clsx } from 'clsx';

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center justify-center min-h-[44px] font-label font-bold text-sm px-4 py-2 border-2 transition-colors rounded-lg',
        active
          ? 'bg-marigold border-ink text-ink shadow-[2px_2px_0px_#2B2118]'
          : 'bg-paper border-steel text-ink hover:border-ink',
      )}
      aria-pressed={active}
    >
      <span>{label}</span>
    </button>
  );
}
