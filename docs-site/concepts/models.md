# Model Profiles

These are the model profiles currently **bundled** with the app. Each is attached to a [provider](/concepts/providers); you supply the API key for the providers you want to use. You can also define custom model aliases per provider.

::: tip
This matrix reflects the profiles shipped with the current release. Model availability for a given workflow also depends on which providers you have configured and what your keys can access.
:::

| Provider | Text Models | Image Models | Video Models | Audio Models |
| :--- | :--- | :--- | :--- | :--- |
| **Google AI** | `Gemini 3 Flash`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite`, `Gemma 4` | `nano banana 2` | `Veo 3.1`, `Veo 3.1 Lite` | `Gemini 3.1 Flash TTS`, `Gemini 2.5 Flash TTS`, `Gemini 2.5 Pro TTS`, `Lyria 3 Clip`, `Lyria 3 Pro` |
| **Vertex AI** | `Gemini 3 Flash`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite` | `nano banana 2` | - | `Gemini 3.1 Flash TTS`, `Gemini 2.5 Flash TTS`, `Gemini 2.5 Pro TTS`, `Lyria 3 Clip`, `Lyria 3 Pro` |
| **OpenAI** | `GPT-5.4`, `GPT-5.4 Mini`, `GPT-5.4 Nano` | `GPT Image 2`, `GPT Image 1.5`, `GPT Image 1 Mini` | `Sora 2`, `Sora 2 Pro` | - |
| **Grok** | `Grok 4.20`, `Grok 4.1 Fast` | `Grok Imagine`, `Grok Imagine Pro` | `Grok Imagine Video` | - |
| **Claude** | `Claude Opus 4.7`, `Claude Sonnet 4.6`, `Claude Haiku 4.5` | - | - | - |
| **Alibaba Cloud DashScope** | `Qwen3.6 Max`, `Qwen3.6 Plus`, `Qwen3.6 Flash`, `Qwen3.6 VL Max`, `Qwen3.6 VL Plus` | - | - | - |
| **RunningHub** | - | `nano banana 2`, `Qwen Image 2 Pro` | `Seedance 2.0 Global`, `Seedance 2.0 Global Multimodal Reference` | - |
| **BytePlus** | - | `Seedream 5.0 Lite`, `Seedream 4.5`, `Seedream 4.0`, `Seedream 3.0 T2I`, `Seededit 3.0 I2I` | `Seedance 1.5 Pro`, `Seedance 1.0 Pro`, `Seedance 1.0 Pro Fast` | - |
| **Kling AI** | - | `Kling Image O1`, `Kling V3 Omni`, `Kling V3 Standard`, `Kling V2.1 Standard`, `Kling V2 Standard`, `Kling V1.5 Standard`, `Kling V1 Standard` | `Kling Video O1`, `Kling V3 Omni Video` | - |
| **Black Forest Labs** | - | `Flux 2 Max`, `Flux 2 Pro (Preview)`, `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Klein 9B (Preview)`, `Flux 2 Klein 9B`, `Flux 2 Klein 4B` | - | - |
| **Replicate** | - | `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Max` | `Seedance 2.0 Fast`, `Seedance 2.0` | - |

## Choosing Models

- Models are selected per provider as saved **model profiles**, so jobs reference a profile instead of repeating raw model settings.
- A project sets a default provider; individual jobs can override the provider (and therefore the model). See [Providers & Models](/concepts/providers).
- The assistant and MCP clients can list usable model/provider pairings via `list_available_models`.
