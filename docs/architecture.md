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
These modules will grow as steps are implemented:
- `types.ts` – shared type definitions.
- `worldgen.ts` – physical layer generation.
- `transport.ts` – network creation and pathfinding.
- `growth.ts` – land use, parcels, settlements, and economy.
- `render.ts` – map rendering.
- `export_gif.ts` – GIF export utility.

Each implementation step must update this document with new modules,
interfaces, and data flows.
