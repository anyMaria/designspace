/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same CSP the Tauri build enforces (src-tauri/tauri.conf.json, app.security.csp), so the
// browser dev build behaves like the desktop app. See docs/IMPLEMENTATION_PLAN.md §4.12.
//
// Deviation (logged in docs/DECISIONS.md): `pnpm dev`'s react-refresh preamble is an inline
// `<script>` that Vite injects itself, which the strict `script-src` blocks — plugin-react has
// no nonce/hash option for it. `pnpm preview` serves the production build's static output,
// which has no inline scripts, so it runs under the exact same policy the Tauri build enforces;
// only the dev server relaxes `script-src`. `connect-src` — which is what actually guarantees no
// background network access — stays identical in both.
function csp(allowInlineScripts: boolean): string {
  const scriptSrc = allowInlineScripts
    ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
    : "script-src 'self' 'wasm-unsafe-eval'";
  return (
    `default-src 'self'; ${scriptSrc}; worker-src 'self' blob:; ` +
    "style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: media: http://media.localhost; " +
    "media-src 'self' blob: media: http://media.localhost; font-src 'self' blob: data: media: http://media.localhost; " +
    "connect-src 'self' ipc: http://ipc.localhost media: http://media.localhost; " +
    "object-src 'none'; frame-src 'none'; base-uri 'none'"
  );
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    headers: {
      'Content-Security-Policy': csp(true),
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': csp(false),
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Tauri needs a fixed port and expects the client to ignore that port already being used.
  clearScreen: false,
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['node_modules', 'dist', 'tests/e2e', 'src-tauri', 'crates'],
  },
});
