> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Image Generation with Text Prompts

> Complete guide to FLUX API endpoints for AI image generation. Learn text-to-image creation, API polling, regional endpoints, and code examples.

Our API endpoints enable media creation with BFL models. It follows an asynchronous design, where you first make a request for a generation and then query for the result of your request.

## API Endpoints

<AccordionGroup>
  <Accordion title="Primary Global Endpoint">
    **`api.bfl.ai`** - Recommended for most use cases

    * Routes requests across all available clusters globally
    * Automatic failover between clusters for enhanced uptime
    * Intelligent load distribution prevents bottlenecks during high traffic

    <Warning>
      Always use the `polling_url` returned in responses when using this endpoint
    </Warning>
  </Accordion>

  <Accordion title="Regional Endpoints">
    🇪🇺 **`api.eu.bfl.ai`** - European Multi-cluster

    * Multi-cluster routing limited to EU regions
    * GDPR compliant

    🇺🇸 **`api.us.bfl.ai`** - US Multi-cluster

    * Multi-cluster routing limited to US regions
  </Accordion>

  <Accordion title="Legacy Regional Endpoints">
    🇪🇺 **`api.eu1.bfl.ai`** - EU Single-cluster

    * Single cluster, no automatic failover
  </Accordion>
</AccordionGroup>

<Note>
  For enhanced reliability and performance, we recommend using the global endpoint `api.bfl.ai` or regional endpoints `api.eu.bfl.ai`/`api.us.bfl.ai` for inference tasks.
</Note>

## Available Endpoints

We currently support the following endpoints for image generation:

1. `/flux-2-max`
2. `/flux-2-pro-preview` — our latest FLUX.2 \[pro]
3. `/flux-2-pro` — a fixed snapshot of FLUX.2 \[pro] for workflows that require reproducibility
4. `/flux-2-flex`
5. `/flux-2-klein-4b`
6. `/flux-2-klein-9b-preview` — our latest FLUX.2 \[klein] 9B with KV caching
7. `/flux-2-klein-9b` — a fixed snapshot of FLUX.2 \[klein] 9B for reproducibility
8. `/flux-kontext-max`
9. `/flux-kontext-pro`
10. `/flux-pro-1.1-ultra`
11. `/flux-pro-1.1`
12. `/flux-pro`
13. `/flux-dev`

