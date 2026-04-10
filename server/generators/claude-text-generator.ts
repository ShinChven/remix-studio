import Anthropic from '@anthropic-ai/sdk';
import { TextGenerator, TextGenerateRequest, TextGenerateResult } from './text-generator';

export class ClaudeTextGenerator extends TextGenerator {
  private client: Anthropic;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.client = new Anthropic({
      apiKey,
      ...(apiUrl ? { baseURL: apiUrl } : {}),
    });
  }

  async generate(req: TextGenerateRequest): Promise<TextGenerateResult> {
    try {
      const { prompt, systemPrompt, modelId, temperature = 0.7, maxTokens = 2048, refImagesBase64 } = req;
      const model = modelId || 'claude-sonnet-4-20250514';

      const contentParts: Anthropic.ContentBlockParam[] = [];

      // Add reference images for multimodal input
      if (refImagesBase64 && refImagesBase64.length > 0) {
        for (const base64 of refImagesBase64) {
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: base64 },
          });
        }
      }

      contentParts.push({ type: 'text', text: prompt });

      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: contentParts }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return { ok: false, error: 'No text content in response' };
      }

      return { ok: true, text: textBlock.text };
    } catch (e: any) {
      console.error('[ClaudeTextGenerator] Error:', e);
      return { ok: false, error: e.message || 'Claude text generation failed' };
    }
  }
}
