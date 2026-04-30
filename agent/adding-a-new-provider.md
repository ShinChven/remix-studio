# Adding a New AI Provider

This guide describes the complete end-to-end process of integrating a new AI image generation provider into Remix Studio, from backend logic to frontend UI and background processing.

## 1. Backend Implementation

### Create the Generator
Create a new file in `server/generators/` (e.g., `my-provider-generator.ts`) that implements the `ImageGenerator` interface.

```typescript
import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';
import axios from 'axios';

export class MyProviderGenerator implements ImageGenerator {
  constructor(private apiKey: string, private apiUrl?: string) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { prompt, modelId, aspectRatio, imageSize, background, refImagesBase64 } = req;
    
    // 1. Prepare request payload
    // 2. Call Provider API
    // 3. Download/process the resulting image
    // 4. Return { ok: true, data: Buffer, format: 'png' | 'jpeg' | 'webp' }
  }
}
```

### Register the Generator
Update `server/generators/build-generator.ts` to include your new provider in the factory function.

```typescript
import { MyProviderGenerator } from './my-provider-generator';

export function buildGenerator(provider: Provider): ImageGenerator {
  switch (provider.type) {
    case 'MyProvider':
      return new MyProviderGenerator(provider.apiKey, provider.apiUrl);
    // ...
  }
}
```

### Update Provider Routes
Update the `VALID_TYPES` array in `server/routes/providers.ts` to include your new provider type. This ensures the API accepts the new provider during creation and updates.

```typescript
const VALID_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'RunningHub', 'OpenAI', 'MyProvider'];
```

### Queue & Worker Integration (Optional)
If your provider introduces new parameters (e.g., `background`), make sure to pass them through the `QueueManager`.

Update `server/queue/queue-manager.ts`:
1.  **Update `QueuedJob`**: Add the new parameter to the interface.
2.  **Update `enqueue` Methods**: Pass the parameter from the `Project` or `Job` to the `QueuedJob`.
3.  **Update `executeJob`**: Pass the parameter from the `QueuedJob` to the `generator.generate()` call.

### Sync vs Async Generators (Important for Concurrency)

The queue treats two kinds of generators differently. The distinction is whether you implement `checkStatus`.

| Kind | Defines `checkStatus`? | `generate()` returns | Slot lifecycle |
|---|---|---|---|
| **Sync** (e.g. OpenAI image) | No | `{ ok: true, imageBytes, ... }` | Slot held until `generate()` resolves |
| **Async** (e.g. KlingAI, Replicate, RunningHub) | Yes | `{ ok: true, status: 'processing', taskId }` | Slot held until `DetachedPoller` observes a terminal state via `checkStatus` |

**For async providers**, `QueueManager` hands the job off to `DetachedPoller` once a `taskId` is returned, but the **concurrency slot stays held** until the poller observes `completed` or `failed`. This is what makes `provider.concurrency` actually limit in-flight remote tasks (not just submission rate).

**Rules for `checkStatus` implementations** (see `server/generators/kling-ai-generator.ts` for a reference):

1. Return `{ status: 'processing' }` on **transient errors** (network timeouts, 5xx, JSON parse failures). Never throw — throws disable the stuck-task timeout for that poll cycle.
2. Return `{ status: 'failed', error: '...' }` only when the remote definitively reports the task is dead. The poller will clear the `taskId` and stop polling.
3. Return `{ status: 'completed', imageBytes/videoBytes, mimeType }` only when fully done with bytes ready. Don't return `completed` without bytes.
4. If you never reach a terminal state, the **2-hour stuck-task timeout** (configurable via `JOB_PROCESSING_TIMEOUT_MS`) will auto-fail the job and free the slot. Default applies to all async providers.

**Provider with two-key auth (`apiKey` + `apiSecret`)**: see KlingAI for the pattern. Both `getDecryptedApiKey` and `getDecryptedApiSecret` are looked up; pass both into your generator constructor via `buildGenerator` / `buildVideoGenerator`.

### Video Generators

For video providers, implement the `VideoGenerator` interface in `server/generators/video-generator.ts` and register in `server/generators/build-video-generator.ts`. All video providers are async by definition — `generate()` returns a `taskId` and `checkStatus` polls until completion.

## 2. Type Definitions

Update `src/types.ts` to expose the new provider to the frontend.

1.  **Add to `ProviderType`**:
    ```typescript
    export type ProviderType = 'GoogleAI' | 'VertexAI' | 'RunningHub' | 'OpenAI' | 'MyProvider';
    ```

2.  **Define Model Configurations**:
    Add your provider and its supported models to `PROVIDER_MODELS_MAP`. Use native parameter strings for sizes and qualities.

    ```typescript
    export const PROVIDER_MODELS_MAP: Record<ProviderType, ModelConfig[]> = {
      MyProvider: [
        {
          id: 'model-id',
          name: 'Display Name',
          generatorId: 'MyProvider',
          modelId: 'actual-api-model-id',
          options: {
            aspectRatios: ['1024x1024', '1024x1792', 'auto'],
            qualities: ['low', 'medium', 'high', 'auto'],
            backgrounds: ['transparent', 'opaque', 'auto'], // Optional
          }
        }
      ],
      // ...
    };
    ```

## 3. Frontend UI Integration

### Provider List & Badges
Update `src/pages/Providers.tsx` to define the visual style (colors and icons) for the new provider.

```typescript
const TYPE_COLORS: Record<ProviderType, { icon: string; badge: string }> = {
  MyProvider: { 
    icon: 'bg-blue-500/10 text-blue-500', 
    badge: 'bg-blue-600/10 text-blue-400 border-blue-600/30' 
  },
  // ...
};
```

### Provider Creation Form
Update `src/pages/ProviderForm.tsx` to include the new type in the selection menu and provide a description.

1.  **Add to `PROVIDER_TYPES`**:
    ```typescript
    const PROVIDER_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'RunningHub', 'OpenAI', 'MyProvider'];
    ```

2.  **Add to `TYPE_DESCRIPTIONS`**:
    ```typescript
    const TYPE_DESCRIPTIONS: Record<ProviderType, string> = {
      MyProvider: 'My Provider — API Key description',
      // ...
    };
    ```

## 4. Testing & Verification

1.  **Linting**: Run `npm run lint` to ensure all `Record<ProviderType, ...>` satisfy the new type.
2.  **Creation**: Go to **Settings -> AI Providers** and create a new instance of your provider.
3.  **Generation**: create a project, select your new provider/model, and verify that the generation flow works end-to-end.

> [!TIP]
> If your provider uses specific dimensions (like `1024x1024` instead of `1:1`), make sure to update the `SettingsPanel.tsx` icon logic to handle these strings gracefully.
