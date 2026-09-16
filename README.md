# Map Chat

Map Chat is a full-stack application created for the Wolfpack Digital developer assessment. It allows visitors to explore public chat rooms placed on a map, read their conversations, and—after signing in with Google—create new rooms and send messages in real time.

## Main features

- Explore public chat rooms through map pins.
- Read room conversations without an account.
- Sign in with Google to create rooms and send messages.
- Persist rooms and message history in PostgreSQL.
- Receive new rooms and messages in real time.
- Provide optimistic feedback while a new room is being saved.
- Support desktop and mobile layouts.

## Technology

- **Frontend:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend:** Node.js, Express, Socket.IO, Better Auth
- **Data:** PostgreSQL, Prisma 7, Redis
- **Map:** Leaflet
- **Testing:** Jest, React Testing Library, Playwright with Chromium
- **Tooling:** pnpm workspaces, Docker Compose, ESLint, Husky, GitHub Actions

## Project structure

```text
apps/
  web/          Next.js application
  api/          Express API
packages/
  contracts/    Shared API and realtime contracts
docs/           Product and engineering documentation
```

## Documentation

- [Technical PRD](docs/PRD.md)
- [Engineering notes](docs/ENGINEERING.md)
- [Testing strategy](docs/TESTING.md)
- [Agent workflow](AGENTS.md)

## Status

The project is currently under active development. Installation, environment configuration, local development, and test commands will be added once the foundation is complete and verified.
