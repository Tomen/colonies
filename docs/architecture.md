# Architecture Overview

This document summarises the software architecture for **EastCoast Colonies v1**. See [`design_overview.md`](design_overview.md) for the project brief and guiding principles.

## Layered Structure
- **Physical** – terrain rasters, hydro graph and Voronoi land mesh.
- **Land‑use** – per‑cell land state and forest age.
- **Network** – roads on land‑mesh half‑edges, river/coast segments, ports and crossings.
- **Simulation** – quarterly tick orchestrating settlements, land use, industries, flows and upgrades.
- **Rendering & Export** – WebGL2 layers and GIF recorder.

## Modules
Source code is organized under `src/`:
- `core/` – RNG, schema utilities, math helpers.
- `config/` – default JSON, schema and loader.
- `physical/` – `generateTerrain`, `buildHydro`, `buildLandMesh`.
- `landuse/` – `updateLandUse` and land‑state helpers.
- `network/` – `initNetwork`, `edgeCost` and pathfinding utilities.
- `sim/` – tick orchestration, flow routing and infrastructure upgrades.
- `society/` – settlement growth logic.
- `industries/` – site scoring and activation.
- `render/` – WebGL2 rendering entry point.
- `export/` – GIF capture helpers.

Interfaces for these modules reside in [`src/types.ts`](../src/types.ts).

## Physical Layer
World generation builds three immutable structures in sequence:
1. `generateTerrain` creates a `TerrainGrid` raster from noise, fills depressions,
   derives slope and fertility and traces the coastline with near‑shore depth samples.
2. `buildHydro` runs flow direction and accumulation over the terrain to extract rivers,
   simplify polylines and construct a directed `RiverGraph` with width, order and fall‑line markers.
3. `buildLandMesh` Poisson‑samples land sites (denser near water), forms a Delaunay triangulation
   and Voronoi diagram clipped to land, then annotates cells and half‑edges with terrain and hydro
   attributes including `heCrossesRiver` and `heIsCoast` flags.

These datasets are read‑only foundations for higher layers.

## Current Implementation Details
The prototype generator now derives D8 flow directions and accumulation on the 1 km terrain grid. Rivers are extracted according to configuration, routed to the coast and annotated with width and Strahler order while marking fall‑line nodes. A single‑cell land mesh remains sufficient for downstream tests.
