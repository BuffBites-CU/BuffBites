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
      // `brand-black` is ink for text, but the accent for fills (buttons, selected
      // states, own chat bubbles) and a soft hairline for outlines. Any alpha on an
      // outline lands between 11% and 16% ink, so every border reads the same.
      backgroundColor: {
        'brand-black': 'rgb(var(--fill) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',               // selected chips and tabs
      },
      ringColor: {
        'brand-black': 'rgb(var(--ink) / calc(0.1 + <alpha-value> * 0.06))',
      },
      borderColor: {
        'brand-black': 'rgb(var(--ink) / calc(0.1 + <alpha-value> * 0.06))',
      },
      fontFamily: {
        sans:    ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // `display` and `brush` share one grotesque for headings and big numbers.
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        brush:   ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        title:   ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        heading: ['1.0625rem', { lineHeight: '1.3' }],
        body:    ['0.9375rem', { lineHeight: '1.5' }],
        caption: ['0.75rem',   { lineHeight: '1.4' }],
        label:   ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.07em' }],
      },
      borderRadius: {
        sm:    '6px',
        DEFAULT: '8px',
        md:    '10px',
        lg:    '12px',
        xl:    '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      boxShadow: {
        'card-sm':  '0 1px 3px rgba(26,20,16,0.06), 0 1px 2px rgba(26,20,16,0.04)',
        'card':     '0 4px 12px rgba(26,20,16,0.08), 0 1px 3px rgba(26,20,16,0.04)',
        'card-lg':  '0 8px 24px rgba(26,20,16,0.10), 0 2px 6px rgba(26,20,16,0.06)',
        // Not named 'brand': that would collide with the shadow-<color> utility
        // Tailwind generates for colors.brand and render a solid orange halo.
        'glow':     '0 6px 20px rgb(var(--brand) / 0.35)',
        'glow-sm':  '0 2px 8px rgb(var(--brand) / 0.25)',
        // Cards: a hairline plus a soft lift. `soft-lg` floats (nav, sheets).
        'soft':     '0 0 0 1px rgb(var(--ink) / 0.07), 0 1px 2px rgb(var(--ink) / 0.04), 0 4px 14px rgb(var(--ink) / 0.04)',
        'soft-lg':  '0 0 0 1px rgb(var(--ink) / 0.06), 0 12px 32px rgb(var(--ink) / 0.12)',
        'sticker':  '0 0 0 1px rgb(var(--ink) / 0.08)',
      },
    },
  },
  plugins: [],
}

export default config
