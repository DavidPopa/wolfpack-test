#!/bin/sh
set -eu

pnpm lint
pnpm typecheck
pnpm test:api:unit
pnpm test:api:integration
pnpm test:web
