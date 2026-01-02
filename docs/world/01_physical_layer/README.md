# Physical Layer

The physical layer generates the foundational terrain, hydrology, and environmental data for the simulation.

## Documentation

- [voronoi-generation.md](voronoi-generation.md) - Voronoi mesh terrain algorithm
- [rivers.md](rivers.md) - River generation and valley carving
- [distance-fields.md](distance-fields.md) - Distance field computation techniques

## Overview

This layer creates terrain that simulates a natural single-island landmass with:

- **Single island generation**: Solid landmass with irregular coastline (no lagoons)
- **Mapgen4-style elevation**: Dual hills+mountains system for natural terrain
- **Voronoi mesh**: ~10K polygonal cells for efficient pathfinding
- **Flow-based rivers**: Rivers determined by flow accumulation threshold
- **Deterministic output**: Same seed produces identical terrain

## Algorithm

Uses Lloyd-relaxed Voronoi tessellation with d3-delaunay. See [voronoi-generation.md](voronoi-generation.md).

**Key features:**
- **Poisson disk sampling**: Natural point distribution with no grid artifacts
- Single island with irregular coastline (no internal water pockets)
- Mapgen4-style elevation: mountains + hills blended by distance from coast
- Configurable coastal flatness via `elevationBlendPower`

**Strengths:**
- Organic visual appearance (~10K irregular cells)
- Fast A* on small graph
- Natural parcel boundaries

**Trade-offs:**
- Flow routing on irregular mesh is complex
- Depression handling requires special algorithms
- Gradient fields are noisier

## Classes

- **createWorldGenerator** (`packages/core/src/generator-factory.ts`): Factory function
- **VoronoiWorldGenerator** (`packages/core/src/voronoi-worldgen.ts`): Voronoi-based terrain generation
- **SeededRNG** (`packages/core/src/rng.ts`): Deterministic randomness

## Key Algorithms

### Single Island Mask (Voronoi)

Land/water boundary using radius + coastline noise:

1. Compute base radius from `landFraction` parameter
2. Generate angle-based noise for coastline variation
3. Cell is land if: `distFromCenter < baseRadius + coastlineNoise`

**Key design:** Noise only affects the coastline edge, not interior. This prevents lagoons.

### Mapgen4-style Elevation (Voronoi)

Dual hills+mountains system inspired by [mapgen4](https://www.redblobgames.com/maps/mapgen4/):

1. **BFS from ocean**: Compute distance from coast for each cell
2. **Select peaks**: Pick N inland cells with highest coast distance, spread apart
3. **BFS from peaks**: Compute distance from mountains
4. **Mountain elevation**: Use `B/(A+B)` formula (high near peaks, low near coast)
5. **Hill elevation**: Low-amplitude fractal noise
6. **Blend**: Mountains dominate inland, hills dominate near coast

### Flow Routing & Rivers (Voronoi)

1. Each land cell flows to lowest neighbor
2. Sort cells high-to-low, accumulate flow downstream
3. Edges with flow > `riverThreshold` become rivers

## Configuration Parameters

### Island Shape

| Parameter | Default | Description |
|-----------|---------|-------------|
| `landFraction` | 0.55 | Island size (0.3=small, 0.8=large) |
| `islandNoiseScale` | 0.006 | Coastline noise frequency |
| `islandNoiseOctaves` | 4 | Coastline complexity |

### Elevation (Mapgen4-style)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `peakElevation` | 300 | Maximum elevation (meters) |
| `mountainPeakCount` | 5 | Number of mountain peaks |
| `hilliness` | 0.3 | Rolling terrain amount (0-1) |
| `elevationBlendPower` | 2 | Coastal flatness (higher=flatter) |
| `hillNoiseScale` | 0.008 | Hill noise frequency |
| `hillNoiseAmplitude` | 0.4 | Hill noise strength |

### Rivers

| Parameter | Default | Description |
|-----------|---------|-------------|
| `riverThreshold` | 50 | Min flow accumulation for river |
| `moistureDiffusion` | 5 | Moisture diffusion iterations |

### Mesh

| Parameter | Default | Description |
|-----------|---------|-------------|
| `voronoiCellCount` | 10000 | Number of Voronoi cells |
| `voronoiRelaxation` | 2 | Lloyd relaxation passes |

## Data Structures

### VoronoiTerrainData

```typescript
interface VoronoiTerrainData {
  type: 'voronoi';
  cells: VoronoiCell[];
  edges: VoronoiEdge[];
  rivers: VoronoiEdge[];
  bounds: { width: number; height: number };
}

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

## Integration with Other Layers

The physical layer provides foundation data for:

| Layer | Data Used |
|-------|-----------|
| **Cadastral** | Cell boundaries for parcels, elevation for land value |
| **Network** | Terrain slope for road costs, rivers for crossings |
| **Economy** | River flow for mill sites, moisture for agriculture |
| **Settlements** | Harbor scoring (coastal cells with river access) |
