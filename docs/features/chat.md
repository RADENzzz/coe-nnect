# Chat and presence

CoE-NNECT includes a private chat surface for college-level coordination, plus a live presence indicator that shows who is currently using the application and when everyone else was last seen.

## Who can chat

Chat is restricted to:

- `college_dean`
- `department_head`

`college_secretary` and `viewer` have no chat UI or API access. The hidden `administrator` account is included in the service-layer eligibility list for maintenance access, but it is excluded from user-facing chat surfaces and filtered out of conversation lists.

## UI surfaces

Chat is mounted globally for eligible roles as a floating widget. Opening it reveals a drawer with two panes:

| Pane | Contents |
| --- | --- |
| Left | Conversation list or people picker, search, online counts, unread badges, and a **New message** action. |
| Right | Message thread with day separators, sender grouping, copyable message bodies, and a composer. |

Behavior details:

- The drawer remembers whether it was open and which conversation was active for the current browser session.
- The people picker merges the backend directory with the live presence list, so online users are easy to find.
- Conversation previews show the last message and unread count.
- Opening a conversation and reading it clears its unread badge; the backend updates `conversation_member.last_read_at`.
- New messages play a short sound unless the user disables chat sounds in Settings.
- The widget shows a total unread count and can be opened with the keyboard.
- Messages are plain text, 1–2,000 characters. There are no attachments, group conversations, or message editing in the current implementation.
- URLs in messages are linkified. Messages can be copied from the thread.

## Data model

| Table | Purpose |
| --- | --- |
| `conversation` | Thread header and timestamps. |
| `conversation_member` | Membership, per-user last-read marker, and unread calculation. |
| `message` | Sender, body, conversation, and creation time. |
| `user_presence` | One row per user with `last_seen_at`, written by the heartbeat endpoint. |

A conversation is direct: it has exactly two members. `POST /v1/chat/conversations` reuses an existing direct conversation with the same other user instead of creating a duplicate.

## API

All chat routes require a Supabase bearer token and chat eligibility. The heartbeat route accepts any authenticated role.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/chat/users` | Eligible users for the people picker, including role, department, and last-seen data. |
| `GET` | `/api/v1/chat/conversations` | Conversations for the signed-in user, with the other participant, last message, and unread count. |
| `POST` | `/api/v1/chat/conversations` | Create or reuse a direct conversation. Body: `{ "otherUserId": "<uuid>" }`. |
| `GET` | `/api/v1/chat/conversations/:id/messages?before=&limit=` | Message history in chronological order; use `before` to page backwards. Default limit is 50, capped at 100. |
| `POST` | `/api/v1/chat/conversations/:id/messages` | Send a message. Body: `{ "body": "..." }`. |
| `PATCH` | `/api/v1/chat/conversations/:id/read` | Mark the conversation read. |
| `POST` | `/api/v1/users/me/heartbeat` | Record `user_presence.last_seen_at` for the signed-in user. |

Every conversation route checks membership before returning or changing data. A non-member receives `403`, not an empty result.

## Realtime delivery

Chat uses two complementary channels:

### Supabase Realtime

- **Presence:** one shared channel named `presence:online-users`. The frontend tracks `{ user_id, username, role, dept_id, dept_code, dept_name, online_at }` for the signed-in user. Every consumer shares the same channel; it is created when the first consumer mounts and torn down when the last one unmounts. `PresenceProvider` mounts it above the router for the whole signed-in session.
- **Messages:** the open conversation subscribes to `postgres_changes` `INSERT` events on `public.message`, filtered by `conversation_id`. This appends messages from other participants without polling. RLS still governs which rows the browser can receive.

### Socket.IO

The notifications gateway joins each authenticated socket to `user:<id>` and emits:

| Event | Payload | Purpose |
| --- | --- | --- |
| `chat:new` | `conversationId`, `messageId`, `senderId`, `body`, `createdAt` | Play the chat sound and refresh the conversation list even when the drawer is closed. |
| `notification:new` | Notification record | Update the inbox and toast/badge. |
| `unread_count` | `{ count }` | Keep the notification badge accurate. |

`chat:new` is sent to every other conversation member after the message is persisted. The sender's own UI is updated from the REST response.

## Presence semantics

Presence has two layers because each answers a different question:

1. **Live online dot:** Supabase Realtime presence answers "is this person connected right now?" It disappears when the tab closes, the network drops, or the user navigates somewhere that unsubscribes.
2. **Persisted last seen:** `user_presence.last_seen_at` answers "when was this person last around?" The frontend sends a heartbeat every 60 seconds while the tab is visible and skips beats while `document.visibilityState === 'hidden'`. Returning to the tab or focusing the window sends an immediate beat.

The UI combines them:

- online → **Active now** (green dot);
- offline with a recent timestamp → **Active just now** or a relative label such as **Active 12m ago**;
- no timestamp → **Offline**.

The drawer also remembers locally observed disconnects so a label flips to "Active just now" before the next directory refetch. The dean dashboard uses the same presence data to count online department heads.

The heartbeat endpoint is available to every authenticated role, including `viewer` and the hidden administrator, even though only deans and department heads have chat.

## Security and privacy

- Controller guards restrict chat to `college_dean` and `department_head`.
- Service-layer checks repeat role and membership validation, so a route added without the controller guard still fails closed.
- Messages are private to conversation members; the API never returns another user's conversation.
- Direct Supabase access is governed by RLS. The browser receives message rows only for conversations it is allowed to read.
- `user_presence` has RLS enabled with no client policies and no `anon`/`authenticated` grants. Only the API's database connection reads or writes it, so clients cannot enumerate presence rows.
- The administrator role is filtered from the user-facing conversation list even though maintenance paths remain reachable.

## Related documentation

- [Frontend guide](../apps/frontend.md) — chat surfaces, presence provider, and environment.
- [Backend guide](../apps/backend.md) — route map and notification gateway.
- [Dashboard](dashboard.md) — online department-head counts and last-seen labels.
- [Database structure](../DATABASE%20STRUCTURE/README.md) — chat and presence tables.
