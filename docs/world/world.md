# World Simulation Design

Vision, layers, entities, and validation criteria for the Colonies simulation.

**This is the main entry point for understanding the world simulation design.**

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENTS & GOVERNANCE                        │
│         Households, Enterprises, Counties, States               │
│                    (decision-making entities)                   │
├─────────────────────────────────────────────────────────────────┤
│                    ECONOMY & RESOURCES                          │
│     Food, Timber, Iron, Textiles, Bricks, Tools                │
│           Production, Trade Routes, Prices                      │
├─────────────────────────────────────────────────────────────────┤
│                  SETTLEMENTS & URBANIZATION                     │
│          Hamlet → Village → Town → City                         │
│         Population, Services, Industries, Streets               │
├─────────────────────────────────────────────────────────────────┤
│                      NETWORK LAYER                              │
│         Trails, Roads, Turnpikes, River Routes                  │
│       A* Pathfinding, Edge Costs, Usage Counters                │
├─────────────────────────────────────────────────────────────────┤
│                    CADASTRAL LAYER                              │
│           Parcels, Ownership, Land Use                          │
│        DCEL/Half-Edge, Metes-and-Bounds                         │
├─────────────────────────────────────────────────────────────────┤
│                     PHYSICAL LAYER                              │
│          Terrain, Hydrology, Soils, Vegetation                  │
│         Grid Raster (1000×1000) or Voronoi (~10K)              │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    Deterministic RNG (seed)
```

### Layer Dependencies

```
Physical → Cadastral → Network → Settlements → Economy → Agents
    │          │          │           │           │
    │          │          │           │           └─ Governance decisions
    │          │          │           └─ Trade routes, prices
    │          │          └─ Road connections, travel costs
    │          └─ Parcel boundaries, ownership
    └─ Terrain constraints, resources
```

## Vision

- Generate an American East-Coast-like map with coastline, rivers and ridges.
- Let time advance as households claim land, clear forests, build roads, and grow into towns and cities.
- Present the process as a classical 2D/2.5D map with a time-lapse of growth.

## Architecture Principles

- Deterministic RNG with seed; data-driven configuration via JSON/TOML.
- Modular design or ECS with job system/workers for long steps.
- Clean separation between simulation (ticks) and rendering.

## Pluggable Algorithm Architecture

Each simulation layer supports multiple algorithm implementations that can be compared and stacked:

| Layer | Current | Planned |
|-------|---------|---------|
| Physical | Grid (raster D8), Voronoi mesh | - |
| Network | Grid A* | Graph A* on Voronoi |
| Cadastral | - | DCEL parcels |

The UI allows selecting algorithms per layer to study their impact on:
- Visual appearance
- Performance characteristics
- Downstream layer compatibility

---

## Physical Layer (World Representation)

**Status:** Complete | **Docs:** [01_physical_layer/](01_physical_layer/README.md)

- **Heightfield:** coastal plain, single inland ridge belt, many west→east rivers; knobs for ridge orientation and river density.
- **Hydrology:** flow direction & accumulation, river graph, lakes/estuaries.
- **Soils & fertility:** derived from elevation, slope, coast and river proximity.
- **Vegetation:** age-structured forest map with regrowth and clearing costs.
- **Climate/seasonality:** optional seasonal multipliers for productivity and travel.
- Data stored as raster grids (height, fertility, forest age, moisture) and vector sets (coastline, rivers, water bodies).

### Physical Layer Algorithms

Two approaches are implemented for terrain generation:

**Grid-Based** - See [terrain-generation.md](01_physical_layer/terrain-generation.md)
- Regular 2D raster array (1000×1000 cells)
- D8 flow routing for hydrology
- GPU-friendly texture mapping
- Trade-off: 1M cells makes A* expensive

**Voronoi Mesh** - See [voronoi-generation.md](01_physical_layer/voronoi-generation.md)
- ~10K irregular polygonal cells
- Delaunay dual graph for flow routing
- Organic visual appearance
- Trade-off: Flow routing more complex

---

## Cadastral Layer (Parcels & Ownership)

**Status:** Pending | **Task:** [todo/03_growth.md](todo/03_growth.md)

- DCEL/half-edge overlay storing parcel polygons.
- Parcel generation anchored on coastlines, river bends or road junctions with metes-and-bounds bearings and area constraints.
- Edges snap to rivers/roads or straight bearings; topology must remain valid.
- Parcels track owner id, tenure, and current land use (forest, field, pasture, manufactory, town lots).

---

## Network Layer (Movement & Infrastructure)

**Status:** Complete | **Docs:** [02_network_layer/](02_network_layer/README.md)

- Nodes: settlements, crossings, ports, intersections, mills.
- Edges: trails/roads/turnpikes and optional river/coastal routes with quality & usage counters.
- Edge cost = surface cost × slope factor × land-cover factor + crossing/toll penalties; seasonal modifiers possible.
- Desire-lines: OD trips use A*; accumulated usage upgrades edges and opens ferries then bridges at good crossings.

---

## Settlements & Urbanization

**Status:** Pending | **Task:** [todo/03_growth.md](todo/03_growth.md)

- Settlement entities hold population, services, industries and port status; ranks progress hamlet → village → town → city.
- Seeds at sheltered harbors or river mouths; secondary seeds at fall line and crossroads.
- Growth driven by attractiveness (market access, harbor quality, flat land, resources, governance). Streets begin organic then adopt grids.

---

## Economy, Land Use & Resources

**Status:** Pending | **Task:** [todo/04_industries.md](todo/04_industries.md)

- Minimal goods: food, timber, lumber, charcoal, iron goods, textiles, bricks, tools; data-driven recipes connect inputs to outputs.
- Agriculture uses parcel fertility/acreage with simple rotation; forests yield timber and regrow over time.
- Industries (mills, shipyards, ironworks, brickworks, woodworking) spawn where required inputs and power are available.
- Each tick routes goods along the network to satisfy demand; prices optional.

---

## Agents & Governance

**Status:** Pending

- Households choose to claim land, migrate, or work based on wages and access.
- Enterprises open industries when ROI thresholds are met.
- Governance approves bridges, sets tolls, maintains roads, and forms counties and states over time.

---

## Time & Simulation Loop

Each tick (monthly or seasonal):
1. Apply seasonal modifiers.
2. Update population via births, deaths, migration.
3. Handle parcel claims, forest clearing and field rotation.
4. Produce goods from farms, forests and industries.
5. Route trade, update edge usage, upgrade infrastructure.
6. Grow settlements and lay out new streets.
7. Apply governance decisions.

---

## Configuration

Editable knobs include terrain shape, harbor scoring weights, parcel size and frontage bias, network costs & upgrade thresholds, crop yields, migration rates, and governance parameters. Changing configs should not require recompiling.

---

## Testing & Validation

- Unit tests for DCEL operations, hydrology mass conservation and pathfinding.
- Golden seeds with KPIs (bridge count, travel times, parcel counts) to detect regressions.
- Emergent pattern checks: ports at harbors, fall-line towns/mills, bridges at narrowings, evolving parcel orientation from water- to road-frontage.

---

## Exploration & Design Decisions

Design discussions and option analyses are archived in [exploration/](exploration/):
- [2025-01-next-steps-options.md](exploration/2025-01-next-steps-options.md) - Post-terrain next steps
- [2025-01-settlement-design-decisions.md](exploration/2025-01-settlement-design-decisions.md) - Settlement architecture
