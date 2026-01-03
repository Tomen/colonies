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
- `voronoi-worldgen.ts`: Voronoi terrain generation
- `generator-factory.ts`: World generator factory
- `cadastral.ts`: Parcel subdivision and land use management
- `settlements.ts`: Settlement seeding and expansion
- `growth.ts`: Settlement management (legacy stub)

### @colonies/cli
Node.js CLI for batch generation:
- `main.ts`: Entry point
- `config.ts`: YAML config file loading

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
  - [World Design](docs/world/world.md) - **Main entry point for simulation design**
  - [Physical Layer](docs/world/01_physical_layer/README.md)
  - [Network Layer](docs/world/02_network_layer/README.md)
- **Frontend**: [docs/frontend/](docs/frontend/)
  - [River Rendering](docs/frontend/river-rendering.md)

## Implementation Status

| Component | Status | Documentation |
|-----------|--------|---------------|
| Physical Layer | Complete | [docs/world/01_physical_layer/](docs/world/01_physical_layer/README.md) |
| Biome System | Complete | [docs/world/world.md#biomes](docs/world/world.md) |
| Cadastral Layer | Complete | [docs/world/world.md#cadastral-layer](docs/world/world.md) |
| Network Layer | Complete | [docs/world/02_network_layer/](docs/world/02_network_layer/README.md) |
| Settlements | Basic | [docs/world/world.md#settlements--urbanization](docs/world/world.md) |
| Frontend Viewer | Complete | [docs/frontend/](docs/frontend/README.md) |
| River Rendering | Complete | [docs/frontend/river-rendering.md](docs/frontend/river-rendering.md) |
| Economy/Industry | Pending | [docs/world/todo/04_industries.md](docs/world/todo/04_industries.md) |

## Definition of Done

Before marking any layer complete:
1. `pnpm test` passes with coverage for new functionality
2. `pnpm lint` reports no warnings/errors
3. Create documentation in appropriate `docs/` subfolder
4. Update `docs/architecture.md` and `docs/roadmap.md`

## Key Algorithms

- **Single Island Generation**: Radius + coastline noise for solid landmass
- **Mapgen4-style Elevation**: Dual hills+mountains system with B/(A+B) blending
- **Voronoi Flow Routing**: Each cell flows to lowest neighbor
- **BFS Distance Fields**: Distance from coast/peaks for elevation
- **Harbor Scoring**: Multi-criteria (depth, shelter, river access)
- **A* Pathfinding**: Priority queue-based shortest path
- **Simplex Noise**: Seeded terrain variation

## Configuration

World generation parameters via `WorldConfig` in `@colonies/shared`:

### Core

| Parameter | Default | Description |
|-----------|---------|-------------|
| `seed` | 12345 | Deterministic RNG seed |
| `mapSize` | 10000 | Map size in meters (10km default, 1 unit = 1 meter) |

### Island Shape

| Parameter | Default | Description |
|-----------|---------|-------------|
| `landFraction` | 0.55 | Island size (0.3=small, 0.8=large) |
| `islandNoiseOctaves` | 4 | Coastline complexity |

### Elevation (Mapgen4-style)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `peakElevation` | 1500 | Maximum elevation in meters |
| `hilliness` | 0.3 | Rolling terrain amount (0-1) |
| `elevationBlendPower` | 2 | Coastal flatness (higher=flatter) |

### Rivers

| Parameter | Default | Description |
|-----------|---------|-------------|
| `riverThreshold` | 50 | Min flow accumulation for river |

### Settlements

| Parameter | Default | Description |
|-----------|---------|-------------|
| `settlementCount` | 3 | Number of villages to seed (0-10) |
