#!/usr/bin/env node
// Copies ONNX Runtime Web's WASM binary + loader into public/ort/ (§4.10), so the app never
// fetches them from a CDN at runtime (the default behavior transformers.js falls back to) —
// `env.backends.onnx.wasm.wasmPaths` (src/lib/ai/env.ts) points at this local copy instead.
//
// Only the `.asyncify` variant: reading transformers.js's own default-path logic
// (backends/onnx.js), that's the one selected everywhere except Safari < 26 without WebGPU —
// WebView2 is always Chromium, never Safari, so that's the only variant this app ever needs.
// Re-run whenever `onnxruntime-web` (a transitive dependency of `@huggingface/transformers`)
// is upgraded, in case the file names change with it.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// `onnxruntime-web` is a transitive dependency (of `@huggingface/transformers`), not a direct
// one, so resolve it relative to that package rather than this script — via the `webgpu` entry
// point transformers.js itself imports (`backends/onnx.js`), since the package's own
// `package.json` isn't in its `exports` map and can't be resolved directly.
const TRANSFORMERS_ENTRY = require.resolve('@huggingface/transformers');
const ORT_WEBGPU_ENTRY = require.resolve('onnxruntime-web/webgpu', { paths: [TRANSFORMERS_ENTRY] });
const ORT_DIST = path.dirname(ORT_WEBGPU_ENTRY);
const DEST = path.join(__dirname, '..', 'public', 'ort');

const FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

fs.mkdirSync(DEST, { recursive: true });
for (const file of FILES) {
  const from = path.join(ORT_DIST, file);
  const to = path.join(DEST, file);
  // Skip a same-size copy that's already there — this runs on every `pnpm build`/`pnpm dev`
  // (via `pre*` hooks) and the .wasm file alone is ~25 MB, not worth re-copying every time.
  if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) {
    console.log(`public/ort/${file} is already up to date`);
    continue;
  }
  fs.copyFileSync(from, to);
  const { size } = fs.statSync(to);
  console.log(`Copied ${file} (${(size / 1024 / 1024).toFixed(1)} MB) -> public/ort/`);
}
