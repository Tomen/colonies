# Hydrology Improvements: Lakes & River Rendering

Design proposal for two hydrology improvements. Status: **Revised After Review**

## Problem Analysis (Corrected)

### Problem 1: Narrow Edge Pinching

**Root cause**: This is a **rendering/geometry constraint**, not a hydrology issue.

The edge-based bank/floor points are clamped to shared Voronoi edge length (via `min(distToV0, distToV1) * 0.9`). When a high-flow river must "fit through" a short edge, it pinches regardless of how flow is routed.

**Wrong solution**: Edge capacity + flow splitting (conflates hydraulics with geometry)

**Right solution**: Decouple channel width from Voronoi edge length via distance-field carving

### Problem 2: Abrupt River Termination

**Root cause**: This is a **hydrology/topology issue**. Local minima exist with `flowsTo = null`, causing the flow graph to end internally.

**Solution**: Depression handling with Priority-Flood algorithm (standard DEM preprocessing technique).

## Revised Solutions

### Solution 1: Priority-Flood Depression Handling (Hydrology)

Use the Priority-Flood algorithm ([Barnes et al. 2014](https://arxiv.org/abs/1511.04463)) - a standard, well-documented approach for depression filling:

**Algorithm**:
1. Treat ocean-adjacent cells as "open drains" (initial queue seeds)
2. Priority queue ordered by elevation (lowest first)
3. Process each cell, setting `filledElevation = max(elevation, neighbor's filledElevation)`
4. Any cell where `filledElevation > originalElevation + ε` is inside a lake basin
5. Track lake components, spill elevation, and outlet during flood

**Output**:
- `cell.filledElevation: number` - elevation after filling
- `cell.lakeId: number | null` - lake membership
- `lakes[]` with `cellIds`, `waterLevel` (= spill elevation), `outletCell`

**Flow routing**:
- Within a lake, all cells route to the lake's outlet
- Lake surface renders at `waterLevel = spillElevation`

**Control knobs**:
- `minLakeArea`: Only render lakes above this cell count
- `minLakeDepth`: Fill depressions below this depth (treat as noise)

### Solution 2: Distance-Field Carving (Rendering)

Decouple channel width from Voronoi edge geometry by carving based on proximity to river centerline:

**Algorithm**:
1. Build river centerline as segments: `cell.centroid → downstream.centroid`
2. For each terrain vertex, compute distance to nearest river segment
3. Carve vertex height by smooth radial profile:
   ```
   carve(d) = depth * smoothstep(1, 0, d / (width/2))^p
   ```
4. Keep existing log-scaled `width(flow)` and `depth(flow)` formulas

**Implementation**:
- Spatial hash/grid for efficient nearest-segment queries
- Water surface: strip/tube mesh along centerline, or sample "river surface height field"

**Why this works**: Channel width is realized in continuous space, not constrained to a single shared edge segment.

### Flow Splitting: NOT RECOMMENDED

**Do NOT implement flow splitting** to fix pinching. The original proposal conflated hydraulics (edge capacity) with geometry (rendering constraints).

Flow splitting (MFD/D-Infinity) is a legitimate technique for modeling distributaries and braided rivers, but:
- It doesn't solve the pinching problem (which is geometric)
- It significantly increases complexity (accumulation becomes a DAG, not a tree)
- It's not needed for the current goals

If braided rivers are desired in the future, see:
- [WhiteboxTools Hydrological Analysis](https://www.whiteboxgeo.com/manual/wbt_book/available_tools/hydrological_analysis.html)
- [Network-based flow accumulation (AGU)](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2018JF004827)

## Data Structure Changes

### New Types

```typescript
interface Lake {
  id: number;
  cellIds: number[];        // Cells forming the lake
  waterLevel: number;       // Spill elevation
  outletCell: number;       // Cell where overflow exits
  outletTarget: number;     // Downstream cell from outlet
}
```

### Extended Types

```typescript
// VoronoiCell additions
filledElevation?: number;    // After Priority-Flood (≥ elevation)
lakeId?: number | null;      // Lake membership

// VoronoiTerrainData additions
lakes?: Lake[];
```

### Config Parameters

```typescript
fillSpillEnabled?: boolean;  // Default: true
minLakeArea?: number;        // Default: 3 cells
minLakeDepth?: number;       // Default: 1 meter (fill shallower depressions)
```

## Implementation Order

### Phase 1: Hydrology Correctness (Priority-Flood)

1. Implement `priorityFloodFill()` in `voronoi-worldgen.ts`
2. Produce `filledElevation` for all cells
3. Identify lake basins and outlets
4. Route flow out of lakes via outlet
5. **Test**: "Every land cell reaches ocean or explicit lake outlet path"

### Phase 2: Rendering Refactor (Distance-Field Carving)

1. Build river centerline segments from flow graph
2. Implement spatial hash for nearest-segment queries
3. Replace edge-constrained carving with distance-field carving
4. Update water surface to use centerline-based approach

## Files Affected

| File | Changes |
|------|---------|
| `packages/shared/src/types.ts` | Add `Lake`, extend `VoronoiCell` |
| `packages/shared/src/config-schema.ts` | New defaults |
| `packages/core/src/voronoi-worldgen.ts` | Priority-Flood, lake detection |
| `packages/frontend/src/three/VoronoiTerrainMesh.tsx` | Distance-field carving |
| `packages/frontend/src/three/LakeMesh.tsx` | New component |

## Key Insight

> **Treat lakes as hydrology preprocessing (Priority-Flood), and treat pinching as a rendering representation problem (distance-field carving), not as a flow-routing problem.**

## References

- [Priority-Flood Algorithm (arXiv)](https://arxiv.org/abs/1511.04463)
- [Mapgen4 River Representation](https://simblob.blogspot.com/2018/10/mapgen4-river-representation.html)
- [Mapgen4 River Appearance](https://simblob.blogspot.com/2018/09/mapgen4-river-appearance.html)
- [Embedding Rivers in TINs (PDF)](https://dccg.upc.edu/people/rodrigo/pubs/EmbeddingRivers_IJGIS.pdf)
- [WhiteboxTools Hydrological Analysis](https://www.whiteboxgeo.com/manual/wbt_book/available_tools/hydrological_analysis.html)

## Related Documentation

- [Physical Layer](../01_physical_layer/README.md) - Current flow routing
- [River Rendering](../../frontend/river-rendering.md) - Current V-shaped channels
