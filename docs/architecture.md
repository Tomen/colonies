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
1. `generateTerrain` creates a `TerrainGrid` raster from simplex noise seeded via the game RNG. Relief strength and ridge orientation come from `cfg.worldgen`, then slope and fertility are derived before tracing the coastline with near‑shore depth samples.
2. `buildHydro` runs D∞ flow direction and accumulation over the terrain, using a small eastward tilt to bias outlets toward the coast. Accumulation is converted into channels based on `cfg.worldgen.river_density`, then traced into polylines that terminate at coastal mouth nodes. Each directed edge stores discharge, width, slope and Strahler order, and fall‑line nodes are flagged where downstream slopes exceed a threshold.
3. `buildLandMesh` Poisson‑samples land sites (denser near water), forms a Delaunay triangulation
   and Voronoi diagram clipped to land, then annotates cells and half‑edges with terrain and hydro
   attributes including `heCrossesRiver` and `heIsCoast` flags. The Voronoi polygons are built from
   a D3 Delaunay and bounded by the coastline rectangle; half‑edges are paired by shared vertices,
   tagged when they lie on the coastal boundary and checked for intersection against river polylines.

These datasets are read‑only foundations for higher layers.

## Current Implementation Details
The prototype world generator produces a 1 km grid using seeded simplex noise with adjustable ridge orientation. It derives per‑cell slope and fertility, then computes D∞ routing and flow accumulation to extract a river graph that conserves discharge to the coastline. River polylines are simplified into directed edges with width, order and fordability estimates, and fall‑line nodes are marked on steep downstream reaches. The land mesh now Poisson‑samples hundreds of coastal‑biased sites, builds a Delaunay/Voronoi diagram clipped to the land rectangle, and fills half‑edge connectivity with coast and river‑intersection flags plus per‑cell terrain attributes.

Debug exports are available via `cfg.debug.export_grids`, writing `terrain_elevation.json`, `terrain_moisture.json` and `hydro_flow.json` into `cfg.debug.output_dir` for inspection. Each JSON includes raster dimensions, cell size and flattened data arrays to ease troubleshooting of the grid stages.
