# Architecture

Software architecture for the Colonies simulation and frontend.

## Monorepo Structure

```
colonies/
├── packages/
│   ├── shared/      # @colonies/shared - Types and config
│   ├── core/        # @colonies/core - Simulation logic
│   ├── cli/         # @colonies/cli - Node.js CLI
│   └── frontend/    # @colonies/frontend - React + Three.js app
└── docs/
    ├── world/       # Simulation documentation
    └── frontend/    # Frontend documentation
```

## Package Dependencies

```
@colonies/shared    (no dependencies)
       ↑
       │
@colonies/core      (simplex-noise)
       ↑
   ┌───┴───┐
   │       │
@colonies/cli     @colonies/frontend
(pngjs, yaml)     (react, three, zustand)
```

## Pluggable Layer Architecture

Each simulation layer can have multiple algorithm implementations:

```typescript
// packages/shared/src/types.ts
interface ITerrainGenerator {
  generateTerrain(): TerrainData;
  findBestHarbor(terrain: TerrainData): Point | null;
}

// packages/core/src/generator-factory.ts
export function createWorldGenerator(config: WorldConfig): ITerrainGenerator {
  return new VoronoiWorldGenerator(config);
}
```

### Algorithm

Uses **Voronoi mesh terrain generation** with Poisson disk sampling for natural cell distribution. See [Physical Layer](world/01_physical_layer/README.md).

## Simulation Layers

See [world/](world/) for detailed documentation:

| Layer | Status | Documentation |
|-------|--------|---------------|
| Physical | Complete | [world/01_physical_layer/](world/01_physical_layer/README.md) |
| Network | Complete | [world/02_network_layer/](world/02_network_layer/README.md) |
| Cadastral | Planned | [world/todo/03_growth.md](world/todo/03_growth.md) |
| Society | Planned | [world/todo/03_growth.md](world/todo/03_growth.md) |
| Economy | Planned | [world/todo/04_industries.md](world/todo/04_industries.md) |

## Frontend Architecture

See [frontend/](frontend/) for detailed documentation:

| Component | Description |
|-----------|-------------|
| Web Worker | Runs simulation in background thread |
| Three.js Scene | Height-displaced terrain mesh with shaders |
| Zustand Store | State management and worker communication |
| React UI | Control panel, status bar, layer toggles |

## Key Interfaces

Defined in `@colonies/shared`:

- **WorldConfig** - Configuration parameters for world generation
- **VoronoiTerrainData** - Voronoi cells with elevation, moisture, flow
- **PathResult** - Pathfinding result with path, cost, crossings
- **NetworkEdge** - Transport edges with type, cost, usage
- **Settlement** - Entities with population, rank, location

## Core Classes

In `@colonies/core`:

- **SeededRNG** - Deterministic random number generator
- **VoronoiWorldGenerator** - Voronoi terrain with Poisson disk sampling
- **TransportNetwork** - A* pathfinding, edge costs, road upgrades
- **CadastralManager** - Parcel subdivision and land use
- **SettlementManager** - Village seeding and expansion

## Data Flow

```
                    CLI                          Frontend
                     │                              │
                     ▼                              ▼
Config ────► createWorldGenerator() ◄────── Web Worker
                     │                              │
                     ▼                              │
           VoronoiWorldGenerator                   │
                     │                              │
                     ▼                              ▼
         VoronoiTerrainData ────────────► Three.js Scene
                     │                              │
                     ▼                              ▼
           SettlementManager                  React UI
```

## Development Tools

- **pnpm** - Package manager with workspaces
- **TypeScript** - Strict mode, ES modules
- **Vite** - Frontend dev server and bundler
- **Vitest** - Unit testing
- **ESLint + Prettier** - Code quality
