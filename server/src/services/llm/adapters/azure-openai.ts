import { OpenAIAdapter } from './openai';

/** Default Azure OpenAI REST API version. Override with the AZURE_OPENAI_API_VERSION env var. */
const DEFAULT_AZURE_API_VERSION = '2024-10-21';

/**
 * Azure OpenAI (native) adapter.
 *
 * Azure hosts OpenAI models behind a deployment-based URL and authenticates with an
 * `api-key` header instead of a bearer token, but the request/response bodies are
 * OpenAI-shaped — so this reuses {@link OpenAIAdapter} and only overrides the URL and
 * headers.
 *
 * - baseUrl: `https://<resource>.openai.azure.com`
 * - URL: `${baseUrl}/openai/deployments/${modelId}/chat/completions?api-version=<ver>`
 *   where the model's `modelId` is the Azure deployment name.
 */
export class AzureOpenAIAdapter extends OpenAIAdapter {
  protected readonly label = 'Azure OpenAI';
  private readonly apiVersion: string;

  constructor(
    providerId: string,
    baseUrl: string,
    apiVersion: string = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_AZURE_API_VERSION,
  ) {
    // Strip trailing slashes so the deployment path joins cleanly.
    super(providerId, baseUrl.replace(/\/+$/, ''));
    this.apiVersion = apiVersion;
  }

  protected buildChatUrl(model: string): string {
    return `${this.baseUrl}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`;
  }

  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };
  }
}
