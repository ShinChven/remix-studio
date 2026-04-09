import OpenAI from 'openai';
import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

export class OpenAIGenerator extends ImageGenerator {
  private client: OpenAI;
  private defaultModel = 'gpt-image-1.5';

  constructor(apiKey: string, apiUrl?: string) {
    super();

    let finalBaseUrl = apiUrl || undefined;
    if (finalBaseUrl && !finalBaseUrl.includes('/v1') && !finalBaseUrl.includes('openai.azure.com') && !finalBaseUrl.includes('localhost') && !finalBaseUrl.includes('127.0.0.1')) {
      finalBaseUrl = `${finalBaseUrl.endsWith('/') ? finalBaseUrl.slice(0, -1) : finalBaseUrl}/v1`;
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: finalBaseUrl,
    });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const { prompt, modelId, aspectRatio, imageSize, background, refImagesBase64 } = req;
      const model = modelId || this.defaultModel;

      // Use native parameters directly
      const quality = (imageSize as any) || "medium";
      const size = (aspectRatio as any) || "1024x1024";

      if (refImagesBase64 && refImagesBase64.length > 0) {
        // Image-to-Image (Edit/Variation/Composition)
        // gpt-image-1.5 supports multiple reference images for composition
        const imageFiles = await Promise.all(
          refImagesBase64.map((base64, index) => 
            this.bufferToFile(Buffer.from(base64, 'base64'), `input_${index}.png`)
          )
        );
        
        const response = await this.client.images.edit({
          model,
          image: imageFiles as any, // Array of files supported by gpt-image-1.5
          prompt,
          n: 1,
          size: size as any,
          quality: quality as any,
          background: background as any,
        } as any); // Cast because SDK types might not match gpt-image-1.5 specifically

        return this.extractImage(response);
      } else {
        // Text-to-Image
        const response = await this.client.images.generate({
          model,
          prompt,
          n: 1,
          size: size as any,
          quality: quality as any,
          background: background as any,
        } as any);

        return this.extractImage(response);
      }
    } catch (e: any) {
      console.error('[OpenAIGenerator] Error:', e);
      return { ok: false, error: e.message || 'OpenAI generation failed' };
    }
  }

  /**
   * Node.js fetch/OpenAI SDK helper to convert Buffer to a File-like object
   */
  private async bufferToFile(buffer: Buffer, filename: string): Promise<any> {
    // The OpenAI SDK provides a utility to convert buffers/streams to File objects compatible with the API
    return OpenAI.toFile(buffer, filename, { type: 'image/png' });
  }

  private async extractImage(response: OpenAI.Images.ImagesResponse): Promise<GenerateResult> {
    const data = response.data[0];
    if (!data) return { ok: false, error: 'No image data in OpenAI response' };

    // Newer models (gpt-image-1, gpt-image-1.5) return b64_json by default
    if (data.b64_json) {
      return { ok: true, imageBytes: Buffer.from(data.b64_json, 'base64') };
    }

    // Fallback to URL if provided
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
