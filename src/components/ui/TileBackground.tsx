import React from 'react';
import { clsx } from 'clsx';

interface TileBackgroundProps {
  variant: 'tile' | 'paper';
  children: React.ReactNode;
  className?: string;
}

const tileStyle: React.CSSProperties = {
  backgroundColor: '#8FD0BC',
  backgroundImage: [
    'repeating-linear-gradient(0deg, transparent, transparent calc(40px - 1px), #6ab5a0 calc(40px - 1px), #6ab5a0 40px)',
    'repeating-linear-gradient(90deg, transparent, transparent calc(40px - 1px), #6ab5a0 calc(40px - 1px), #6ab5a0 40px)',
  ].join(', '),
};

const paperStyle: React.CSSProperties = {
  backgroundColor: '#F6EBD0',
};

export default function TileBackground({ variant, children, className }: TileBackgroundProps) {
  const inlineStyle = variant === 'tile' ? tileStyle : paperStyle;

  return (
    <div
      className={clsx('relative', className)}
      style={inlineStyle}
    >
      {variant === 'paper' && (
        /* Subtle noise overlay for aged-paper effect */
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
            backgroundRepeat: 'repeat',
          }}
        />
      )}
      {children}
    </div>
  );
}
