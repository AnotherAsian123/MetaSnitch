/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // STYLE.md palette
        black: "#08090A",
        carbon: "#222823",
        charcoal: "#575A5E",
        ash: "#A7A2A9",
        snow: "#F4F7F5",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.22s cubic-bezier(0.22,1,0.36,1)",
        "slide-up": "slide-up 0.25s cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};
