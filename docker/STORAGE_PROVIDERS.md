# S3-Compatible Storage Configuration

This app writes generated images and export archives to two buckets:

- `S3_BUCKET`
- `S3_EXPORT_BUCKET`

For managed object stores, the safest production default is:

- pre-create both buckets
- set `S3_AUTO_CREATE_BUCKET=false`
- use provider-issued access keys or the provider's native IAM mechanism

`S3_PUBLIC_ENDPOINT` should usually be left blank unless you intentionally want presigned download URLs to use a different S3-compatible hostname.

## AWS S3

Recommended when you want the least amount of compatibility risk.

```env
AWS_REGION=us-east-1
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_PUBLIC_ENDPOINT=
S3_AUTO_CREATE_BUCKET=false
```

Notes:

- Leave `S3_ENDPOINT` empty so the AWS SDK uses normal AWS S3 endpoint resolution.
- If the container runs on EC2, ECS, or another AWS environment with an IAM role, you can leave `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` empty.
- If you are not using IAM roles, fill `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` with an IAM user's credentials that can access both buckets.

## Cloudflare R2

Use R2's S3-compatible API endpoint and access keys.

```env
AWS_REGION=us-east-1
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_PUBLIC_ENDPOINT=
S3_AUTO_CREATE_BUCKET=false
```

Notes:

- Replace `<ACCOUNT_ID>` with your Cloudflare account ID.
- For this app, `AWS_REGION=us-east-1` is the simplest choice. Cloudflare documents R2's bucket region as `auto`, and also documents that `us-east-1` aliases to `auto`.
- Create the buckets in R2 first, then keep `S3_AUTO_CREATE_BUCKET=false`.

## Google Cloud Storage

Use the XML API endpoint and Cloud Storage HMAC keys.

```env
AWS_REGION=auto
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY_ID=<GCS_HMAC_ACCESS_ID>
S3_SECRET_ACCESS_KEY=<GCS_HMAC_SECRET>
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_PUBLIC_ENDPOINT=
S3_AUTO_CREATE_BUCKET=false
```

Notes:

- Use Cloud Storage HMAC credentials, not a service account JSON key file, for the S3-compatible path.
- Pre-create both buckets in Cloud Storage.
- `AWS_REGION=auto` matches Google's own S3 SDK interoperability examples.

## Alibaba Cloud OSS

Use the OSS S3-compatible endpoint for your region.

```env
AWS_REGION=oss-cn-hangzhou
S3_ENDPOINT=https://s3.oss-cn-hangzhou.aliyuncs.com
S3_ACCESS_KEY_ID=<ALIYUN_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<ALIYUN_ACCESS_KEY_SECRET>
S3_BUCKET=your-images-bucket
S3_EXPORT_BUCKET=your-exports-bucket
S3_PUBLIC_ENDPOINT=
S3_AUTO_CREATE_BUCKET=false
```

Notes:

- Replace the region in both `AWS_REGION` and `S3_ENDPOINT` with your actual OSS region.
- Pre-create both OSS buckets.
- Alibaba Cloud documents S3-compatible public endpoints in the form `https://s3.oss-<region>.aliyuncs.com`.
- For Chinese mainland regions, Alibaba Cloud documents an extra restriction for some newer OSS accounts: you may need to use a custom domain name (CNAME) for data API operations instead of the default public endpoint.

## Quick checks before deployment

- Confirm the image bucket and export bucket both already exist.
- Confirm the credentials can read, write, list, and delete objects in both buckets.
- Keep `S3_PUBLIC_ENDPOINT` empty unless you have explicitly tested presigned downloads with that hostname.
- If you switch providers later, do not change `PROVIDER_ENCRYPTION_KEY` unless you are also re-encrypting stored provider secrets.
