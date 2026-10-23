import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Set by `pnpm dev:online` (or manually). Behind a Cloudflare quick tunnel the
// app is served over https://<random>.trycloudflare.com, so the HMR socket has
// to use wss:// on port 443 instead of ws://<host>:5173.
const TUNNEL_MODE =
  process.env.VITE_TUNNEL === '1' || process.env.VITE_TUNNEL === 'true';

// Vite rejects requests whose Host header is not allowlisted ("Blocked
// request"). Quick tunnels use a new random hostname on every run, so allow
// the whole trycloudflare.com zone. Extra hosts (a named tunnel on your own
// domain, ngrok, ...) can be added as a comma-separated list.
const allowedHosts = [
  '.trycloudflare.com',
  // Railway-generated public domains.
  '.up.railway.app',
  ...(process.env.VITE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
];

// Where the API and Socket.IO live. The tunnel exposes only the Vite port and
// the proxy forwards these paths, which keeps the browser on a single origin.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

const proxy = {
  '/api': { target: apiTarget, changeOrigin: true },
  '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Fail loudly in tunnel mode instead of silently moving to 5174, which
    // would leave the tunnel pointing at the wrong port.
    strictPort: TUNNEL_MODE,
    allowedHosts,
    proxy,
    hmr: TUNNEL_MODE ? { protocol: 'wss', clientPort: 443 } : undefined,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
  preview: {
    port: 4173,
    allowedHosts,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
