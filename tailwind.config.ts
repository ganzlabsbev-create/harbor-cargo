import type { Config } from "tailwindcss";

// Color tokens pulled from the harbor-cargo logo:
// deep navy hull, orange + blue wave bands, off-white mark.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          bg: "#040D1A",
          surface: "#0A1930",
          surface2: "#101F3B",
          border: "#1C2E4D",
        },
        ink: {
          DEFAULT: "#F5F7FA",
          dim: "#B7C2D6",
          faint: "#7C8AA5",
        },
        harbor: {
          navy: "#052447",
          navyDeep: "#02051E",
          orange: "#FA6522",
          orangeDim: "#C94F19",
          blue: "#0560D0",
          blueDeep: "#003B85",
          mist: "#E8EDF4",
        },
        accent: {
          orange: "#FA6522",
          blue: "#0560D0",
          red: "#EF4444",
          green: "#22C55E",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "var(--font-body-th)", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body-th)", "sans-serif"],
      },
      boxShadow: {
        "glow-orange": "0 0 0 1px rgba(250,101,34,0.35), 0 8px 24px -8px rgba(250,101,34,0.45)",
        "glow-blue": "0 0 0 1px rgba(5,96,208,0.35), 0 8px 24px -8px rgba(5,96,208,0.45)",
        "glow-green": "0 0 0 1px rgba(34,197,94,0.35), 0 8px 24px -8px rgba(34,197,94,0.45)",
        "glow-red": "0 0 0 1px rgba(239,68,68,0.35), 0 8px 24px -8px rgba(239,68,68,0.45)",
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "harbor-hull":
          "linear-gradient(180deg, #0A1930 0%, #071429 60%, #040D1A 100%)",
        "harbor-waves":
          "linear-gradient(90deg, #FA6522 0%, #0560D0 55%, #003B85 100%)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.375rem",
      },
    },
  },
  plugins: [],
};
export default config;
