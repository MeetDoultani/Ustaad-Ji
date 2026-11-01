import React from 'react';

export default function BarberPoleDivider() {
  return (
    <div
      className="barber-divider h-8 w-full border-y border-ink/30"
      aria-hidden="true"
      style={{
        background:
          'repeating-linear-gradient(45deg, #C8262F 0, #C8262F 6px, #FFFFFF 6px, #FFFFFF 12px, #1E4F9C 12px, #1E4F9C 18px)',
        backgroundSize: '25px 25px',
      }}
    />
  );
}
