import { APIMART_TEXT_MODELS } from '../../../src/lib/apimart-models';
import { apimartBaseUrl } from '../../utils/apimart';
import { OpenAIChatProvider } from './openai';
import type { ChatRequest, ChatResponse } from './types';

/** APIMart's unified Chat Completions endpoint also handles assistant tools. */
export class APIMartChatProvider extends OpenAIChatProvider {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apimartBaseUrl(apiUrl));
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const model = APIMART_TEXT_MODELS.find((m) => m.modelId === req.modelId);
    if (model?.options.supportsReferenceImages === false && req.messages.some((m) => m.role === 'user' && m.images?.length)) {
      throw new Error(`APIMart ${req.modelId} does not support reference images`);
    }
    return super.chat({ ...req, temperature: model?.options.temperatures?.length ? req.temperature : undefined });
  }
}
