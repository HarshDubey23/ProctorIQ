/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        'xs': ['var(--text-xs)', { lineHeight: 'var(--leading-normal)' }],
        'sm': ['var(--text-sm)', { lineHeight: 'var(--leading-normal)' }],
        'base': ['var(--text-base)', { lineHeight: 'var(--leading-normal)' }],
        'lg': ['var(--text-lg)', { lineHeight: 'var(--leading-snug)' }],
        'xl': ['var(--text-xl)', { lineHeight: 'var(--leading-snug)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-tight)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
        '5xl': ['var(--text-5xl)', { lineHeight: 'var(--leading-tight)' }],
        '6xl': ['var(--text-6xl)', { lineHeight: 'var(--leading-tight)' }],
      },
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        jade: 'var(--jade)',
        ochre: 'var(--ochre)',
        plum: 'var(--plum)',
        clay: 'var(--clay)',
        cobalt: 'var(--cobalt)',
        gold: 'var(--gold)',
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
        /* Deprecated aliases — will be removed after migration */
        'text': {
          primary: 'var(--ink)',
          secondary: 'var(--ink-muted)',
          muted: 'var(--ink-faint)',
          mono: 'var(--cobalt)',
        },
        'signal': {
          focus: 'var(--jade)',
          alert: 'var(--ochre)',
          absent: 'var(--clay)',
          multi: 'var(--clay)',
          neutral: 'var(--ink-faint)',
          caution: 'var(--ochre)',
          drowsy: 'var(--plum)',
        },
        'bg': {
          neutral: 'var(--surface-0)',
          focused: 'var(--surface-1)',
          distracted: 'var(--surface-1)',
          absent: 'var(--surface-1)',
          multi: 'var(--surface-1)',
        },
        'panel': {
          neutral: 'var(--surface-1)',
          focused: 'var(--surface-1)',
          distracted: 'var(--surface-1)',
          absent: 'var(--surface-1)',
          multi: 'var(--surface-1)',
        },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Lora', '"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Martian Mono Variable"', '"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        'aperture-sm': 'var(--shadow-sm)',
        'aperture-md': 'var(--shadow-md)',
        'aperture-lg': 'var(--shadow-lg)',
        'aperture-xl': 'var(--shadow-xl)',
      },
      borderRadius: {
        'aperture-sm': 'var(--radius-sm)',
        'aperture-md': 'var(--radius-md)',
        'aperture-lg': 'var(--radius-lg)',
        'aperture-xl': 'var(--radius-xl)',
      },
    },
  },
  plugins: [],
};
