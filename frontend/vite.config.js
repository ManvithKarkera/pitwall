import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In production CloudFront routes /api/* to EC2 and /reports/* to S3.
// Locally the FastAPI dev server answers both.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/reports": "http://localhost:8000",
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
