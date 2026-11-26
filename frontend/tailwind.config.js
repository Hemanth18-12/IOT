/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        sr: {
          bg: '#101010',
          sidebar: '#141414',
          card: '#1C1C1C',
          elevated: '#242424',
          yellow: '#FACC15',
          'yellow-hover': '#EAB308',
          text: '#F5F5F5',
          muted: '#A3A3A3',
          border: '#303030',
          success: '#22C55E',
          error: '#EF4444',
          warning: '#F59E0B',
        },
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
