/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6", // Vibrant Blue
        "background-light": "#f8fafc",
        "background-dark": "#020617", // Deep Black-Blue
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        serif: ["Playfair Display", "serif"],
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        'xl': '1rem',
        '2xl': '1.5rem',
        'full': '9999px',
      },
    },
  },
  plugins: [],
}
