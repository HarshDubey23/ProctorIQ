/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        'xs': ['0.6875rem', { lineHeight: '1rem' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'base': ['0.9375rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.375rem', { lineHeight: '2rem' }],
      },
      colors: {
        bg: {
          neutral: '#111827',
          focused: '#0F1E2D',
          distracted: '#1E140A',
          absent: '#0F0F1E',
          multi: '#1A0A10',
        },
        panel: {
          neutral: '#1C2430',
          focused: '#172335',
          distracted: '#271A0E',
          absent: '#141428',
          multi: '#211018',
        },
        signal: {
          focus: '#38BDF8',
          alert: '#FB923C',
          absent: '#A78BFA',
          multi: '#F472B6',
          neutral: '#64748B',
          caution: '#FCD34D',
          drowsy: '#34D399',
        },
        text: {
          primary: '#F1F5F9',
          secondary: '#94A3B8',
          muted: '#475569',
          mono: '#7DD3FC',
        },
      },
      fontFamily: {
        display: ['Anton', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
