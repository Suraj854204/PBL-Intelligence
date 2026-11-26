import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000", "/evidence": "http://localhost:4000" } },
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
  test: { include: ["tests/**/*.test.ts"] },
} as any);
