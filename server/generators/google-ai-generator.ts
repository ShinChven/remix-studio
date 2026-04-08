import { GoogleGenAI } from '@google/genai';
import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';

export class GoogleAIGenerator extends ImageGenerator {
  private apiKey: string;
  private apiUrl: string | undefined;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { prompt, aspectRatio = '2:3', imageSize = '1K', refImagesBase64, modelId, apiUrl: reqApiUrl } = req;
    const actualModelId = modelId || DEFAULT_MODEL;

    const customUrl = reqApiUrl || this.apiUrl;
    let baseUrl: string | undefined;
    if (customUrl) {
      try {
        baseUrl = new URL(customUrl).origin;
      } catch (e) {
        // Fallback or ignore
      }
    }

    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      ...(baseUrl ? { httpOptions: { baseUrl } } : {})
    });

    const contents: any[] = [{ text: prompt }];
    if (refImagesBase64 && refImagesBase64.length > 0) {
      for (const base64 of refImagesBase64) {
        contents.push({ inlineData: { mimeType: 'image/png', data: base64 } });
      }
    }

    try {
      const response = await ai.models.generateContent({
        model: actualModelId,
        contents,
        config: {
          responseModalities: ['IMAGE'],
          // @ts-ignore
          imageConfig: { aspectRatio, imageSize },
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate) return { ok: false, error: 'No candidates in response' };

      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return { ok: false, error: `Finish reason: ${finishReason}` };
      }

      const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData);
      if (!imagePart || !imagePart.inlineData) {
        return { ok: false, error: 'No image data in response' };
      }

      return { ok: true, imageBytes: Buffer.from(imagePart.inlineData.data, 'base64') };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }
}
