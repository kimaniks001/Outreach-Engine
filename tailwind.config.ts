import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b1220",
          raised: "#111a2c",
          border: "#22304a",
        },
        ink: {
          DEFAULT: "#e6ebf5",
          muted: "#93a1bd",
          faint: "#5f6d8a",
        },
        brand: {
          DEFAULT: "#3b82f6",
          muted: "#1d4ed8",
        },
        status: {
          good: "#22c55e",
          warn: "#eab308",
          bad: "#ef4444",
          neutral: "#64748b",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
