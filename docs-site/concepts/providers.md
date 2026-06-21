# Providers & Models

**Providers** are the AI backends Remix Studio uses to run generation jobs. Each provider stores its own credentials, optional endpoint override, and model configuration.

## What a Provider Stores

- A **name** and **type** (for example OpenAI-compatible, Google, Vertex AI, or other supported generators).
- An **encrypted API key** (encrypted with `PROVIDER_ENCRYPTION_KEY`).
- An optional **API URL override**, for proxies or self-hosted endpoints.
- Optional **model configuration** — saved model profiles attached to the provider.
- A **concurrency setting** controlling how many jobs run in parallel for that provider.

Provider credentials are managed inside the app rather than hardcoded into project files.

## Providers and Jobs

- A project can use a **default provider**, while individual jobs can **override** that provider when needed.
- Model configuration is attached to the provider, so jobs choose a saved **model profile** instead of repeating raw model settings.
- Each provider's [concurrency limit](/concepts/queue) controls its own parallelism independently of other providers.

## Custom Models & Aliases

Beyond the bundled [model profiles](/concepts/models), you can define **custom model aliases** per provider, so jobs can target models not shipped by default. Manage these from the provider's profile screen.

## Third-Party Proxies

Remix Studio supports affordable third-party API proxies for Google Gemini and OpenAI models. To configure one:

1. Create a Provider with the appropriate type (`GoogleAI` or `OpenAI`).
2. Enter your proxy's API key.
3. In the **API URL** field, enter the proxy's base domain (for example `https://api.laozhang.ai`).
4. The app handles path construction and supports dynamic model replacement.

## Supported Provider Families

Generators ship for a broad set of providers across modalities, including Google AI, Vertex AI, OpenAI, Grok, Claude (Anthropic), Alibaba Cloud DashScope, RunningHub, BytePlus, Kling AI, Black Forest Labs, and Replicate. See [Model Profiles](/concepts/models) for the full bundled matrix.

## Security

API keys are encrypted at rest with `PROVIDER_ENCRYPTION_KEY`.

::: danger
Do not change `PROVIDER_ENCRYPTION_KEY` after providers exist unless you are re-encrypting stored credentials — otherwise saved API keys may become unreadable. See [Configuration](/guide/configuration).
:::
