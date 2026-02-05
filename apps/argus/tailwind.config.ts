import type { Config } from 'tailwindcss';

const config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx,mdx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;

export default config;

