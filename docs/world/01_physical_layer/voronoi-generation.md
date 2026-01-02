# Voronoi Terrain Generation

Specification for Voronoi mesh-based terrain generation algorithm.

## Overview

Voronoi terrain generation uses an irregular mesh of polygonal cells. This approach is inspired by [Red Blob Games' mapgen4](https://www.redblobgames.com/maps/mapgen4/) and uses similar techniques for elevation and terrain shaping.

**Best for:**
- Organic visual appearance
- Fast A* pathfinding (~10K nodes vs 1M)
- Natural land parcel boundaries
- Downstream settlement/road simulation

**Trade-offs:**
- Flow routing on irregular mesh is more complex
- Depression handling requires priority-flood algorithms
- Smooth gradient fields are noisier than grid sampling

## Algorithm Steps

### 1. Point Distribution

Generate seed points for Voronoi cells using **Poisson disk sampling** (Bridson's algorithm):

```typescript
// Calculate minimum distance from target cell count
const minDist = Math.sqrt((size * size) / targetCount) * 0.8;

// Bridson's algorithm:
// 1. Create background grid for spatial queries (cell size = minDist / √2)
// 2. Start with random seed point, add to active list
// 3. For each active point, generate k candidates at distance [r, 2r]
// 4. Accept candidate if no existing point within minDist
// 5. Remove point from active list when no valid candidates found
// 6. Repeat until active list empty
```

**Why Poisson disk sampling?**
- **No grid artifacts**: True random distribution with no visible patterns
- **Minimum spacing guarantee**: Prevents tiny cells that would cause rendering issues
- **Organic appearance**: Natural-looking cell distribution
- **Efficient**: O(n) complexity via spatial hash grid

### 2. Voronoi Tessellation

Compute Voronoi diagram using d3-delaunay:

```typescript
import { Delaunay } from 'd3-delaunay';

const delaunay = Delaunay.from(points);
const voronoi = delaunay.voronoi([0, 0, mapSize, mapSize]);
```

**Data Structures:**
- `cells[]` - Polygon vertices for each cell
- `neighbors[]` - Adjacent cell indices via `voronoi.neighbors(i)`
- `edges[]` - Shared boundaries between cells

### 3. Lloyd Relaxation

Improve cell regularity by moving seeds to cell centroids (2-3 iterations):

```typescript
for (let i = 0; i < relaxationIterations; i++) {
  const centroids = computeCentroids(voronoi, points.length);
  points = centroids;
  delaunay = Delaunay.from(points);
  voronoi = delaunay.voronoi([0, 0, mapSize, mapSize]);
}
```

### 4. Single Island Mask

Determine land vs water using a **single island approach**:

```typescript
// Base radius from landFraction parameter
const baseRadius = 0.3 + landFraction * 0.7;
const coastlineVariation = 0.15;

for (const cell of cells) {
  const distFromCenter = distance(cell.centroid, mapCenter) / (mapSize / 2);

  // Angle-based noise for coastline variation (no internal holes)
  const angle = Math.atan2(cy - center, cx - center);
  const coastlineNoise = fractalNoise(angle, position) * coastlineVariation;

  const effectiveRadius = baseRadius + coastlineNoise;
  cell.isLand = distFromCenter < effectiveRadius;
}
```

**Key design choice:** Noise only affects the coastline edge, not the interior. This creates a solid landmass with an irregular coast, rather than lagoons with internal water pockets.

### 5. Elevation Assignment (Mapgen4-style)

Uses a **dual hills+mountains system** inspired by mapgen4:

#### Step 5a: Distance from Coast (BFS)
```typescript
const distFromCoast = bfsDistance(cells, oceanCells);
```

#### Step 5b: Select Mountain Peaks
```typescript
// Pick N cells with highest distance from coast, spread apart
const peaks = selectSpreadPeaks(cells, distFromCoast, mountainPeakCount);
```

#### Step 5c: Distance from Peaks (BFS)
```typescript
const distFromPeak = bfsDistance(landCells, peaks);
```

#### Step 5d: Dual Elevation Blend
```typescript
for (const cell of landCells) {
  const coastT = distFromCoast[cell.id] / maxCoastDist;

  // Mountain elevation: B/(A+B) formula from mapgen4
  const A = distFromPeak[cell.id] + 1;
  const B = distFromCoast[cell.id] + 1;
  const mountainBlend = B / (A + B);  // High near peaks, low near coast

  // Apply blend power for flat coastal plains
  const mountainElevation = Math.pow(coastT, blendPower) * mountainBlend * peakElevation;

  // Hill elevation: low-amplitude fractal noise
  const hillElevation = fractalNoise(cell.centroid) * hillNoiseAmplitude * peakElevation;

  // Blend hills and mountains based on distance from coast
  const blendWeight = Math.pow(coastT, blendPower);
  cell.elevation =
    hillElevation * hilliness * (1 - blendWeight) +
    mountainElevation * (1 - hilliness * (1 - blendWeight));
}
```

**Effect of parameters:**
- `elevationBlendPower`: Higher = flatter coastal plains before mountains rise
- `hilliness`: Higher = more rolling terrain near coasts
- `mountainPeakCount`: Number of distinct mountain peaks

### 6. Flow Routing

Each land cell flows to its lowest neighbor:

```typescript
for (const cell of landCells) {
  let lowestNeighbor = null;
  let lowestElevation = cell.elevation;

  for (const neighborId of cell.neighbors) {
    if (cells[neighborId].elevation < lowestElevation) {
      lowestElevation = cells[neighborId].elevation;
      lowestNeighbor = neighborId;
    }
  }
  cell.flowsTo = lowestNeighbor;
}
```

### 7. Flow Accumulation

Accumulate upstream flow (high-to-low elevation order):

```typescript
const sorted = landCells.sort((a, b) => b.elevation - a.elevation);

for (const cell of sorted) {
  if (cell.flowsTo !== null) {
    cells[cell.flowsTo].flowAccumulation += cell.flowAccumulation;
  }
}
```

### 8. River Extraction

Mark high-flow edges as rivers:

```typescript
for (const cell of cells) {
  if (cell.flowAccumulation >= riverThreshold && cell.flowsTo !== null) {
    const edge = findSharedEdge(cell, cells[cell.flowsTo]);
    edge.isRiver = true;
    edge.flowVolume = cell.flowAccumulation;
  }
}
```

### 9. Moisture Propagation

Diffuse moisture from rivers and coast:

```typescript
// Initialize at water sources
for (const cell of cells) {
  if (!cell.isLand || cell.isCoast || hasRiver(cell)) {
    cell.moisture = 1.0;
  }
}

// Diffuse to neighbors
for (let i = 0; i < diffusionIterations; i++) {
  for (const cell of landCells) {
    const avgNeighbor = average(cell.neighbors.map(n => cells[n].moisture));
    cell.moisture = cell.moisture * 0.7 + avgNeighbor * 0.3;
  }
}
```

## Configuration Parameters

### Island Shape

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `landFraction` | number | 0.55 | Island size (0.3=small, 0.8=large) |
| `islandNoiseScale` | number | 0.006 | Coastline noise frequency |
| `islandNoiseOctaves` | number | 4 | Coastline complexity |

### Elevation (Mapgen4-style)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `peakElevation` | number | 300 | Maximum elevation in meters |
| `mountainPeakCount` | number | 5 | Number of mountain peaks |
| `hilliness` | number | 0.3 | Rolling terrain amount (0-1) |
| `elevationBlendPower` | number | 2 | Coastal flatness (higher=flatter) |
| `hillNoiseScale` | number | 0.008 | Hill noise frequency |
| `hillNoiseAmplitude` | number | 0.4 | Hill noise strength |

### Mesh & Rivers

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `voronoiCellCount` | number | 10000 | Number of Voronoi cells |
| `voronoiRelaxation` | number | 2 | Lloyd relaxation passes |
| `riverThreshold` | number | 50 | Min flow accumulation for river |
| `moistureDiffusion` | number | 5 | Moisture diffusion iterations |

## Data Structures

### VoronoiCell

```typescript
interface VoronoiCell {
  id: number;
  centroid: Point;
  vertices: Point[];
  neighbors: number[];
  isLand: boolean;
  isCoast: boolean;
  elevation: number;
  moisture: number;
  flowsTo: number | null;
  flowAccumulation: number;
}
```

### VoronoiTerrainData

```typescript
interface VoronoiTerrainData {
  type: 'voronoi';
  cells: VoronoiCell[];
  edges: VoronoiEdge[];
  rivers: VoronoiEdge[];
  bounds: { width: number; height: number };
}
```

## References

- [Red Blob Games: mapgen4](https://www.redblobgames.com/maps/mapgen4/)
- [Mapgen4 Elevation Blog Post](https://www.redblobgames.com/x/1728-elevation-control/)
- [d3-delaunay library](https://github.com/d3/d3-delaunay)
- [Poisson Disk Sampling (Bridson's algorithm)](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf)
- [Priority-Flood Depression Filling](https://arxiv.org/abs/1511.04463)
