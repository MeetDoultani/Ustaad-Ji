'use client';

import React from 'react';
import { clsx } from 'clsx';

interface SalonInputProps {
  label: string;
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
      <label htmlFor={id} className="block font-label font-bold text-ink text-sm">
        {label}
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
        className="bg-paper border-2 border-ink focus:border-marigold focus:outline-none px-4 py-3 font-body text-ink w-full min-h-[44px] rounded-lg"
      />
    </div>
  );
}
