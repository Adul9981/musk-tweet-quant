/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // SAP / Apple style design tokens (highest visual principle)
        'apple-bg': '#f5f5f7',
        'apple-card': '#ffffff',
        'apple-ink': '#1d1d1f',
        'apple-sub': '#6e6e73',
        'apple-line': '#e5e5ea',
        'apple-accent': 'var(--apple-accent)',
        'apple-accent-strong': 'var(--apple-accent-strong)',
        'apple-accent-soft': 'var(--apple-accent-soft)',
        'apple-accent-line': 'var(--apple-accent-line)',
        'apple-green': '#1e8e3e',
        'apple-amber': '#b45309',
        'apple-red': '#c92a2a',
        'neon-green': '#00FF88',
        'neon-pink': '#FF0080',
        'neon-cyan': '#00FFFF',
        'neon-yellow': '#FFE500',
        'dark-bg': '#0A0A0F',
        'card-bg': '#12121A',
      },
    },
  },
  plugins: [],
}
