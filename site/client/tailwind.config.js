/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '480px',
      },
      colors: {
        anikoto: {
          bg: '#0b1622',
          surface: '#142030',
          'surface-hover': '#1c2d44',
          panel: '#20334d',
          border: '#1a2a3e',
          'border-bright': '#2a3e59',
          cyan: '#209cee',
          'cyan-hover': '#3caedc',
          badge: '#26a3d6',
          text: '#a0b1c5',
          'text-white': '#ffffff',
          'text-muted': '#515f75',
        },
        brand: {
          500: '#209cee',
          600: '#1b86ce',
          accent: '#00b4d8',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'Archivo', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        archivo: ['Archivo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
