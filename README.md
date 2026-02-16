# Inventory Nodes

`nodes` is the unified stock-endpoint table for inventory ledger movements.

## Why it exists

- Decouples inventory movements from warehouse-only flows.
- Lets a movement point from any stock node to any stock node.
- Works with the new ledger source of truth:
  - `inventory_movement_events` (header)
  - `inventory_movement_lines` (lines)

## Current node types

- `WAREHOUSE`
- `LOCATION`
- `SUPPLIER`
- `CUSTOMER`
- `ASSET`
- `VIRTUAL`

## How movement ledger works

- Event header carries: `event_type`, `status`, `occurred_at`, optional reference fields.
- Every line stores `from_node_id`, `to_node_id`, `item_id`, `unit_id`, `quantity > 0`.
- Balance is computed as: `SUM(incoming to node) - SUM(outgoing from node)`.
- Balances are computed from `inventory_movement_lines` joined with `inventory_movement_events` where status is `POSTED`.
- `POSTED` rows are immutable; corrections should be new reversing entries.

## Adding a new node type

1. Extend `nodes_node_type_check` in migration flow.
2. Expose/filter type from `GET /api/organizations/:id/nodes`.
3. Update frontend selector grouping in `frontend/src/pages/InventoryMovementsPage.tsx`.

## Schema doc

Current schema reference: `docs/db/SCHEMA.md`.
