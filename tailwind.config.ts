import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base surfaces — deep ink, not a stock #111/#0B0B0B black
        ink: {
          950: "#0F1320",
          900: "#161B2C",
          800: "#1E2438",
          700: "#2A314A",
        },
        // Saffron/marigold accent — primary action + highlight
        saffron: {
          400: "#F7B84B",
          500: "#F5A524",
          600: "#D98A0F",
        },
        // Muted teal — secondary data-viz colour, growth/positive signal
        teal: {
          400: "#5EEAD4",
          500: "#2DD4BF",
          600: "#14B8A6",
        },
        // Platform reference colours, used only for small data indicators
        platform: {
          youtube: "#FF3B30",
          instagram: "#D6339A",
        },
        border: "#2A314A",
        muted: "#8A93AD",
      },
      fontFamily: {
        display: ["var(--font-lexend)", "sans-serif"],
        sans: ["var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
