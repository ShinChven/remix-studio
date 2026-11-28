# Model Profiles

These are the model profiles currently **bundled** with the app. Each is attached to a [provider](/concepts/providers); you supply the API key for the providers you want to use. You can also define custom model aliases per provider.

::: tip
This matrix reflects the profiles shipped with the current release. Model availability for a given workflow also depends on which providers you have configured and what your keys can access.
:::

## 1. High-Level Provider Summary

| Provider | Text | Image | Video | Audio |
| :--- | :---: | :---: | :---: | :---: |
| **Google AI** | ✅ | ✅ | ✅ | ✅ |
| **Vertex AI** | ✅ | ✅ | ✅ | ✅ |
| **OpenAI** | ✅ | ✅ | - | - |
| **Grok** | ✅ | ✅ | ✅ | - |
| **Claude** | ✅ | - | - | - |
| **Alibaba Cloud DashScope** | ✅ | - | - | - |
| **Kimi (Moonshot AI)** | ✅ | - | - | - |
| **MiniMax** | ✅ | ✅ | ✅ | ✅ |
| **RunningHub** | - | ✅ | ✅ | - |
| **BytePlus** | - | ✅ | ✅ | - |
| **Kling AI** | - | ✅ | ✅ | - |
| **Black Forest Labs** | - | ✅ | - | - |
| **Replicate** | - | ✅ | ✅ | - |
| **APIMart** | ✅ | ✅ | ✅ | ✅ |
| **Civitai** | - | ✅ | ✅ | - |

