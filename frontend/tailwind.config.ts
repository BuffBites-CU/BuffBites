import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // All colors are CSS variables (see app/globals.css) so the palette can be
      // retuned in one place. Values are space-separated RGB for alpha support.
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',       // logo orange — fills, buttons
          deep:    'rgb(var(--brand-deep) / <alpha-value>)',  // text/icons on light bg (AA)
          pale:    'rgb(var(--brand-pale) / <alpha-value>)',
          black:   'rgb(var(--ink) / <alpha-value>)',
          stone:   'rgb(var(--stone) / <alpha-value>)',
          gold:    'rgb(var(--cu-gold) / <alpha-value>)',     // CU Buffs gold accent
          hot:     'rgb(var(--hot) / <alpha-value>)',         // trending / fire accents
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          card:    'rgb(var(--surface-card) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
          warm:    'rgb(var(--surface-warm) / <alpha-value>)',
        },
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
      fontFamily: {
        sans:    ['var(--font-outfit)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Hand-drawn face. `display` and `brush` both map to it so every
        // heading, label and button shares one handwriting style.
        display: ['var(--font-hand)',   'ui-rounded', 'system-ui', 'sans-serif'],
        brush:   ['var(--font-hand)',   'ui-rounded', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        title:   ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        heading: ['1.0625rem', { lineHeight: '1.3' }],
        body:    ['0.9375rem', { lineHeight: '1.5' }],
        caption: ['0.75rem',   { lineHeight: '1.4' }],
        label:   ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.07em' }],
      },
      boxShadow: {
        'card-sm':  '0 1px 3px rgba(26,20,16,0.06), 0 1px 2px rgba(26,20,16,0.04)',
        'card':     '0 4px 12px rgba(26,20,16,0.08), 0 1px 3px rgba(26,20,16,0.04)',
        'card-lg':  '0 8px 24px rgba(26,20,16,0.10), 0 2px 6px rgba(26,20,16,0.06)',
        // Not named 'brand': that would collide with the shadow-<color> utility
        // Tailwind generates for colors.brand and render a solid orange halo.
        'glow':     '0 6px 20px rgb(var(--brand) / 0.35)',
        'glow-sm':  '0 2px 8px rgb(var(--brand) / 0.25)',
        // Minimal, soft, warm-tinted elevation for white cards on peach.
        'soft':     '0 6px 20px rgb(var(--shadow) / 0.10), 0 1px 3px rgb(var(--shadow) / 0.06)',
        'soft-lg':  '0 14px 36px rgb(var(--shadow) / 0.14), 0 2px 6px rgb(var(--shadow) / 0.06)',
        'sticker':  '0 6px 20px rgb(var(--shadow) / 0.10), 0 1px 3px rgb(var(--shadow) / 0.06)',
      },
    },
  },
  plugins: [],
}

export default config
