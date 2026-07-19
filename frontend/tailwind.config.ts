import type { Config } from 'tailwindcss';

// Kolory mapowane na zmienne CSS z systemu motywów (globals.css).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        card: 'var(--card)',
        line: 'var(--line)',
        line2: 'var(--line2)',
        rowhover: 'var(--rowhover)',
        fg: 'var(--fg)',
        fg2: 'var(--fg2)',
        fg3: 'var(--fg3)',
        muted: 'var(--muted)',
        acc: 'var(--acc)',
        accfg: 'var(--accfg)',
        accsoft: 'var(--accsoft)',
        capbg: 'var(--capbg)',
        capbd: 'var(--capbd)',
        inputbd: 'var(--inputbd)',
        // aliasy zgodności ze starszymi komponentami (teraz theme-aware)
        canvas: 'var(--bg)',
        edge: 'var(--line)',
        brand: {
          DEFAULT: 'var(--acc)',
          hover: 'var(--accfg)',
          soft: 'var(--accfg)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