<Tip>
  Preview endpoints (`flux-2-pro-preview`, `flux-2-klein-9b-preview`) reflect our latest advances and are the best place to start. Choose non-preview endpoints when you need a pinned model for reproducibility. See [Preview Endpoints](/flux_2/flux2_overview#preview-endpoints) for details.
</Tip>

## Create Your First Image

### Submit Generation Request

To submit an image generation task, create a request. This example uses `flux-2-pro-preview`, our latest and most capable model:

<CodeGroup>
  ```bash submit_request.sh theme={null}
  # Install curl and jq, then run:
  # Make sure to set your API key: export BFL_API_KEY="your_key_here"

  request=$(curl -X 'POST' \
    'https://api.bfl.ai/v1/flux-2-pro-preview' \
    -H 'accept: application/json' \
    -H "x-key: ${BFL_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{
    "prompt": "A cat on its back legs running like a human is holding a big silver fish with its arms. The cat is running away from the shop owner and has a panicked look on his face. The scene is situated in a crowded market.",
    "width": 1440,
    "height": 2048
  }')

  echo $request
  request_id=$(jq -r .id <<< $request)
  polling_url=$(jq -r .polling_url <<< $request)
  echo "Request ID: ${request_id}"
  echo "Polling URL: ${polling_url}"
  ```

  ```python submit_request.py theme={null}
  # Install requests: pip install requests

  import os
  import requests

  request = requests.post(
      'https://api.bfl.ai/v1/flux-2-pro-preview',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': 'A cat on its back legs running like a human is holding a big silver fish with its arms. The cat is running away from the shop owner and has a panicked look on his face. The scene is situated in a crowded market.',
          'width': 1440,
          'height': 2048
      },
  ).json()

  print(request)
  request_id = request["id"]
  polling_url = request["polling_url"]
  print(f"Request ID: {request_id}")
  print(f"Polling URL: {polling_url}")
  ```
</CodeGroup>

A successful response will be a JSON object containing the request's `id` and a `polling_url` that should be used to retrieve the result.

<Warning>
  **Important:** When using the global endpoint (`api.bfl.ai`) or regional endpoints (`api.eu.bfl.ai`, `api.us.bfl.ai`), you must use the `polling_url` returned in the response for checking request status.
</Warning>

### Poll for Results

To retrieve the result, poll the endpoint using the `polling_url`:

<CodeGroup>
  ```bash poll_results.sh theme={null}
  # This assumes that the request_id and polling_url variables are set from the previous step

  while true
  do
    sleep 0.5
    result=$(curl -s -X 'GET' \
      "${polling_url}" \
      -H 'accept: application/json' \
      -H "x-key: ${BFL_API_KEY}")

    status=$(jq -r .status <<< $result)
    echo "Status: $status"

    if [ "$status" == "Ready" ]
    then
      echo "Result: $(jq -r .result.sample <<< $result)"
      break
    elif [ "$status" == "Error" ] || [ "$status" == "Failed" ]
    then
      echo "Generation failed: $result"
      break
    fi
  done
  ```

  ```python poll_results.py theme={null}
  # This assumes request_id and polling_url are set from the previous step
  import time
  import os
  import requests

  while True:
      time.sleep(0.5)
      result = requests.get(
          polling_url,
          headers={
              'accept': 'application/json',
              'x-key': os.environ.get("BFL_API_KEY"),
          },
      ).json()

      status = result["status"]
      print(f"Status: {status}")

      if status == "Ready":
          print(f"Result: {result['result']['sample']}")
          break
      elif status in ["Error", "Failed"]:
          print(f"Generation failed: {result}")
          break
  ```
</CodeGroup>

A successful response will be a JSON object containing the result, where `result['sample']` is a signed URL for retrieval.

<Warning>
  Our signed URLs are only valid for 10 minutes. Please retrieve your result within this timeframe.
</Warning>

<Warning>
  **Image Delivery:** The `result.sample` URLs are served from delivery endpoints (`delivery-eu.bfl.ai`, `delivery-us.bfl.ai`) and are not meant to be served directly to users. We recommend downloading the image and re-serving it from your own infrastructure. We do not enable CORS on delivery URLs.
</Warning>

See our [reference documentation](https://docs.bfl.ai/api-reference/) for a full list of options and our [inference repo](https://github.com/black-forest-labs/flux).

## Limits

<Warning>
  **Rate Limits:** Sending requests to our API is limited to 24 active tasks. If you exceed your limit, you'll receive a status code `429` and must wait until one of your previous tasks has finished.
</Warning>

<Warning>
  **Rate Limits:** Additionally, due to capacity issues, for `flux-kontext-max`, requests to our API are limited to 6 active tasks.
</Warning>

<Note>
  **Credits:** If you run out of credits (status code `402`), visit [https://api.bfl.ai](https://api.bfl.ai), sign in and click "Add" to buy additional credits. See also [Credits & Billing](https://docs.bfl.ai/account_management/credits_billing).
</Note>

<Tip>
  If you require higher volumes, please contact us at [flux@blackforestlabs.ai](mailto:flux@blackforestlabs.ai).
</Tip>

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# FLUX API Integration Guide

> Essential guide for integrating with FLUX API endpoints, including endpoint selection, polling, and content handling.

## API Endpoints Overview

### Primary Global Endpoint

**`api.bfl.ai`** - Primary Endpoint

* Routes requests across all available clusters globally
* Provides automatic failover between clusters for enhanced uptime
* Intelligent load distribution prevents bottlenecks during high traffic periods
* **Important:** Always use the `polling_url` returned in responses when using this endpoint
* **Suitable for:** Standard inference

### Regional Endpoints

**`api.eu.bfl.ai`** - European Multi-cluster Endpoint

* Multi-cluster routing limited to EU regions
* GDPR compliant
* Provides the same uptime and load balancing benefits within EU regions

**`api.us.bfl.ai`** - US Multi-cluster Endpoint

* Multi-cluster routing limited to US regions
* Provides the same uptime and load balancing benefits within US regions

## Key Benefits of New Endpoints

<Columns cols={3}>
  <Card title="Enhanced Reliability" icon="shield-check">
    Reduced downtime through automatic cluster failover
  </Card>

  <Card title="Better Performance" icon="gauge">
    Intelligent traffic distribution prevents overload during peak usage
  </Card>

  <Card title="Seamless Experience" icon="sparkles">
    Load balancing happens transparently on our end
  </Card>
</Columns>

## Polling URL Usage

When using the primary global endpoint (`api.bfl.ai`) or regional endpoints (`api.eu.bfl.ai`, `api.us.bfl.ai`), you **must** use the `polling_url` returned in the initial request response.

<Note>
  **Webhook Users:** If you're using webhooks to receive results, no changes are needed. The `polling_url` requirement only applies when implementing async polling behavior to check request status.
</Note>

### Example Implementation

<CodeGroup>
  ```python polling_example.py theme={null}
  import requests
  import time
  import os

  # Submit request to global endpoint
  response = requests.post(
      'https://api.bfl.ai/v1/flux-2-pro-preview',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': 'A serene landscape with mountains',
          'width': 1440,
          'height': 810
      }
  )

  data = response.json()
  request_id = data['id']
  polling_url = data['polling_url']  # Use this URL for polling

  # Poll using the returned polling_url
  while True:
      time.sleep(0.5)
      result = requests.get(
          polling_url,
          headers={
              'accept': 'application/json',
              'x-key': os.environ.get("BFL_API_KEY"),
          }
      ).json()

      if result['status'] == 'Ready':
          print(f"Image ready: {result['result']['sample']}")
          break
      elif result['status'] in ['Error', 'Failed']:
          print(f"Generation failed: {result}")
          break
  ```

  ```bash polling_example.sh theme={null}
  # Submit request and extract polling URL
  response=$(curl -X 'POST' \
    'https://api.bfl.ai/v1/flux-2-pro-preview' \
    -H 'accept: application/json' \
    -H "x-key: ${BFL_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{
      "prompt": "A serene landscape with mountains",
      "width": 1440,
      "height": 810
    }')

  request_id=$(echo $response | jq -r .id)
  polling_url=$(echo $response | jq -r .polling_url)

  # Poll using the polling URL
  while true; do
    sleep 0.5
    result=$(curl -s -X 'GET' \
      "${polling_url}" \
      -H 'accept: application/json' \
      -H "x-key: ${BFL_API_KEY}")

    status=$(echo $result | jq -r .status)
    echo "Status: $status"

    if [ "$status" == "Ready" ]; then
      echo "Result: $(echo $result | jq -r .result.sample)"
      break
    elif [ "$status" == "Error" ] || [ "$status" == "Failed" ]; then
      echo "Generation failed: $result"
      break
    fi
  done
  ```
</CodeGroup>

## Content Delivery and Storage Guidelines

### Delivery URLs

Generated images are served from region-specific delivery URLs (e.g., `delivery-eu.bfl.ai` for European regions).

### Important Delivery Considerations

<Warning>
  **Not for Direct Serving:** The `result.sample` URLs from delivery endpoints are not meant to be served directly to end users.
</Warning>

<Warning>
  **No CORS Support:** We do not enable CORS on delivery URLs, which means they cannot be used directly in web browsers for cross-origin requests.
</Warning>

<Warning>
  **10-Minute Expiration:** Generated images expire after 10 minutes and become inaccessible.
</Warning>

<Note>
  **Network Access:** If your infrastructure uses firewalls or network restrictions, ensure you whitelist the delivery endpoints (e.g., `delivery-eu.bfl.ai`) to allow downloading generated images.
</Note>

### Recommended Image Handling

**Download and Re-serve Pattern:**

<CodeGroup>
  ```python download_and_serve.py theme={null}
  import requests
  import os
  from datetime import datetime
  from typing import Dict, Any

  def download_and_store_image(result_url: str, local_path: str) -> str:
      """
      Download image from BFL delivery URL and store locally
      """
      response = requests.get(result_url)
      response.raise_for_status()

      with open(local_path, 'wb') as f:
          f.write(response.content)

      return local_path

  def handle_generation_result(result: Dict[str, Any]) -> Dict[str, Any]:
      """
      Process generation result and store image locally
      """
      if result['status'] == 'Ready':
          sample_url = result['result']['sample']

          # Generate unique filename
          timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
          filename = f"generated_image_{timestamp}.jpg"
          local_path = os.path.join("./images", filename)

          # Ensure directory exists
          os.makedirs(os.path.dirname(local_path), exist_ok=True)

          # Download and store
          stored_path = download_and_store_image(sample_url, local_path)

          # Now serve from your own infrastructure
          return {
              'status': 'ready',
              'local_path': stored_path,
              'public_url': f"https://yourdomain.com/images/{filename}"
          }

      return result
  ```

  ```javascript download_and_serve.js theme={null}
  const fs = require('fs');
  const path = require('path');
  const https = require('https');

  async function downloadAndStoreImage(resultUrl, localPath) {
      return new Promise((resolve, reject) => {
          const file = fs.createWriteStream(localPath);

          https.get(resultUrl, (response) => {
              response.pipe(file);

              file.on('finish', () => {
                  file.close();
                  resolve(localPath);
              });

              file.on('error', (err) => {
                  fs.unlink(localPath, () => {}); // Delete incomplete file
                  reject(err);
              });
          }).on('error', reject);
      });
  }

  async function handleGenerationResult(result) {
      if (result.status === 'Ready') {
          const sampleUrl = result.result.sample;

          // Generate unique filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `generated_image_${timestamp}.jpg`;
          const localPath = path.join('./images', filename);

          // Ensure directory exists
          fs.mkdirSync(path.dirname(localPath), { recursive: true });

          // Download and store
          const storedPath = await downloadAndStoreImage(sampleUrl, localPath);

          // Return path for serving from your infrastructure
          return {
              status: 'ready',
              localPath: storedPath,
              publicUrl: `https://yourdomain.com/images/${filename}`
          };
      }

      return result;
  }
  ```
</CodeGroup>

## Migration Checklist

<Steps>
  <Step title="Update API Endpoints">
    * Replace legacy endpoints with appropriate new endpoints based on your needs
    * Use `api.bfl.ai` for global load balancing
    * Use `api.eu.bfl.ai` or `api.us.bfl.ai` for regional preferences
  </Step>

  <Step title="Implement Polling URL Handling">
    * Ensure your code extracts and uses the `polling_url` from API responses
    * Update polling logic to use the provided polling URL instead of hardcoded endpoints
  </Step>

  <Step title="Implement Proper Image Handling">
    * Set up download and re-serve infrastructure for generated images
    * Plan for 10-minute expiration window
    * Consider implementing CDN or cloud storage for better performance
  </Step>
</Steps>

## Best Practices

### Error Handling

<CodeGroup>
  ```python error_handling.py theme={null}
  import requests
  import time
  from typing import Dict, Any, Optional

  def robust_api_call(url: str, headers: Dict[str, str], json_data: Dict[str, Any], max_retries: int = 3) -> Dict[str, Any]:
      """
      Robust API call with retry logic and proper error handling
      """
      for attempt in range(max_retries):
          try:
              response = requests.post(url, headers=headers, json=json_data)

              if response.status_code == 429:
                  # Rate limit exceeded, wait and retry
                  wait_time = 2 ** attempt  # Exponential backoff
                  time.sleep(wait_time)
                  continue

              elif response.status_code == 402:
                  # Insufficient credits
                  raise Exception("Insufficient credits. Please add credits to your account.")

              elif response.status_code >= 400:
                  # Other client/server errors
                  response.raise_for_status()

              return response.json()

          except requests.exceptions.RequestException as e:
              if attempt == max_retries - 1:
                  raise e
              time.sleep(2 ** attempt)

      raise Exception(f"Failed after {max_retries} attempts")
  ```
</CodeGroup>

### Rate Limiting

<Note>
  * Maximum 24 concurrent requests for most endpoints
  * Maximum 6 concurrent requests for `flux-kontext-max`
  * Implement exponential backoff for 429 responses
</Note>

### Content Management

* Download images immediately upon generation completion
* Implement proper error handling for expired URLs
* Consider implementing a queue system for high-volume applications
* Use appropriate storage solutions (CDN, cloud storage) for serving images to users


> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# FLUX.2 Image Editing

> Edit images with FLUX.2 using text prompts and multi-reference support for up to 10 images, with advanced controls and up to 4MP output.

**Edit images like magic.** Describe what you want changed, and FLUX.2 makes it happen. Combine furniture from multiple photos into one room. Replace people with animals while keeping proportions perfect. Change backgrounds, swap textures, edit text—all while maintaining photorealism that matches professional photography.

Reference multiple images simultaneously - up to 8 via API, up to 10 in the playground. Use **\[max]** for highest precision editing, **\[pro]** for production at scale, **\[flex]** for fine-grained control, or **\[klein]** for cost-efficient high-volume editing.

<Tip>
  **Try it live** - Upload images and describe your edits in our [playground](https://playground.bfl.ai). See the magic happen in seconds.
</Tip>

<Info>
  **Upgrading from FLUX.1?** FLUX.2 adds multi-reference support, improved photorealism, better text editing, and output up to 4MP. [See comparison →](#what-is-better-than-flux-1)
</Info>

## See It In Action

These aren't demos—they're real edits you can make right now:

<Frame caption="8 images, one prompt: Create a complete fashion editorial with consistent characters across every scene">
  <img src="https://cdn.sanity.io/images/2gpum2i6/production/51696bb4ac2972e1dda5f3e68f748210f392c4f4-4861x1863.jpg" alt="Multi-reference fashion editorial showing consistent characters across 10 scenes" />
</Frame>

**Prompt**: `Create a fashion editorial with consistent characters across multiple scenes`

<Frame caption="Combine furniture from multiple photos into one perfect room, apply textures from other images">
  <img src="https://cdn.sanity.io/images/2gpum2i6/production/8f8f713951ae554d3309c593742b97739c6b0bce-4057x1863.jpg" alt="Interior design combining furniture and textures from multiple reference images" />
</Frame>

**Prompt**: `Use the empty illuminated concrete space from the first image as the room, place all the furniture from the images inside this space, and use the purple knit texture from the uploaded image to create a blanket draped over the red chair.`

<Frame caption="Replace people with animals from 5 different images—proportions and scene composition stay perfect">
  <img src="https://cdn.sanity.io/images/2gpum2i6/production/254b6e382a658da2ad2ed6e27d8cf67f566721aa-4057x1863.jpg" alt="Scene with animals replacing people, maintaining natural proportions" />
</Frame>

**Prompt**: `Replace the people in the image with the animals from images 2, 3, 4, 5, and 6. Adjust them to the space and style so they sit naturally in the scene. Adjust the proportions of the animals to each other and to the space`

<Columns cols={2}>
  <Frame caption="Create scenes using colors from reference images">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/b756a70b1b5a1686aafe631deb31d88ca7525ddb-1600x1200.png" alt="Color matching from reference" />
  </Frame>

  <Frame caption="Output with matched colors">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/da31ac8fddaf35a01bce4a5ed22a44c7933d358a-1024x1024.png" alt="Output with color-matched scene" />
  </Frame>
</Columns>

## How It Works

### Multi-Reference Magic

Combine elements from multiple images into one perfect scene. FLUX.2 maintains consistency across characters, products, and styles—even when you're mixing completely different sources. All models support up to 8 reference images via API and up to 10 in the playground.

**Example**: Combine people and animals from separate photos

**Prompt**: `The person from image 1 is petting the cat from image 2, the bird from image 3 is next to them`

<Columns cols={3}>
  <Frame caption="Reference 1: Person">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/83238423bfee53164679707c8ce6848339f4cf1e-4160x6240.jpg" alt="Person reference" />
  </Frame>

  <Frame caption="Reference 2: Cat">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/830bfac74da873e1125f41442b4dd1af5a21de7f-3433x5149.jpg" alt="Cat reference" />
  </Frame>

  <Frame caption="Reference 3: Bird">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/2c2b2e393e1e51e94462e89d5bb879978b66a8a6-3136x3920.jpg" alt="Bird reference" />
  </Frame>
</Columns>

<Frame caption="Result: All elements combined into one natural scene">
  <img src="https://cdn.sanity.io/images/2gpum2i6/production/ec25bcd17f7723c3f5a2ed5d6930d3ccf1d81463-1024x768.jpg" alt="Combined scene with person, cat, and bird" />
</Frame>

### Exact Color Control

FLUX.2 supports precise color matching using hex color codes. Specify exact brand colors without approximation, making it ideal for professional design workflows.

**Color Matching from Reference Images**

Reference a color from another image for precise matching:

**Prompt**: `Change the color of the gloves to the color of image 2`

<Tip>
  For best color matching performance, you can include a color square of the desired color in your reference images and disable Prompt Upsampling. FLUX.2 will match the exact color from the reference.
</Tip>

<Columns cols={2}>
  <Frame caption="Reference image 1">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/b7b0f5d467e2dc309c7f8e7a1a6fcda92814fc5b-1360x752.jpg" alt="First reference image" />
  </Frame>

  <Frame caption="Color reference">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/dfebb523d384d4509880ff9eabd33b1db4253919-268x170.png" alt="Second reference image" />
  </Frame>
</Columns>

<Frame caption="Output: The gloves are now the color of the reference image 2">
  <img src="https://cdn.sanity.io/images/2gpum2i6/production/3e8366550cd51f2d1e3dd95ca2a15708a336a702-1360x752.jpg" alt="Output image with gloves changed to the color of reference image 2" />
</Frame>

### Pose Guidance

Control exact positioning and body language. Upload a pose reference image and FLUX.2 matches it precisely—perfect for maintaining consistency across shots or recreating specific poses.

**Example**: Match a pose from a reference image

<Columns cols={3}>
  <Frame caption="Input image">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/f283eaa49a9c7ec5008fe8785d88b49e75a86a6e-3648x5472.png" alt="Original input image" />
  </Frame>

  <Frame caption="Pose guidance reference">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/0c7221a85293a97f4981d58bd8fc938dbc8e6840-526x526.png" alt="Pose guidance reference image" />
  </Frame>

  <Frame caption="Result: Exact pose match">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/b6f1760484612c63e5144f7d0c35f164005f557d-960x1440.png" alt="Output with matched pose" />
  </Frame>
</Columns>

Use pose guidance to:

* Maintain consistent poses across multiple images
* Recreate specific body positions from reference photos
* Control character positioning in scenes
* Match poses from sketches or wireframes

### Extract & Recompose

Isolate products, objects, or elements from images and recompose them into new layouts. Perfect for creating product collages, marketing materials, and Instagram-ready content.

**Example**: Extract products and create an Instagram ad collage

**Prompt**: `Extract the different products from this picture. Clean them up and create a collage from them like it would be for an ad on Instagram`

<Columns cols={2}>
  <Frame caption="Input: Original product image">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/f3b90881e5969594f38ebe1cb0f73020c13fddee-1053x1520.png" alt="Original product image" />
  </Frame>

  <Frame caption="Output: Clean product collage ready for Instagram">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/9b9bd8cd77b2a614010f47da1233d22cd6b5f435-992x1440.png" alt="Product collage extracted and recomposed" />
  </Frame>
</Columns>

Use extraction to:

* Create product showcases from lifestyle photos
* Build marketing collages from product shots
* Isolate elements for social media content
* Clean up and recompose product catalogs

### Advanced Multi-Reference Techniques

**Collage Method**

<Info>
  Quality may be slightly lower with the collage method compared to using multiple separate input images. For best results, use individual reference images when possible.
</Info>

You can also use a single input image containing a collage layout to guide composition. This method is useful for quick layout experiments.

**Prompt**: `Create a cinematic street scene in front of the pastel-colored corner building. The man in the dark suit is leaning against the wall near the café entrance. The woman is walking past him, carrying one of the Azzedine Alaïa tote bags. The focus is on their contrasting styles — her relaxed, creative vibe versus his confident, formal look. The black boots are part of her outfit`

<Columns cols={2}>
  <Frame caption="Input: Collage with reference elements">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/8f171eb875ef7d921453a2b51481e918c9fe79a5-1707x1533.jpg" alt="Collage input with building, people, and accessories" />
  </Frame>

  <Frame caption="Output: Composed scene from collage elements">
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/fc1a2d78c8e6066a32e7e379557b98b1920812f3-1440x1280.jpg" alt="Cinematic street scene composed from collage elements" />
  </Frame>
</Columns>

## Using FLUX.2 API for Image Editing

FLUX.2 image editing **requires both** a **text prompt** and **an input image** to work. The input image serves as the base that will be edited according to your prompt. You can optionally include additional reference images for multi-reference editing:

* **\[max]**: Up to **8 reference images** via API, up to **10** in playground
* **\[pro]**: Up to **8 reference images** via API, up to **10** in playground
* **\[flex]**: Up to **8 reference images** via API, up to **10** in playground
* **\[klein]**: Up to **4 reference images** via API
* **\[dev]**: Recommended max **6 reference images** (open model, limited by memory)

To use FLUX.2 for image editing, you'll make a request to `/v1/flux-2-max`, `/v1/flux-2-pro-preview`, `/v1/flux-2-flex`, `/v1/flux-2-klein-4b`, `/v1/flux-2-klein-9b-preview`, or `/v1/flux-2-klein-9b`. See [Preview Endpoints](/flux_2/flux2_overview#preview-endpoints) for details on preview vs pinned models.

### Create Request

<CodeGroup>
  ```bash create_request.sh theme={null}
  # Using image URLs (simplest method)
  # flux-2-pro-preview reflects our latest advances (use flux-2-pro for a pinned model)
  request=$(curl -X POST \
    'https://api.bfl.ai/v1/flux-2-pro-preview' \
    -H 'accept: application/json' \
    -H "x-key: ${BFL_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{
      "prompt": "<What you want to edit on the image>",
      "input_image": "https://example.com/your-image.jpg",
      "input_image_2": "https://example.com/reference-2.jpg"
    }')
  echo $request
  request_id=$(echo $request | jq -r .id)
  polling_url=$(echo $request | jq -r .polling_url)
  ```

  ```python create_request.py theme={null}
  import os
  import requests

  # Option 1: Use image URLs directly (simplest)
  # flux-2-pro-preview reflects our latest advances (use flux-2-pro for a pinned model)
  response = requests.post(
      'https://api.bfl.ai/v1/flux-2-pro-preview',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': '<What you want to edit on the image>',
          'input_image': 'https://example.com/your-image.jpg',
          # 'input_image_2': 'https://example.com/reference-2.jpg',  # Optional
      },
  ).json()

  request_id = response["id"]
  polling_url = response["polling_url"]
  cost = response.get("cost")  # Cost in credits

  # Option 2: Use base64 encoded images (for local files)
  # import base64
  # from PIL import Image
  # from io import BytesIO
  #
  # image = Image.open("your_image.jpg")
  # buffered = BytesIO()
  # image.save(buffered, format="JPEG")
  # img_str = base64.b64encode(buffered.getvalue()).decode()
  # # Then use img_str as the input_image value
  ```

  ```python create_request_klein_4b.py theme={null}
  import os
  import requests

  # FLUX.2 [klein] 4B - Cost-efficient image editing
  response = requests.post(
      'https://api.bfl.ai/v1/flux-2-klein-4b',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': '<What you want to edit on the image>',
          'input_image': 'https://example.com/your-image.jpg',
          # 'input_image_2': 'https://example.com/reference-2.jpg',  # Up to 4 total
      },
  ).json()

  request_id = response["id"]
  polling_url = response["polling_url"]
  ```

  ```python create_request_klein_9b.py theme={null}
  import os
  import requests

  # FLUX.2 [klein] 9B - Balanced quality/speed (use flux-2-klein-9b for a pinned model)
  response = requests.post(
      'https://api.bfl.ai/v1/flux-2-klein-9b-preview',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': '<What you want to edit on the image>',
          'input_image': 'https://example.com/your-image.jpg',
          # 'input_image_2': 'https://example.com/reference-2.jpg',  # Up to 4 total
      },
  ).json()

  request_id = response["id"]
  polling_url = response["polling_url"]
  ```
</CodeGroup>

A successful response will be a JSON object containing the request's `id`, `polling_url`, and pricing information:

```json Response Example theme={null}
{
  "id": "task-id-here",
  "polling_url": "https://api.bfl.ai/v1/get_result?id=task-id-here",
  "cost": 4.5,           // Credits charged for this request
  "input_mp": 2.07,      // Input megapixels
  "output_mp": 2.07      // Output megapixels
}
```

The `cost` field shows the credits charged for the request. Use this to track pricing for your image editing operations.

### Poll for Result

After submitting a request, you need to poll using the returned `polling_url` to retrieve the output when ready.

<CodeGroup>
  ```bash poll_result.sh theme={null}
  while true; do
    sleep 0.5
    result=$(curl -s -X 'GET' \
      "${polling_url}" \
      -H 'accept: application/json' \
      -H "x-key: ${BFL_API_KEY}")

    status=$(echo $result | jq -r .status)
    echo "Status: $status"

    if [ "$status" == "Ready" ]; then
      echo "Result: $(echo $result | jq -r .result.sample)"
      break
    elif [ "$status" == "Error" ] || [ "$status" == "Failed" ]; then
      echo "Generation failed: $result"
      break
    fi
  done
  ```

  ```python poll_result.py theme={null}
  # This assumes that the `polling_url` variable is set.

  import time
  import os
  import requests

  while True:
      time.sleep(0.5)
      result = requests.get(
          polling_url,
          headers={
              'accept': 'application/json',
              'x-key': os.environ.get("BFL_API_KEY"),
          },
      ).json()

      if result['status'] == 'Ready':
          print(f"Image ready: {result['result']['sample']}")
          break
      elif result['status'] in ['Error', 'Failed']:
          print(f"Generation failed: {result}")
          break
  ```
</CodeGroup>

A successful response will be a JSON object containing the result, and `result['sample']` is a signed URL for retrieval.

<Warning>
  Our signed URLs are only valid for 10 minutes. Please retrieve your result within this timeframe.
</Warning>

### FLUX.2 Image Editing Parameters

<Tip>
  For image editing, FLUX.2 matches input image dimensions by default (rounded to multiples of 16). Use `width` and `height` to override.

  **Resolution:**

  * **Minimum**: 64x64
  * **Maximum**: 4MP (e.g., 2048x2048)
  * **Recommended**: Up to 2MP
  * **Output**: Always multiples of 16
</Tip>

<Warning>
  **Input image preprocessing:** FLUX.2 automatically preprocesses input images to meet resolution requirements:

  * **Images over 4MP** are resized to 4MP while preserving the aspect ratio (dimensions rounded to multiples of 16 pixels)
  * **Non-aligned dimensions** are cropped to the next smaller multiple of 16 pixels on each edge

  This means your input image may be slightly modified before processing. If pixel-perfect alignment matters for your use case, ensure your input images are already at 4MP or below with dimensions that are multiples of 16.
</Warning>

List of FLUX.2 parameters for image editing. These parameters apply to all FLUX.2 image editing endpoints (`/v1/flux-2-max`, `/v1/flux-2-pro-preview`, `/v1/flux-2-pro`, `/v1/flux-2-flex`, `/v1/flux-2-klein-4b`, `/v1/flux-2-klein-9b-preview`, `/v1/flux-2-klein-9b`) unless noted otherwise:

| Parameter                               | Type           | Default  | Description                                                                                                                                                                                                                                                                               | Required |
| --------------------------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `prompt`                                | string         |          | Text description of the edit to be applied. Supports up to **32K tokens** for long-form prompts.                                                                                                                                                                                          | **Yes**  |
| `input_image`                           | string         |          | Base64 encoded image or URL of image to use as reference. Supports up to 20MB or 20 megapixels. Input resolution: minimum **64x64**, recommended up to 2MP, maximum 4MP (e.g., 2048x2048). Dimensions must be multiples of 16.                                                            | **Yes**  |
| `input_image_2` through `input_image_8` | string         | `null`   | Additional reference images for multi-reference editing. Each parameter accepts base64 encoded image or URL. Up to 7 additional images (8 total) via API for \[max], \[pro], and \[flex]. **\[klein]**: Up to 3 additional (4 total). **\[dev]**: Recommended max 5 additional (6 total). | No       |
| `width`                                 | integer / null | `null`   | Output width in pixels. Must be a multiple of 16. If omitted, matches input image width.                                                                                                                                                                                                  | No       |
| `height`                                | integer / null | `null`   | Output height in pixels. Must be a multiple of 16. If omitted, matches input image height.                                                                                                                                                                                                | No       |
| `seed`                                  | integer / null | `null`   | Seed for reproducibility. If `null` or omitted, a random seed is used. Accepts any integer.                                                                                                                                                                                               | No       |
| `safety_tolerance`                      | integer        | `2`      | Moderation level for inputs and outputs. Value ranges from 0 (most strict) to 6 (more permissive).                                                                                                                                                                                        | No       |
| `output_format`                         | string         | `"jpeg"` | Desired format of the output image. Can be "jpeg" or "png".                                                                                                                                                                                                                               | No       |
| `guidance`                              | number / null  | `4.5`    | **\[flex only]** Guidance scale for generation. Controls how closely the output follows the prompt. Minimum: 1.5, maximum: 10, default: 4.5.                                                                                                                                              | No       |
| `steps`                                 | integer / null | `50`     | **\[flex only]** Number of inference steps. Maximum: 50, default: 50.                                                                                                                                                                                                                     | No       |
| `webhook_url`                           | string / null  | `null`   | URL for asynchronous completion notification. Must be a valid HTTP/HTTPS URL.                                                                                                                                                                                                             | No       |
| `webhook_secret`                        | string / null  | `null`   | Secret for webhook signature verification, sent in the `X-Webhook-Secret` header.                                                                                                                                                                                                         | No       |

### Multi-Reference Editing

When using multiple `input_image` parameters (`input_image`, `input_image_2`, `input_image_3`, etc.), FLUX.2 combines elements from multiple source images while maintaining consistency. This is particularly useful for:

* **Character consistency**: Maintain the same character across different scenes
* **Product mockups**: Use product reference images in various contexts
* **Style transfer**: Combine style references with content images
* **Fashion editorials**: Keep models and clothing consistent across variations

FLUX.2 understands your input images, making it possible to describe what you want to change using natural language. You can reference specific images by index number or describe elements from your input images.

**Example 1: Natural Language Descriptions**

Describe elements from your input images naturally, and FLUX.2 understands them:

**Prompt**: `The man is leaning against the wall reading a newspaper with the title "FLUX.2". The woman is walking past him, carrying one of the tote bags and wearing the black boots. The focus is on their contrasting styles — her relaxed, creative vibe versus his formal look.`

<Note>
  FLUX.2 intelligently identifies elements across multiple input images based on your descriptions, even when you don't specify exact image indices.
</Note>

**Example 2: Explicit Image Indexing**

Reference specific images by number for precise control:

**Prompt**: `Replace the top of the person from image 1 with the one from image 2`

This approach gives you explicit control over which elements come from which reference image.

**Example 3: Combining Multiple People**

Combine people from different images into a single scene:

**Prompt**: `This exact image but the couple next to the fire replaced by the people in image 2 and 3`

**API Example**: Multi-reference editing with multiple input images

```python Multi-Reference Editing Example theme={null}
import requests
import os

