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
| `voronoi-worldgen.ts` | VoronoiWorldGenerator - Voronoi polygon terrain |
| `generator-factory.ts` | createWorldGenerator - Factory function |
| `cadastral.ts` | CadastralManager - Parcel subdivision and land use |
| `settlements.ts` | SettlementManager - Village seeding and expansion |
| `growth.ts` | GrowthManager - Settlements (stub) |
| `rivers.ts` | River utilities |
| `distance-field.ts` | Distance field calculations |
| `index.ts` | Re-exports all public classes |

## Key Classes

### createWorldGenerator(config)
Factory function that returns a VoronoiWorldGenerator.

### VoronoiWorldGenerator
Voronoi polygon-based terrain generation using d3-delaunay:
- Lloyd relaxation for uniform cells
- BFS elevation from ocean
- Delaunay-based flow routing
- Cell-based moisture diffusion
- Returns `VoronoiTerrainData` with `type: 'voronoi'`

### CadastralManager
Manages parcels within terrain cells:
- Subdivides Voronoi cells into lot-sized parcels
- Tracks land use per parcel
- Provides spatial queries

### SettlementManager
Handles village placement and growth:
- Seeds villages on suitable land cells
- Claims surrounding cells for expansion
- Assigns land uses to parcels

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
- `voronoi-worldgen.test.ts` - Voronoi terrain generation, cell properties
- `generator-factory.test.ts` - Factory function tests
- `cadastral.test.ts` - Parcel subdivision and queries
- `settlements.test.ts` - Village seeding and expansion
- `growth.test.ts` - Settlement stubs

## Guidelines

- No Node.js APIs (fs, path, etc.) - this runs in browsers
- No browser APIs (DOM, window, etc.) - this runs in Node.js
- All randomness must use SeededRNG for determinism
- Export classes through `index.ts`
