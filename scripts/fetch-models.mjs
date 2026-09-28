#!/usr/bin/env node
// Downloads the bundled CLIP model at build time (§4.10) — the app never fetches models at
// runtime. Run once locally (or in CI, cached by model id) before `pnpm tauri build`:
//   node scripts/fetch-models.mjs
//
// How this lands the files in exactly the shape the app expects at runtime, with zero manual
// path-juggling: transformers.js's Node file-system cache uses `{modelId}/{filename}` as its
// cache key (verified by reading its source, `utils/hub.js`'s `buildResourcePaths` — the
// `proposedCacheKey` for a `FileCache` on the default "main" revision is exactly
// `pathJoin(modelId, filename)`), which is the *same* relative shape the runtime's
// `env.localModelPath` convention expects (`pathJoin(env.localModelPath, modelId, filename)`).
// So pointing `env.cacheDir` at `src-tauri/resources/models` here downloads each file straight
// into the path the bundled app will later read it from via `media://models/...` — no separate
// "flatten the cache into place" step needed.
//
// huggingface.co is blocked in this cloud sandbox (see CLAUDE.md), so this script cannot be run
// to completion here — it's verified structurally (imports resolve, env config applies, and the
// expected network call is what actually fails) but the real download only happens where the
// owner or CI actually has internet: a local run, or the Windows installer workflow (see the
// comment in .github/workflows/windows-build.yml this script's presence resolves).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  env,
  CLIPVisionModelWithProjection,
  CLIPTextModelWithProjection,
  AutoProcessor,
  AutoTokenizer,
} from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '..', 'src-tauri', 'resources', 'models');

// Spike S7 (§8) also evaluates MobileCLIP variants; ViT-B/32 is the plan's baseline pick.
const MODEL_ID = process.env.DESIGNSPACE_MODEL_ID ?? 'Xenova/clip-vit-base-patch32';

env.allowRemoteModels = true;
env.allowLocalModels = false; // always fetch fresh from the Hub, never reuse a stale local copy
env.useBrowserCache = false;
env.useFSCache = true;
env.cacheDir = MODELS_DIR;

function progress(data) {
  if (data.status === 'progress') {
    const pct = data.total ? Math.round((data.loaded / data.total) * 100) : 0;
    process.stdout.write(`\r  ${data.file} — ${pct}%`.padEnd(80));
  } else if (data.status === 'done') {
    process.stdout.write('\n');
  }
}

async function main() {
  console.log(`Fetching ${MODEL_ID} into ${MODELS_DIR}`);
  console.log('Vision encoder + projection…');
  await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    quantized: true,
    progress_callback: progress,
  });
  console.log('Text encoder + projection…');
  await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
    quantized: true,
    progress_callback: progress,
  });
  console.log('Image processor…');
  await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: progress });
  console.log('Tokenizer…');
  await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progress });
  console.log(`Done — ${MODEL_ID} is ready under ${MODELS_DIR}.`);
}

main().catch((err) => {
  console.error('\nFailed to fetch the AI model:', err.message ?? err);
  console.error(
    'If this is a cloud sandbox session, huggingface.co is blocked — this only succeeds ' +
      'with real internet access (a local machine, or Windows CI). See docs/DECISIONS.md (S7).',
  );
  process.exitCode = 1;
});
