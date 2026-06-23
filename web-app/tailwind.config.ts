import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        panel: "#f7f8fb",
        line: "#d8dee9",
        lazada: "#1f67d2",
        shopee: "#e05a2a"
      }
    }
  },
  plugins: []
};

export default config;
