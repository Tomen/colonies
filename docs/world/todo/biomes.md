# Biome System Implementation

**Status:** Implemented
**Prerequisite for:** M5 Economy

## Overview

Every Voronoi cell belongs to a biome. Biomes are derived from existing terrain properties and influence:
1. Pathfinding costs (travel difficulty)
2. Buildable structures (what parcels/buildings can be placed)
3. Resource availability (for M5 economy)

## Biome Types

| Biome | Derivation Rule | Pathfinding Cost | Allowed Buildings |
|-------|-----------------|------------------|-------------------|
| `sea` | `!isLand` (open water) | Impassable (by land) | None |
| `river` | Cell on river edge or high flow | Higher crossing cost | Mill (future) |
| `lake` | Cell in lake basin (`lakeId !== null`) | Impassable (by land) | None |
| `plains` | Land, low elevation, no forest | Base cost (1.0x) | Farm, house |
| `woods` | Land with moisture > threshold | Higher cost (1.5x) | Lumberjack, house |
| `mountains` | Land, elevation > threshold | Very high cost (3.0x) | Mine (future) |

## Implementation Tasks

### Task 1: Add Biome to Types
**File:** `packages/shared/src/types.ts`

```typescript
export type Biome = 'sea' | 'river' | 'lake' | 'plains' | 'woods' | 'mountains';

// Add to VoronoiCell:
export interface VoronoiCell {
  // ... existing fields
  biome: Biome;
}
```

### Task 2: Biome Assignment in Terrain Generation
**File:** `packages/core/src/voronoi-worldgen.ts`

Add biome assignment after elevation and moisture are computed:

```typescript
function assignBiome(cell: VoronoiCell, config: WorldConfig): Biome {
  // Water cells
  if (!cell.isLand) return 'sea';
  if (cell.lakeId !== null) return 'lake';

  // Check if cell is part of a river (high flow accumulation)
  // River cells are still traversable but have crossing costs
  const riverThreshold = config.riverThreshold ?? 50;
  if (cell.flowAccumulation >= riverThreshold) return 'river';

  // Mountain threshold (e.g., top 15% of elevation range)
  const mountainThreshold = (config.peakElevation ?? 1500) * 0.6;
  if (cell.elevation > mountainThreshold) return 'mountains';

  // Woods based on moisture (higher moisture = forest)
  const woodsThreshold = 0.5;
  if (cell.moisture > woodsThreshold) return 'woods';

  // Default to plains
  return 'plains';
}
```

### Task 3: Update Pathfinding Costs
**File:** `packages/core/src/transport.ts`

Add biome-based cost multipliers:

```typescript
const BIOME_COST_MULTIPLIER: Record<Biome, number> = {
  sea: Infinity,      // Impassable by land
  lake: Infinity,     // Impassable by land
  river: 1.0,         // Traversable but crossings have penalty
  plains: 1.0,        // Base cost
  woods: 1.5,         // Slower through forest
  mountains: 3.0,     // Very slow in mountains
};
```

### Task 4: Update Settlement Building Logic
**File:** `packages/core/src/settlements.ts`

Map biomes to allowed land uses:

```typescript
const BIOME_ALLOWED_LAND_USE: Record<Biome, LandUse[]> = {
  sea: [],
  lake: [],
  river: ['residential'],  // Can build near rivers
  plains: ['field', 'pasture', 'residential', 'commercial', 'civic'],
  woods: ['forest', 'residential'],  // Lumberjack operations
  mountains: ['residential'],  // Limited building in mountains
};
```

### Task 5: Add Biome Visualization (Frontend)
**File:** `packages/frontend/src/three/VoronoiTerrainMesh.tsx`

Add biome-based coloring option in terrain renderer.

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mountainElevationFraction` | 0.6 | Fraction of peakElevation for mountain biome |
| `woodsMoistureThreshold` | 0.5 | Moisture level for woods biome |
| `riverFlowThreshold` | 50 | Flow accumulation for river biome (same as riverThreshold) |

## Testing

1. **Biome assignment**: Verify each cell gets correct biome based on properties
2. **Pathfinding**: Verify paths avoid/minimize mountain traversal
3. **Settlement building**: Verify farms only on plains, lumberjacks only in woods
4. **Visualization**: Verify biome coloring matches expectations

## Dependencies

- Uses existing: `elevation`, `moisture`, `isLand`, `lakeId`, `flowAccumulation`
- No new dependencies required

## Acceptance Criteria

- [x] All cells have a biome assigned
- [x] Pathfinding costs reflect biome difficulty
- [x] Settlements respect biome building restrictions
- [x] Frontend shows biome colors when texture mode = "biome"
- [x] Frontend shows moisture gradient when texture mode = "moisture" (normalized for visibility)
- [x] Normal texture mode shows woods influence (dark green for forested areas)
- [x] `pnpm test` passes (126 tests)
- [x] `pnpm lint` passes
