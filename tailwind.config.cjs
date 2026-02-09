module.exports = {
  content: [
    "./index.html",
    "./*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./ai/**/*.{ts,tsx}"
  ],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        "brand-main": "#6163a5",
        "brand-hover": "#60407f",
        "brand-light": "#f9f5ff",
        "brand-border": "#e8def6",
        "dark-bg": "#20122E",
        "dark-surface": "#3f2258",
        "dark-text": "#BB95DD",
        "dark-sec-border": "#613f7f",
        "dark-sec-bg": "rgba(63,34,88,0.5)"
      }
    }
  },
  plugins: []
};
