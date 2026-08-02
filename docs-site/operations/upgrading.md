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

## Compatibility Notes

- Normal upgrades do not automatically invalidate every current session. Individual security migrations or releases can change token/session behavior; read the release notes between your current and target versions.
- Reference URLs can use HTTP or HTTPS, but server-side provider and media fetches reject unsafe private/internal network targets.
- Database migrations are forward operations. Restore the pre-upgrade database and matching object-storage snapshot if a rollback requires an older schema.

## Keep PROVIDER_ENCRYPTION_KEY Stable

::: danger
Do not change `PROVIDER_ENCRYPTION_KEY` across upgrades unless you are also re-encrypting stored provider credentials. Existing provider API keys are encrypted with this value.

If you previously ran an older version with a longer key value, the app may have been using only the first 64 hex characters — keep that same effective 64-character value when upgrading, or saved credentials may fail to decrypt.
:::

## Recommended Upgrade Procedure (Docker)

1. **Back up the database** first — see [Backup & Restore](/operations/backup-and-restore).
2. Back up the main/export buckets and confirm the encryption key is recoverable.
3. Read every release note between the installed and target versions.
4. Pull the new image (or update `REMIX_STUDIO_IMAGE`).
5. Restart the stack; the container applies migrations on startup.
6. Confirm health at `/healthz` and `/readyz`.
7. Test sign-in, provider decryption, representative media, queue dispatch, and export download.

## Changelog

For a user-facing tour of what changed in each release, see [What's New](/whats-new).

The full technical record is documented by version in the project's `CHANGELOG.md` and on the [GitHub Releases](https://github.com/ShinChven/remix-studio/releases) page.
