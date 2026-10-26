import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  server: { port: 5178, strictPort: true },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { excel: ["xlsx"], charts: ["chart.js"] } },
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
