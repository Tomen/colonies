# Roadmap

Project progress and implementation milestones.

## Current Status

### Simulation (packages/core, packages/cli)

| Layer | Status | Documentation |
|-------|--------|---------------|
| Physical Layer | Complete | [world/01_physical_layer/](world/01_physical_layer/README.md) |
| Network Layer | Complete | [world/02_network_layer/](world/02_network_layer/README.md) |

### Frontend (packages/frontend)

| Feature | Status | Description |
|---------|--------|-------------|
| Project Setup | Complete | Vite + React + TypeScript |
| Three.js Scene | Complete | Terrain mesh with shaders |
| Web Worker | Complete | Background simulation |
| Control Panel | Complete | Config sliders, generate button |
| Layer Toggles | Complete | Show/hide terrain, rivers |

## Pending Work

### Simulation

| Task | Description |
|------|-------------|
| [world/todo/03_growth.md](world/todo/03_growth.md) | Land Use and Settlements |
| [world/todo/04_industries.md](world/todo/04_industries.md) | Industry Sites |
| [world/todo/05_polish_gif.md](world/todo/05_polish_gif.md) | Rendering and GIF Export |

### Frontend

| Task | Description |
|------|-------------|
| Interactive Editing | Click to place settlements, roads |
| Time Controls | Play/pause simulation, speed slider |
| Settlement Markers | Render towns and cities |
| Road Network | Visualize transport edges |
| Minimap | 2D overview in corner |

## Milestones

High-level feature milestones from the [design spec](world/design.md):

1. **M1 Physical world** - terrain, hydrology, soils, vegetation
2. **M2 Parcels & claims** - DCEL overlay and parcel generator
3. **M3 Movement network** - pathfinding, desire lines, ferries/bridges
4. **M4 Settlements & streets** - growth and street generation
5. **M5 Economy & resources** - goods, industries, trade routing
6. **M6 Governance & states** - counties, bridges, tolls, state formation
7. **M7 Polish** - classical rendering, labels, export, save/load
8. **M8 Frontend** - interactive web viewer

## Milestone Progress

| Milestone | Status |
|-----------|--------|
| M1 Physical world | Complete |
| M2 Parcels & claims | Pending |
| M3 Movement network | Complete |
| M4 Settlements & streets | Pending |
| M5 Economy & resources | Pending |
| M6 Governance & states | Pending |
| M7 Polish | Pending |
| M8 Frontend | In Progress |
