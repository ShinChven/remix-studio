# Docker Deployment Templates

These templates are intended to be copied into a separate deployment repository after this repository publishes Docker images to GHCR.

## Recommended layouts

- `compose.aws-s3.yml`: app + PostgreSQL, with object storage on AWS S3 or another managed S3-compatible service
- `compose.minio.yml`: app + PostgreSQL + MinIO, for a fully self-hosted single-host deployment
- `compose.app-only.yml`: app only, for environments that already provide PostgreSQL and object storage

## Matching environment files

- `env.aws-s3.example`
- `env.cloudflare-r2.example`
- `env.gcs.example`
- `env.aliyun-oss.example`
- `env.minio.example`
- `env.app-only.example`

## Storage backend guides

- `STORAGE_PROVIDERS.md`: provider-specific S3-compatible configuration notes for AWS S3, Cloudflare R2, Google Cloud Storage, and Alibaba Cloud OSS

## Suggested workflow

1. Let GitHub Actions build and publish the image from this repository
2. In the deployment repository, pin `REMIX_STUDIO_IMAGE` to a release tag such as `ghcr.io/shinchven/remix-studio:1.0.0`
3. Copy one compose file and its matching env example
4. Replace all placeholder secrets before deployment
5. If you use passkeys, set `WEBAUTHN_RP_ID` to the public site domain only, without protocol or port. Example: `app.example.com` or `example.com`
6. If TLS terminates at a reverse proxy or load balancer, set `WEBAUTHN_ORIGIN` to the exact external origin, including `https://`. Example: `https://app.example.com`

## Image tags and cleanup

- `edge` tracks the latest successful build from the default branch
- `latest` is only published from version tags and points to the newest release
- Version tags publish `1.0.0`, `1.0`, and `1` style tags from `v1.0.0`
- `.github/workflows/ghcr-cleanup.yml` removes old untagged GHCR images weekly, keeps the newest 20 untagged images, and validates multi-architecture image integrity after cleanup

## Example commands

```bash
cp docker/env.aws-s3.example .env
docker compose -f docker/compose.aws-s3.yml --env-file .env up -d
```

```bash
cp docker/env.minio.example .env
docker compose -f docker/compose.minio.yml --env-file .env up -d
```

All templates expose app health on `/healthz` and readiness on `/readyz`.
