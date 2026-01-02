# River Rendering System

This document describes the V-shaped river channel rendering system implemented in `VoronoiTerrainMesh.tsx`.

## Overview

Rivers are rendered as carved V-shaped channels in the terrain mesh. The system creates realistic river valleys with:
- **Outer terrain** - Original terrain surface
- **Bank slopes** - Sloped transition from terrain to river floor
- **River floor** - Carved bottom of the channel
- **Water surface** - Blue polygon representing the water level

## Key Parameters

```typescript
// Base channel widths (scaled by flow)
const W_O_BASE = 4;    // Base outer width (bank-to-bank)
const W_I_BASE = 2;    // Base inner width (floor)
const WIDTH_SCALE = 2; // Flow scaling factor

// Threshold for river classification
const RIVER_THRESHOLD = 50; // Minimum flowAccumulation to be a river
```

### Flow-Scaled Widths

Channel width increases with flow accumulation using logarithmic scaling:

```typescript
const flowFactor = Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1);
const W_O = W_O_BASE + flowFactor * WIDTH_SCALE;
const W_I = W_I_BASE + flowFactor * WIDTH_SCALE;
```

| Flow Accumulation | W_O (outer) | W_I (inner) |
|-------------------|-------------|-------------|
| 50 (threshold)    | ~5.4        | ~3.4        |
| 100               | ~6.2        | ~4.2        |
| 500               | ~8.8        | ~6.8        |
| 1000              | ~10         | ~8          |

### Carve Depth

River depth also scales with flow:

```typescript
const carveDepth = Math.min(
  Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
  cell.elevation * 0.5  // Never carve more than half the elevation
);
```

## Geometry Structure

### Coordinate Systems

- **Map coordinates**: `(x, y)` - 2D position on the terrain map
- **World coordinates**: `(x, y, z)` - 3D position where:
  - `x = mapX - bounds.width / 2` (centered)
  - `y = elevation * ELEVATION_SCALE` (height)
  - `z = mapY - bounds.height / 2` (centered)

### Key Points

For each river cell, we compute several key points:

```
     v (vertex)
     |\
     | \
     |  \ outer triangle
     |   \
     b----+ bank line (at W_O/2 perpendicular distance from flow)
     |\   |
     | \  | bank slope
     |  \ |
     f---\+ floor line (at W_I/2 perpendicular distance from flow)
      \   |
       \  | floor triangle
        \ |
         c (centroid, at carved depth)
```

- **v** - Cell vertex (original terrain height)
- **b** - Bank point (original terrain height)
- **f** - Floor point (carved depth)
- **c** - Centroid (carved depth)

### Flow-Perpendicular Width Calculation

Bank and floor points are positioned to maintain consistent perpendicular distance from the flow line:

```typescript
// Flow direction (toward downstream cell)
const flowDirX = (downstream.centroid.x - cx) / len;
const flowDirY = (downstream.centroid.y - cy) / len;

// Perpendicular direction (90° rotation)
const flowPerpX = -flowDirY;
const flowPerpY = flowDirX;

// For each spoke from centroid to vertex
const sx = vertex.x - cx;
const sy = vertex.y - cy;

// How much moving along spoke contributes to perpendicular distance
const perpComponent = Math.abs(sx * flowPerpX + sy * flowPerpY);

// Parameter along spoke to reach W_O/2 perpendicular distance
const tBank = Math.min((W_O / 2) / perpComponent, 0.8);
const bankPoint = {
  x: cx + sx * tBank,
  y: cy + sy * tBank
};
```

## Triangle Structure

### Non-River Neighbor Edges

For edges where the neighbor is not a river cell:

```
Outer triangles:     v0 → v1 → b1,  v0 → b1 → b0
Bank slope:          b0 → b1 → f1,  b0 → f1 → f0
Floor:               f0 → f1 → c
```

### Shared River Edges

For edges shared with another river cell, we need to connect spoke-based points (s_b, s_f) with edge-based points (e_b, e_f):

```
        v0                    v1
         \                    /
          \   outer          /
           \                /
          s_b0            s_b1     (spoke-based bank)
             \    bank    /
              \          /
             e_b0------e_b1        (edge-based bank, on shared edge)
               \  bank  /
                \      /
              s_f0    s_f1         (spoke-based floor)
                 \    /
                e_f0--e_f1         (edge-based floor, on shared edge)
                   \/
                   c               (centroid)
```

