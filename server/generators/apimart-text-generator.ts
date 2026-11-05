import { APIMART_TEXT_MODELS } from '../../src/lib/apimart-models';
import { APIMartClient } from '../utils/apimart';
import { TextGenerator, type TextGenerateRequest, type TextGenerateResult } from './text-generator';

export class APIMartTextGenerator extends TextGenerator {
  constructor(private apiKey: string, private apiUrl?: string) { super(); }

  async generate(req: TextGenerateRequest): Promise<TextGenerateResult> {
    try {
      const model = req.modelId || 'gpt-6.1-sol';
      const config = APIMART_TEXT_MODELS.find((m) => m.modelId === model);
      if (req.refImagesBase64?.length && config?.options.supportsReferenceImages === false) {
        return { ok: false, error: `APIMart ${model} does not support reference images` };
      }
      const content = req.refImagesBase64?.length ? [
        ...req.refImagesBase64.map((data) => ({
          type: 'image_url', image_url: { url: data.startsWith('data:') ? data : `data:image/png;base64,${data}` },
        })),
        { type: 'text', text: req.prompt },
      ] : req.prompt;
      const messages = [
        ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
        { role: 'user', content },
      ];
      const json = await new APIMartClient(this.apiKey, req.apiUrl || this.apiUrl).json('chat/completions', {
        model, messages, stream: false,
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined && config?.options.temperatures?.length ? { temperature: req.temperature } : {}),
      });
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text) return { ok: false, error: 'APIMart returned no text content' };
      return { ok: true, text };
    } catch (e: any) {
      return { ok: false, error: e.message || 'APIMart text generation failed' };
    }
  }
}
