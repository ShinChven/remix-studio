# API And Auth Security Analysis

Date: 2026-04-09

Scope:

- API routes under `server/routes/`
- Authentication and session code under `server/auth/`
- Repository ownership checks under `server/db/`
- Client-side auth token handling under `src/`

Method:

- Static code review only
- No runtime exploitation or infrastructure testing

## Summary

The biggest problems are not crypto bugs. They are access-control and trust-boundary bugs.

The highest-risk issues are:

1. A logged-in user can potentially overwrite another user’s project data if they know the victim project ID.
2. A logged-in user can potentially modify or delete another user’s library items if they know the relevant IDs.
3. The server will make outbound requests to user-controlled URLs, which creates an SSRF risk.
4. Login throttling is weak and the 2FA verification step is not rate-limited.
5. Passkey verification does not require strong user verification.
6. JWTs are exposed to browser JavaScript and are not revoked after password changes.

## Priority Order

Patch in this order:

1. Fix project ownership enforcement
2. Fix library item ownership enforcement
3. Lock down SSRF paths
4. Add proper rate limits to login and 2FA
5. Tighten session handling and token revocation
6. Raise passkey assurance requirements

## Findings

### 1. Cross-user project modification is possible

Severity: Critical

What this means:

- The route checks authentication, but the deeper database write path does not fully enforce ownership.
- If a user knows another user’s project ID, they may be able to replace that project’s jobs or workflow.

Why this matters:

- This is a tenant-isolation failure.
- In a multi-user deployment, one user should never be able to mutate another user’s data.

Where:

- `server/routes/projects.ts`
- `server/db/project-repository.ts`
- `src/pages/ProjectForm.tsx`

Important code paths:

- `server/routes/projects.ts:262`
- `server/db/project-repository.ts:117`
- `server/db/project-repository.ts:129`
- `server/db/project-repository.ts:133`
- `server/db/project-repository.ts:433`
- `server/db/project-repository.ts:488`
- `src/pages/ProjectForm.tsx:36`
- `src/pages/ProjectForm.tsx:102`

Why it happens:

- `updateProject()` does a user-scoped update on the project row.
- But even if that update matches nothing, it still calls `saveJobs()` and `saveWorkflow()`.
- Those functions write by `projectId` and nested record IDs, not by a confirmed owned project record.
- Project IDs are user-chosen and not guaranteed to be secret.

Recommended fix:

- First fetch the project by both `projectId` and `userId`.
- If it does not exist, stop immediately with `404`.
- Only then allow any nested job/workflow writes.
- In `saveJobs()` and `saveWorkflow()`, add ownership constraints or require a verified owned project record.

### 2. Cross-user library item modification is possible

Severity: High

What this means:

- A logged-in user may be able to add, edit, reorder, or delete another user’s library items if they know the library or item IDs.

Why this matters:

- This is another tenant-isolation failure.
- Libraries are shared building blocks inside the product, so corruption here can impact project generation behavior.

Where:

- `server/routes/libraries.ts`
- `server/db/library-repository.ts`

Important code paths:

- `server/routes/libraries.ts:189`
- `server/routes/libraries.ts:220`
- `server/routes/libraries.ts:255`
- `server/routes/libraries.ts:272`
- `server/routes/libraries.ts:289`
- `server/db/library-repository.ts:88`
- `server/db/library-repository.ts:104`
- `server/db/library-repository.ts:120`
- `server/db/library-repository.ts:133`
- `server/db/library-repository.ts:137`

Why it happens:

- The route layer passes `userId`.
- The repository methods then update or delete `libraryItem` rows by bare item ID.
- Those writes do not re-check that the parent library belongs to the caller.

Recommended fix:

- Before writing a library item, verify the library belongs to `userId`.
- For updates and deletes, scope the query through the parent library ownership.
- Do not use global `update({ where: { id } })` or `delete({ where: { id } })` for user-owned nested records.

### 3. SSRF risk through provider URLs and reference image fetching

Severity: High

What this means:

- The server will fetch URLs that users can control.
- That can let a normal user make the server connect to internal services or attacker-controlled endpoints.

Why this matters:

- SSRF can expose cloud metadata services, private admin panels, internal APIs, or other network-only resources.
- It can also be used to bounce sensitive image bytes or internal responses to an attacker.

Where:

- `server/queue/queue-manager.ts`
- `server/routes/providers.ts`
- `server/generators/openai-generator.ts`
- `server/generators/google-ai-generator.ts`
- `server/generators/vertex-ai-generator.ts`

Important code paths:

- `server/queue/queue-manager.ts:279`
- `server/queue/queue-manager.ts:287`
- `server/routes/providers.ts:31`
- `server/routes/providers.ts:74`
- `server/generators/openai-generator.ts:10`
- `server/generators/google-ai-generator.ts:20`
- `server/generators/vertex-ai-generator.ts:22`

Why it happens:

- Job reference images can be remote `http` URLs, and the server downloads them.
- Provider `apiUrl` can be supplied by users and is then used as an outbound server-side request target.

Recommended fix:

- Do not allow arbitrary outbound URLs by default.
- Add an allowlist of supported provider hosts.
- Reject private, loopback, link-local, and metadata IP ranges.
- For reference images, prefer uploaded assets stored in your own object storage instead of arbitrary remote URLs.

### 4. Login and 2FA brute-force resistance is weak

Severity: High

What this means:

