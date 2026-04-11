import { GoogleAIVideoGenerator } from './google-ai-video-generator';

const DEFAULT_BASE = 'https://aiplatform.googleapis.com';
const DEFAULT_MODEL = 'veo-3.1-generate-001';

/**
 * Vertex AI Veo video generator.
 *
 * Uses the aiplatform publisher-model endpoint shape. Same request body as
 * GoogleAI (instances[0].{prompt,image}, parameters.{aspectRatio,durationSeconds,resolution}),
 * just a different base path.
 *
 * Endpoint:
 *   POST {base}/v1/publishers/google/models/{model}:predictLongRunning
 *
 * Authenticates via an API key header (x-goog-api-key) — same pattern as the
 * existing VertexAIGenerator, which is what users configure in the Providers UI.
 */
export class VertexAIVideoGenerator extends GoogleAIVideoGenerator {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl);
    // Re-resolve base: default to aiplatform rather than generativelanguage.
    if (!apiUrl) {
      (this as any).base = DEFAULT_BASE;
    }
  }

  protected buildGenerateUrl(model: string): string {
    return `${(this as any).base}/v1/publishers/google/models/${model}:predictLongRunning`;
  }

  protected buildOperationUrl(operationName: string): string {
    const trimmed = operationName.startsWith('/') ? operationName.slice(1) : operationName;
    // Vertex LRO poll path is just /v1/{name}
    return `${(this as any).base}/v1/${trimmed}`;
  }

  // `generate()` and `checkStatus()` are inherited. The superclass reads
  // `modelId || 'veo-3.1-generate-preview'` — override the default via the
  // ModelConfig entries in PROVIDER_MODELS_MAP (we pass 'veo-3.1-generate-001').
  // We don't need to override here because callers always supply modelId.
  // However, if modelId is somehow omitted, we want to fall back to the Vertex default.
  async generate(req: any): Promise<any> {
    if (!req.modelId) req.modelId = DEFAULT_MODEL;
    return super.generate(req);
  }
}
