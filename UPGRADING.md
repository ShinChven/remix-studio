# Upgrading

When pulling new changes in a Docker deployment and the app container is already running, run the upgrade step with `docker exec` before restarting the server:

```bash
docker exec -it remix-studio-app node /app/docker/upgrade.mjs
```

Then restart the app container:

```bash
docker restart remix-studio-app
```

If you are running the app outside Docker, the equivalent direct command is:

```bash
npx prisma migrate deploy
```

## Breaking changes to be aware of

- **All existing sessions are invalidated after upgrading.** The authentication system was hardened to use HttpOnly cookies exclusively and now includes a session version in each token. Existing JWTs will no longer be accepted. All users will need to sign in again.
- **Reference image URLs can use HTTP or HTTPS, but cannot point to private IPs.** Jobs that reference images via internal network addresses will be rejected.
