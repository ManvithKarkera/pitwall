// Preview local frontend changes against the live PitWall API, before deploying:
//   npm run dev:live   ->  http://localhost:5174
// Pages reload as files change. Only the frontend is local; data, sign-in and
// comparisons come from the deployed site, so treat it like production.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config.js";

const live = { target: "https://d1ydawpo9bsoc7.cloudfront.net", changeOrigin: true, secure: true };

export default mergeConfig(base, defineConfig({
  server: { port: 5174, strictPort: true, proxy: { "/api": live, "/reports": live } },
}));