#### Edge-Based Point Calculation

1. **Find crossing point** - Where the line between centroids crosses the shared edge
2. **Compute edge perpendicular component** - Using the cell's flow direction (not neighbor direction!)
3. **Calculate adjusted width** - To maintain perpendicular distance from flow

```typescript
// Edge direction (normalized)
const edgeDirX = (v1.x - v0.x) / edgeLen;
const edgeDirY = (v1.y - v0.y) / edgeLen;

// Use SAME flow perpendicular as spoke calculation
const edgePerpComponent = Math.abs(edgeDirX * flowPerpX + edgeDirY * flowPerpY);
const effectivePerp = Math.max(edgePerpComponent, 0.3); // Clamp to avoid huge widths

// Half-width along edge to achieve W_O/2 perpendicular distance
const halfWoAdjusted = Math.min(
  (avgW_O / 2) / effectivePerp,
  Math.min(distToV0, distToV1) * 0.9  // Don't exceed edge bounds
);

// Edge-based bank points
const e_b0 = { x: crossX - edgeDirX * halfWoAdjusted, z: crossY - edgeDirY * halfWoAdjusted };
const e_b1 = { x: crossX + edgeDirX * halfWoAdjusted, z: crossY + edgeDirY * halfWoAdjusted };
```

#### Width Averaging for Smooth Transitions

At shared edges, we average the widths of both cells:

```typescript
const neighborFlowFactor = Math.log(neighbor.flowAccumulation / RIVER_THRESHOLD + 1);
const neighborW_O = W_O_BASE + neighborFlowFactor * WIDTH_SCALE;
const avgW_O = (W_O + neighborW_O) / 2;
```

## River Water Surface

The water surface is rendered as a polygon at 20% of the carve depth:

```typescript
const carveDepth = cell.elevation - carvedElevation;
const riverSurfaceY = (cell.elevation - 0.2 * carveDepth) * elevationScale;
```

### Consistent Vertex Heights

To ensure water surface vertices match across cells, heights are pre-computed per-vertex by averaging adjacent river cells' carve depths:

```typescript
function buildVertexRiverHeightMap(cells, vertexElevations) {
  // For each vertex, find average carve depth of adjacent river cells
  const avgCarveDepth = carveDepthSum / riverCount;
  // River surface at 20% below original vertex elevation
  return baseElevation - 0.2 * avgCarveDepth;
}
```

## Debug Mode

Setting `carveRivers` to `'debug'` enables visualization:

### Triangle Colors
- **Green** - Outer triangles (terrain to bank)
- **Red** - Bank slope triangles
- **Blue** - Floor triangles

### Debug Lines
- **Yellow** - Centroid-to-centroid connections between river cells
- **Magenta** - Various debug lines:
  - Vertical lines at edge crossing points
  - v → b → f → e paths showing the geometry structure
  - r → c lines showing river polygon points

### Debug Line: r → c

The "r" point is at 0.8 interpolation from floor to bank, representing where the river polygon edge would be:

```typescript
const rx = fx + 0.8 * (bx - fx);
const ry = fy + 0.8 * (by - fy);
// Draw line from r to centroid at r's height
```

## Height Levels Summary

| Point | Height |
|-------|--------|
| Vertex (v) | Original vertex elevation (averaged from adjacent cells) |
| Bank (b) | Original cell elevation |
| Floor (f) | Carved elevation = `cell.elevation - carveDepth` |
| Centroid (c) | Carved elevation |
| River surface | `cell.elevation - 0.2 * carveDepth` |

For shared edges, heights are averaged between cells:
- `avgBankY = (cell.elevation + neighbor.elevation) / 2`
- `avgFloorY = (cellCarvedY + neighborCarvedY) / 2`

## Files

- `packages/frontend/src/three/VoronoiTerrainMesh.tsx` - Main implementation
- `packages/frontend/src/store/simulation.ts` - `RiverCarvingMode` type definition

## Related Documentation

- [Physical Layer](../world/01_physical_layer/README.md) - Terrain generation and flow accumulation
- [Network Layer](../world/02_network_layer/README.md) - Transport networks
- [Frontend README](README.md) - Frontend architecture overview
