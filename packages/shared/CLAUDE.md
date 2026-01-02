# @colonies/shared

Shared types and configuration utilities used by all other packages.

## Purpose

This package has no dependencies and defines the common interfaces that `core`, `cli`, and `frontend` all depend on. Changes here affect the entire monorepo.

## Files

| File | Description |
|------|-------------|
| `types.ts` | Core interfaces: Point, WorldConfig, TerrainData, NetworkEdge, etc. |
| `config-schema.ts` | Default configuration values and validation |
| `index.ts` | Re-exports all public types |

## Key Types

- **WorldConfig** - All simulation parameters (terrain, transport, thresholds)
- **TerrainData** - Height, flow accumulation, and moisture grids
- **CostField** - Movement cost with water/river flags
- **PathResult** - A* pathfinding result
- **NetworkEdge** - Transport edge with type, cost, usage
- **RiverCrossing** - Ford/ferry/bridge crossing point
- **Settlement** - Population center with rank and location

## Commands

```bash
pnpm build    # Compile TypeScript
pnpm lint     # Run ESLint
```

## Guidelines

- Keep this package dependency-free
- All types should be platform-agnostic (no Node.js or browser-specific APIs)
- Export everything through `index.ts`
- When adding new config parameters, also add defaults in `config-schema.ts`
