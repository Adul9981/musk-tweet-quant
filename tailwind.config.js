/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
