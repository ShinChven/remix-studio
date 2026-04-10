import { TextGenerator, TextGenerateRequest, TextGenerateResult } from './text-generator';

const DEFAULT_BASE_URL = 'https://api.x.ai/v1';

export class GrokTextGenerator extends TextGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = (apiUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async generate(req: TextGenerateRequest): Promise<TextGenerateResult> {
    try {
      const { prompt, systemPrompt, modelId, temperature = 0.7, maxTokens = 2048, refImagesBase64 } = req;
      const model = modelId || 'grok-4.20-0309-non-reasoning';

      const messages: Array<{ role: string; content: any }> = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      // Build user message content (text + optional images for multimodal)
      if (refImagesBase64 && refImagesBase64.length > 0) {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
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

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        // @ts-ignore — node-fetch timeout
        timeout: 120_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];
      if (!choice) return { ok: false, error: 'No choices in response' };

      const text = choice.message?.content;
      if (!text) return { ok: false, error: 'No text content in response' };

      return { ok: true, text };
    } catch (e: any) {
      console.error('[GrokTextGenerator] Error:', e);
      return { ok: false, error: e.message || 'Grok text generation failed' };
    }
  }
}
