module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          900: "#0b1120",
          800: "#0f172a",
          700: "#1e293b",
          600: "#334155",
        },
      },
      boxShadow: {
        panel: "0 20px 60px rgba(15, 23, 42, 0.35)",
      },
    },
  },
  plugins: [],
};
