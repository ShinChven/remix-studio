# Model Context Protocol (MCP) and OAuth 2.1 Implementation Guide

## Introduction

Remix Studio integrates the **Model Context Protocol (MCP)** to empower AI models with the ability to interact directly with the project's ecosystem. By exposing a set of specialized tools, Remix Studio allows LLMs to list libraries, search for prompts, create new content, and manage storage resources. To ensure these interactions are secure and standards-compliant, the project implements a robust **OAuth 2.1 Connector**.

This document provides a deep dive into the architectural design, implementation details, and security mechanisms of both the MCP server and the OAuth 2.1 authorization layer. It serves as a comprehensive reference for developers looking to understand, maintain, or extend the platform's AI-ready interfaces.

---

## 1. OAuth 2.1 Connector Architecture

The OAuth 2.1 implementation in Remix Studio is designed to be a modern, secure authorization server that adheres to the latest RFC standards. Unlike traditional OAuth 2.0, OAuth 2.1 consolidates security best practices, such as requiring PKCE (Proof Key for Code Exchange) and prohibiting insecure grant types like the Implicit Grant.

### 1.1 Core Components and RFC Compliance

The authorization server is implemented in `server/routes/oauth.ts` using the Hono framework. It implements several key specifications:

- **RFC 8414 (Authorization Server Metadata):** The server exposes a metadata endpoint at `/.well-known/oauth-authorization-server`. This allows clients to automatically discover the authorization endpoint, token endpoint, supported scopes (`mcp:tools`), and supported grant types (`authorization_code`, `refresh_token`). This discovery mechanism is crucial for cross-platform compatibility, enabling tools like Claude Desktop to "find" the Remix Studio endpoints without manual configuration.
- **RFC 9728 (Protected Resource Metadata):** The metadata for the protected MCP resource is available at `/.well-known/oauth-protected-resource`. It points to the MCP endpoint (`/mcp`) and lists the authorized authorization servers. This RFC is particularly important for MCP, as it allows clients to verify that they are talking to the correct resource server and that the authorization server is trusted.
- **RFC 7591 (Dynamic Client Registration):** Clients can register themselves via the `/register` endpoint. This is essential for ecosystem growth, allowing third-party MCP clients to obtain a `client_id` and `client_secret` dynamically. The registration process enforces strict redirect URI validation (must be `localhost` or `https`) to prevent redirection attacks.
- **RFC 7636 (PKCE):** Proof Key for Code Exchange is mandatory for the Authorization Code flow. The server strictly validates the `code_challenge` and `code_verifier` using the `S256` method. PKCE is used to mitigate the risk of authorization code interception, making it secure even for public clients (like browser-based apps or CLI tools) that cannot keep a secret.

### 1.2 The Authorization Flow

The primary method for obtaining access to MCP tools is the **Authorization Code Flow with PKCE**:

1.  **Authorization Request (`GET /authorize`):** The client redirects the user to the authorization endpoint. The request includes parameters such as `client_id`, `redirect_uri`, `response_type=code`, `scope`, `code_challenge`, and `state`.
2.  **Authentication Check:** Remix Studio first checks if the user is logged in by verifying the `token` cookie. If the session is missing or invalid, the user is redirected to the login page with a `next` parameter to return them to the authorization flow after signing in.
3.  **User Consent:** Once authenticated, a consent page (`renderAuthorizePage`) is displayed. This page clearly shows the client's name and the specific scope they are requesting (`mcp:tools`). This ensures transparency, as users know exactly what permissions they are granting.
4.  **Authorization Code Issuance:** Upon clicking "Approve", the server generates a cryptographically secure `oAuthAuthorizationCode`. This code is short-lived (10 minutes) and is stored in the database along with the `code_challenge` and `userId`. The user is then redirected back to the client's `redirect_uri` with the `code` and the original `state`.
5.  **Token Exchange (`POST /token`):** The client sends a POST request to the token endpoint with the `code`, `client_id`, `client_secret` (if issued), and the `code_verifier`.
6.  **Verification and Issuance:** The server hashes the `code_verifier` and compares it to the stored `code_challenge`. If they match, and the code hasn't been used before, the server issues a Bearer `access_token` (valid for 1 hour) and a `refresh_token` (valid for 30 days).

### 1.3 Personal Access Tokens (PAT)

For developers, CLI tools, or simple integrations where the complexity of OAuth is not required, Remix Studio provides **Personal Access Tokens**.
- **Creation:** Users can manage these tokens in their settings. The backend provides endpoints `GET /api/oauth/tokens` to list and `POST /api/oauth/tokens` to create.
- **One-Time Display:** When a PAT is created, the raw token (starting with `pat_`) is returned once. It is never stored in plain text and cannot be retrieved again.
- **Storage:** Only the SHA-256 hash of the token is stored, along with a `tokenPrefix` (the first 12 characters) for UI identification.
- **Revocation:** Users can revoke a PAT at any time, instantly cutting off access for any script or tool using it.

---

