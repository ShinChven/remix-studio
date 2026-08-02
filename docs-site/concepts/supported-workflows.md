# Supported Workflows

Remix Studio does not hard-code a single input-to-output pipeline. A project chooses an **output type**, a model profile declares accepted contexts and output options, and the workflow supplies the compatible text/media inputs.

## Output Types

| Project type | Produces | Typical workflow inputs |
| :--- | :--- | :--- |
| **Text** | Text | Text prompts plus image/video/audio context when supported by the selected multimodal model |
| **Image** | Images | Text, reference images, and provider-specific media context |
| **Video** | Video | Text, source/reference images, video, or audio when the selected video model supports them |
| **Audio** | Speech or music | Text; reference images only for audio models that explicitly declare image support |

This capability-based model covers common workflows such as text-to-text, image analysis, text-to-image, image-to-image, text/image-to-video, video transformation, audio-conditioned video, text-to-speech, text-to-music, and image-conditioned music.

## How Availability Is Decided

A workflow is usable only when all three layers agree:

1. **Project type** selects the text, image, video, or audio execution path.
2. **Provider family** must implement that output generator.
3. **Model profile** must advertise the required input contexts and options.

The project editor uses the selected model profile to show settings such as supported aspect ratios, qualities, backgrounds, durations, resolutions, sound modes, audio formats, prompt limits, and reference-image support.

::: warning
A provider appearing in Remix Studio does not mean every model from that provider supports every workflow. Custom aliases inherit the capabilities you configure for them, so verify the upstream model and proxy behavior.
:::

## Context Behavior

Workflow text is joined into the request prompt. Image, video, and audio steps become separate context arrays and are passed only through generators that implement those inputs.

Audio projects intentionally hide direct video/audio workflow inputs. They are driven by text, with optional reference images only when the selected audio model allows them. Audio output configuration distinguishes speech/TTS settings from music settings.

For the bundled provider/model matrix, see [Model Profiles](/concepts/models). For the exact generation settings stored with a job, see [Projects & Albums](/concepts/projects).
