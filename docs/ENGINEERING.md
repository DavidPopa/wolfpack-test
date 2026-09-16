# Engineering notes

The [PRD](PRD.md) owns stack, architecture, product behavior and exclusions. Do not duplicate or silently expand those decisions. These are implementation pitfalls to check when relevant.

## Boundaries and security

- Keep shared contracts browser-safe: no Prisma clients, secret configuration or session-table internals. Add abstractions only for a concrete shared need.
- Derive creator/author identity from the server session, never request input. Validate untrusted data even when the client uses the same schema.
- Keep OAuth/origin/cookie protections intact through the proxy. Test-session fixtures must not enable a production auth bypass. Render message content as text.
- Check installed Prisma 7/Better Auth APIs and compatible Node/package versions before configuring generators/adapters; do not copy reference-project flags blindly.

## Persistence and ordering

- Enforce request-ID uniqueness in PostgreSQL, not just check-then-insert code. Compare payloads on reuse, including message room identity; concurrent identical retries return the canonical record.
- Match cursor ordering to its index and ID tiebreaker. Apply explicit input/page limits.
- Update rate counters and expiry atomically; bound Redis keys and document configured limits. No silent fallback that changes the PRD's outage behavior.
- Socket delivery is not durable storage. Handle subscription/catch-up races and multiple missing history pages, not merely the latest page. Clean up listeners/subscriptions when switching rooms.
- Test both socket-before-HTTP and HTTP-before-socket. Reconcile by stable identity; a late response must not steal current selection. Roll back only the failed optimistic entry, not an entire stale cache snapshot.

## UI and runtime

- A pin represents a room; a pending pin has no confirmed room ID. Keep Leaflet/browser-only code out of server execution.
- Resolve the provided map's tile/style configuration, licensing and attribution before implementing it. No provider substitution without a decision.
- Prefer labelled native/shadcn controls, visible focus and textual status/error cues. Check panel focus, keyboard use, mobile reflow and polite connection announcements.
- Verify the browser-facing proxy, including WebSocket upgrades, not just internal service URLs.
- Pin compatible runtimes/package manager; use reproducible multi-stage images and an appropriate `.dockerignore`. Prefer native-dependency compatibility over minimum image size.
- Keep migrations and cleanup on assigned isolated resources. Store only dummy environment examples; no local volumes, secrets or session artifacts in source control.
- For the later infrastructure estimate, cite dated prices and usage assumptions. Do not provision or deploy services.
