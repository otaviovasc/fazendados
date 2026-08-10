/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          sunken: "rgb(var(--paper-sunken) / <alpha-value>)",
          card: "rgb(var(--paper-card) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        pasture: {
          50: "rgb(var(--pasture-50) / <alpha-value>)",
          100: "rgb(var(--pasture-100) / <alpha-value>)",
          200: "rgb(var(--pasture-200) / <alpha-value>)",
          500: "rgb(var(--pasture-500) / <alpha-value>)",
          600: "rgb(var(--pasture-600) / <alpha-value>)",
          700: "rgb(var(--pasture-700) / <alpha-value>)",
          900: "rgb(var(--pasture-900) / <alpha-value>)",
        },
        review: {
          100: "rgb(var(--review-100) / <alpha-value>)",
          500: "rgb(var(--review-500) / <alpha-value>)",
          700: "rgb(var(--review-700) / <alpha-value>)",
        },
        danger: {
          100: "rgb(var(--danger-100) / <alpha-value>)",
          600: "rgb(var(--danger-600) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "72rem",
      },
    },
  },
  plugins: [],
};
