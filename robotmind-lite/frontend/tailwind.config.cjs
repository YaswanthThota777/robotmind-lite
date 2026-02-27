module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel:     "0 20px 60px rgba(15, 23, 42, 0.35)",
        "teal-sm": "0 0 12px rgba(20,184,166,.2)",
        "teal-md": "0 0 20px rgba(20,184,166,.3)",
        "teal-lg": "0 0 36px rgba(20,184,166,.35)",
      },
      transitionDuration: {
        200: "200ms",
      },
    },
  },
  plugins: [],
};

