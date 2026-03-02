# Skill: PlantTrack Backend (Express + Knex + Postgres)

This skill is a practical workflow guide for agents working inside `backend/`.

## Scope

- Allowed writes: `backend/**`
- Required references: `../docs/db/SCHEMA.md`, `backend/README.md`
- Optional references: `../docs/contracts/**`, `../docs/ENV.md`

## Stack (from `backend/package.json`)

- Runtime: Node `22.14.0` (see `backend/.nvmrc`)
- HTTP: Express + CORS + Morgan
- DB: PostgreSQL (`pg`) via Knex
- Validation: Zod
- Auth: `bcryptjs`
- Dev: Nodemon

## Local Commands (use from `backend/`)

- Install: `npm install`
- Dev: `npm run dev`
- Start: `npm start`
- DB init/migrate:
  - `npm run db:setup` (creates DB then migrates)
  - `npm run migrate`
  - `npm run migrate:rollback`

## Required Project Rules (do not skip)

- Before backend changes, read `../docs/db/SCHEMA.md` and align behavior with it.
- If you change any request/response payload used by the UI, update `../docs/contracts/API.md` in the same change.
- Do not commit env files; env policy is in `../docs/ENV.md`.

## Project Conventions (based on existing code)

- Routes live in `src/routes/` and are registered in `src/index.js` under the `/api` prefix.
- Models live in `src/models/` and are responsible for DB/domain operations.
- Prefer Zod schemas in routes for request validation; return:
  - `400 { message: 'Validation failed', errors: ... }` for schema failures
  - `400/404/409` with a clear `{ message }` for domain errors
- Use transactions (`db.transaction(...)`) for multi-table writes (especially node-backed entities).
- Keep organization scoping consistent:
  - Use `loadOrganizationContext` middleware where applicable and read `req.organizationId`.

## Typical Change Workflow

1. Confirm schema expectations in `../docs/db/SCHEMA.md` (tables, constraints, immutability rules).
2. Implement model changes in `src/models/` first.
3. Add/update route handlers in `src/routes/` using Zod validation.
4. Register new routes in `src/index.js`.
5. If the change affects the UI contract, update `../docs/contracts/API.md`.

