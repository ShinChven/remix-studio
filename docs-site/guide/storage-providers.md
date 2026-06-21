# Storage Providers

Remix Studio writes generated images and export archives to two S3-compatible buckets:

- `S3_BUCKET` — project images, workflow assets, and library media
- `S3_EXPORT_BUCKET` — completed ZIP export archives

For managed object stores, the safest production default is:

- Pre-create **both** buckets.
- Set `S3_AUTO_CREATE_BUCKET=false`.
- Use provider-issued access keys or the provider's native IAM mechanism.

`S3_PUBLIC_ENDPOINT` should usually be left blank unless you intentionally want presigned download URLs to use a different S3-compatible hostname.

## AWS S3

Recommended when you want the least amount of compatibility risk.

```ini
AWS_REGION=us-east-1
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_PUBLIC_ENDPOINT=
S3_EXPORT_PUBLIC_ENDPOINT=
S3_PUBLIC_CUSTOM_DOMAIN=false
S3_EXPORT_PUBLIC_CUSTOM_DOMAIN=false
S3_AUTO_CREATE_BUCKET=false
```

- Leave `S3_ENDPOINT` empty so the AWS SDK uses normal AWS S3 endpoint resolution.
- On EC2, ECS, or other AWS environments with an IAM role, you can leave the access key and secret empty.
- Otherwise, fill them with an IAM user that can access both buckets.

## Cloudflare R2

Use R2's S3-compatible API endpoint and access keys.

```ini
AWS_REGION=us-east-1
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_AUTO_CREATE_BUCKET=false
```

Replace `<ACCOUNT_ID>` with your Cloudflare account ID.

## Google Cloud Storage

Use Cloud Storage HMAC credentials (not a service account JSON key) for the S3-compatible path.

```ini
AWS_REGION=auto
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY_ID=<GCS_HMAC_ACCESS_ID>
S3_SECRET_ACCESS_KEY=<GCS_HMAC_SECRET>
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_AUTO_CREATE_BUCKET=false
```

- Pre-create both buckets in Cloud Storage.
- `AWS_REGION=auto` matches Google's own S3 SDK interoperability examples.

## Alibaba Cloud OSS

Use the OSS S3-compatible endpoint for your region.

```ini
AWS_REGION=oss-cn-hangzhou
S3_ENDPOINT=https://s3.oss-cn-hangzhou.aliyuncs.com
S3_ACCESS_KEY_ID=<ALIYUN_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<ALIYUN_ACCESS_KEY_SECRET>
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_AUTO_CREATE_BUCKET=false
```

- Replace the region in both `AWS_REGION` and `S3_ENDPOINT` with your actual OSS region.
- Pre-create both OSS buckets.
- For some newer OSS accounts in Chinese mainland regions, you may need a custom domain (CNAME) for data API operations instead of the default public endpoint.

## Third-Party API Proxies

Remix Studio can use affordable third-party API proxies for accessing Google Gemini and OpenAI models at a lower cost. To configure a proxy provider:

1. Create a new [Provider](/concepts/providers) with the appropriate type (`GoogleAI` or `OpenAI`).
2. Enter your proxy's API key.
3. In the **API URL** field, enter your proxy's base domain (for example `https://api.laozhang.ai`).
4. The app handles path construction and supports dynamic model replacement.

## Quick Checks Before Deployment

- Confirm the image bucket and export bucket both already exist.
- Confirm the credentials can read, write, list, and delete objects in both buckets.
- Keep `S3_PUBLIC_ENDPOINT` empty unless you have explicitly tested presigned downloads with that hostname.
- If you switch providers later, do not change `PROVIDER_ENCRYPTION_KEY` unless you are also re-encrypting stored provider secrets.
