import { OpenAITextGenerator } from './openai-text-generator';

const DEFAULT_ALIBABACLOUD_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

/**
 * Alibaba Cloud DashScope (Qwen) text generator. DashScope's compatible-mode
 * endpoint is OpenAI-shaped, so we reuse the OpenAI generator with a
 * DashScope default base URL.
 */
export class AlibabacloudTextGenerator extends OpenAITextGenerator {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl ?? DEFAULT_ALIBABACLOUD_BASE_URL);
  }
}
