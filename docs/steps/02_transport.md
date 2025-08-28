# Step 2: Transport Network

Create pathfinding and dynamic infrastructure growth over the generated terrain.

## Tasks
- Build raster cost field factoring slope and land cover.
- Implement A* routing between origin–destination pairs.
- Create edge types: trails, roads, river routes, coastal shipping.
- Accumulate usage on edges; upgrade trail→road→turnpike per thresholds.
- Detect river crossings; open ferries then build bridges based on traffic.
- Update [`docs/architecture.md`](../architecture.md) with network data structures.

## Testing & Acceptance
- For fixed OD pairs, roads form near‑optimal corridors.
- Bridges appear first at narrow, high‑usage crossings after ferries.
- Usage heatmap reflects simulated traffic.
- All items in [Definition of Done](../definition_of_done.md) are satisfied.
