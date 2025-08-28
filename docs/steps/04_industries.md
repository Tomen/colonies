# Step 4: Industry Sites

Introduce resource‑driven industries and integrate them with flows.

## Tasks
- Implement site scoring for mills, shipyards, ironworks, brickworks, and woodworking.
- Add hysteresis thresholds to spawn or upgrade industries based on nearby resources and access.
- Each industry emits resource flows to and from network nodes.
- Place industry icons on the map when activated.
- Update [`docs/architecture.md`](../architecture.md) with industry systems.

## Testing & Acceptance
- Mills appear at rapids/falls with timber or grain activity nearby.
- Shipyard spawns at port when timber activity is present.
- Brickworks near clay deposits; ironworks where timber and water power co‑locate.
- All items in [Definition of Done](../definition_of_done.md) are satisfied.
