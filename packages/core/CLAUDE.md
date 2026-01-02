# @colonies/core

Platform-agnostic simulation logic that runs in both Node.js and browsers.

## Purpose

Contains all simulation algorithms without platform-specific I/O. Used by both `@colonies/cli` (Node.js) and `@colonies/frontend` (browser via Web Worker).

## Dependencies

- `@colonies/shared` - Types and config
- `simplex-noise` - Procedural noise generation
- `d3-delaunay` - Voronoi/Delaunay tessellation

## Files

| File | Description |
|------|-------------|
| `rng.ts` | SeededRNG - Linear congruential generator |
| `worldgen.ts` | WorldGenerator - Grid-based terrain, hydrology, harbors |
| `voronoi-worldgen.ts` | VoronoiWorldGenerator - Voronoi polygon terrain |
| `generator-factory.ts` | createWorldGenerator - Factory for algorithm selection |
| `transport.ts` | TransportNetwork - A* pathfinding, edges, upgrades |
| `growth.ts` | GrowthManager - Settlements (stub) |
| `rivers.ts` | River utilities |
| `distance-field.ts` | Distance field calculations |
| `index.ts` | Re-exports all public classes |

## Key Classes

### createWorldGenerator(config)
Factory function that returns appropriate generator based on `config.generationAlgorithm`:
- `'grid'` (default) - Returns WorldGenerator
- `'voronoi'` - Returns VoronoiWorldGenerator

### WorldGenerator
Grid-based terrain generation with:
- Height map (coastal plain → ridge transition)
- D8 flow direction and accumulation
- Moisture calculation
- Harbor suitability scoring
- Returns `GridTerrainData` with `type: 'grid'`

### VoronoiWorldGenerator
Voronoi polygon-based terrain generation using d3-delaunay:
- Lloyd relaxation for uniform cells
- BFS elevation from ocean
- Delaunay-based flow routing
- Cell-based moisture diffusion
- Returns `VoronoiTerrainData` with `type: 'voronoi'`

### TransportNetwork
Manages movement with:
- Cost field from terrain slope/water
- A* pathfinding (8-directional)
- River crossing detection
- Edge upgrades (trail→road→turnpike)

### SeededRNG
Deterministic random numbers for reproducible generation.

## Commands

```bash
pnpm build       # Compile TypeScript
pnpm test        # Run Vitest tests
pnpm test:watch  # Watch mode
pnpm lint        # Run ESLint
```

## Tests

Tests are in `tests/`:
- `worldgen.test.ts` - Grid terrain generation, hydrology, harbors
- `voronoi-worldgen.test.ts` - Voronoi terrain generation, cell properties
- `generator-factory.test.ts` - Factory function, type discriminators
- `transport.test.ts` - Cost field, A*, edges, upgrades
- `growth.test.ts` - Settlement stubs

## Guidelines

- No Node.js APIs (fs, path, etc.) - this runs in browsers
- No browser APIs (DOM, window, etc.) - this runs in Node.js
- All randomness must use SeededRNG for determinism
- Export classes through `index.ts`
