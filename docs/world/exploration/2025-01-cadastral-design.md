# Cadastral Layer Design

*Explored: January 2025*
*Status: Approved for implementation*

## Context

After reviewing the layer architecture, we identified that the Cadastral layer is needed before Settlements can be implemented. The key question "where can I place a house?" requires a parcel system.

**Problem:** Voronoi terrain cells are ~100m across - too large for individual buildings. We need human-scale parcels within terrain cells.

## Key Decisions

### 1. Representation: Simple Polygons (not DCEL)

**Chosen:** Store parcels as simple polygon vertex lists.

```typescript
interface Parcel {
  id: string;
  vertices: Point[];        // Closed polygon
  centroid: Point;
  area: number;
  terrainCellId: number;
  owner: string | null;
  landUse: LandUse;
}
```

**Rationale:** DCEL (Doubly-Connected Edge List) provides topological guarantees but adds significant complexity. Simple polygons are sufficient for MVP. Can upgrade to DCEL later if we need parcel subdivision/merging operations.

---

### 2. Generation: On-Demand (not upfront)

**Chosen:** Create parcels only when settlements claim terrain cells.

```
Settlement expands → Claims terrain cell → Subdivide cell into parcels
```

**Rationale:**
- Lower memory footprint (only parcels near settlements)
- Ties cadastral directly to simulation activity
- Avoids generating millions of unused parcels

---

### 3. Subdivision: Organic Shapes (not grid overlay)

**Chosen:** Recursive Voronoi subdivision for natural-looking irregular lots.

**Algorithm:**
1. Settlement claims a Voronoi cell
2. Generate N random points inside cell (N = cell area / target parcel size)
3. Compute Voronoi diagram of those points
4. Clip sub-cells to parent cell boundary
5. Each sub-cell becomes a parcel

**Rationale:** Grid overlay produces artificial rectangular lots. Recursive Voronoi follows the organic cell shape and produces irregular lots that look more natural for a historical simulation.

---

### 4. Terrain Integration

| Terrain Type | Cell Size | Parcels per Cell | Strategy |
|--------------|-----------|------------------|----------|
| Grid | ~10m | 1:1 | Cell = parcel (no subdivision needed) |
| Voronoi | ~100m | 10-50 | Recursive Voronoi subdivision |

For Grid terrain, each cell is already lot-sized, so no subdivision is needed.

---

### 5. Frontend Visualization

**Chosen:** Both wireframe and colored modes.

- **Wireframe:** Show parcel boundaries as lines (debugging, understanding structure)
- **Colored:** Fill parcels by land use (wilderness=green, residential=brown, etc.)
- Toggle via UI layer controls (like existing terrain/water toggles)

**Land use colors:**
| Land Use | Color | Hex |
|----------|-------|-----|
| wilderness | Forest green | #228B22 |
| forest | Dark green | #006400 |
| field | Goldenrod | #DAA520 |
| pasture | Light green | #90EE90 |
| residential | Saddle brown | #8B4513 |
| commercial | Royal blue | #4169E1 |
| industrial | Dim gray | #696969 |
| civic | Gold | #FFD700 |

---

## Data Structures

### CadastralData

```typescript
interface CadastralData {
  parcels: Map<string, Parcel>;           // id → Parcel
  parcelsByCell: Map<number, string[]>;   // terrainCellId → parcel IDs
  spatialIndex: ParcelSpatialIndex;       // For point queries
}
```

### Spatial Index

Grid-based spatial index for fast point-in-parcel queries:

```typescript
class ParcelSpatialIndex {
  private cellSize = 50;  // 50m grid cells
  private grid: Map<string, Set<string>>;

  add(parcel: Parcel): void;
  findAt(point: Point): Parcel | null;
  findInRect(bounds: Rect): Parcel[];
}
```

---

## Technical Considerations

### Polygon Clipping

Voronoi subdivision requires clipping sub-polygons to parent cell boundary.

**Options considered:**
1. `polygon-clipping` npm package - full-featured but adds dependency
2. Sutherland-Hodgman algorithm - simple, works for convex clips
3. d3-delaunay's built-in bounds clipping - already a dependency

**Decision:** Start with d3-delaunay's clipping, add library if insufficient.

### Point-in-Polygon

Spatial index needs point-in-polygon test for parcel lookup. Use ray casting algorithm (simple, works for any polygon).

### Random Points in Polygon

For subdivision, need to generate random points inside arbitrary polygons. Use rejection sampling with bounding box.

---

## Implementation Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types.ts` | Parcel, LandUse types |
| `packages/core/src/cadastral.ts` | CadastralManager class |
| `packages/core/src/polygon-utils.ts` | Point-in-polygon, point generation |
| `packages/core/tests/cadastral.test.ts` | Unit tests |
| `packages/frontend/src/three/ParcelMesh.tsx` | Visualization |

---

## Deferred Decisions

1. **Parcel size configuration** - Add to WorldConfig later (targetParcelSize, minParcelArea)
2. **Waterfront detection** - Can detect post-generation based on proximity to water
3. **Road frontage** - Defer until roads exist

---

## Build Order

```
Phase 1: Cadastral (this design) ← CURRENT
Phase 2: Settlements (uses cadastral to claim parcels)
Phase 3: Connect Network (roads between settlements)
Phase 4: Basic Economy (resource production)
```
