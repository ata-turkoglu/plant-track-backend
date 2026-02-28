# Backend Agent Guide

This file is for AI agents working in backend scope (`backend/`).

## Start Here

- Cross-scope agent guide: [`../README.md`](../README.md)
- Project overview: [`../README.md`](../README.md)

## First Read (Required)

- DB agent guide: [`../docs/db/README.md`](../docs/db/README.md)
- DB schema source of truth: [`../docs/db/SCHEMA.md`](../docs/db/SCHEMA.md)

Before backend changes, read schema doc first and align route/model behavior with it.

## Core Domain

- Inventory source of truth:
  - `inventory_movement_events` (header)
  - `inventory_movement_lines` (lines)
- Unified stock endpoints:
  - `nodes` table (`WAREHOUSE`, `LOCATION`, `SUPPLIER`, `CUSTOMER`, `ASSET`, `VIRTUAL`)
- Balances:
  - computed from `POSTED` events only
  - `SUM(incoming) - SUM(outgoing)` by node/item

## Main Backend Paths

- `src/index.js`: route registration
- `src/routes/`: API handlers
- `src/models/`: DB/domain operations
- `migrations/000000_init.cjs`: current squashed migration

## Local Dev

```bash
cd backend
npm install
npm run db:setup
npm run dev
```

Env config:
- Create `backend/.env` (not committed). See `../docs/ENV.md`.

Contract docs:
- If payloads change, update `../docs/contracts/API.md`.

## Recent Backend Notes (Do Not Miss)

- `items`:
  - `items.type` is removed; use `warehouse_type_id`.
  - item payloads include `brand`, `model`, `size_spec`, `size_unit_id`.
- `translations`:
  - model is single-row per key with columns `tr` and `en` (not locale/value rows).
  - namespaces include at least `warehouse_type`, `unit`, `unit_symbol`.
- `units`:
  - unit translation and symbol translation records must stay in sync with unit create/update flows.
  - `unit_symbol` translation key now uses unit code mapping (not raw symbol key).
- `suppliers/customers`:
  - corresponding `nodes` records must be created/updated/deleted together in transactional flow.
- `inventory movements`:
  - use event + lines model, node ids are required for movements.
  - keep `POSTED` immutability rule in mind for corrections.

## Change Checklist

After backend changes:

1. Update route + model together for domain consistency.
2. Verify migrations/schema assumptions against `docs/db/SCHEMA.md`.
3. If node-related data changes, validate `/api/organizations/:id/nodes` compatibility.
4. If API contract changes, reflect required frontend impact.
