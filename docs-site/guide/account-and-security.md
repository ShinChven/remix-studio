# Accounts & Security

Remix Studio is multi-user and self-hosted. Access is protected by authentication, role-based controls, and optional strong-auth factors.

## Authentication Methods

- **Email/password** with JWT-based sessions stored in HttpOnly cookies.
- **Google OAuth** for existing-user login and invite-based registration (requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).
- **Passkeys / WebAuthn** registration and sign-in.
- **Two-factor authentication (2FA)** using TOTP.

## Roles & Access Control

- **Admin** and **user** roles.
- User status controls, including disabling accounts.
- Admin user management, including password reset and per-user storage limits.
- Invite-code-based registration.

Admins manage users and invites from the admin screens (Admin → Users, Admin → Invites).

## Two-Factor Authentication

Set up TOTP-based 2FA from **Account → Security**. Once enabled, sign-in requires a code from your authenticator app in addition to your password.

## Passkeys

Register a passkey from your account settings for passwordless WebAuthn sign-in. For deployments behind a reverse proxy, configure:

- `WEBAUTHN_RP_ID` — the public site domain only (no protocol or port), e.g. `app.example.com`.
- `WEBAUTHN_ORIGIN` — the exact external origin including `https://`, e.g. `https://app.example.com`.
- `WEBAUTHN_RP_NAME` — the name shown during registration (defaults to `Remix Studio`).

## Storage Limits

Each user has a storage limit. Usage is tracked across projects, libraries, archives, and recycle-bin data, and is checked before enqueuing generation jobs or creating exports. See [Storage](/concepts/storage).

## Session Behavior

The authentication system uses HttpOnly cookies exclusively and embeds a session version in each token.

::: warning Upgrades invalidate sessions
After upgrading, all existing sessions are invalidated and every user must sign in again. See [Upgrading](/operations/upgrading).
:::

## Default Admin

On first boot, the app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are set and that user does not already exist. Change the password after first sign-in.
