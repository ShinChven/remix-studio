# Standalone Admin Architecture Plan

This document outlines the strategic plan and architectural considerations for separating the admin features from the main SaaS application into a standalone management dashboard.

## 1. Motivation for Separation

As the SaaS scales, decoupling the admin dashboard provides several benefits:
- **Strict Security Isolation:** Admin applications can be placed on a completely different subdomain, restrict access by IP address/VPN, and mandate a different SSO provider, reducing the security surface area of the main app.
- **Compliance (SOC2/HIPAA):** Physical separation of customer-facing code and administrative access simplifies security audits.
- **Targeted Tech Stack:** The main app requires high polish and performance. A standalone admin app can be built rapidly without worrying about consumer-grade UI/UX, or by utilizing low-code internal tooling.
- **Reduced Bundle Size:** Removing admin-specific libraries and components reduces the client bundle size for regular users.

## 2. What Needs to be Removed from the Current App

To completely strip out the admin functionality from the main SaaS, the following components and logic will need to be removed:

*   **Frontend Routes & Components:** 
    *   Delete `src/pages/AdminUsers.tsx`.
    *   Remove the `/admin/users` route from `src/App.tsx`.
    *   Remove the `ProtectedRoute`'s `adminOnly` logic.
    *   Remove the link to the admin panel in `src/components/MainLayout.tsx`.
*   **API Client Logic:** 
    *   Remove `getUsers`, `updateUserRole`, and `updateUserStorageLimit` from `src/api.ts`.
*   **Backend Routes:** 
    *   Remove the `GET /api/admin/users`, `PUT /api/admin/users/:id/role`, and `PUT /api/admin/users/:id/storage-limit` endpoints from `server/routes/auth.ts`.
*   **Auth Middleware:** 
    *   The `adminOnly` middleware in `server/auth/auth.ts` will no longer be needed.

## 3. Architecture of the Standalone Admin App

Two main paths are available for the new admin application:

### Path A: Custom Built App (React/Node.js)
Create a new repository (e.g., `remix-studio-admin`).
*   **Frontend:** A new React or Next.js app focused purely on data tables, user management, and internal metrics.
*   **Backend/Database Access:**
    *   *Option 1 (Shared Database):* The admin app connects directly to the existing PostgreSQL/Minio databases. Fastest to set up but tightly couples the admin app to the main app's database schema.
    *   *Option 2 (Admin API):* Build a dedicated internal API on the main app (secured with internal API keys) that the admin app consumes. This is safer as it maintains a single source of truth for business logic.

### Path B: Low-Code Internal Tooling (Recommended)
Instead of building and maintaining a second React app from scratch, use tools like **Retool**, **Appsmith**, or **Refine**.
*   Connect these tools directly to the database or an internal API.
*   They provide pre-built data grids, forms, and role-based access controls out of the box, significantly reducing development time.

## 4. Authentication Considerations

Separating the apps introduces challenges with authentication:
*   **Single Sign-On (SSO):** If admin users log in with the same credentials used for the main app, the authentication provider must support multiple applications.
*   **Isolated Admin Auth:** Often, it's preferable to use completely different authentication for admins (e.g., Google Workspace SSO for employees) to keep customer data perfectly isolated from internal employee access.

## 5. Transition Strategy

The transition should be executed in phases to minimize disruption:
1.  **Build First, Delete Second:** Build the standalone admin app or set up the low-code tool before touching the main codebase.
2.  **Verify:** Ensure the new admin dashboard can successfully and securely read and modify user roles and storage limits in the database.
3.  **Clean Up:** Once the new tool is verified in production, perform the cleanup in the main `remix-studio` codebase, removing all the code identified in Section 2.