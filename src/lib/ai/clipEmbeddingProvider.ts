// The real embedding provider (§4.10) — worker-only (`ai.worker.ts`), never imported from the
// main thread: loading `@huggingface/transformers` is expensive and this app's env is configured
// for offline, local-only loading before this module ever calls `.from_pretrained()` (see
// `configureTransformersEnv` in `src/lib/ai/env.ts`, called by the worker at startup).

import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  type PreTrainedTokenizer,
  type Processor,
} from '@huggingface/transformers';
import { l2Normalize, type EmbeddingProvider } from './embeddingProvider';

// Spike S7 (§8) also evaluates MobileCLIP variants; ViT-B/32 is the plan's baseline pick — must
// match `scripts/fetch-models.mjs`'s `MODEL_ID` (both default to the same model, and both can be
// overridden together via `DESIGNSPACE_MODEL_ID` if a future spike picks a different one).
const MODEL_ID = 'Xenova/clip-vit-base-patch32';

type VisionModel = Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
type TextModel = Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>>;

export class ClipEmbeddingProvider implements EmbeddingProvider {
  readonly dims = 512;

  private visionModel: VisionModel | null = null;
  private processor: Processor | null = null;
  private textModel: TextModel | null = null;
  private tokenizer: PreTrainedTokenizer | null = null;

  // `dtype: 'q8'` asks for the `*_quantized.onnx` files that `scripts/fetch-models.mjs` bundles
  // (the only ones in the installer); `wasm` is the only device this app runs on (§4.10).
  private async ensureVision(): Promise<{ visionModel: VisionModel; processor: Processor }> {
    this.visionModel ??= await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
    });
    this.processor ??= await AutoProcessor.from_pretrained(MODEL_ID);
    return { visionModel: this.visionModel, processor: this.processor };
  }

  private async ensureText(): Promise<{ textModel: TextModel; tokenizer: PreTrainedTokenizer }> {
    this.textModel ??= await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
    });
    this.tokenizer ??= await AutoTokenizer.from_pretrained(MODEL_ID);
    return { textModel: this.textModel, tokenizer: this.tokenizer };
  }

  async embedImage(bytes: ArrayBuffer, mime: string): Promise<Float32Array> {
    const { visionModel, processor } = await this.ensureVision();
    const image = await RawImage.fromBlob(new Blob([bytes], { type: mime }));
    const inputs = (await processor(image)) as unknown;
    const output = (await visionModel(inputs)) as { image_embeds: { data: Float32Array } };
    return l2Normalize(Float32Array.from(output.image_embeds.data));
  }

  async embedText(text: string): Promise<Float32Array> {
    const { textModel, tokenizer } = await this.ensureText();
    const inputs = tokenizer([text], { padding: true, truncation: true });
    const output = (await textModel(inputs)) as { text_embeds: { data: Float32Array } };
    return l2Normalize(Float32Array.from(output.text_embeds.data));
  }

  dispose(): void {
    this.visionModel = null;
    this.processor = null;
    this.textModel = null;
    this.tokenizer = null;
  }
}
