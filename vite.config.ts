import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// SaaS platform administration console — no build-time API keys are injected
// (the AI/Gemini define of the combined app served the removed center
// student-import feature). PubNub client keys are optional and read from the
// standard Vite env files below.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Allow the sandbox preview proxy host so the live preview loads.
    allowedHosts: true,
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
    proxy: {
      // Local dev: run `npx wrangler pages dev` (default port 8788) alongside `npm run dev`
      '/api': 'http://localhost:8788',
    },
  },
});
