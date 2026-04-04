import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

const DEFAULT_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent';

export class GoogleAIGenerator extends ImageGenerator {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || DEFAULT_API_URL;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { prompt, aspectRatio = '2:3', imageSize = '1K', refImagesBase64 } = req;

    const parts: object[] = [{ text: prompt }];
    if (refImagesBase64 && refImagesBase64.length > 0) {
      for (const base64 of refImagesBase64) {
        parts.push({ inline_data: { mime_type: 'image/png', data: base64 } });
      }
    }

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio, imageSize },
      },
    };

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // @ts-ignore — node-fetch timeout
        timeout: 180_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result: any = await res.json();

      if (result.promptFeedback?.blockReason) {
        return { ok: false, error: `Prompt blocked: ${result.promptFeedback.blockReason}` };
      }

      const candidate = result.candidates?.[0];
      if (!candidate) return { ok: false, error: 'No candidates in response' };

      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return { ok: false, error: `Finish reason: ${finishReason}` };
      }

      const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData);
      if (!imagePart) return { ok: false, error: 'No image data in response' };

      return { ok: true, imageBytes: Buffer.from(imagePart.inlineData.data, 'base64') };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }
}
