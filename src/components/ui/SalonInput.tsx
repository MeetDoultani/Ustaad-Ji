'use client';

import React from 'react';
import { clsx } from 'clsx';

interface SalonInputProps {
  label: string;
  labelHi?: string;
  id: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
  autoComplete?: string;
}

export default function SalonInput({
  label,
  labelHi,
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  className,
  required,
  autoComplete,
}: SalonInputProps) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="flex flex-col">
        <span className="font-label font-bold text-ink">{label}</span>
        {labelHi && (
          <span className="font-body text-sm text-steel">{labelHi}</span>
        )}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        className="bg-paper border-2 border-ink focus:border-marigold focus:outline-none px-4 py-3 font-body text-ink w-full min-h-[44px] rounded-none"
      />
    </div>
  );
}
