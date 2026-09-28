/** The `embeddings.model` column's key (§4.10) — shared by `aiQueue.ts` (writes) and
 * `embeddingsStore.ts` (reads) without those two modules importing each other. Bump if the model
 * changes (a different model's vectors aren't comparable to the old ones); kept short and
 * version-free so swapping quantization or fetch details doesn't orphan existing vectors — only
 * an actual model swap should. Must match `scripts/fetch-models.mjs`'s `MODEL_ID` in spirit, not
 * literally. */
export const CLIP_MODEL = 'clip-vit-base-patch32';
