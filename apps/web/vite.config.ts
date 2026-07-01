import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the Express server in dev so the frontend can use
    // same-origin "/api/..." paths (avoids CORS fiddling during development).
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
