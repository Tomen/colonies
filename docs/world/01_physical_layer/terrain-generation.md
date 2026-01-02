# Terrain Generation

Technical documentation for the terrain generation algorithm in `packages/core/src/worldgen.ts`.

## Overview

The terrain simulates islands using a **distance-field based approach** inspired by [Red Blob Games' mapgen2/mapgen4](https://www.redblobgames.com/maps/mapgen4/). This approach generates natural-looking islands with:

- **Irregular coastlines** defined by noise + distance-from-center
- **Elevation based on distance from coast** (higher toward island centers)
- **Rivers flowing in all directions** from peaks to nearest coast
- **Carved river valleys** with parabolic profiles

## Algorithm Flow

The generation follows these steps:

```
1. Generate island mask (noise + distance-from-center)
2. Find coastline cells (land adjacent to water)
3. Compute distance field from coastline
4. Generate elevation from distance to coast
5. Find local peaks for river sources
6. Generate rivers flowing toward any coast
7. Carve river valleys
8. Add distance-scaled noise
9. Calculate flow accumulation for moisture
```

### Step 1: Island Mask Generation

The island shape is created by combining:
- **Distance from center**: Cells closer to center are more likely to be land
- **Multi-octave noise**: Creates irregular coastline

```typescript
// For each cell:
const distFromCenter = sqrt(dx² + dy²);  // Normalized 0-1
const noiseValue = multiOctaveNoise(x, y);

// Higher noise + closer to center = land
const landValue = noiseValue - distFromCenter * 0.7;
isLand = landValue > (1 - landFraction);
```

### Step 2: Find Coastline Cells

Coastline cells are land cells adjacent to water (4-connected):

```typescript
const coastlineCells = findCoastlineCells(islandMask);
// Returns all land cells with at least one water neighbor
```

### Step 3: Distance Field from Coast

BFS computes distance from each cell to nearest coastline:

```typescript
const distToCoast = computeDistanceField(size, coastlineCells);
// Result: 0 at coast, increases toward island center
```

See [distance-fields.md](distance-fields.md) for implementation details.

### Step 4: Elevation from Distance

Elevation is proportional to distance from coast:

```typescript
if (isWater) {
  elevation = -5 - distToCoast * 0.3;  // Ocean depth
} else {
  const t = distToCoast / maxDistance;
  elevation = smoothstep(t) * peakElevation;  // Island height
}
```

The `smoothstep` function creates natural-looking rounded peaks:
```
smoothstep(t) = t² × (3 - 2t)
```

### Step 5: Find Peaks for River Sources

Unlike the previous ridge-based approach, islands have multiple peaks scattered across the terrain:

```typescript
const peaks = findPeaks(elevation, islandMask, riverSpacing, minPeakElevation);
// Returns local maxima in 2D elevation grid
```

### Step 6: River Generation

Rivers trace downhill from peaks to any coast:

1. For each peak, follow steepest descent
2. Add meandering via noise
3. Stop when reaching water (elevation ≤ 0)

See [rivers.md](rivers.md) for detailed documentation.

### Step 7: Valley Carving

River valleys are carved with parabolic profiles. See [rivers.md](rivers.md).

### Step 8: Distance-Scaled Noise

Noise amplitude varies based on proximity to rivers:

```typescript
const nearRiver = isNearRiver(x, y, riverGrid, 10);
const baseNoiseAmp = elevation * noiseAmplitude;
const actualNoiseAmp = baseNoiseAmp * (nearRiver ? 0.3 : 1.0);
elevation += noise * actualNoiseAmp;
```

This creates flat valleys and rough peaks.

### Step 9: Flow Accumulation

D8 flow routing for moisture calculation (unchanged from previous version).

## Configuration Parameters

### Island Shape

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `landFraction` | number | 0.45 | Fraction of map that is land (0-1) |
| `islandNoiseScale` | number | 0.006 | Noise frequency for coastline shape |
| `islandNoiseOctaves` | number | 4 | Coastline complexity (more = more irregular) |

### Elevation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `peakElevation` | number | 300 | Maximum elevation at island center (meters) |
| `minPeakElevation` | number | 50 | Minimum elevation to be a river source |

### Rivers

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `riverSpacing` | number | 80 | Minimum distance between river sources (cells) |
| `riverMeanderStrength` | number | 0.3 | How much rivers curve (0 = straight) |

### Noise

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `noiseScale` | number | 0.005 | Base frequency of terrain noise |
| `noiseAmplitude` | number | 0.15 | Noise strength as fraction of local elevation |

## Data Structures

### TerrainData

```typescript
interface TerrainData {
  height: number[][];          // Elevation grid (negative = water)
  flowAccumulation: number[][]; // Upstream cell count per cell
  moisture: number[][];         // Moisture level 0-1
  rivers?: River[];             // Explicit river polylines
}
```

### River

```typescript
interface River {
  id: string;                  // Unique identifier
  points: Point[];             // Polyline from source to mouth
  strahler: number;            // Stream order (1=headwater, higher=major)
  tributaries: River[];        // Child rivers
}
```

## Visual Example

```
Island terrain (top-down):

    ░░░░░░░░░░░░░░░░░░░░
  ░░░░░░░████████░░░░░░░░
░░░░░░████████████████░░░░
░░░░██████████████████░░░░
░░░░████████▓▓████████░░░░    ▓ = Peak (high elevation)
░░░░░░████████████████░░░░    █ = Land (medium elevation)
  ░░░░░░████████████░░░░░░    ░ = Ocean (negative elevation)
    ░░░░░░░░░░░░░░░░░░░░

Rivers flow outward in all directions ↗↘↙↖
```

## Related Files

- `packages/core/src/worldgen.ts` - Main terrain generation
- `packages/core/src/rivers.ts` - River generation and valley carving
- `packages/core/src/distance-field.ts` - Distance field utilities
- `packages/shared/src/types.ts` - WorldConfig and TerrainData interfaces
- `config.yaml` - User configuration
