# Providers & Models

A **provider** is a user-owned connection to an AI service. It stores credentials, an optional API endpoint override, concurrency, and custom model aliases. Projects and jobs refer to the provider record by ID, so two accounts—or two connections to the same vendor—remain isolated.

## Provider Records

| Field | Purpose |
| :--- | :--- |
| Name | Human-readable label shown in selectors and queue monitoring |
| Type | Selects the generator implementation, such as Google AI, OpenAI, or Kling AI |
| API key | Primary credential, encrypted before database storage |
| API secret | Optional second credential used by providers such as Kling AI |
| API URL | Optional safe endpoint override for a compatible proxy |
| Concurrency | Maximum generation jobs this provider record may run at once |
| Custom models | Alias definitions merged with the bundled model profiles |

Credentials are entered and changed in the provider screens. They are decrypted only on the server when a job or assistant call needs them.

## Project Defaults and Job Snapshots

A project selects a default provider and model. Creating a draft copies that selection into the draft, and dispatch resolves any remaining project fallback values into the job row before calling the provider.

As a result:

- Changing the project provider does not rewrite existing drafts/jobs.
- Deleting a provider may leave old job history without a usable provider connection.
- Retrying requires the snapshotted provider/model still to be available and correctly configured.

Use **Reuse configuration** on a prior job when you want its settings to become the editable starting point for new work.

## Concurrency

Concurrency belongs to the provider record. Two separate OpenAI connections can therefore have different limits and independent queues. A remote async task keeps its slot while being polled.

Choose a conservative limit that matches vendor rate limits and your media-processing capacity. Increasing it can increase provider throttling, memory use, and simultaneous object-storage writes. See [Queue & Concurrency](/concepts/queue).

## Bundled Profiles and Custom Aliases

Bundled profiles describe:

- Provider model ID and display name.
- Output category.
- Supported aspect ratios, formats, qualities, backgrounds, durations, resolutions, or audio formats.
- Prompt limits and supported input contexts where applicable.
- Whether a model is eligible for assistant chat.

Custom aliases let you add a compatible model ID without waiting for a release. An alias uses the selected provider generator; it does not install a new protocol adapter. Configure its capabilities accurately, because the project editor relies on them to expose valid controls.

See [Model Profiles](/concepts/models) for the bundled matrix.

## Assistant Compatibility

Generation support and assistant-chat support are separate. The in-app assistant currently accepts provider records of type Google AI, OpenAI, Claude, and Alibaba Cloud. Other provider families can still appear in project model selectors when their generators are implemented.

See [The Assistant](/concepts/assistant).

## API URL Overrides and Proxies

An API URL override is intended for a service that is wire-compatible with the chosen provider type. Remix Studio constructs provider-specific paths and validates the override before use.

When configuring a proxy:

1. Choose the provider type whose request/response protocol the proxy implements.
2. Enter the proxy base URL, not an arbitrary per-model URL unless that provider screen says otherwise.
3. Add custom aliases for model IDs not in the bundled profiles.
4. Test a small job before increasing concurrency.

::: warning
Compatibility is more than accepting the same API key. Streaming, async task polling, media upload formats, response fields, and safety/error payloads must match the selected generator.
:::

URL validation rejects unsafe endpoint forms, including attempts to direct provider calls at private/internal network targets.

## Supported Families

The repository includes generation adapters and bundled profiles across Google AI, Vertex AI, OpenAI, Grok, Claude, Alibaba Cloud, RunningHub, BytePlus, Kling AI, Black Forest Labs, and Replicate. Supported modalities differ by family and model; consult [Model Profiles](/concepts/models) rather than assuming every family supports text, image, video, and audio.

## Credential Encryption

Provider API credentials are encrypted at rest with `PROVIDER_ENCRYPTION_KEY`.

::: danger
Keep `PROVIDER_ENCRYPTION_KEY` stable. Changing it without re-encrypting existing records makes saved credentials unreadable. The effective key must be a 64-character hexadecimal value. Back it up separately from the database.
:::

The encryption key protects database contents, but anyone with both the database and deployment secret can decrypt provider credentials. Restrict environment configuration, database access, logs, and backups accordingly.
