# Next Steps After Pluggable World Generation

*Explored: January 2025*
*Decision: Option B selected*

## Context

After implementing pluggable world generation (Grid + Voronoi terrain algorithms), we evaluated what to build next.

## Options Presented

### Option A: Voronoi Terrain Enhancements

Improve the Voronoi generator to match Grid's hydrology quality.

**Tasks:**
- Priority-flood depression filling
- Strahler stream ordering
- Lake/pond detection
- Better moisture diffusion

**Pros:** Makes Voronoi viable for full simulation
**Cons:** Deep algorithmic work, may not be needed yet

---

### Option B: Land Use & Settlements (SELECTED)

Start the civilization simulation layer.

**Tasks:**
- Land-use raster (forest/field/pasture/urban)
- Settlement seeding at harbors/river mouths
- Population growth model
- Basic forest clearing mechanics

**Pros:** Core gameplay loop, visible progress
**Cons:** Need to decide Grid vs Voronoi foundation

---

### Option C: Performance & Polish

Optimize existing systems for larger maps.

**Tasks:**
- Web Worker optimizations
- Level-of-detail rendering
- Memory management
- Loading states

**Pros:** Better user experience
**Cons:** Not user-visible progress

---

### Option D: Network Layer on Voronoi

Port TransportNetwork to work with Voronoi cells.

**Tasks:**
- Graph-based A* on Delaunay edges
- Edge cost calculation from cell properties
- Road rendering as cell boundaries

**Pros:** Enables full simulation on Voronoi
**Cons:** May be premature if Voronoi isn't the final choice

---

### Option E: Frontend Enhancements

Improve visualization and interaction.

**Tasks:**
- Time slider for simulation playback
- Settlement markers
- Road overlay rendering
- Camera improvements

**Pros:** Better demo capability
**Cons:** Need simulation data first

---

### Option F: Documentation & Examples

Consolidate learnings.

**Tasks:**
- Algorithm comparison writeup
- Performance benchmarks
- Usage examples

**Pros:** Helps future development
**Cons:** Doesn't advance simulation

---

## Decision

**Selected: Option B (Land Use & Settlements)**

Rationale from user:
1. Push to get human civilization logic going as first priority
2. Keep both Grid and Voronoi terrain types for now
3. Focus on design and architectural challenges first
