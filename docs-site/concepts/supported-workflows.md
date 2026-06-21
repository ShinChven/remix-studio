# Supported Workflows

Remix Studio is multimodal: a [workflow](/concepts/workflows) maps one kind of input to one kind of output. The supported input → output combinations are:

| Workflow | Description |
| :--- | :--- |
| **Text → Text** | Standard LLM generation |
| **Text → Image** | Prompt-based image generation |
| **Text → Video** | Prompt-based video generation |
| **Text → Audio** | Scripted text-to-speech generation (TTS) |
| **Text → Music** | Prompt-based music generation (e.g. with Lyria models) |
| **Image → Text** | Describe or analyze images (multimodal) |
| **Image → Image** | Stylize or transform images using reference images |
| **Image → Video** | Animate images into video |
| **Image → Music** | Generate music using reference image context |
| **Video → Video** | Transform or edit videos using reference video context |
| **Audio → Video** | Generate video using reference audio context (e.g. lip-sync or music) |

Which workflows are available to you depends on the [providers and models](/concepts/models) you have configured. See [Model Profiles](/concepts/models) for the bundled provider/model matrix.
