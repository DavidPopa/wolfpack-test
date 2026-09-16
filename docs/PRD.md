# Map Chat — Technical PRD

Status: Approved by the developer; awaiting developer commit before implementation. Delivery window: 24 hours.

## Product and scope

Build a map-based public chat application for the Wolfpack Digital fullstack assessment. Visitors explore room pins and read conversations. Authenticated users create rooms and send messages. Rooms and messages persist between sessions. Realtime messaging is included. Authentication uses Better Auth with Google only, accepting personal and Google Workspace accounts without an email-domain restriction. There are no local passwords.

Use Leaflet, identified by the supplied mockup’s attribution, and retain the assessment’s [provided map reference](https://codepen.io/riko11/pen/GExZzQ). CodePen currently is not working; resolve its exact tile/style configuration, licensing, and attribution before map implementation. Follow the supplied desktop interaction model with a map and right-hand conversation panel, adapting the panel for mobile. Globe projection and alternative map providers are outside this version.

## User experience

- Initially show existing pins and an instruction to select or create a room. Selecting a pin opens its titled conversation and highlights the active pin.
- Clicking empty map space immediately selects an optimistic pin labelled as saving. Replace it with the persisted room on success; remove it on failure, preserve its coordinates for retry, and restore selection only if still relevant. Disable messaging until the room is confirmed. Dragging or selecting a pin must not create another room.
- Guests can read rooms and paginated history. Writes require Google sign-in. Preserve the selected location or draft through authentication and resume explicitly. First login creates the account; support logout and persistent sessions. Authors come from the authenticated account.
- Show plain-text messages with author and timestamp, chronological ordering, older-history loading, and pending, failed, or sent feedback. Mark messages sent only after server confirmation. Preserve failed drafts for retry.
- Provide keyboard-accessible forms and controls, labelled inputs, readable focus states, and loading, empty, error, and connection states. Announce connection changes without disrupting conversation. Avoid forced scrolling when reading older messages.

Excluded: private rooms, roles, profiles, moderation, room renaming/deletion, pin movement, search, geolocation, other login providers, local registration/passwords, email verification flows, password recovery, message editing/deletion, attachments, reactions, threads, presence, typing indicators, read receipts, and offline sending.

## Architecture and data

Use a TypeScript pnpm monorepo: `apps/web` for Next.js App Router, Tailwind CSS, and shadcn/ui; `apps/api` for an Express modular monolith; `packages/contracts` for shared request, response, validation, and event contracts; and `docs` for deliverables. Backend modules are auth, rooms, and messages. Keep business rules in the backend and component state near the UI; avoid additional service layers without a concrete need.

Express owns Better Auth, authorization, Prisma/PostgreSQL, and Socket.IO. Pin stable compatible versions, using Prisma 7. Next.js has no database access or duplicate auth configuration. Docker Compose runs web, API, PostgreSQL with a persistent volume, Redis, and a reverse proxy. One browser origin routes `/api` and `/socket.io` to Express, supporting WebSocket upgrades, and UI requests to Next.js. Use one API instance. Redis stores expiring rate-limit counters for room/message writes; PostgreSQL retains application data and sessions. No queues, message cache, or horizontal scaling.

Data model:

- Better Auth-managed user, session, account, and verification tables.
- Room: ID, automatic title, latitude, longitude, creator user ID, timestamp, client request ID.
- Message: ID, room ID, author user ID, body, timestamp, client request ID.

For each creation operation, enforce uniqueness on user plus client request ID and reject conflicting reuse. Retries must not duplicate rooms or messages.

Use foreign keys and a room/message-order index. Message cursors use stable server ordering with an ID tiebreaker. Public responses expose only the author information needed for display, never email or session data.

## HTTP, realtime, and state

HTTP handles room listing/creation and cursor-paginated message reading/sending. Validate input and page limits server-side. Better Auth verifies every protected write; configure secure cookies and trusted origins. Configure Google OAuth credentials and callback URLs through environment variables. Redis rate limiting uses atomic counters with expiry; on Redis failure, reject protected writes with a retriable error while reads remain available.

Persist writes before acknowledging success or broadcasting events. Socket.IO broadcasts new rooms to connected visitors and new messages to subscribers of the selected room. Clients leave the previous subscription when switching rooms and ignore late responses for another selection.

TanStack Query with `fetch` owns server data and optimistic pins; Better Auth's React client owns sessions. React state owns selection, drafts, and panels. Reconcile HTTP responses and socket events by entity/request ID, including socket events arriving before HTTP responses. Roll back only the failed optimistic entry, preserving concurrent updates. On subscription/reconnection, recover missing messages with paginated catch-up and refresh pins. Deduplicate overlapping results; PostgreSQL remains authoritative.

## Acceptance and delivery

Run checks in order: ESLint, TypeScript, backend Jest unit/integration tests, frontend Jest with React Testing Library, then Playwright E2E in Chromium against the production build. Verify Google login/logout, authorization, persistence, optimistic success/rollback, Redis limits/failure, pagination, two-browser delivery, room isolation, retry deduplication, and reconnect recovery. Record real-provider login separately from automated auth fixtures; complete responsive/accessibility checks.

The developer owns Git integration. The orchestrator may stage, commit and push only when the developer explicitly requests the exact action and scope; execution agents never do so. Deliver scoped changes through PRs, each with its own branch/worktree, task, QA evidence, and written review. The orchestrator identifies parallel work and dependencies. Husky gates commits with lint, type checks, and Jest tests; PR CI also runs Chromium E2E. See [workflow rules](../AGENTS.md#workflow).

Deliver GitHub source, local setup/environment examples, AI rules, and staging/production infrastructure estimates including Redis. List services, rationale, costs, and usage assumptions; deployment is unnecessary. Run the self-review configuration on final code and deliver the report with fixed/deferred findings and reasons. Reserve time for verification and documentation.
