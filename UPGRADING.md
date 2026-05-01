# Upgrading

When pulling new changes, always run database migrations before restarting the server:

```bash
npx prisma migrate deploy
```

## Breaking changes to be aware of

- **All existing sessions are invalidated after upgrading.** The authentication system was hardened to use HttpOnly cookies exclusively and now includes a session version in each token. Existing JWTs will no longer be accepted. All users will need to sign in again.
- **Reference image URLs can use HTTP or HTTPS, but cannot point to private IPs.** Jobs that reference images via internal network addresses will be rejected.
