# Colonies

Procedural American East-Coast-like terrain generator with historical settlement growth simulation.

## Features

- **Procedural Terrain** - Height maps with coastal plains, inland ridges, and river networks
- **Hydrology Simulation** - D8 flow routing and accumulation for realistic rivers
- **Transport Networks** - A* pathfinding with road/bridge upgrades based on usage
- **Interactive Frontend** - 3D terrain viewer with real-time generation
- **Deterministic** - Seeded RNG for reproducible worlds

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the interactive frontend
pnpm dev
# Open http://localhost:5173

# Or generate terrain via CLI
pnpm generate
# Outputs PNG files to output/
```

## Project Structure

```
colonies/
├── packages/
│   ├── shared/      # @colonies/shared - Types and config
│   ├── core/        # @colonies/core - Simulation logic
│   ├── cli/         # @colonies/cli - Node.js CLI
│   └── frontend/    # @colonies/frontend - React + Three.js
├── docs/
│   ├── world/       # Simulation documentation
│   └── frontend/    # Frontend documentation
└── output/          # Generated PNG files
```

## Packages

| Package | Description |
|---------|-------------|
| `@colonies/shared` | Shared types (WorldConfig, TerrainData) and config utilities |
| `@colonies/core` | Platform-agnostic simulation (works in browser and Node.js) |
| `@colonies/cli` | Command-line tool for batch terrain generation |
| `@colonies/frontend` | Interactive 3D viewer with React and Three.js |

## Commands

```bash
# Development
pnpm dev              # Start frontend dev server
pnpm generate         # Run CLI terrain generation

# Build
pnpm build            # Build all packages

# Test
pnpm test             # Run all tests
pnpm test:watch       # Watch mode

# Quality
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier
```

## Frontend

The interactive viewer runs simulation in a Web Worker and renders terrain with Three.js:

- **Control Panel** - Adjust seed, map size, ridge orientation, river density
- **3D Terrain** - Height-displaced mesh with custom shaders
- **Layer Toggles** - Show/hide terrain, rivers, settlements
- **Real-time Progress** - Generation progress bar

## CLI Output

Running `pnpm generate` creates PNG files in `output/`:

| File | Description |
|------|-------------|
| `01_height_map.png` | Elevation (blue=water, green/brown=land) |
| `02_flow_accumulation.png` | River network (blue intensity = flow) |
| `03_moisture_map.png` | Moisture (brown=dry, green=wet) |
| `04_cost_field.png` | Movement cost (green=easy, red=difficult) |
| `05_usage_heatmap.png` | Transport usage (yellow→red heat) |

## Configuration

World generation parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `seed` | 12345 | Deterministic RNG seed |
| `mapSize` | 1000 | Grid resolution (1000 = 10km at 10m resolution) |
| `ridgeOrientation` | 45 | Ridge belt angle in degrees |
| `riverDensity` | 0.5 | Precipitation multiplier (0-1) |
| `coastalPlainWidth` | 0.3 | Fraction of map for coastal plain |
| `ridgeHeight` | 200 | Maximum ridge elevation in meters |

## Documentation

- [Architecture](docs/architecture.md) - System design and data flow
- [Roadmap](docs/roadmap.md) - Implementation progress
- **Simulation**
  - [Physical Layer](docs/world/01_physical_layer/README.md) - Terrain and hydrology
  - [Network Layer](docs/world/02_network_layer/README.md) - Pathfinding and transport
  - [Design Spec](docs/world/design.md) - Full simulation design
- **Frontend**
  - [Frontend Docs](docs/frontend/README.md) - React/Three.js architecture

## Algorithms

- **Simplex Noise** - Multi-octave terrain variation
- **D8 Flow Routing** - 8-direction steepest descent for water flow
- **Topological Accumulation** - High-to-low traversal for river networks
- **Harbor Scoring** - Multi-criteria (depth, shelter, river access)
- **A* Pathfinding** - Priority queue-based shortest path

## Tech Stack

- **TypeScript** - Strict mode, ES modules
- **pnpm** - Workspace-based monorepo
- **Vite** - Frontend dev server and bundler
- **React** - UI components
- **Three.js** - 3D terrain rendering
- **Zustand** - State management
- **Vitest** - Unit testing

## Project Status

| Component | Status |
|-----------|--------|
| Physical Layer | Complete |
| Network Layer | Complete |
| Frontend Viewer | Complete |
| Cadastral/Growth | Planned |
| Economy/Industry | Planned |
| Time-lapse Export | Planned |

See [docs/roadmap.md](docs/roadmap.md) for detailed progress.

## License

ISC
