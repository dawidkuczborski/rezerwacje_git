/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class", // ✅ klasyczny dark mode
  theme: {
    extend: {
      colors: {
        // 🟣 Nadpisujemy Tailwindowe gray'e
        gray: {
          50:  "#f9f9f9",
          100: "#f2f2f2",
          200: "#dbdbdb",
          300: "#bfbfbf",
          400: "#9a9a9a",
          500: "#777777",
          600: "#555555",
          700: "#3d3c3c",  // ramki slotów
          800: "#1c1c1c",  // dolne panele, boxy
          850: "#0f0f10",  // twoje główne tło (custom)
          900: "#0d0d0d",  // kalendarz, głębokie tło
        },

        // 🟠 Kolor akcentu (pomarańcz)
        orange: {
          500: "#E57B2C",  // główny akcent
          600: "#d46f27",
        },

        // 🖤 (opcjonalnie) podstawowe tła strony
        background: {
          dark: "#0f0f10",
          surface: "#1c1c1c",
        },
      },
    },
  },
  plugins: [],
};