- The login limiter can be bypassed or weakened.
- The second-factor verification step has no rate limiting at all.

Why this matters:

- Once an attacker has a correct password, the 2FA endpoint becomes the main thing protecting the account.
- Without rate limits, the attacker can keep guessing codes during the valid flow window.

Where:

- `server/routes/auth.ts`
- `server/utils/rate-limiter.ts`

Important code paths:

- `server/routes/auth.ts:59`
- `server/routes/auth.ts:61`
- `server/routes/auth.ts:156`
- `server/utils/rate-limiter.ts:1`

Why it happens:

- Rate limiting is keyed by headers like `x-forwarded-for`, which are not trustworthy unless the app is behind a controlled proxy that rewrites them.
- The limiter is in-memory, so it resets on restart and does not coordinate across multiple instances.
- `/api/auth/2fa/verify-login` has no throttle.

Recommended fix:

- Apply rate limits to both password login and 2FA verification.
- Use a real shared store such as Redis.
- Key limits by a combination of account identifier and trusted network information.
- Only trust forwarded IP headers when a known reverse proxy is in front of the app.

### 5. Passkey flow accepts weaker assurance than expected

Severity: Medium

What this means:

- The passkey flow accepts user presence, but does not require verified user identity such as device PIN or biometrics.

Why this matters:

- In many deployments, passkeys are expected to prove stronger user verification than a simple hardware touch.
- This is not necessarily a break, but it lowers assurance.

Where:

- `server/auth/webauthn.ts`
- `server/routes/auth.ts`

Important code paths:

- `server/auth/webauthn.ts:273`
- `server/auth/webauthn.ts:295`
- `server/auth/webauthn.ts:330`
- `server/auth/webauthn.ts:387`
- `server/auth/webauthn.ts:416`
- `server/routes/auth.ts:369`

Why it happens:

- Registration and authentication both use `userVerification: 'preferred'`.
- Verification enforces `userPresent`, not `userVerified`.
- The result includes `userVerified`, but the login route does not require it.

Recommended fix:

- Change passkey policies to require `userVerification: 'required'`.
- Reject assertions where `userVerified` is false.
- Decide whether this stricter policy should apply to both registration and login.

### 6. Session token handling is weaker than it looks

Severity: Medium

What this means:

- The app sets an `HttpOnly` cookie, but also returns the JWT to the frontend and stores it in `localStorage`.
- That means any XSS bug can steal the session token.

Why this matters:

- `HttpOnly` cookies are meant to keep tokens away from browser JavaScript.
- Returning the same token in JSON removes most of that benefit.

Where:

- `server/routes/auth.ts`
- `src/contexts/AuthContext.tsx`
- `src/api.ts`

Important code paths:

- `server/routes/auth.ts:36`
- `server/routes/auth.ts:48`
- `src/contexts/AuthContext.tsx:20`
- `src/contexts/AuthContext.tsx:46`
- `src/api.ts:3`

Why it happens:

- After login, the server sets a cookie and also returns the token in the response body.
- The client stores that token in `localStorage` and sends it in the `Authorization` header on later requests.

Recommended fix:

- Pick one session transport.
- Prefer `HttpOnly`, `Secure`, `SameSite` cookies and stop exposing JWTs to JavaScript.
- Remove `localStorage` token storage.
- If bearer tokens must stay, treat the app as fully XSS-sensitive and harden accordingly.

### 7. Password changes do not revoke existing JWTs

Severity: Medium

What this means:

- If a JWT is stolen, changing the password does not invalidate that token.
- The token remains usable until expiry.

Why this matters:

- Users expect a password reset to cut off old sessions.
- Right now, a stolen token can survive for up to the token lifetime.

Where:

- `server/routes/auth.ts`
- `server/auth/auth.ts`

Important code paths:

- `server/routes/auth.ts:110`
- `server/routes/auth.ts:135`
- `server/routes/auth.ts:649`
- `server/routes/auth.ts:666`
- `server/auth/auth.ts:61`

Why it happens:

- JWT validation checks signature and expiry, but not any server-side session version or revocation marker.
- Password changes only update the password hash.

Recommended fix:

- Add a token version or session version field on the user record.
- Include that version in JWTs.
- Increment it on password change, admin reset, account disable, and other security events.

## Configuration Notes

### Default-secret fallback should not exist in production code

Severity: Medium

Where:

- `server/auth/auth.ts:7`
- `server.ts:35`
- `.env.example:21`

Concern:

- The auth layer has a hardcoded fallback JWT secret for non-production use.
- That is convenient for development, but dangerous if a deployment is misconfigured.

Recommended fix:

- Remove the default fallback entirely.
- Require `JWT_SECRET` in every environment except perhaps an explicitly marked test environment.

## What Was Not Tested

- Reverse-proxy and header trust behavior in a real deployment
- CORS behavior
- CSP and other browser hardening headers
- Practical exploitation against a live environment
- Dependency and supply-chain review

## Short Remediation Checklist

- Enforce ownership before any nested project writes
- Enforce ownership before any library item writes
- Remove or strictly allowlist outbound user-controlled URLs
- Add shared rate limits for login and 2FA
- Move session auth to `HttpOnly` cookie only
- Add JWT revocation or token versioning
- Require verified passkey authentication
- Remove default JWT secret fallback

## Recommendation

If only one patch batch can be done first, it should be the ownership fixes in projects and libraries. Those are the clearest cross-user data integrity risks.
