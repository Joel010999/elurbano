import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        urbano: {
          red: '#e53935',
          dark: '#c62828',
          light: '#ef5350',
        },
      },
    },
  },
  plugins: [],
};

export default config;
