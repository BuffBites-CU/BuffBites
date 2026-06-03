import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-gold': '#CFB87C',
        'brand-black': '#1C1C1C',
        surface: {
          DEFAULT: '#F9F7F2',
          card: '#FFFFFF',
          overlay: '#F0EDE6',
        },
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
      fontSize: {
        title:   ['1.375rem', { lineHeight: '1.25' }],
        heading: ['1.0625rem', { lineHeight: '1.3' }],
        body:    ['0.9375rem', { lineHeight: '1.5' }],
        caption: ['0.75rem',   { lineHeight: '1.4' }],
        label:   ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.05em' }],
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
  ],
}

export default config