**Civitai** has no bundled profiles. A [Civitai project](/concepts/projects#civitai-projects) picks its checkpoint, LoRAs and embeddings from Civitai's catalog, or for video one of Civitai's engines (Wan 2.1, 2.2, 2.2 5B, 2.5, 2.7, 3.0 and Hunyuan). [ComfyUI projects](/concepts/projects#comfyui-projects) need no provider or profile at all: they run whatever models your own ComfyUI workflow loads.

## 2. Text Generation (LLMs)

| Provider | Supported Models |
| :--- | :--- |
| **Google AI** | `Gemini 4 Neon`, `Gemini 4 Carbon`, `Gemini 4 Argon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash`, `Gemini 3.7 Flash`, `Gemini 3.6 Flash`, `Gemini 3.5 Flash`, `Gemini 3.5 Flash Lite`, `Gemma 4` |
| **Vertex AI** | `Gemini 4 Neon`, `Gemini 4 Carbon`, `Gemini 4 Argon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash`, `Gemini 3.7 Flash`, `Gemini 3.6 Flash`, `Gemini 3.5 Flash`, `Gemini 3.5 Flash Lite` |
| **OpenAI** | `GPT-6.2 Astra`, `GPT-6.2 Sol`, `GPT-6 Astra`, `GPT-6.1 Sol`, `GPT-6.1 Terra`, `GPT-6 Sol`, `GPT-6 Luna` |
| **Grok** | `Grok 4.7`, `Grok 4.6`, `Grok 4.5`, `Grok 4.20`, `Grok 4.3`, `Grok 4.1 Fast` |
| **Claude** | `Claude Fable 5.2`, `Claude Opus 5.5`, `Claude Sonnet 5.5`, `Claude Haiku 5.5`, `Claude Fable 5.1`, `Claude Fable 5`, `Claude Opus 5`, `Claude Sonnet 5` |
| **Alibaba Cloud DashScope** | `Qwen4 Max`, `Qwen3.8 Flash`, `Qwen3.7 Plus`, `Qwen3.8 Max`, `Qwen3.6 Max`, `Qwen3.6 Plus`, `Qwen3.6 Flash`, `Qwen3.6 VL Max`, `Qwen3.6 VL Plus` |
| **Kimi (Moonshot AI)** | `Kimi K3.1 Pro`, `Kimi K3.1 Pro Highspeed`, `Kimi K3` |
| **MiniMax** | `MiniMax M3`, `MiniMax M2.7`, `MiniMax M2.7 Highspeed`, `MiniMax M2.5`, `MiniMax M2.5 Highspeed`, `MiniMax M2.1`, `MiniMax M2.1 Highspeed`, `MiniMax M2` |
| **APIMart** | 72 chat models, including GPT-6.2, Claude Fable 5.2, Gemini 4 Neon, Qwen4 Max and DeepSeek. The provider profile shows models available to your key. |

Text profiles start at Gemini 3.5, GPT-6 and Claude 5. A generation project saved with an older profile runs on the provider's default text model (Gemini 3.8 Flash, GPT-6.1 Terra or Claude Sonnet 5.5), and an assistant conversation on one asks you to pick a current model. Gemini 2.5 TTS profiles are gone too; projects on them use Gemini 3.8 Flash TTS.

## 3. Image Generation

| Provider | Supported Models |
| :--- | :--- |
| **Google AI** | `nano banana 2.1`, `nano banana Pro`, `nano banana 2 Lite` |
| **Vertex AI** | `nano banana 2.1`, `nano banana Pro`, `nano banana 2 Lite` |
| **OpenAI** | `GPT Image 2.6 Sunburst`, `GPT Image 2.6 Flare`, `GPT Image 2.5 Sunburst`, `GPT Image 2.5 Flare`, `GPT Image 2`, `GPT Image 1 Mini` |
| **Grok** | `Grok Imagine Image 2.0`, `Grok Imagine`, `Grok Imagine Image 2.0 (Low legacy channel)` |
| **MiniMax** | `MiniMax H3 Image`, `MiniMax Image 01` |
| **RunningHub** | `Seedream 5.5 Layer Decomposition`, `nano banana 2`, `nano banana Pro`, `GPT Image 2.5 Sunburst`, `GPT Image 2.5 Flare`, `GPT Image 2.5 Sunburst Official`, `GPT Image 2.5 Flare Official`, `GPT Image 2`, `GPT Image 2 Official`, `Qwen Image 3 Pro`, `Qwen Image 3`, `Grok Imagine Quality`, `Dola Seedream 5.0 Pro`, `Dola Seedream 5.0 Pro Layer Decomposition`, `Seedream V5 Pro`, `Wan 2.7 Pro` |
| **BytePlus** | `Seedream 5.5`, `Seedream 5.0 Pro`, `Seedream 5.0 Lite`, `Seedream 4.5`, `Seedream 4.0`, `Seedream 3.0 T2I`, `Seededit 3.0 I2I` |
| **Kling AI** | `Kling Image O1`, `Kling V3 Omni`, `Kling V3 Standard`, `Kling V2.1 Standard`, `Kling V2 Standard`, `Kling V1.5 Standard`, `Kling V1 Standard` |
| **Black Forest Labs** | `FLUX 3 Image`, `FLUX 3 Image Klein`, `Flux 2 Max`, `Flux 2 Pro (Preview)`, `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Klein 9B (Preview)`, `Flux 2 Klein 9B`, `Flux 2 Klein 4B` |
| **Replicate** | `FLUX 3 Image`, `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Max` |
| **APIMart** | `Kling Image 4.0`, `Kling Image 4.0 Webpage`, `Kling Image 4.0 E-commerce`, `nano banana 2.1`, `nano banana 2.1 Ext`, `nano banana 2`, `nano banana 2 Official`, `nano banana 2 Lite`, `nano banana 2 Lite Ext`, `nano banana Pro`, `nano banana Pro Official`, `nano banana`, `nano banana Official`, `GPT Image 2.5 Sunburst`, `GPT Image 2.5 Flare`, `GPT Image 2.5 Ext`, `GPT Image 2`, `GPT Image 2 Official`, `GPT Image 1 Official`, `GPT Image 1.5 Official`, `GPT-4o Image`, `Seedream 5.0 Pro`, `Seedream 5.0 Flash`, `Seedream 5.0 Lite`, `Seedream 4.5`, `Seedream 4.0`, `FLUX 3 Image`, `FLUX 3 Image Klein`, `FLUX.2 Pro`, `FLUX.2 Max`, `FLUX.2 Flex`, `FLUX Kontext Pro`, `FLUX Kontext Max`, `HY Image 3.5 Preview`, `Muse Image Ext`, `MAI Image 2.6`, `MAI Image 2.6 Flash`, `Qwen Image 3.0`, `Qwen Image 3.0 Pro`, `Qwen Image 2.0`, `Qwen Image 2.0 Pro`, `Z Image Turbo`, `Grok Imagine Image 2.0`, `Grok Imagine 2.0 Ext`, `Grok Imagine Image`, `Grok Imagine Image Quality`, `Grok Imagine 1.5`, `Wan 2.7 Image Pro`, `Wan 2.7 Image`, `Imagen 4.0`, `Midjourney`, `GPT Image 2.6`, `MAI Image 2.7`, `Seedream 5.5`, `MiniMax H3 Image`, `MiniMax H3 Image Highspeed` |

## 4. Video Generation

| Provider | Supported Models |
| :--- | :--- |
| **Google AI** | `Gemini Omni 1.2 Flash`, `Gemini Omni 1.2 Flash (720p)` |
| **Vertex AI** | `Veo 3.1 GA`, `Veo 3.1 Fast GA`, `Veo 3.1 Lite GA` |
| **Grok** | `Grok Imagine Video 1.5` |
| **MiniMax** | `MiniMax Hailuo H3 Highspeed`, `MiniMax Hailuo H3 Lite`, `MiniMax Hailuo H3` |
| **RunningHub** | `Seedance 2.5 Token`, `Seedance 2.0 Global`, `Seedance 2.0 Global Multimodal Reference`, `MiniMax Hailuo H3`, `MiniMax Hailuo H3 Multimodal Reference` |
| **BytePlus** | `Seedance 2.5 Flash`, `Seedance 2.5`, `Seedance 2.0 Mini`, `Seedance 1.0 Pro`, `Seedance 1.0 Pro Fast` |
| **Kling AI** | `Kling Video O1`, `Kling V3 Omni Video` |
| **Replicate** | `FLUX 3 Video (Early Access)`, `Seedance 2.5`, `Seedance 2.0 Fast`, `Seedance 2.0` |
| **APIMart** | `Seedance 2.5 Flash`, `Seedance 2.5`, `Seedance 2.0`, `seedance-2.0-fast`, `seedance-2.0-mini`, `Seedance 1.5 Pro`, `seedance-1-0-pro-fast`, `seedance-1-0-pro-quality`, `veo3.1-fast`, `veo3.1-quality`, `veo3.1-lite`, `veo3.1-fast-official`, `veo3.1-quality-official`, `Kling V4`, `Kling 3.0 Turbo`, `kling-v3`, `kling-v3-omni`, `kling-v2-6`, `kling-video-o1`, `kling-v2-6-motion-control`, `kling-v3-motion-control`, `MiniMax H3`, `MiniMax H3 Max`, `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast`, `MiniMax Hailuo 02`, `wan3.0-video`, `wan3.0-video-prime`, `Wan 2.7`, `Wan 2.7 Reference to Video`, `Wan 2.7 Video Editing`, `Wan 2.6`, `wan2.6-i2v`, `wan2.6-i2v-flash`, `Wan 2.5 Preview`, `Vidu Q4 Preview`, `Vidu Q3`, `Vidu Q3 Mix`, `viduq3-pro`, `viduq3-turbo`, `Grok Imagine Video`, `Grok Imagine Video 1.5`, `Grok Imagine Video 1.5 Ext`, `Gemini Omni 1.1 Flash`, `Gemini Omni 1.2 Flash`, `Gemini Omni Flash Preview`, `Gemini Omni 1.1 Flash Ext`, `happyhorse-1.0`, `happyhorse-1.1`, `FLUX 3 Video`, `skyreels-v4-fast`, `skyreels-v4-std`, `pixverse-v6`, `pixverse-v6-max`, `Muse Video Ext` |

Vertex AI Veo uses a Google Cloud project endpoint and OAuth credentials. See [Vertex AI video and speech](/concepts/providers#vertex-ai-video-and-speech).

## 5. Audio Generation

| Provider | Supported Models | Audio Type |
| :--- | :--- | :--- |
| **Google AI** | `Lyria 3.5`, `Lyria 3 Clip`, `Lyria 3 Pro` | Music Generation |
| **Google AI** | `Gemini 3.8 Flash TTS`, `Gemini 3.8 Flash-Lite TTS` | Text-to-Speech |
| **Vertex AI** | `Lyria 3 Clip`, `Lyria 3 Pro` | Music Generation |
| **Vertex AI** | `Gemini 3.8 Flash TTS`, `Gemini 3.8 Flash-Lite TTS` | Text-to-Speech |
| **MiniMax** | `MiniMax Music 3.0` | Music Generation |
| **MiniMax** | `MiniMax Speech 2.8 HD`, `MiniMax Speech 2.8 Turbo` | Text-to-Speech |
| **APIMart** | `Suno V6`, `Suno V6 Wild`, `Suno V6 Mini`, `Flow Music`, `Flow Music Lyria 3.5` | Music Generation |
| **APIMart** | `GPT-4o Mini TTS` | Text-to-Speech |

## 6. Multi-Agent Assistant Models

The built-in [Multi-Agent Assistant](/concepts/assistant) can use text profiles belonging to provider records of these types:

- **Google AI**
- **Anthropic (Claude)**
- **OpenAI**
- **Alibaba Cloud**
- **Kimi (Moonshot AI)**
- **MiniMax**
- **APIMart**

Vertex AI and Grok profiles can be used by generation projects where supported, but their provider types are not accepted by the current assistant chat adapter.

Native OpenAI GPT-6.2 Sol and Astra use the Responses API for Assistant tool calls. Text generation projects use Chat Completions.

The assistant receives the shared tool catalog independently of the model profile. Successful orchestration still depends on the upstream model handling tool calls reliably; a profile being categorized as text does not guarantee equal agent performance.

## Choosing Models

- Models are selected per provider as saved **model profiles**, so jobs reference a profile instead of repeating raw model settings.
- A project sets a default provider/model; the resolved choice is copied into each draft/job. See [Providers & Models](/concepts/providers).
- The assistant and MCP clients can list usable model/provider pairings via `list_available_models`.
- Profile options drive the project UI: prompt limits, context support, aspect ratio, quality, background, duration, resolution, sound, and audio-format controls are shown only when declared.
- Every bundled model carries a short explanation of what it is for and how it differs from its neighbours. It shows under the model in the project settings and on each card in the model selector, and the selector's search matches it. Custom aliases have none.
- **Dola Seedream 5.0 Pro Layer Decomposition** (RunningHub) needs one image in the workflow and returns a base image plus up to 16 transparent PNG layers, each saved as its own album item. The prompt is optional and names what to separate.
- **Seedream 5.5 Layer Decomposition** (RunningHub) needs one source image and returns a base image and up to 99 layers.
- A custom alias adds a model to an existing provider adapter; it does not add a new transport or generator family.
