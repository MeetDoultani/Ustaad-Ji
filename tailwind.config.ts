import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tile: '#8FD0BC',
        tealDeep: '#0F5E57',
        paper: '#F6EBD0',
        ink: '#2B2118',
        marigold: '#F2A900',
        saffron: '#E8731A',
        maroon: '#7A1F2B',
        steel: '#8A9299',
        poleRed: '#C8262F',
        poleBlue: '#1E4F9C',
        chalk: '#FFFFFF',
      },
      fontFamily: {
        sign: ['var(--font-sign)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        label: ['var(--font-label)', 'sans-serif'],
        token: ['var(--font-token)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
