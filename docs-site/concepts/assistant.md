# The Assistant

Remix Studio includes a persistent, tool-using assistant for planning and operating the workspace in chat. It uses the same account-scoped tool definitions as the [MCP server](/integrations/mcp), while providing an in-app confirmation UI and conversation history.

## Requirements and Model Selection

The assistant does not use a hidden global model credential. Create a provider in Remix Studio, then choose an assistant-capable text model in the composer or **Assistant Settings**.

The chat runtime currently supports provider records of these types:

- **Google AI**
- **OpenAI**
- **Claude (Anthropic)**
- **Alibaba Cloud**
- **Kimi (Moonshot AI)**

Other provider families may generate project assets without being available as the assistant's chat model. A saved provider must belong to the user and contain a decryptable API key. API URL overrides are honored after the same URL-safety validation used elsewhere in the server.

The selected provider and model are stored on the conversation. The most recent selection is also remembered locally as the default for a new chat.

## Workspace Context

The assistant can read account-scoped workspace data through tools rather than relying on a stale copy in the prompt. Read capabilities include:

- Libraries and paginated/searchable library items.
- Storage totals and category breakdowns.
- Project workflows and album summaries.
- Usable provider/model pairings.
- Social accounts, campaigns, posts, post text, and post media metadata.

The composer can bind workspace context and attach supported images. With a Google AI provider selected, the microphone control records audio in the browser and transcribes it through the configured Google provider before sending the resulting text.

## Skills

Assistant skills are prompt templates stored in a dedicated text library. Manage them under **Assistant Settings → Skills**, then type `/` in the composer to search and insert one.

Skills help standardize recurring instructions; they do not add server permissions or bypass tool confirmation. Editing or deleting a skill is the same kind of library-item operation as editing other reusable text.

## Tools and What They Can Change

The assistant can:

- Create and describe libraries.
- Create prompts individually or in batches.
- Update prompt text, titles, and tags, including batch metadata updates.
- Create projects with complete workflows and update existing projects.
- Create and update campaigns and posts, attach owned media, and schedule posts.

The tool catalog is visible under **Assistant Settings → Tools**, including each tool's input schema, category, and whether approval is required.

## Confirmation and Approval Modes

Tools are categorized as read, write, or destructive.

- **Read tools** run without a mutation confirmation.
- **Write tools** pause and show a human-readable summary plus the exact arguments.
- **Destructive tools** also require explicit confirmation and cannot be placed on the auto-approved write list.

For a write tool, you can approve only the pending call or approve that tool for future calls in the current conversation. Conversation approvals are stored per chat and can be changed from the tool-approvals dialog. They do not become a global permission for other conversations.

Pending confirmations expire. Cancelling one records the cancellation and lets the conversation continue without applying the change.

::: warning
Approving a tool means later calls to that named write tool in the same conversation can execute without another prompt. Review the approved-tools list when a conversation's purpose changes.
:::

## Conversation History

Messages, tool calls, structured arguments/results, token counts, errors, and pending confirmations are persisted separately from project generation jobs. This keeps chat history independent of the generation queue.

The history screen can reopen previous conversations and archive chats you no longer need in the active list. Deleting a conversation removes its messages and confirmation records; it does not undo workspace changes the conversation already performed.

## Assistant vs. MCP

| | In-app assistant | External MCP client |
| :--- | :--- | :--- |
| Interface | Remix Studio chat UI | Claude, Codex, or another MCP client |
| Authentication | Logged-in Remix Studio session | OAuth 2.0 or personal access token |
| Tool definitions | Shared registry | Shared registry |
| Read tools | Execute directly | Execute directly |
| Write confirmation | In-app confirmation; eligible write tools can be approved per conversation | Two-call preview and hash-confirmation protocol |
| Conversation storage | Stored by Remix Studio | Managed by the external client |

Both paths enforce user ownership in each handler. IDs supplied by a model do not grant access to another user's records.

## Related

- [MCP Support](/integrations/mcp) — authentication and the external confirmation protocol.
- [Libraries & Prompts](/concepts/libraries) — reusable data and assistant skills.
- [Campaigns](/concepts/campaigns) — campaign/post tools available to the assistant.