## 2. Model Context Protocol (MCP) Integration

The MCP server acts as the gateway between AI models (like Claude, GPT-4, or other MCP-compatible agents) and the Remix Studio backend.

### 2.1 Implementation Details

The MCP server is implemented in `server/mcp/mcp-server.ts` using the official `@modelcontextprotocol/sdk`.

- **Transport:** The server utilizes the `WebStandardStreamableHTTPServerTransport`. This transport is designed for modern web environments and works seamlessly with Hono's request/response handling. Unlike legacy SSE, this transport handles bi-directional communication more efficiently over standard HTTP.
- **Initialization:** When a request hits `/mcp`, the `createMcpRouter` middleware first authenticates the request. If authorized, it instantiates a new `McpServer` instance, passing in the `userId` so that all subsequent tool calls are scoped to that specific user.
- **Authentication Middleware:** The `resolveBearer` function is the gatekeeper. It extracts the Bearer token from the `Authorization` header and performs a two-step check:
    1.  It searches the `OAuthAccessToken` table for a matching hash.
    2.  If not found, it searches the `PersonalAccessToken` table.
    It verifies that the token is not revoked and has not expired. For Personal Access Tokens, it also updates the `lastUsedAt` timestamp for audit purposes.

### 2.2 Security Middleware

Every MCP request is passed through a Hono middleware that:
1.  Extracts the `Authorization` header.
2.  Resolves the `userId` using `resolveBearer`.
3.  If resolution fails, it returns a `401 Unauthorized` response with a `WWW-Authenticate` header. This header includes `resource_metadata`, pointing the client back to the OAuth discovery endpoints. This follows the RFC 9728 pattern, allowing smart clients to automatically trigger an OAuth flow when they receive a 401.

---

## 3. Comprehensive Tool Specification

Remix Studio currently exposes several high-level tools to MCP clients. Each tool is strictly typed using Zod schemas, which also serves as documentation for the LLM.

### 3.1 `list_libraries`
- **Description:** Lists all text-based libraries owned by the authenticated user.
- **Inputs:** `page` (optional number), `limit` (optional number).
- **Example Output:**
  ```json
  {
    "libraries": [
      { "id": "lib-123", "name": "Video Scripts", "type": "text", "itemCount": 15 },
      { "id": "lib-456", "name": "Social Media Prompts", "type": "text", "itemCount": 8 }
    ],
    "total": 2,
    "page": 1,
    "pages": 1
  }
  ```
- **Use Case:** Allows an AI to understand where a user stores their prompts and scripts.

### 3.2 `create_library`
- **Description:** Creates a new text library.
- **Inputs:** `name` (required string).
- **Functionality:** This is useful for organizing newly generated content into specific categories.

### 3.3 `create_prompt`
- **Description:** Adds a text prompt (item) to a specific library.
- **Inputs:** `library_id` (string), `content` (string), `title` (optional string), `tags` (optional array).
- **Use Case:** An AI agent can use this to "save" its best generations for the user to use later in the Remix Studio UI.

### 3.4 `search_library_items`
- **Description:** Performs a cross-library search for text prompts.
- **Inputs:** `query` (string), `library_id` (optional), `tags` (optional array).
- **Use Case:** If a user asks "find my script about space travel", the AI can use this tool to retrieve the exact text from the database.

### 3.5 `get_storage_usage`
- **Description:** Provides a detailed breakdown of the user's storage consumption.
- **Returns:** Total size, limit, and breakdown for Projects, Libraries, Archives, and Trash.
- **Use Case:** Allows the AI to help the user manage their quotas or explain why a new upload might fail.

### 3.6 `list_albums`
- **Description:** Lists project albums with their respective sizes and item counts.
- **Use Case:** Gives the AI visibility into the user's media projects, allowing it to reference them in conversation.

---

## 4. Database Schema Details

The persistence layer for these features is managed via Prisma. The `prisma/schema.prisma` file defines several critical models that work together to maintain security and state.

### 4.1 `OAuthClient`
This model stores the metadata for applications that connect to Remix Studio.
- `clientId`: A unique, public identifier for the client.
- `clientSecretHash`: A SHA-256 hash of the client's secret.
- `redirectUris`: A JSON array of allowed callback URLs.
- `grantTypes`: Allowed grant types (e.g., `authorization_code`).
- `responseTypes`: Allowed response types (e.g., `code`).
- `tokenEndpointAuthMethod`: How the client authenticates (e.g., `client_secret_basic`).

### 4.2 `OAuthAuthorizationCode`
Stores the temporary codes used during the authorization flow.
- `code`: The actual code string.
- `clientId`: References the `OAuthClient`.
- `userId`: References the `User` who granted access.
- `codeChallenge`: The PKCE challenge string.
- `codeChallengeMethod`: Usually `S256`.
- `expiresAt`: Codes expire after 10 minutes.
- `used`: A boolean flag to prevent replay attacks.

