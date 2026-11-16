import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/v1": "http://127.0.0.1:8010",
      "/media": "http://127.0.0.1:8010",
      "/health": "http://127.0.0.1:8010",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
