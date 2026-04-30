import { OpenAIChatProvider } from './openai';

const DEFAULT_ALIBABACLOUD_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

/**
 * Alibaba Cloud DashScope (Qwen) chat adapter. DashScope's compatible-mode
 * endpoint speaks the OpenAI Chat Completions protocol, so we point the
 * OpenAI adapter at the international DashScope base URL by default. Users
 * can override the URL when registering the provider to target other regions
 * (Beijing / Hong Kong / Virginia / Frankfurt).
 */
export class AlibabacloudChatProvider extends OpenAIChatProvider {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl ?? DEFAULT_ALIBABACLOUD_BASE_URL);
  }
}
