# Model Profiles

These are the model profiles currently **bundled** with the app. Each is attached to a [provider](/concepts/providers); you supply the API key for the providers you want to use. You can also define custom model aliases per provider.

::: tip
This matrix reflects the profiles shipped with the current release. Model availability for a given workflow also depends on which providers you have configured and what your keys can access.
:::

## 1. High-Level Provider Summary

| Provider | Text | Image | Video | Audio |
| :--- | :---: | :---: | :---: | :---: |
| **Google AI** | ✅ | ✅ | ✅ | ✅ |
| **Vertex AI** | ✅ | ✅ | - | ✅ |
| **OpenAI** | ✅ | ✅ | ✅ | - |
| **Grok** | ✅ | ✅ | ✅ | - |
| **Claude** | ✅ | - | - | - |
| **Alibaba Cloud DashScope** | ✅ | - | - | - |
| **RunningHub** | - | ✅ | ✅ | - |
| **BytePlus** | - | ✅ | ✅ | - |
| **Kling AI** | - | ✅ | ✅ | - |
| **Black Forest Labs** | - | ✅ | - | - |
| **Replicate** | - | ✅ | ✅ | - |

## 2. Text Generation (LLMs)

| Provider | Supported Models |
| :--- | :--- |
| **Google AI** | `Gemini 3.6 Flash`, `Gemini 3.5 Flash`, `Gemini 3.5 Flash Lite`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite`, `Gemma 4` |
| **Vertex AI** | `Gemini 3.6 Flash`, `Gemini 3.5 Flash`, `Gemini 3.5 Flash Lite`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite` |
| **OpenAI** | `GPT-5.6`, `GPT-5.6 Terra`, `GPT-5.6 Luna`, `GPT-5.5`, `GPT-5.4`, `GPT-5.4 Mini`, `GPT-5.4 Nano` |
| **Grok** | `Grok 4.5`, `Grok 4.20`, `Grok 4.3`, `Grok 4.1 Fast` |
| **Claude** | `Claude Sonnet 5`, `Claude Opus 4.7`, `Claude Sonnet 4.6`, `Claude Haiku 4.5` |
| **Alibaba Cloud DashScope** | `Qwen3.6 Max`, `Qwen3.6 Plus`, `Qwen3.6 Flash`, `Qwen3.6 VL Max`, `Qwen3.6 VL Plus` |

## 3. Image Generation

| Provider | Supported Models |
| :--- | :--- |
| **Google AI** | `nano banana 2` |
| **Vertex AI** | `nano banana 2` |
| **OpenAI** | `GPT Image 2`, `GPT Image 1.5`, `GPT Image 1 Mini` |
| **Grok** | `Grok Imagine`, `Grok Imagine Pro` |
| **RunningHub** | `nano banana 2`, `GPT Image 2`, `Qwen Image 2 Pro`, `Grok Imagine Pro` |
| **BytePlus** | `Seedream 5.0 Lite`, `Seedream 4.5`, `Seedream 4.0`, `Seedream 3.0 T2I`, `Seededit 3.0 I2I` |
| **Kling AI** | `Kling Image O1`, `Kling V3 Omni`, `Kling V3 Standard`, `Kling V2.1 Standard`, `Kling V2 Standard`, `Kling V1.5 Standard`, `Kling V1 Standard` |
| **Black Forest Labs** | `Flux 2 Max`, `Flux 2 Pro (Preview)`, `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Klein 9B (Preview)`, `Flux 2 Klein 9B`, `Flux 2 Klein 4B` |
| **Replicate** | `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Max` |

## 4. Video Generation

| Provider | Supported Models |
| :--- | :--- |
| **Google AI** | `Veo 3.1`, `Veo 3.1 Lite` |
| **OpenAI** | `Sora 2`, `Sora 2 Pro` |
| **Grok** | `Grok Imagine Video` |
| **RunningHub** | `Seedance 2.0 Global`, `Seedance 2.0 Global Multimodal Reference` |
| **BytePlus** | `Seedance 1.5 Pro`, `Seedance 1.0 Pro`, `Seedance 1.0 Pro Fast` |
| **Kling AI** | `Kling Video O1`, `Kling V3 Omni Video` |
| **Replicate** | `Seedance 2.0 Fast`, `Seedance 2.0` |

## 5. Audio Generation

| Provider | Supported Models | Audio Type |
| :--- | :--- | :--- |
| **Google AI** | `Lyria 3 Clip`, `Lyria 3 Pro` | Music Generation |
| **Google AI** | `Gemini 3.1 Flash TTS`, `Gemini 2.5 Flash TTS`, `Gemini 2.5 Pro TTS` | Text-to-Speech |
| **Vertex AI** | `Lyria 3 Clip`, `Lyria 3 Pro` | Music Generation |
| **Vertex AI** | `Gemini 3.1 Flash TTS`, `Gemini 2.5 Flash TTS`, `Gemini 2.5 Pro TTS` | Text-to-Speech |

## 6. Chat Assistant Models

The built-in Remix Studio [Assistant](/concepts/assistant) acts as your agent within the app. By default, it is powered by **Gemini** models (such as `Gemini 3.1 Pro`), but the assistant runner supports multiple backends. You can select your preferred assistant model from the assistant settings, including capable reasoning models from:
- **Google AI / Vertex AI** (e.g., Gemini)
- **Anthropic (Claude)**
- **OpenAI**
- **Grok**
- **Alibaba Cloud**

These models are optimized for tool-calling and understanding the internal state of your library and storage.

## Choosing Models

- Models are selected per provider as saved **model profiles**, so jobs reference a profile instead of repeating raw model settings.
- A project sets a default provider; individual jobs can override the provider (and therefore the model). See [Providers & Models](/concepts/providers).
- The assistant and MCP clients can list usable model/provider pairings via `list_available_models`.
