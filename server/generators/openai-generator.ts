import OpenAI from 'openai';
import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

type OpenAIBackground = 'transparent' | 'opaque' | 'auto';
type OpenAIOutputFormat = 'png' | 'jpeg' | 'webp';
type OpenAIQuality = 'low' | 'medium' | 'high' | 'auto';

const LEGACY_OPENAI_IMAGE_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);
const GPT_IMAGE_2_TARGET_PIXELS: Record<'1K' | '2K' | '4K', number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  '4K': 3840 * 2160,
};
const GPT_IMAGE_2_MAX_EDGE = 3840;
const GPT_IMAGE_2_MIN_PIXELS = 655_360;
const GPT_IMAGE_2_MAX_PIXELS = 8_294_400;

export class OpenAIGenerator extends ImageGenerator {
  private apiKey: string;
  private client: OpenAI;
  private baseURL?: string;
  private defaultModel = 'gpt-image-1.5';

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseURL = this.normalizeBaseUrl(apiUrl);

    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
    });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const { prompt, modelId, refImagesBase64 } = req;
      const model = modelId || this.defaultModel;
      const client = this.getClient(req.apiUrl);
      const imageParams = this.buildImageParams(model, req);

      if (refImagesBase64 && refImagesBase64.length > 0) {
        const imageFiles = await Promise.all(
          refImagesBase64.map((base64, index) =>
            this.bufferToFile(Buffer.from(base64, 'base64'), `input_${index}.png`),
          ),
        );

        const response = await client.images.edit({
          model,
          image: imageFiles as any,
          prompt,
          n: 1,
          ...imageParams,
        } as any);

        return this.extractImage(response);
      }

      const response = await client.images.generate({
        model,
        prompt,
        n: 1,
        ...imageParams,
      } as any);

      return this.extractImage(response);
    } catch (e: any) {
      console.error('[OpenAIGenerator] Error:', e);
      return { ok: false, error: e.message || 'OpenAI generation failed' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string | undefined {
    let finalBaseUrl = apiUrl || undefined;
    if (
      finalBaseUrl &&
      !finalBaseUrl.includes('/v1') &&
      !finalBaseUrl.includes('openai.azure.com') &&
      !finalBaseUrl.includes('localhost') &&
      !finalBaseUrl.includes('127.0.0.1')
    ) {
      finalBaseUrl = `${finalBaseUrl.endsWith('/') ? finalBaseUrl.slice(0, -1) : finalBaseUrl}/v1`;
    }

    return finalBaseUrl;
  }

  private getClient(apiUrl?: string): OpenAI {
    const baseURL = this.normalizeBaseUrl(apiUrl);
    if (baseURL === this.baseURL) {
      return this.client;
    }

    return new OpenAI({
      apiKey: this.apiKey,
      baseURL,
    });
  }

  private buildImageParams(model: string, req: GenerateRequest): Record<string, unknown> {
    const outputFormat = this.resolveOutputFormat(req.format);
    const background = this.resolveBackground(model, req.background, outputFormat);
    const size = this.resolveSize(model, req.aspectRatio, req.imageSize);
    const quality = this.resolveQuality(req.imageSize);

    const params: Record<string, unknown> = {};
    if (size) params.size = size;
    if (quality) params.quality = quality;
    if (background) params.background = background;
    if (outputFormat) params.output_format = outputFormat;
    return params;
  }

  private resolveOutputFormat(format?: string): OpenAIOutputFormat | undefined {
    switch (format) {
      case 'png':
      case 'jpeg':
      case 'webp':
        return format;
      default:
        return undefined;
    }
  }

  private resolveQuality(value?: string): OpenAIQuality {
    switch ((value || '').toLowerCase()) {
      case 'low':
        return 'low';
      case 'medium':
      case 'standard':
        return 'medium';
      case 'high':
      case 'hd':
        return 'high';
      case 'auto':
        return 'auto';
      default:
        return 'auto';
    }
  }

  private resolveBackground(
    model: string,
    background?: string,
    outputFormat?: OpenAIOutputFormat,
  ): OpenAIBackground | undefined {
    switch ((background || '').toLowerCase()) {
      case '':
        return undefined;
      case 'auto':
        return 'auto';
      case 'opaque':
        return 'opaque';
      case 'transparent':
        if (this.isGptImage2Model(model)) {
          throw new Error('gpt-image-2 does not support transparent backgrounds');
        }
        if (outputFormat === 'jpeg') {
          throw new Error('Transparent background requires png or webp output format');
        }
        return 'transparent';
      default:
        return undefined;
    }
  }

  private resolveSize(model: string, aspectRatio?: string, imageSize?: string): string {
    const normalizedAspectRatio = (aspectRatio || '').trim();
    if (!normalizedAspectRatio) {
      return this.isGptImage2Model(model) ? 'auto' : '1024x1024';
    }

    if (normalizedAspectRatio === 'auto') {
      return 'auto';
    }

    if (this.isGptImage2Model(model)) {
      return this.resolveGptImage2Size(normalizedAspectRatio, imageSize);
    }

    return this.resolveLegacySize(normalizedAspectRatio);
  }

  private resolveLegacySize(aspectRatio: string): string {
    if (LEGACY_OPENAI_IMAGE_SIZES.has(aspectRatio)) {
      return aspectRatio;
    }

    const exactSize = this.parseExactSize(aspectRatio);
    if (exactSize) {
      if (exactSize.width === exactSize.height) return '1024x1024';
      return exactSize.width > exactSize.height ? '1536x1024' : '1024x1536';
    }

    const ratio = this.parseRatio(aspectRatio);
    if (ratio == null) {
      return '1024x1024';
    }

    if (Math.abs(ratio - 1) < 0.05) return '1024x1024';
    return ratio > 1 ? '1536x1024' : '1024x1536';
  }

  private resolveGptImage2Size(aspectRatio: string, imageSize?: string): string {
    const exactSize = this.parseExactSize(aspectRatio);
    if (exactSize) {
      this.assertValidGptImage2Size(exactSize.width, exactSize.height);
      return `${exactSize.width}x${exactSize.height}`;
    }

    const ratio = this.parseRatio(aspectRatio);
    if (ratio == null) {
      return 'auto';
    }

    const longToShort = Math.max(ratio, 1 / ratio);
    if (longToShort > 3) {
      throw new Error('gpt-image-2 supports aspect ratios up to 3:1');
    }

    const tier = this.normalizeResolutionTier(imageSize) || '1K';
    const targetPixels = GPT_IMAGE_2_TARGET_PIXELS[tier];

    let width: number;
    let height: number;
    if (ratio >= 1) {
      width = Math.sqrt(targetPixels * ratio);
      height = width / ratio;
    } else {
      height = Math.sqrt(targetPixels / ratio);
      width = height * ratio;
    }

    const scaleDown = Math.min(
      1,
      GPT_IMAGE_2_MAX_EDGE / width,
      GPT_IMAGE_2_MAX_EDGE / height,
      Math.sqrt(GPT_IMAGE_2_MAX_PIXELS / (width * height)),
    );
    width *= scaleDown;
    height *= scaleDown;

    let finalWidth = this.floorToMultipleOf16(width);
    let finalHeight = this.floorToMultipleOf16(height);

    if (finalWidth * finalHeight < GPT_IMAGE_2_MIN_PIXELS) {
      const scaleUp = Math.sqrt(GPT_IMAGE_2_MIN_PIXELS / Math.max(finalWidth * finalHeight, 1));
      finalWidth = this.ceilToMultipleOf16(Math.min(finalWidth * scaleUp, GPT_IMAGE_2_MAX_EDGE));
      finalHeight = this.ceilToMultipleOf16(Math.min(finalHeight * scaleUp, GPT_IMAGE_2_MAX_EDGE));
    }

    this.assertValidGptImage2Size(finalWidth, finalHeight);
    return `${finalWidth}x${finalHeight}`;
  }

  private normalizeResolutionTier(value?: string): '1K' | '2K' | '4K' | undefined {
    switch ((value || '').toUpperCase()) {
      case '1K':
        return '1K';
      case '2K':
        return '2K';
      case '4K':
        return '4K';
      default:
        return undefined;
    }
  }

  private parseExactSize(value: string): { width: number; height: number } | null {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return { width, height };
  }

  private parseRatio(value: string): number | null {
    const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return width / height;
  }

  private floorToMultipleOf16(value: number): number {
    return Math.max(16, Math.floor(value / 16) * 16);
  }

  private ceilToMultipleOf16(value: number): number {
    return Math.max(16, Math.ceil(value / 16) * 16);
  }

  private assertValidGptImage2Size(width: number, height: number): void {
    if (width > GPT_IMAGE_2_MAX_EDGE || height > GPT_IMAGE_2_MAX_EDGE) {
      throw new Error('gpt-image-2 max edge length is 3840px');
    }
    if (width % 16 !== 0 || height % 16 !== 0) {
      throw new Error('gpt-image-2 image sizes must use multiples of 16px');
    }

    const pixels = width * height;
    if (pixels < GPT_IMAGE_2_MIN_PIXELS || pixels > GPT_IMAGE_2_MAX_PIXELS) {
      throw new Error('gpt-image-2 total pixels must be between 655,360 and 8,294,400');
    }

    const longToShort = Math.max(width, height) / Math.min(width, height);
    if (longToShort > 3) {
      throw new Error('gpt-image-2 supports aspect ratios up to 3:1');
    }
  }

  private isGptImage2Model(model: string): boolean {
    return model.toLowerCase().startsWith('gpt-image-2');
  }

  private async bufferToFile(buffer: Buffer, filename: string): Promise<any> {
    return OpenAI.toFile(buffer, filename, { type: 'image/png' });
  }

  private async extractImage(response: OpenAI.Images.ImagesResponse): Promise<GenerateResult> {
    const data = response.data[0];
    if (!data) return { ok: false, error: 'No image data in OpenAI response' };

    if (data.b64_json) {
      return { ok: true, imageBytes: Buffer.from(data.b64_json, 'base64') };
    }

    if (data.url) {
      try {
        const res = await fetch(data.url);
        if (!res.ok) return { ok: false, error: `Failed to download image from OpenAI: ${res.statusText}` };
        const arrayBuffer = await res.arrayBuffer();
        return { ok: true, imageBytes: Buffer.from(arrayBuffer) };
      } catch (e: any) {
        return { ok: false, error: `Download failed: ${e.message}` };
      }
    }

    return { ok: false, error: 'No image URL or base64 data in OpenAI response' };
  }
}