api_key = os.environ.get("BFL_API_KEY")

response = requests.post(
    'https://api.bfl.ai/v1/flux-2-pro-preview',
    headers={"x-key": api_key},
    json={
        "prompt": "The person from image 1 is petting the cat from image 2, the bird from image 3 is next to them",
        "input_image": "https://example.com/person.jpg",      # URL or base64
        "input_image_2": "https://example.com/cat.jpg",       # URL or base64
        "input_image_3": "https://example.com/bird.jpg",      # URL or base64
        "seed": 42,
        "output_format": "jpeg"
    }
)

request_id = response.json()["id"]
```

<Note>
  Use `input_image` for the main image, and `input_image_2` through `input_image_8` for additional reference images (up to 8 total via API). All models support up to 10 reference images in the playground. **\[dev]** recommended max 6 total.
</Note>

### Choosing the Right Model

|                      | **\[klein]**                                       | **\[max]**                        | **\[pro]**                     | **\[flex]**                    |
| -------------------- | -------------------------------------------------- | --------------------------------- | ------------------------------ | ------------------------------ |
| **Best for**         | Real-time editing, high volume                     | Highest quality, final production | Production workflows at scale  | Quality with control           |
| **Speed**            | Sub-second                                         | \< 15 seconds                     | \< 10 seconds                  | Higher latency                 |
| **Reference images** | Up to 4 (API)                                      | Up to 8 (API), 10 (playground)    | Up to 8 (API), 10 (playground) | Up to 8 (API), 10 (playground) |
| **Controls**         | Standard                                           | Standard                          | Standard                       | Adjustable steps & guidance    |
| **Grounding search** | No                                                 | Yes                               | No                             | No                             |
| **Pricing**          | 4B: $0.014 + $0.001/MP<br />9B: $0.015 + $0.002/MP | from \$0.07/MP                    | from \$0.03/MP                 | \$0.06/MP                      |

<CardGroup cols={2}>
  <Card title="FLUX.2 [klein]" icon="rocket" href="/flux_2/flux2_overview#flux2-klein-models">
    **Sub-Second Editing**

    Real-time image editing from \$0.014/image. Open weights available—runs locally on consumer GPUs (\~13GB VRAM).
  </Card>

  <Card title="FLUX.2 [max]" icon="crown">
    **Top-Tier Quality**

    Highest precision editing with state-of-the-art character consistency. Best for professional content needing the final touch.
  </Card>

  <Card title="FLUX.2 [pro]" icon="bolt">
    **Fast & Efficient**

    Best balance of speed and quality. Ideal for high-volume editing workflows.
  </Card>

  <Card title="FLUX.2 [flex]" icon="sliders">
    **Quality with Control**

    Adjustable steps and guidance. Best when you need fine-grained control over generation.
  </Card>
</CardGroup>

## What is Better Than FLUX.1

| Capability             | FLUX.1                        | FLUX.2                                                                                                                         |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Multi-reference images | 1 image                       | **\[pro]**: Up to 8 (API), 10 (playground)<br />**\[flex]**: Up to 8 (API), 10 (playground)<br />**\[dev]**: Recommended max 6 |
| Output resolution      | Up to 1.6MP (except \[ultra]) | Up to 4MP                                                                                                                      |
| Text editing           | Basic                         | Improved accuracy                                                                                                              |
| Photorealism           | Good                          | Higher fidelity on skin, hair, fabric, hands                                                                                   |
| Prompt following       | Standard                      | Enhanced complex instruction handling                                                                                          |
| World knowledge        | Limited                       | More grounded in lighting and spatial logic                                                                                    |


> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# FLUX.2 Text to Image

> FLUX.2 is the recommended model for text-to-image generation. Generate high-fidelity images with advanced control, exact colors, and flexible aspect ratios.

**FLUX.2** brings enterprise-grade efficiency and professional precision to text-to-image generation. It closes the gap between generated and real imagery with accurate hands, faces, and textures—all while respecting brand guidelines through hex-code color steering. **\[max]** offers the highest quality with grounding search for real-time information.

<Tip>
  **Try it live** — Test FLUX.2 \[max], \[pro], and \[flex] in the [playground](https://playground.bfl.ai). \[klein] is available via [API](#klein-integration) and on [Hugging Face](https://huggingface.co/black-forest-labs).
</Tip>

<Columns cols={3}>
  <Frame>
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/d32277e1afee4fe9ef2d698438f4bbc0c53ae8d5-1936x1952.jpg" alt="Photorealistic portrait generated by FLUX.2" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/39499388295e25fd5bfcb8fd3ad71d75a2096416-2048x2048.jpg" alt="Professional AI conference photograph with complex typography and hex color specifications" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/2gpum2i6/production/d7b0dd9dfc0236ad763cda9de4b17dea9f455b90-1936x1952.jpg" alt="Weather in Freiburg" />
  </Frame>
</Columns>

## Capabilities

Explore why FLUX.2 is the choice for professional workflows.

<Tabs>
  <Tab title="Photorealism & Detail">
    **Close the gap between Generated and Real.**
    FLUX.2 produces realistic image details up to 4MP: accurate hands, faces, fabrics, logos, and small objects that other models miss. Ideal for creative photography, e-commerce shots, and product marketing.

    <Columns cols={2}>
      <Frame caption="Bulldog + glam nails">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/2b08183aa662936b50e69d6806f3b46b4eeda132-960x1440.jpg" alt="Lifestyle shot" />
      </Frame>

      <Frame caption="Tiger in the forest">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/ba6306816a54782a0b16c5af6627cf29700249f2-960x1440.jpg" alt="Tiger shot" />
      </Frame>

      <Frame caption="Retro computer + pixel cabin">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/b5200b30734be1ca3bf95f3adbe01228a979de46-1440x1024.jpg" alt="Product shot" />
      </Frame>

      <Frame caption="Face in the cold">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/20370abfd1d798f34419ccd241a068ca1c997ed2-1552x656.png" alt="" />
      </Frame>
    </Columns>
  </Tab>

  <Tab title="Typography & Design">
    **From UI mockups to Infographics.**
    FLUX.2 renders clear, legible typography and adheres to complex layout instructions.

    * **Web Design:** Landing page mockups with readable headers
    * **Infographics:** Structured data visualizations
    * **Advertising:** Production-ready ad creatives

    <Columns cols={2}>
      <Frame caption="Clean typography and grid adherence">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/210fd1523579966e66503edd22d7525136b2cf8e-1072x803.png" alt="Typography poster" />
      </Frame>

      <Frame caption="Data visualization infographic">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/2355f71eb41d1da454ef3c1b820b3d7ce644bd16-1920x1920.jpg" alt="Freiburg Infographic" />
      </Frame>

      <Frame caption="Magazine cover layout">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/00ddd4ce8b582891f3b174462dc635dac4e45d46-1456x1920.jpg" alt="Magazine Cover" />
      </Frame>

      <Frame caption="Automotive advertisement">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/dd06b0f7b82ba5776e09d6827605733dcb5a7526-1456x1920.jpg" alt="Car advertisement" />
      </Frame>
    </Columns>
  </Tab>

  <Tab title="Grounding Search">
    Generate images grounded in real-time information with FLUX.2 \[max]. It searches the web when needed, so you can create visuals of yesterday’s football game, the weather in real-time of any cities, or re-create historical events.

    <Columns cols={2}>
      <Frame caption="Score of a previous football game">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/5d9c090250ee74dcd77a9b600bafeb6e53c0f692-1680x1680.jpg" />
      </Frame>

      <Frame caption="The weather in real-time of Freiburg">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/d7b0dd9dfc0236ad763cda9de4b17dea9f455b90-1936x1952.jpg" />
      </Frame>

      <Frame caption="Re-create historical events: 'GC4Q+2V Berlin, Nov. 9th 1989'">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/23784cfd7989338315503484278d66ede410de02-2032x1808.jpg" />
      </Frame>

      <Frame caption="News story about NYC snowstorm on December 15th, 2025">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/643b5ae0d2d3da93c5c258f1c9dd2dfa50b08e64-1936x1952.jpg" />
      </Frame>
    </Columns>
  </Tab>

  <Tab title="Creative & Culture">
    **Comics, Memes, and Trends.**
    FLUX.2 understands internet culture, tone, and style. Prompt in your native language with state-of-the-art instruction following.

    * **Comics & Graphic Novels:** Maintain consistent styles for storytelling
    * **Memes & Social:** Generate culturally relevant content
    * **Multilingual:** Native language support

    <Columns cols={2}>
      <Frame caption="Consistent comic book style across panels">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/ff4d90d49054184073fcf25b86ac9bcb96f0eb41-1440x832.jpg" alt="Comic Book" />
      </Frame>

      <Frame caption="Consistent comic book style across panels">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/7b767ce5259d743e8e98e408e47f9c75fb285882-1440x832.jpg" alt="Comic Book" />
      </Frame>

      <Frame caption="Consistent comic book style across panels">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/c146397a89b81fad8af3c246132bcf6163f68af3-1328x800.jpg" alt="Comic Book" />
      </Frame>

      <Frame caption="Consistent comic book style across panels">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/2630c974542af56eb8d894f394c340fdf2fd2004-1440x832.jpg" alt="Comic Book" />
      </Frame>
    </Columns>
  </Tab>

  <Tab title="Advanced Control">
    **Structured Prompting**

    Use structured prompts for precise control over generation. Perfect for production workflows and automation.

    ```json Example: Structured Prompting theme={null}
    {
      "subject": "Mona Lisa painting by Leonardo da Vinci",
      "background": "museum gallery wall, ornate gold frame",
      "lighting": "soft gallery lighting, warm spotlights",
      "style": "digital art, high contrast",
      "camera_angle": "eye level view",
      "composition": "centered, portrait orientation"
    }
    ```

    <Columns cols={2}>
      <Frame caption="Eye Level View">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/bc12fcb7269c9449f2cbc3b1d1f54c59da4850e3-1456x1424.jpg" />
      </Frame>

      <Frame caption="Worm's Eye View">
        <img src="https://cdn.sanity.io/images/2gpum2i6/production/8c3fa60821f9e0f30de348f7827547cb82b564c9-1456x1424.jpg" />
      </Frame>
    </Columns>

    **Exact Color Control**

    FLUX.2 supports precise color matching using hex color codes. Specify exact brand colors without approximation, making it ideal for professional design workflows.

    **Method 1: Using Hex Codes in Prompts**

    The best way to include hex codes in your prompt is by signaling with keywords like "color" or "hex" followed by the code:

    **Example**: Apply hex colors to specific objects

    <Frame caption="Prompt: A vase on a table in living room, the color of the vase is a gradient of color, starting with color #02eb3c and finishing with color #edfa3c. The flowers inside the vase have the color #ff0088">
      <img src="https://cdn.sanity.io/images/2gpum2i6/production/3a3bf9b588602adf581f7293611b0e59fd50eadb-1552x1520.png" alt="Vase with gradient colors and flowers using hex color specifications" />
    </Frame>
  </Tab>
</Tabs>

## Integration

Integrate FLUX.2 text-to-image generation into your application in three steps.

<Steps>
  <Step title="Authenticate">
    Get your API key from the [BFL Dashboard](https://dashboard.bfl.ai). You will use this in the `x-key` header.
  </Step>

  <Step title="Create a Generation Request">
    Send a POST request to the endpoint for your chosen model. The `prompt` is required.

    <Tabs>
      <Tab title="[klein] 4B">
        <CodeGroup>
          ```bash cURL theme={null}
          curl -X POST https://api.bfl.ai/v1/flux-2-klein-4b \
            -H 'accept: application/json' \
            -H "x-key: $BFL_API_KEY" \
            -H 'Content-Type: application/json' \
            -d '{
              "prompt": "A serene mountain landscape at golden hour, soft diffused light filtering through clouds, creating long shadows across the valley",
              "width": 1024,
              "height": 1024
            }'
          ```

          ```python Python theme={null}
          import requests, os

          response = requests.post(
              "https://api.bfl.ai/v1/flux-2-klein-4b",
              headers={
                  "accept": "application/json",
                  "x-key": os.environ.get("BFL_API_KEY"),
                  "Content-Type": "application/json",
              },
              json={
                  "prompt": "A serene mountain landscape at golden hour, soft diffused light filtering through clouds, creating long shadows across the valley",
                  "width": 1024,
                  "height": 1024,
              },
          ).json()

          request_id = response["id"]
          polling_url = response["polling_url"]
          ```
        </CodeGroup>
      </Tab>

      <Tab title="[klein] 9B">
        `flux-2-klein-9b-preview` reflects our latest advances with KV caching. Use `flux-2-klein-9b` if you need a pinned model. See [Preview Endpoints](/flux_2/flux2_overview#preview-endpoints) for details.

        <CodeGroup>
          ```bash cURL theme={null}
          curl -X POST https://api.bfl.ai/v1/flux-2-klein-9b-preview \
            -H 'accept: application/json' \
            -H "x-key: $BFL_API_KEY" \
            -H 'Content-Type: application/json' \
            -d '{
              "prompt": "A serene mountain landscape at golden hour, soft diffused light filtering through clouds, creating long shadows across the valley",
              "width": 1024,
              "height": 1024
            }'
          ```

          ```python Python theme={null}
          import requests, os

          response = requests.post(
              "https://api.bfl.ai/v1/flux-2-klein-9b-preview",
              headers={
                  "accept": "application/json",
                  "x-key": os.environ.get("BFL_API_KEY"),
                  "Content-Type": "application/json",
              },
              json={
                  "prompt": "A serene mountain landscape at golden hour, soft diffused light filtering through clouds, creating long shadows across the valley",
                  "width": 1024,
                  "height": 1024,
              },
          ).json()

          request_id = response["id"]
          polling_url = response["polling_url"]
          ```
        </CodeGroup>
      </Tab>

      <Tab title="[max]">
        <CodeGroup>
          ```bash cURL theme={null}
          curl -X POST https://api.bfl.ai/v1/flux-2-max \
            -H 'accept: application/json' \
            -H "x-key: $BFL_API_KEY" \
            -H 'Content-Type: application/json' \
            -d '{
              "prompt": "Cinematic shot of a futuristic city at sunset, 85mm lens",
              "width": 1920,
              "height": 1080,
              "safety_tolerance": 2
            }'
          ```

          ```python Python theme={null}
          import requests, os

          response = requests.post(
              "https://api.bfl.ai/v1/flux-2-max",
              headers={
                  "accept": "application/json",
                  "x-key": os.environ.get("BFL_API_KEY"),
                  "Content-Type": "application/json",
              },
              json={
                  "prompt": "Cinematic shot of a futuristic city at sunset, 85mm lens",
                  "width": 1920,
                  "height": 1080,
              },
          ).json()

          request_id = response["id"]
          polling_url = response["polling_url"]
          cost = response.get("cost")  # Cost in credits
          ```
        </CodeGroup>
      </Tab>

      <Tab title="[pro]">
        `flux-2-pro-preview` reflects our latest advances. Use `flux-2-pro` if you need a pinned model. See [Preview Endpoints](/flux_2/flux2_overview#preview-endpoints) for details.

        <CodeGroup>
          ```bash cURL theme={null}
          curl -X POST https://api.bfl.ai/v1/flux-2-pro-preview \
            -H 'accept: application/json' \
            -H "x-key: $BFL_API_KEY" \
            -H 'Content-Type: application/json' \
            -d '{
              "prompt": "Cinematic shot of a futuristic city at sunset, 85mm lens",
              "width": 1920,
              "height": 1080,
              "safety_tolerance": 2
            }'
          ```

          ```python Python theme={null}
          import requests, os

          response = requests.post(
              "https://api.bfl.ai/v1/flux-2-pro-preview",
              headers={
                  "accept": "application/json",
                  "x-key": os.environ.get("BFL_API_KEY"),
                  "Content-Type": "application/json",
              },
              json={
                  "prompt": "Cinematic shot of a futuristic city at sunset, 85mm lens",
                  "width": 1920,
                  "height": 1080,
              },
          ).json()

          request_id = response["id"]
          polling_url = response["polling_url"]
          cost = response.get("cost")  # Cost in credits
          ```
        </CodeGroup>
      </Tab>
    </Tabs>
  </Step>

  <Step title="Check Pricing">
    The API response includes pricing information. The `cost` field shows the credits charged for the request.

    <CodeGroup>
      ```bash cURL theme={null}
      # Response includes cost information
      {
        "id": "task-id-here",
        "polling_url": "<polling_url>",
        "cost": 3.0,           # Credits charged for this request
        "input_mp": 0.0,      # Input megapixels
        "output_mp": 2.07     # Output megapixels
      }
      ```

      ```python Python theme={null}
      response = requests.post(...).json()

      cost = response.get("cost")        # Credits charged
      input_mp = response.get("input_mp")  # Input megapixels
      output_mp = response.get("output_mp")  # Output megapixels

      print(f"Request cost: {cost} credits")
      ```
    </CodeGroup>
  </Step>

  <Step title="Retrieve the Result">
    Poll the `polling_url` until the status is `Ready`.

    <CodeGroup>
      ```bash cURL theme={null}
      # Poll until status is 'Ready'
      curl -X GET "$POLLING_URL" \
        -H 'accept: application/json' \
        -H "x-key: $BFL_API_KEY"
      ```

      ```python Python theme={null}
      import time

      while True:
          result = requests.get(
              polling_url,
              headers={"accept": "application/json", "x-key": os.environ.get("BFL_API_KEY")}
          ).json()

          if result["status"] == "Ready":
              print(f"Image URL: {result['result']['sample']}")
              break
          elif result["status"] in ["Error", "Failed"]:
              print(f"Generation failed: {result}")
              break

          time.sleep(0.5)
      ```
    </CodeGroup>
  </Step>
</Steps>

## Configuration

| Parameter           | Type          | Default  | Description                                                                                        |
| :------------------ | :------------ | :------- | :------------------------------------------------------------------------------------------------- |
| `prompt`            | string        | —        | **Required.** Text description of the image to generate.                                           |
| `width`             | integer       | `1024`   | Output width in pixels. Must be a multiple of 16.                                                  |
| `height`            | integer       | `1024`   | Output height in pixels. Must be a multiple of 16.                                                 |
| `seed`              | integer       | random   | Set for reproducible results.                                                                      |
| `safety_tolerance`  | integer       | `2`      | Moderation level: `0` (strict) to `6` (permissive).                                                |
| `output_format`     | string        | `"jpeg"` | Output format: `"jpeg"` or `"png"`.                                                                |
| `prompt_upsampling` | boolean       | `false`  | If true, performs upsampling on the prompt for enhanced detail. Not available for \[klein] models. |
| `webhook_url`       | string / null | `null`   | URL for asynchronous completion notification. Must be a valid HTTP/HTTPS URL.                      |
| `webhook_secret`    | string / null | `null`   | Secret for webhook signature verification, sent in the `X-Webhook-Secret` header.                  |

**\[flex] only parameters:**

| Parameter  | Type    | Default | Description                                                                                                                                                     |
| :--------- | :------ | :------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `steps`    | integer | `50`    | **\[flex only]** Number of inference steps. Maximum: 50, default: 50. Higher = more detail, slower.                                                             |
| `guidance` | float   | `4.5`   | **\[flex only]** Guidance scale. Controls how closely the output follows the prompt. Minimum: 1.5, maximum: 10, default: 4.5. Higher = closer prompt adherence. |

<Tip>
  **Resolution:** Minimum 64x64, maximum 4MP (e.g., 2048x2048), recommended up to 2MP. Output dimensions are always multiples of 16.
</Tip>

## Model Selection

|                      | **\[klein] 4B**        | **\[klein] 9B**            | **\[max]**      | **\[pro]**          | **\[flex]**                 |
| -------------------- | ---------------------- | -------------------------- | --------------- | ------------------- | --------------------------- |
| **Best for**         | Real-time, high volume | Balance of speed & quality | Highest quality | Production at scale | Quality with control        |
| **Speed**            | Sub-second             | Sub-second                 | \< 15 seconds   | \< 10 seconds       | Higher latency              |
| **Controls**         | Standard               | Standard                   | Standard        | Standard            | Adjustable steps & guidance |
| **Grounding search** | No                     | No                         | Yes             | No                  | No                          |
| **Pricing**          | $0.014 + $0.001/MP     | $0.015 + $0.002/MP         | from \$0.07/MP  | from \$0.03/MP      | \$0.06/MP                   |

<CardGroup cols={2}>
  <Card title="FLUX.2 [klein] 4B" icon="rocket">
    **Sub-Second Generation**

    From \$0.014/image. Runs on consumer GPUs (\~13GB VRAM). Apache 2.0 license. Perfect for real-time applications and local deployment.
  </Card>

  <Card title="FLUX.2 [klein] 9B" icon="rocket">
    **Frontier Quality at Speed**

    From \$0.015/image. Matches models 5x its size. 9B flow model with 8B Qwen3 text embedder for superior prompt understanding. FLUX Non-Commercial License.
  </Card>

  <Card title="FLUX.2 [max]" icon="crown">
    **Top-Tier Quality**

    Highest image quality and prompt adherence. Includes grounding search for real-time information. Best for professional content needing the final touch.
  </Card>

  <Card title="FLUX.2 [pro]" icon="bolt">
    **Fast & Efficient**

    Best balance of speed and cost. Ideal for high-volume applications needing fast turnaround.
  </Card>

  <Card title="FLUX.2 [flex]" icon="sliders">
    **Quality with Control**

    Adjustable steps and guidance. Best when you need fine-grained control over generation.
  </Card>

  <Card title="[klein] Prompting Guide" icon="graduation-cap" href="/guides/prompting_guide_flux2_klein">
    **Narrative Prompting**

    \[klein] works best with prose-style prompts. Learn techniques for lighting, atmosphere, and scene description.
  </Card>
</CardGroup>


