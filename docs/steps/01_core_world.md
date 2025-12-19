# Step 1: Core World Generation

Implement the foundational world generation and hydrology systems.

## Tasks
- [x] Implement seeded RNG and JSON configuration loader.
- [x] Generate 10×10 km height map using noise with ridge orientation controls.
- [x] Derive slope and fertility from the height map.
- [x] Run hydrology model to ensure rivers flow to ocean and avoid sinks.
- [x] Score coastline for harbor suitability and place a single initial port.
- [x] Output raster grids: height, flow accumulation, moisture.
- [x] Document algorithms and data structures in [`docs/architecture.md`](../architecture.md).

## Testing & Acceptance
- Given default config, rivers reach the ocean without infinite loops.
- Coastal plain and ridge belt are visually distinct in debug output.
- Flow accumulation produces reasonable river hierarchy.
- Port appears at best‑scoring harbor cell.
- All items in [Definition of Done](../definition_of_done.md) are satisfied.
