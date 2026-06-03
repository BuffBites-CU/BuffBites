import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-gold':       '#CFB87C',
        'brand-gold-deep':  '#B39340',
        'brand-gold-pale':  '#EDD89A',
        'brand-black':      '#1A1410',
        surface: {
          DEFAULT: '#FAF6ED',
          card:    '#FFFDF9',
          overlay: '#F0E8D4',
          warm:    '#E8DEC8',
        },
        muted:        '#8A7A68',
        'brand-stone':'#C4B8A4',
      },
      fontFamily: {
        sans:    ['var(--font-dm-sans)',  'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-syne)',     'ui-sans-serif', 'system-ui', 'sans-serif'],
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
        'gold':     '0 6px 20px rgba(207,184,124,0.35)',
        'gold-sm':  '0 2px 8px rgba(207,184,124,0.25)',
      },
    },
  },
  plugins: [],
}

export default config
