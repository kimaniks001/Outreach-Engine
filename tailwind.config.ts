import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#f6f2e9",
          raised: "#fffdf8",
          soft: "#efe9db",
          border: "#dcd6c8",
          inverse: "#18452c",
        },
        ink: {
          DEFAULT: "#1c2620",
          muted: "#55605a",
          faint: "#8a938c",
          inverse: "#f8f4eb",
        },
        brand: {
          DEFAULT: "#1f6b3a",
          muted: "#164a29",
          bright: "#3fa268",
          soft: "#cadfcf",
        },
        accent: {
          DEFAULT: "#d9722e",
          soft: "#f0c8a6",
        },
        status: {
          good: "#1f7a45",
          warn: "#b76625",
          bad: "#b94838",
          neutral: "#718078",
        },
      },
      fontFamily: {
        sans: ["Instrument Sans", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        quiet: "0 18px 50px rgba(28, 38, 32, 0.08)",
        float: "0 10px 30px rgba(28, 38, 32, 0.12)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
