# Settlement System Design Decisions

*Explored: January 2025*
*Status: Under review*

## Context

After selecting "Land Use & Settlements" as the next focus, we need to make architectural decisions before implementation. The system must support both Grid and Voronoi terrain types.

---

## Decision 1: Simulation Time Model

How does time advance in the simulation?

### Option 1A: Discrete Yearly Ticks (Recommended)
```typescript
function tick(state: SimulationState): SimulationState {
  state.year++;
  updatePopulations(state);
  expandSettlements(state);
  return state;
}
```
**Pros:** Simple mental model, matches historical timescales, easy to debug
**Cons:** Coarse granularity, all events synchronized

### Option 1B: Event-Driven
```typescript
interface SimEvent { time: number; type: string; execute(): void; }
// Priority queue processes events in order
```
**Pros:** Fine-grained control, realistic timing
**Cons:** Complex debugging, harder to visualize

### Option 1C: Continuous with Delta Time
```typescript
function update(state: SimulationState, deltaYears: number): SimulationState
```
**Pros:** Smooth animations, variable speed
**Cons:** Floating-point accumulation issues, harder to reason about

---

## Decision 2: Settlement Data Model

How do we store settlement data?

### Option 2A: Separate Entity List (Recommended)
```typescript
interface SimulationState {
  terrain: TerrainResult;
  settlements: Settlement[];
  year: number;
}

interface Settlement {
  id: string;
  name: string;
  location: Point;
  cellId?: number;        // For Voronoi
  population: number;
  rank: 'hamlet' | 'village' | 'town' | 'city';
  foundedYear: number;
}
```
**Pros:** Clean separation, works for both terrain types, easy queries
**Cons:** Need to sync with terrain data

### Option 2B: Embedded in Terrain Cells
```typescript
// Grid: heightMap[y][x].settlement
// Voronoi: cells[i].settlement
```
**Pros:** Spatial queries automatic, no sync needed
**Cons:** Different structures for Grid vs Voronoi, harder to iterate

---

## Decision 3: Terrain Type Strategy

How do we support both Grid and Voronoi?

### Option 3A: Abstract Interface (Recommended)
```typescript
interface TerrainLocation {
  point: Point;
  getElevation(): number;
  getMoisture(): number;
  getNeighbors(): TerrainLocation[];
  isWater(): boolean;
  isCoast(): boolean;
}

class GridTerrainAdapter implements TerrainLocationProvider { ... }
class VoronoiTerrainAdapter implements TerrainLocationProvider { ... }
```
**Pros:** Clean abstraction, settlement logic is terrain-agnostic
**Cons:** Performance overhead, abstraction complexity

### Option 3B: Grid-First with Voronoi Conversion
Convert Voronoi to grid for simulation, keep Voronoi for display.
**Pros:** One simulation path, simpler logic
**Cons:** Loses Voronoi benefits, conversion overhead

### Option 3C: Separate Implementations
Duplicate settlement logic for each terrain type.
**Pros:** Optimized for each, no abstraction overhead
**Cons:** Code duplication, maintenance burden

---

## Decision 4: Initial Settlement Placement

Where do first settlements appear?

### Option 4A: Best Harbors Only
Use existing `findBestHarbor()` for 1-3 initial settlements.
**Pros:** Historically accurate (colonial ports), uses existing code
**Cons:** Limited to coast

### Option 4B: Harbors + River Mouths + Fall Line
Score multiple site types:
- Harbors (ocean access, shelter)
- River mouths (trade routes)
- Fall line (water power, navigation limit)
**Pros:** More realistic distribution, interior settlements
**Cons:** More complex scoring

### Option 4C: Random with Constraints
Random placement filtered by habitability score.
**Pros:** Variety, unpredictable
**Cons:** Less historically grounded

---

## Decision 5: Population Growth Model

How does population change over time?

### Option 5A: Simple Exponential
```typescript
newPop = population * (1 + growthRate);
```
**Pros:** Simple, predictable
**Cons:** Unrealistic unlimited growth

### Option 5B: Carrying Capacity (Logistic) (Recommended)
```typescript
newPop = population * (1 + rate * (1 - population / carryingCapacity));
```
**Pros:** Natural limits, intuitive
**Cons:** Need to determine capacity per location

### Option 5C: Resource-Based
```typescript
newPop = min(population * growth, foodProduction / consumptionPerCapita);
```
**Pros:** Emergent behavior, realistic constraints
**Cons:** Requires economy system first

---

## Decision 6: Land Use Representation

How do we track what land is used for?

### Option 6A: Per-Cell Property (Recommended)
```typescript
type LandUse = 'wilderness' | 'forest' | 'field' | 'pasture' | 'urban';
// Grid: landUse[y][x]
// Voronoi: cells[i].landUse
```
**Pros:** Simple, clear state
**Cons:** Coarse for Grid (each cell = one use)

### Option 6B: Separate Land Use Layer
Additional raster independent of terrain cells.
**Pros:** Fine-grained control, decoupled
**Cons:** More memory, sync complexity

### Option 6C: Building/Improvement List
```typescript
interface Improvement { type: string; location: Point; radius: number; }
```
**Pros:** Precise placement, flexible
**Cons:** More complex queries, rendering

---

## Decision 7: Pathfinding & Roads

How do settlements connect?

### Option 7A: Reuse TransportNetwork
Existing A* pathfinding for road generation.
**Pros:** Already implemented, proven
**Cons:** Grid-only currently

### Option 7B: Delaunay Edges for Voronoi
Use cell adjacency graph for pathfinding.
**Pros:** Natural for Voronoi
**Cons:** Need separate implementation

### Option 7C: Defer for MVP (Recommended)
Skip road generation initially, add later.
**Pros:** Faster to MVP, reduce scope
**Cons:** Less realistic simulation

---

## Decision 8: Frontend Visualization

How do we show settlements?

### Option 8A: 3D Building Models
Instanced meshes for buildings.
**Pros:** Visually rich
**Cons:** Complex, performance concerns

### Option 8B: Colored Terrain Regions
Tint terrain cells by land use.
**Pros:** Integrates with existing renderer
**Cons:** Less distinct settlements

### Option 8C: 2D Overlay Markers
Sprites/billboards for settlements.
**Pros:** Clear, performant
**Cons:** Less immersive

### Option 8D: Simple Markers for MVP (Recommended)
Colored spheres or simple shapes at settlement locations.
**Pros:** Quick to implement, clear visibility
**Cons:** Not pretty, placeholder feel

---

## Summary of Recommendations

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| 1. Time Model | Yearly ticks | Simple, debuggable |
| 2. Data Model | Separate entity list | Terrain-agnostic |
| 3. Terrain Strategy | Abstract interface | Clean separation |
| 4. Placement | Harbors + river mouths | Historically grounded |
| 5. Growth | Carrying capacity | Natural limits |
| 6. Land Use | Per-cell property | Simple for MVP |
| 7. Roads | Defer for MVP | Reduce scope |
| 8. Visualization | Simple markers | Quick iteration |

---

## Open Questions

1. Should we commit to one terrain type for settlements, or maintain dual support?
2. How does this relate to the cadastral layer in the design doc?
3. What's the relationship between settlements and the network layer?
