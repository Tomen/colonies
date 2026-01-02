# Distance Fields

Technical documentation for distance field computation in `packages/core/src/distance-field.ts`.

## What Are Distance Fields?

A distance field is a 2D grid where each cell contains the distance to the nearest feature (coastline, river, ridge, etc.). Distance fields provide:

- **Smooth gradients**: Natural transitions between terrain features
- **Feature-relative positioning**: "How far am I from the coast?"
- **Efficient queries**: O(1) lookup after O(n) computation

## Visual Example

Distance field from a coastline (values increase moving inland):

```
Coastline →  0  0  0  0  0
             1  1  1  1  1
             2  2  2  2  2
             3  3  3  3  3
             4  4  4  4  4
             ← Inland
```

## Algorithm: BFS-Based Computation

Distance fields are computed using Breadth-First Search (BFS):

```typescript
function computeDistanceField(
  size: number,
  seeds: Point[],        // Starting cells (distance = 0)
  obstacles?: Function   // Optional impassable cells
): number[][] {
  const distance = createGrid(size, Infinity);
  const queue: Point[] = [];

  // Initialize seeds with distance 0
  for (const seed of seeds) {
    distance[seed.y][seed.x] = 0;
    queue.push(seed);
  }

  // BFS expansion
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = distance[current.y][current.x];

    for (const neighbor of getNeighbors(current)) {
      if (obstacles?.(neighbor.x, neighbor.y)) continue;

      const newDist = currentDist + 1;
      if (newDist < distance[neighbor.y][neighbor.x]) {
        distance[neighbor.y][neighbor.x] = newDist;
        queue.push(neighbor);
      }
    }
  }

  return distance;
}
```

### Complexity

- **Time**: O(n) where n = grid cells
- **Space**: O(n) for distance grid + queue

### Properties

- Always produces integer distances (cell counts)
- Respects obstacles if provided
- Guaranteed to find shortest path to nearest seed

## Applications in Terrain Generation

### 1. Distance to Ocean

Used for the provincial elevation profile:

```typescript
// Cells at coastline are seeds
const coastlineCells = findCoastline(size, coastlinePosition);
const distToOcean = computeDistanceField(size, coastlineCells);

// Elevation increases with distance from ocean
elevation = f(distToOcean[y][x]);
```

### 2. Distance to Ridge

Combined with distToOcean for smooth elevation gradients:

```typescript
const ridgeCells = findRidgeLine(elevation);
const distToRidge = computeDistanceField(size, ridgeCells);

// Influence ratio determines provincial zone
const ridgeInfluence = distToOcean / (distToOcean + distToRidge + 1);
```

### 3. Distance to Rivers

Controls noise amplitude and valley carving:

```typescript
const riverCells = rasterizeRivers(rivers);
const distToRiver = computeDistanceField(size, riverCells);

// Flat valleys near rivers, rough terrain far from rivers
noiseAmplitude = 5 + distToRiver[y][x] * 0.3;
```

## Smoothstep Function

Distance fields often need smooth interpolation. The `smoothstep` function provides natural-looking transitions:

```typescript
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}
```

### Smoothstep vs Linear

```
1.0 ┤         ╭──── smoothstep
    │       ╱╱
    │     ╱╱
    │   ╱╱
    │ ╱╱
0.0 ┼╱──────────────
    0              1
```

- **Linear**: Constant rate of change, visible edges
- **Smoothstep**: Gradual acceleration/deceleration, smooth transitions

## Finding Ridge Lines

The ridge line is the set of local elevation maxima:

```typescript
function findRidgeLine(elevation: number[][]): Point[] {
  const ridgeLine: Point[] = [];
  const size = elevation.length;

  for (let y = 0; y < size; y++) {
    let maxX = 0;
    let maxElevation = -Infinity;

    // Find highest point in this row
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

## Computing Distance to Polylines

Rivers are polylines, not individual points. To compute distance:

1. **Rasterize** polylines to grid cells using Bresenham's line algorithm
2. **BFS** from rasterized cells

```typescript
function computeDistanceToPolylines(
  polylines: { points: Point[] }[],
  size: number
): number[][] {
  const seeds: Point[] = [];

  for (const polyline of polylines) {
    for (let i = 0; i < polyline.points.length - 1; i++) {
      // Bresenham's line algorithm
      const cells = rasterizeLine(
        polyline.points[i],
        polyline.points[i + 1]
      );
      seeds.push(...cells);
    }
  }

  return computeDistanceField(size, seeds);
}
```

### Bresenham's Line Algorithm

Efficiently rasterizes a line segment to grid cells:

```typescript
function* bresenhamLine(p0: Point, p1: Point): Generator<Point> {
  let x0 = Math.round(p0.x), y0 = Math.round(p0.y);
  const x1 = Math.round(p1.x), y1 = Math.round(p1.y);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    yield { x: x0, y: y0 };

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
```

## Comparison to Other Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **BFS Distance Field** | Exact, fast O(n), integer distances | Only Chebyshev/Manhattan distance |
| **Euclidean Distance Transform** | True Euclidean distance | More complex, floating point |
| **Fast Marching Method** | Handles variable speeds | O(n log n), complex implementation |

For terrain generation, BFS is preferred for its simplicity and speed.

## Performance Considerations

### Grid Size Impact

| Map Size | Cells | BFS Time |
|----------|-------|----------|
| 100x100 | 10K | <1ms |
| 500x500 | 250K | ~10ms |
| 1000x1000 | 1M | ~50ms |

### Optimization Tips

1. **Reuse distance fields**: Compute once, use multiple times
2. **Limit propagation**: Stop BFS when reaching max needed distance
3. **Sparse seeds**: Fewer seeds = faster initial queue population

## Related Files

- `packages/core/src/distance-field.ts` - Implementation
- `packages/core/src/worldgen.ts` - Usage in terrain generation
- `packages/core/src/rivers.ts` - Usage in valley carving
