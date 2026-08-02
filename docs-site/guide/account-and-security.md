# Accounts & Security

Remix Studio is a multi-user application even when deployed for one person. Libraries, projects, providers, campaigns, exports, trash, assistant conversations, and automation tokens are scoped to the authenticated user.

## Account Status and Roles

Users have an `admin` or `user` role and an `active` or `disabled` status.

Admins can:

- Create and manage invite codes.
- View users and change account status.
- Reset passwords.
- Set per-user storage limits.

A disabled user cannot sign in or open a project live connection. Existing access tokens are also checked against current account state.

## Registration and Invites

Self-registration is invite based. An invite has an encrypted/hash-protected code, optional note and expiry, a maximum-use count, and redemption records. Google-based registration still requires a valid invite; Google OAuth is not an unrestricted public-signup switch.

The first administrator can be bootstrapped with `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`. The user is created only when that email does not already exist.

::: warning
Replace the bootstrap password immediately and remove it from long-lived environment files when your deployment process permits. Leaving the same default credentials in every environment increases recovery and disclosure risk.
:::

## Sign-in Methods

### Password

Passwords are hashed with bcrypt and must be at least eight characters when changed. Accounts created through another method may have no password.

You can remove a password only after registering at least one passkey, and the current password is required for the removal. This prevents removing the last usable sign-in method through the account screen.

### Google

Google OAuth can sign in an existing account and complete invite-based registration. Configure the client ID, secret, and exact callback described in [Configuration](/guide/configuration).

### Passkeys

Passkeys use WebAuthn for passwordless sign-in. Register and name one or more credentials under **Account → Security**; the account page shows creation and last-used times and lets you revoke a credential.

WebAuthn validates:

- `WEBAUTHN_RP_ID` — public host only, with no scheme or port.
- `WEBAUTHN_ORIGIN` — exact browser origin including scheme and any non-default port.
- `WEBAUTHN_RP_NAME` — display name shown by the authenticator.

Changing the public domain requires corresponding WebAuthn configuration and may make previously registered credentials unusable on the new relying party.

### TOTP Two-Factor Authentication

TOTP 2FA adds a six-digit authenticator code to password sign-in. Setup uses a temporary secret and QR code, then requires a valid code before activation. Disabling 2FA requires a current TOTP code and, when the account has a password, that password too.

Passkey sign-in is already possession-based and follows the WebAuthn flow rather than the password-plus-TOTP flow.

## Sessions

Successful sign-in sets two HttpOnly, `SameSite=Lax` cookies:

- A short-lived signed access token.
- A database-backed refresh token with a 30-day expiry.

Refresh tokens rotate. The previous row is retained briefly as a rotation tombstone so a lost/concurrent response can be recovered inside a grace window. Reuse outside that window deletes the rotation chain and requires a new sign-in.

Access tokens include the user's session version. Security-sensitive admin/password/status operations can increment that version, invalidating older tokens. Normal application upgrades do **not** inherently invalidate every session; specific historical migrations or security releases may do so and are called out in release notes.

Signing out deletes the current refresh-token chain on a best-effort basis and clears both cookies. Expired sessions and old rotation tombstones are cleaned periodically.

## Rate Limiting and Proxies

Login, 2FA, and related authentication flows use an in-memory rate limiter keyed partly by client address. Behind a reverse proxy, enable `TRUST_PROXY` only when the proxy is trusted and overwrites forwarding headers.

Rate-limit state is per server process. For a multi-instance public deployment, add upstream rate limiting at the load balancer or gateway.

## Provider and External Tokens

Provider credentials, social/store access tokens, and connected-service refresh tokens are encrypted at rest. Their recoverability depends on `PROVIDER_ENCRYPTION_KEY`, which must remain stable and be backed up separately from PostgreSQL.

MCP personal access tokens are stored as hashes and displayed only at creation. OAuth/PAT access is scoped to `mcp:tools`; revoke unused tokens and clients from **Assistant Settings → MCP**.

## Storage Limits

Every user has a byte limit. Storage analysis includes projects, libraries, export archives, and trash. Generation and export routes perform preflight estimates before accepting work, while admins can change the underlying limit.

See [Storage](/concepts/storage) for what is counted and where estimates can differ from final output size.

## Deployment Checklist

- Use HTTPS for cookies, OAuth callbacks, passkeys, and PWA features.
- Set strong, unique `JWT_SECRET` and `PROVIDER_ENCRYPTION_KEY` values.
- Keep the encryption key out of the database backup and store a recoverable secret backup.
- Configure exact public `APP_URL`, WebAuthn origin/RP ID, and OAuth callbacks.
- Restrict `/api/internal/*` at the proxy if the deployment is public.
- Enable `TRUST_PROXY` only behind a controlled proxy.
- Disable unused accounts and revoke unused passkeys, MCP tokens, social channels, and store connections.
