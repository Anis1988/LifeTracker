// "Liquid Glass 2": a soft teal/violet/amber glow behind frosted-glass cards; pearl in light mode, deep night in dark
// (follows the phone's setting). Colour tokens live in src/index.css. Green for fine, amber for heads-ups, red only for problems.
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
