# River Generation

Technical documentation for the river generation algorithm in `packages/core/src/rivers.ts`.

## Overview

Rivers are generated as explicit **vector polylines** rather than being derived implicitly from flow accumulation. This approach provides:

- Precise control over river placement and behavior
- Explicit data model for downstream simulation layers
- Natural-looking valley carving with parabolic profiles
- Strahler stream ordering for river hierarchy

## Data Model

### River Interface

```typescript
interface River {
  id: string;           // Unique identifier (e.g., "river_0")
  points: Point[];      // Polyline from source to mouth
  strahler: number;     // Stream order (1=headwater, higher=major)
  tributaries: River[]; // Child rivers (currently empty, for future use)
}
```

### Integration with TerrainData

Rivers are stored in the `TerrainData.rivers` array:

```typescript
interface TerrainData {
  height: number[][];
  flowAccumulation: number[][];
  moisture: number[][];
  rivers?: River[];  // Explicit river polylines
}
```

## Algorithm Flow

```
1. Find ridge line (local elevation maxima)
2. Sample river sources along ridge (Poisson-disc)
3. For each source, trace river downhill to ocean
4. Carve valleys around river polylines
```

### Step 1: Find Ridge Line

The ridge line is found by scanning each row for the local elevation maximum:

```typescript
function findRidgeLine(elevation: number[][]): Point[] {
  const ridgeLine: Point[] = [];

  for (let y = 0; y < size; y++) {
    let maxX = 0;
    let maxElevation = -Infinity;

    for (let x = 0; x < size; x++) {
      if (elevation[y][x] > maxElevation) {
        maxElevation = elevation[y][x];
        maxX = x;
      }
    }

    ridgeLine.push({ x: maxX, y });
  }

  return ridgeLine;
}
```

### Step 2: Sample River Sources

River sources are placed along the ridge using simple spacing:

```typescript
const sources: Point[] = [];
let lastY = -spacing;

for (const point of ridgeLine) {
  if (point.y - lastY >= spacing) {
    sources.push(point);
    lastY = point.y;
  }
}
```

The `riverSpacing` parameter controls minimum distance between sources.

### Step 3: Trace Rivers Downhill

Each river follows the steepest descent path from source to ocean:

```typescript
function traceRiverDownhill(
  source: Point,
  elevation: number[][],
  meander: number,
  noise2D?: (x: number, y: number) => number
): Point[] {
  const points: Point[] = [source];
  let current = source;

  while (elevation[current.y][current.x] > 0) {
    // Find steepest descent among 8 neighbors
    const next = findLowestNeighbor(current, elevation);

    // Add meandering if enabled
    if (meander > 0 && noise2D) {
      next.x += noise2D(current.x, current.y) * meander * 3;
      next.y += noise2D(current.y, current.x) * meander * 3;
    }

    points.push(next);
    current = next;

    // Safety limit to prevent infinite loops
    if (points.length > size * 2) break;
  }

  return points;
}
```

### Step 4: Carve Valleys

River valleys are carved with a parabolic cross-section profile:

```typescript
function carveRiverValleys(
  elevation: number[][],
  rivers: River[],
  distanceToRiver?: number[][]
): void {
  // Compute distance to nearest river for each cell
  const dist = distanceToRiver ?? computeDistanceToPolylines(rivers, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = dist[y][x];
      const valleyWidth = 15;  // cells
      const valleyDepth = 20;  // meters

      if (d < valleyWidth) {
        // Parabolic valley profile: deeper at center
        const t = d / valleyWidth;  // 0 at river, 1 at edge
        const carveAmount = valleyDepth * (1 - t * t);
        elevation[y][x] -= carveAmount;
      }
    }
  }
}
```

The parabolic profile creates:
- Deep, flat-bottomed channels at the river center
- Smooth transitions to surrounding terrain at valley edges

## Strahler Stream Order

Strahler numbers classify rivers by their position in the drainage hierarchy:

| Strahler | Description | Example |
|----------|-------------|---------|
| 1 | Headwater stream | Small creek at ridge |
| 2 | Two order-1 streams merged | |
| 3 | Two order-2 streams merged | |
| n | Two order-(n-1) streams merged | Major river |

Currently, all rivers are assigned Strahler order 1 (future enhancement: merge tributaries and calculate proper ordering).

## Distance to Rivers

The `computeDistanceToPolylines` function calculates distance from each cell to the nearest river using:

1. **Rasterization**: Convert river polylines to grid cells using Bresenham's algorithm
2. **BFS propagation**: Expand from river cells to compute distance field

```typescript
function computeDistanceToPolylines(
  rivers: River[],
  size: number
): number[][] {
  const riverCells: Point[] = [];

  // Rasterize all river polylines
  for (const river of rivers) {
    for (let i = 0; i < river.points.length - 1; i++) {
      const cells = bresenhamLine(river.points[i], river.points[i + 1]);
      riverCells.push(...cells);
    }
  }

  // BFS from river cells
  return computeDistanceField(size, riverCells);
}
```

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `riverSpacing` | 80 | Minimum distance between river sources (cells) |
| `riverMeanderStrength` | 0.3 | How much rivers curve (0 = straight, 1 = very wavy) |

### Effect of riverSpacing

- **Low (40)**: Dense river network, many small streams
- **Medium (80)**: Moderate density, balanced appearance
- **High (200)**: Sparse rivers, large watersheds

### Effect of riverMeanderStrength

- **0.0**: Rivers follow exact steepest descent (straight)
- **0.3**: Natural-looking gentle curves
- **0.8**: Highly meandering, serpentine rivers

## Benefits for Downstream Layers

Having rivers as explicit vector data enables:

| Layer | Benefit |
|-------|---------|
| **Cadastral** | Parcels can reference rivers for metes-and-bounds descriptions |
| **Network** | Crossings use explicit river data, not threshold detection |
| **Economy** | Mills placed at specific river points by Strahler order |
| **Settlements** | River mouths explicitly available for port placement |

## Relationship to Flow Accumulation

Flow accumulation is **still calculated** after terrain generation for:

- **Moisture calculation**: High flow = wetter soil
- **Validation**: Flow accumulation should match river locations
- **Fine-grained hydrology**: Small streams not in explicit rivers

The explicit rivers define **major drainage** while flow accumulation captures **all water flow**.

## Related Files

- `packages/core/src/rivers.ts` - River generation implementation
- `packages/core/src/distance-field.ts` - Distance field utilities
- `packages/core/src/worldgen.ts` - Integration with terrain generation
- `packages/shared/src/types.ts` - River interface definition
