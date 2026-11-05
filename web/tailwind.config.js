/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rome: {
          50: "#fbf8f5",
          100: "#f6efe8",
          200: "#eddccf",
          500: "#b45309",
          600: "#92400e",
          900: "#451a03",
        },
      },
    },
  },
  plugins: [],
};
