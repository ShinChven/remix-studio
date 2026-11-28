import { GoogleAIAudioGenerator } from './google-ai-audio-generator';
import { VertexProjectClient, vertexProjectRoot } from '../utils/vertex-project';

export class VertexAIAudioGenerator extends GoogleAIAudioGenerator {
  private readonly vertex?: VertexProjectClient;

  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl);
    const root = vertexProjectRoot(apiUrl);
    if (root) this.vertex = new VertexProjectClient(apiKey, root);
  }

  protected override buildGenerateContentUrl(model: string, reqApiUrl?: string): string {
    return reqApiUrl || this.vertex?.modelUrl(model, 'generateContent') || super.buildGenerateContentUrl(model);
  }

  protected override async postGenerateContent(url: string, payload: unknown): Promise<any> {
    if (!this.vertex) return super.postGenerateContent(url, payload);
    const response = await this.vertex.post(url, payload, 180_000);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  }
}
