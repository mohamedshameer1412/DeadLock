/** Colors come from CSS variables (app/globals.css) so light and dark share one set of class names. */
const v = (name) => `var(--${name})`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: v("background"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        border: v("border"),
        foreground: v("foreground"),
        muted: v("muted"),
        primary: { DEFAULT: v("primary"), hover: v("primary-hover"), foreground: v("primary-foreground") },
        link: v("link"),
        accent: v("accent"),
        ring: v("ring"),
        success: { DEFAULT: v("success"), bg: v("success-bg") },
        warning: { DEFAULT: v("warning"), bg: v("warning-bg") },
        danger: { DEFAULT: v("danger"), bg: v("danger-bg") },
      },
      boxShadow: {
        sm: "0 2px 8px -2px rgba(2, 145, 224, 0.15)",
        md: "0 4px 16px -4px rgba(2, 145, 224, 0.2), 0 2px 6px -2px rgba(2, 145, 224, 0.1)",
        lg: "0 10px 24px -4px rgba(2, 145, 224, 0.25)",
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      fontFamily: { sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
