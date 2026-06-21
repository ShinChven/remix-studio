# Upgrading

When pulling new changes, **always run database migrations before restarting the server**:

```bash
npx prisma migrate deploy
```

In Docker deployments, the application container runs `prisma migrate deploy` automatically on startup before launching the server.

## Pinning Versions

- For default-branch tracking, use the `latest` image tag.
- For stable production deployments, pin `REMIX_STUDIO_IMAGE` to a release tag such as `ghcr.io/shinchven/remix-studio:1.5.0`.

See [Docker Deployment](/guide/docker-deployment) for image-tag details.

## Breaking Changes to Be Aware Of

- **All existing sessions are invalidated after upgrading.** The authentication system was hardened to use HttpOnly cookies exclusively and now includes a session version in each token. Existing JWTs are no longer accepted, so all users must sign in again.
- **Reference image URLs can use HTTP or HTTPS, but cannot point to private IPs.** Jobs that reference images via internal network addresses will be rejected.

## Keep PROVIDER_ENCRYPTION_KEY Stable

::: danger
Do not change `PROVIDER_ENCRYPTION_KEY` across upgrades unless you are also re-encrypting stored provider credentials. Existing provider API keys are encrypted with this value.

If you previously ran an older version with a longer key value, the app may have been using only the first 64 hex characters — keep that same effective 64-character value when upgrading, or saved credentials may fail to decrypt.
:::

## Recommended Upgrade Procedure (Docker)

1. **Back up the database** first — see [Backup & Restore](/operations/backup-and-restore).
2. Pull the new image (or update `REMIX_STUDIO_IMAGE`).
3. Restart the stack; the container applies migrations on startup.
4. Confirm health at `/healthz` and `/readyz`.
5. Notify users that they will need to sign in again.

## Changelog

All notable changes are documented by version in the project's `CHANGELOG.md` and on the [GitHub Releases](https://github.com/ShinChven/remix-studio/releases) page.
