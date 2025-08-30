# Project Brief and Implementation Plan

This document captures the agreed‑upon scope for **EastCoast Colonies v1**. It replaces earlier drafts and guides development and testing.

## Project Brief
- 10×10 km map where the eastern edge is an ocean margin (~400 m).
- Watch‑only time‑lapse starting at Year 0 with quarterly ticks; runs indefinitely.
- Light historic flavor focusing on fall line, timber and water power.
- Transport modes: overland trails/roads, river navigation and coastal shipping.
- No budgets, money or politics; pure geography‑driven economy.
- Industries: mills, shipyards, ironworks/charcoal, brickworks, woodworking.
- Simulation runs on CPU for determinism; rendering uses WebGL2.
- Input and save files use validated JSON with a deterministic seed.
- Export: time‑lapse GIF at configured cadence.

## Architecture
Layers and their responsibilities:
1. **Physical** – terrain raster, hydro network and Voronoi land mesh.
2. **Land‑use** – mutable land‑state per cell (forest, field, pasture, manufactory, town) and forest age.
3. **Network** – road graph on land‑mesh half‑edges, river/coast segments, ports, landings and crossings.
4. **Simulation** – quarterly tick orchestrating settlements, land use, industries, flows and upgrades.
5. **Rendering & Export** – WebGL2 map layers and deterministic GIF capture.

Determinism rules:
- No `Math.random`/`Date.now`; a seeded RNG is threaded through generators.
- Stable iteration orders and fixed counts for algorithms.
- Avoid floating‑point nondeterminism by consistent traversal and sample counts.
- Single source of truth for parameters; unknown config keys are rejected.

### Physical Layer
World generation proceeds through three deterministic stages:
1. `generateTerrain` produces a `TerrainGrid` from noise, filling depressions, deriving slope and fertility and tracing the coastline with near‑shore depth samples.
2. `buildHydro` applies flow direction and accumulation to extract rivers, simplify them into polylines and construct a directed `RiverGraph` with widths, orders and fall‑line markers.
3. `buildLandMesh` Poisson‑samples land (denser near water), performs Delaunay triangulation and Voronoi clipping to land, then annotates cells and half‑edges with terrain and hydro attributes including `heCrossesRiver` and `heIsCoast`.

The best‑scoring harbor cell becomes the initial port. These physical datasets remain immutable during simulation.

## Repository Layout
```
/src
  core        – RNG, schema helpers, math
  physical    – TerrainGrid, HydroNetwork, LandMesh generators
  landuse     – land state & transitions
  network     – pathfinding, usage, upgrades, crossings
  sim         – tick orchestration & flow routing
  render      – WebGL2 layers
  export      – GIF recorder
  config      – default JSON, types, schema
/tests
```

## Core Data Models
Interfaces live in [`src/types.ts`](../src/types.ts) and include `TerrainGrid`, `HydroNetwork`, `LandMesh`, `LandState`, `NetState`, `Settlement`, `Sim`, and enums for `LandUse` and `RoadClass`.

## Simulation Loop
Each quarterly tick executes:
1. `updateSettlements`
2. `updateLandUse`
3. `updateIndustries`
4. `routeFlowsAndAccumulateUsage`
5. `applyUpgrades`
6. `updateAgesAndWindows`

## Testing & Done Criteria
- Deterministic replays from seed + params.
- Hydrology invariants: rivers reach the sea; `heCrossesRiver` matches geometry.
- Golden seed after 40 years: ≥1 bridge, mill at fall line, shipyard at port, reasonable road growth and reduced forest near roads.
- All steps follow the repository [Definition of Done](definition_of_done.md).
