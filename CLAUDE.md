# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A procedural American East-Coast-like terrain generator with historical settlement growth simulation. Generates terrain, hydrology, transport networks, land use, settlements, and economic development over time. Includes an interactive 3D frontend.

## Monorepo Structure

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

## Commands

```bash
# Install dependencies
pnpm install

# Start frontend dev server
pnpm dev

# Generate terrain via CLI
pnpm generate

# Build all packages
pnpm build

# Run all tests (required before completing any step)
pnpm test

# Watch mode for development
pnpm test:watch

# Lint code (required before completing any step)
pnpm lint

# Format code
pnpm format
```

## Packages

### @colonies/shared
Types and configuration utilities:
- `types.ts`: Core interfaces (Point, WorldConfig, TerrainData, etc.)
- `config-schema.ts`: Default config values and validation

### @colonies/core
Platform-agnostic simulation (browser + Node.js):
- `rng.ts`: Seeded random number generator
- `worldgen.ts`: Terrain generation with simplex noise
- `transport.ts`: A* pathfinding and network management
- `growth.ts`: Settlement management

### @colonies/cli
Node.js CLI for batch generation:
- `main.ts`: Entry point
- `config.ts`: YAML config file loading
- `png_exporter.ts`: PNG visualization output

### @colonies/frontend
React + Three.js interactive viewer:
- `src/store/`: Zustand state management
- `src/three/`: Three.js terrain components
- `src/workers/`: Web Worker for simulation
- `src/components/`: React UI components

## Documentation

- [Architecture](docs/architecture.md) - System design
- [Roadmap](docs/roadmap.md) - Implementation progress
- **Simulation**: [docs/world/](docs/world/)
  - [Physical Layer](docs/world/01_physical_layer/README.md)
  - [Network Layer](docs/world/02_network_layer/README.md)
  - [Design Spec](docs/world/design.md)
- **Frontend**: [docs/frontend/](docs/frontend/)

## Implementation Status

| Component | Status | Documentation |
|-----------|--------|---------------|
| Physical Layer | Complete | [docs/world/01_physical_layer/](docs/world/01_physical_layer/README.md) |
| Network Layer | Complete | [docs/world/02_network_layer/](docs/world/02_network_layer/README.md) |
| Frontend Viewer | Complete | [docs/frontend/](docs/frontend/README.md) |
| Cadastral/Growth | Pending | [docs/world/todo/03_growth.md](docs/world/todo/03_growth.md) |
| Economy/Industry | Pending | [docs/world/todo/04_industries.md](docs/world/todo/04_industries.md) |

## Definition of Done

Before marking any layer complete:
1. `pnpm test` passes with coverage for new functionality
2. `pnpm lint` reports no warnings/errors
3. Create documentation in appropriate `docs/` subfolder
4. Update `docs/architecture.md` and `docs/roadmap.md`

## Key Algorithms

- **D8 Flow Routing**: 8-direction steepest descent for water flow
- **Topological Flow Accumulation**: High-to-low elevation traversal
- **Harbor Scoring**: Multi-criteria (depth, shelter, river access)
- **A* Pathfinding**: Priority queue-based shortest path
- **Simplex Noise**: Seeded terrain variation

## Configuration

World generation parameters via `WorldConfig` in `@colonies/shared`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `seed` | 12345 | Deterministic RNG seed |
| `mapSize` | 1000 | Grid resolution (10km at 10m resolution) |
| `ridgeOrientation` | 45 | Ridge belt angle in degrees |
| `riverDensity` | 0.5 | Precipitation multiplier (0-1) |
| `coastalPlainWidth` | 0.3 | Fraction of map for coastal plain |
| `ridgeHeight` | 200 | Maximum ridge elevation in meters |
