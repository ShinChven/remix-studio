import { TextGenerator, TextGenerateRequest, TextGenerateResult } from './text-generator';

export class GoogleAITextGenerator extends TextGenerator {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://generativelanguage.googleapis.com';
  }

  async generate(req: TextGenerateRequest): Promise<TextGenerateResult> {
    const { prompt, systemPrompt, temperature = 0.7, maxTokens = 2048, refImagesBase64, modelId, apiUrl: reqApiUrl } = req;
    const model = modelId || 'gemini-3-flash-preview';

    let actualApiUrl: string;
    if (reqApiUrl) {
      actualApiUrl = reqApiUrl;
    } else {
      const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
      actualApiUrl = `${base}/v1beta/models/${model}:generateContent`;
    }

    const parts: object[] = [];
    // Add images first if present (multimodal)
    if (refImagesBase64 && refImagesBase64.length > 0) {
      for (const base64 of refImagesBase64) {
        parts.push({ inline_data: { mime_type: 'image/png', data: base64 } });
      }
    }
    parts.push({ text: prompt });

    const payload: any = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    if (model.includes('gemma-4')) {
      payload.thinkingConfig = { thinkingLevel: 'HIGH' };
    } else if (model.includes('gemini-3') || model.includes('gemini-2.5') || model.includes('thinking')) {
      payload.thinkingConfig = { includeThoughts: true };
    }

    try {
      const res = await fetch(`${actualApiUrl}${actualApiUrl.includes('?') ? '&' : '?'}key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // @ts-ignore — node-fetch timeout
        timeout: 120_000,
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
      if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        return { ok: false, error: `Finish reason: ${finishReason}` };
      }

      const textPart = candidate.content?.parts?.find((p: any) => p.text);
      if (!textPart) return { ok: false, error: 'No text in response' };

      return { ok: true, text: textPart.text };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }
}
