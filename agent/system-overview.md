# System Overview

This document gives AI agents and developers a high-level map of Remix Studio's main subsystems.

## Current Stack

- Frontend: React 19, Vite, React Router
- Server: Hono on Node.js
- Database: PostgreSQL with Prisma
- Object storage: S3-compatible storage, including MinIO
- Image processing: Sharp

## Authentication and Access

- Email/password authentication with JWT-based sessions
- Admin and user roles
- User status controls, including disabling accounts
- TOTP-based two-factor authentication
- Passkey/WebAuthn registration and sign-in
- Admin user management, including password reset and per-user storage limits

## Queue and Concurrency

Remix Studio includes a server-side generation queue for image jobs.

- Running a project enqueues only jobs marked as `pending`
- The queue is global in-process and groups work by provider
- Each provider has its own configurable concurrency limit, so you can control how many jobs run in parallel for that provider
- Jobs are snapshotted into `processing` state before dispatch so the worker and poller operate on resolved metadata
- Providers that return a remote task ID are handed off to a detached poller, which checks status every 30 seconds until completion or failure
- On server startup, pending jobs are re-enqueued and interrupted processing jobs are recovered so work can continue after restarts
- A storage limit check runs before enqueuing pending jobs for a project

## Providers

Providers are the AI image backends that Remix Studio uses to run generation jobs.

- Each provider stores a name, type, encrypted API key, optional API URL override, and optional model configuration
- Providers can represent different services or endpoints, such as OpenAI-compatible, Google, Vertex AI, or other supported generators in the server
- A project can use a default provider, while individual jobs can override that provider when needed
- Each provider has its own concurrency setting, which controls how many jobs can run in parallel for that provider
- Model configuration is attached to the provider, so jobs can choose a saved model profile instead of repeating raw model settings
- Provider credentials are managed inside the app rather than hardcoded into project files

## Third-party Proxies

Remix Studio facilitates the use of affordable third-party API proxies (such as [LaoZhang API](https://api.laozhang.ai/register/?aff_code=nxSr)) for accessing Google Gemini and OpenAI models at a lower cost.

To configure a proxy provider:
1. Create a new Provider with the appropriate type (`GoogleAI` or `OpenAI`).
2. Enter your proxy's API Key.
3. In the **API URL** field, enter your proxy's base domain (for example, `https://api.laozhang.ai`).
4. The app automatically handles path construction and supports dynamic model replacement.

## Libraries

Libraries are reusable collections that keep common prompt fragments and image references out of individual projects.

- Remix Studio supports both text libraries and image libraries
- Text libraries are useful for reusable prompt fragments, style blocks, subject ideas, and prompt building templates
- Image libraries are useful for reference images, moodboards, style references, and reusable visual inputs
- Each library contains ordered items, and items can include titles and tags for easier filtering and reuse
- Libraries can be edited independently from projects, so you can improve shared prompt/image collections once and reuse them across multiple workflows
- Text libraries support import and export as Markdown-style lists for bulk editing outside the app

## Exports

Remix Studio can package generated album images into downloadable ZIP archives.

- Exports are created from project album items
- Export tasks run in the background and move through `pending`, `processing`, `completed`, or `failed` states
- Completed archives are stored in a separate export bucket
- The Archive page shows export status across projects and lets users download completed ZIPs or delete export records
- Export creation performs a runtime storage quota check before uploading the ZIP archive

## Storage

Remix Studio tracks storage usage across the main image bucket, libraries, exports, and recycle bin data.

- Remix Studio uses S3-compatible object storage for generated images and archives
- For local development, the recommended storage backend is MinIO running via Docker Compose
- For deployment, you can point the app at AWS S3 or another S3-compatible storage service instead of local MinIO
- The main storage bucket holds project images, workflow assets, library images, and related media
- A separate export bucket is used for completed ZIP archives
- Storage analysis reports total usage against the user's storage limit
- Usage is broken down into projects, libraries, archives, and recycle bin categories

## Repository Structure

```text
remix-studio/
├── design/      # Design notes and implementation docs for AI agents and developers
├── prisma/      # Prisma schema and migrations
├── public/      # Static assets
├── server/      # API, auth, storage, queue, and generator code
├── src/         # React application
├── .env.example # Example environment variables
├── server.ts    # Local server entry point
└── docker-compose.yml
```
