/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#FAF7F1",
          sunken: "#F3EEE5",
          card: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#1C1917",
          soft: "#57534E",
          faint: "#A8A29E",
        },
        pasture: {
          50: "#F0F5EF",
          100: "#DCE8DA",
          200: "#B7D1B4",
          500: "#3E6B42",
          600: "#2F5233",
          700: "#264229",
          900: "#18291B",
        },
        review: {
          100: "#FBEED3",
          500: "#B45309",
          700: "#92400E",
        },
        danger: {
          100: "#FBE4E4",
          600: "#B91C1C",
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
