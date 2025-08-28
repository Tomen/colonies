# Step 3: Land Use and Settlements

Simulate land claims, vegetation, and settlement expansion.

## Tasks
- Generate land‑use raster (fields, forest, pasture, manufactory, town).
- Model forest regrowth and clearing costs based on slope and proximity.
- Seed initial settlements at ports and river mouths; secondary seeds at falls and crossroads.
- Update population each tick and promote hamlet→village→town→city.
- Lay out initial street stubs when settlements grow.
- Document cadastral layer and settlement entities in [`docs/architecture.md`](../architecture.md).

## Testing & Acceptance
- In test seed, parcels generate without topological errors.
- Parcels near rivers are long/narrow; inland parcels more compact.
- Town glyph grows from hamlet to village as centrality rises.
- All items in [Definition of Done](../definition_of_done.md) are satisfied.
