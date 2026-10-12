// "Aurora": a soft emerald/teal/amber glow behind frosted-glass cards; pearl in light mode, deep midnight at night
// (follows the phone's setting). Green for money that's fine, amber for heads-ups, red only for problems.
export default {
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