### 4.3 `OAuthAccessToken`
The long-term storage for access and refresh tokens.
- `token`: SHA-256 hash of the access token.
- `refreshToken`: SHA-256 hash of the refresh token.
- `expiresAt`: When the access token dies (typically 1 hour).
- `refreshExpiresAt`: When the refresh token dies (typically 30 days).
- `revoked`: Whether the user or system has invalidated this token pair.

### 4.4 `PersonalAccessToken`
A simpler model for manual token management.
- `tokenHash`: SHA-256 hash of the `pat_...` string.
- `tokenPrefix`: The first 12 characters for user reference.
- `lastUsedAt`: A timestamp updated every time the token is used for an MCP call.

---

## 5. Security Considerations and Best Practices

### 5.1 Token Hashing
Remix Studio never stores raw tokens (Access, Refresh, or Personal). Instead, it uses `crypto.createHash('sha256')`. This ensures that even if the database is leaked, the tokens cannot be used by an attacker without brute-forcing the 256-bit space, which is computationally infeasible.

### 5.2 Dynamic Client Registration Policy
The `/register` endpoint enforces a strict policy:
- Redirect URIs must be `localhost` (for developers) or `https` (for production).
- Insecure `http` on public domains is prohibited.
- Scope is strictly limited to `mcp:tools` by default.

### 5.3 PKCE Enforcement
OAuth 2.1 requires PKCE for the authorization code grant. The implementation in `handleAuthorizationCodeGrant` checks for the presence of `code_verifier` if a `code_challenge` was recorded during the authorization phase. This prevents authorization code injection attacks.

### 5.4 Bearer Token Rotation
When a refresh token is used, the old access token and the old refresh token record are marked as `revoked`. A new pair is issued. This "Refresh Token Rotation" is a critical security feature that helps detect and mitigate token theft. If an attacker and a legitimate user both try to use the same refresh token, one of them will fail, and the system can flag the breach.

---

## 6. How to Extend the MCP Implementation

Adding a new tool to Remix Studio is straightforward:

1.  **Define the Tool:** In `server/mcp/mcp-server.ts`, use the `server.tool` method.
2.  **Define the Schema:** Use Zod to define the input parameters. Provide clear descriptions for the AI.
3.  **Implement the Logic:** Use the `repository` or `prisma` instances to perform database operations. Ensure all operations are scoped to the `userId` provided in the closure.
4.  **Register the Tool:** Since the server is instantiated per request, the new tool will be immediately available to all authenticated clients.

Example:
```typescript
server.tool(
  'delete_library',
  'Delete a text library by ID.',
  { id: z.string().describe('The ID of the library to delete') },
  async ({ id }) => {
    await repository.deleteLibrary(userId, id);
    return { content: [{ type: 'text', text: 'Library deleted' }] };
  }
);
```

---

## 7. Troubleshooting and Common Issues

### 7.1 "Unauthorized" Errors
If an MCP client receives a 401 error:
1.  **Check Token Expiration:** Access tokens expire after 1 hour. Use the refresh token to get a new one.
2.  **Check Token Prefix:** If using a Personal Access Token, ensure the full string (including `pat_`) is sent in the `Authorization: Bearer <token>` header.
3.  **Audit Logs:** Check the `PersonalAccessToken.lastUsedAt` field in the database to see if the server even registered the attempt.

### 7.2 "Invalid Redirect URI"
During registration or authorization:
1.  Ensure the URI is exactly as registered.
2.  Check that the URI uses `https` unless the host is `localhost`.
3.  Ensure the URI doesn't contain fragment identifiers (`#`).

### 7.3 "PKCE Verification Failed"
1.  Ensure the client uses the same hashing algorithm (S256) for both the challenge and the verifier.
2.  Check that the `code_verifier` is sent as `code_verifier` (with an underscore) in the token request.

---

## 8. Integration Guide for Third-Party Clients

If you are building a tool that needs to connect to Remix Studio's MCP:

1.  **Discovery:** Fetch `/.well-known/oauth-authorization-server` to find the endpoints.
2.  **Registration:** Call `POST /register` to get your `client_id`.
3.  **Authorization:** Direct the user to `/authorize` with a PKCE challenge.
4.  **Token Exchange:** Exchange the code for an `access_token`.
5.  **MCP Connection:** Open a connection to `/mcp` using the Bearer token in the `Authorization` header. Use an SSE-capable client that supports the Model Context Protocol JSON-RPC standard.

---

## 9. Conclusion

By combining the Model Context Protocol with a standards-compliant OAuth 2.1 authorization server, Remix Studio provides a secure and powerful interface for AI-driven workflows. The implementation ensures that user data is protected through modern cryptography (SHA-256 hashing) and strict protocol enforcement (PKCE, HTTPS validation), while the MCP tools offer a rich set of capabilities for LLMs to assist users in managing their creative assets.

The architecture is designed to be future-proof, allowing for the addition of more tools and resources as the platform evolves. Whether through the fully automated OAuth flow or via Personal Access Tokens, Remix Studio is ready for the next generation of AI-integrated software.
