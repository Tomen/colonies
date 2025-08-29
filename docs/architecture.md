# Architecture Overview

This file summarizes the software architecture for implementing the Colonies simulation.
See [`design_overview.md`](design_overview.md) for the full specification and
milestones distilled from the original INPUT.

## Layered Structure
- **Physical layer** – terrain, hydrology, soils and vegetation grids.
- **Cadastral layer** – parcel DCEL and ownership/land‑use attributes.
- **Network layer** – movement graph with roads, ferries and bridges.
- **Society layer** – settlements, population, economy and governance.
- **Rendering/export** – classical map renderer and GIF exporter.

## Modules
Modules are organized under `src/` by responsibility:
- `types.ts` – shared type definitions.
- `core/rng.ts` – seeded deterministic random number generator.
- `config/` – default parameters, JSON Schema, and config loader.
- `physical/generate.ts` – terrain, hydrology and land‑mesh generation.
- `network/graph.ts` – movement graph creation and edge costs.
- `sim/flows.ts` – build origin‑destination bundles and route flows.
- `sim/upgrades.ts` – promote trails, open ferries and build bridges.
- `landuse/update.ts` – land‑use transitions and forest regrowth.
- `society/settlements.ts` – settlement growth and ranking.
- `industries/site_select.ts` – industry site scoring and activation.
- `render/index.ts` – WebGL2 rendering layers.
- `export/gif.ts` – time‑lapse GIF capture.

Each implementation step must update this document with new modules,
interfaces, and data flows.
