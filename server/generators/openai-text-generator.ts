import OpenAI from 'openai';
import { TextGenerator, TextGenerateRequest, TextGenerateResult } from './text-generator';

export class OpenAITextGenerator extends TextGenerator {
  private client: OpenAI;

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

  async generate(req: TextGenerateRequest): Promise<TextGenerateResult> {
    try {
      const { prompt, systemPrompt, modelId, temperature = 0.7, maxTokens = 2048, refImagesBase64 } = req;
      const model = modelId || 'gpt-4.1';

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      // Build user message content (text + optional images for multimodal)
      if (refImagesBase64 && refImagesBase64.length > 0) {
        const content: OpenAI.Chat.ChatCompletionContentPart[] = [];
        for (const base64 of refImagesBase64) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${base64}` },
          });
        }
        content.push({ type: 'text', text: prompt });
        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const choice = response.choices[0];
      if (!choice) return { ok: false, error: 'No choices in response' };

      const text = choice.message.content;
      if (!text) return { ok: false, error: 'No text content in response' };

      return { ok: true, text };
    } catch (e: any) {
      console.error('[OpenAITextGenerator] Error:', e);
      return { ok: false, error: e.message || 'OpenAI text generation failed' };
    }
  }
}
