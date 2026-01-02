# Roadmap

Project progress and implementation milestones.

## Current Status

### Simulation (packages/core, packages/cli)

| Layer | Status | Documentation |
|-------|--------|---------------|
| Physical Layer | Complete | [world/01_physical_layer/](world/01_physical_layer/README.md) |
| Cadastral Layer | Complete | [world/world.md#cadastral-layer](world/world.md) |
| Network Layer | Designed | [world/02_network_layer/](world/02_network_layer/README.md) |
| Settlement Seeding | Complete | [world/world.md#settlements--urbanization](world/world.md) |

**Note:** Network Layer has documentation but `TransportNetwork` class is not yet implemented.

### Frontend (packages/frontend)

| Feature | Status | Description |
|---------|--------|-------------|
| Project Setup | Complete | Vite + React + TypeScript |
| Three.js Scene | Complete | Terrain mesh with shaders |
| Web Worker | Complete | Background simulation |
| Control Panel | Complete | Config sliders, generate button |
| Layer Toggles | Complete | Show/hide terrain, rivers, parcels, settlements |

## Living World Implementation

The next major phase: transform static terrain into a living simulation.

### Todo Files (by Milestone)

| Milestone | Todo File | Status | Description |
|-----------|-----------|--------|-------------|
| M3 | [M3_network.md](world/todo/M3_network.md) | Pending | A* pathfinding, road emergence, river crossings |
| M4 | [M4_simulation.md](world/todo/M4_simulation.md) | Pending | Monthly tick loop, phase ordering, snapshots |
| M5 | [M5_agents.md](world/todo/M5_agents.md) | Pending | Agent model, population dynamics, migration |
| M6 | [M6_economy.md](world/todo/M6_economy.md) | Pending | Production, trade routing, industries |
| M7 | [M7_polish.md](world/todo/M7_polish.md) | Pending | Time-lapse animation, GIF/video export |
| M8 | [M8_frontend.md](world/todo/M8_frontend.md) | Pending | UI time controls, info panels |

### Key Decisions Locked In

| Question | Answer |
|----------|--------|
| Edge representation | Cell-to-cell adjacency |
| Edge initialization | Eager (pre-create all ~30K edges at world gen) |
| Tick granularity | Monthly (12 ticks per year) |
| Phase implementation | Minimal stubs in M4, filled in by M5/M6 |
| Resource model | Storage + spoilage |
| New settlements | Pioneer multi-stage founding |
| Trade model | Merchant guilds with emergent patterns |

### Implementation Dependencies

```
M3_network ────────────────────┐
                               │
M4_simulation ─────────────────┼──► M5_agents ──► M6_economy
                               │
                               ▼
                          M7_polish
                               │
                               ▼
                          M8_frontend
```

## Milestones

High-level feature milestones from the [world design](world/world.md):

| # | Milestone | Status | Dependencies |
|---|-----------|--------|--------------|
| M1 | Physical world | Complete | - |
| M2 | Parcels & claims | Complete | M1 |
| M3 | Movement network | **Implementation Needed** | M1 |
| M4 | Simulation engine | Pending | M3 |
| M5 | Settlements & growth | Pending | M2, M4 |
| M6 | Economy & trade | Pending | M3, M5 |
| M7 | Polish & export | Pending | M6 |
| M8 | Frontend time controls | Pending | M4 |

### Milestone Details

**M1 Physical world** - terrain, hydrology, soils, vegetation
- Voronoi mesh generation
- Flow routing and river formation
- Harbor scoring

**M2 Parcels & claims** - parcel subdivision
- Recursive Voronoi within cells
- Land use assignment
- Ownership tracking

**M3 Movement network** - pathfinding and infrastructure
- A* on Voronoi cell graph
- Edge cost calculation (slope, terrain, road type)
- Usage tracking → road upgrades (trail→road→turnpike)
- River crossing detection (ford→ferry→bridge)

**M4 Simulation engine** - time system
- Monthly tick loop
- Phase ordering (population → production → trade → growth)
- State snapshots for time-lapse
- Deterministic simulation

**M5 Settlements & growth** - population dynamics
- Carrying capacity model
- Birth/death/migration
- Settlement expansion triggers
- Port detection

**M6 Economy & trade** - resources and routing
- Resource production (food, timber, etc.)
- Consumption per capita
- Trade route calculation via A*
- Desire-line emergence

**M7 Polish & export** - visualization
- Time-lapse animation
- Frame capture
- GIF/video export

**M8 Frontend time controls** - UI
- Play/pause/speed controls
- Year display and timeline
- Settlement info panel
- New layer toggles (roads, trade routes)

## Emergent Patterns (Validation)

The Living World simulation should produce these emergent patterns:

| Pattern | Mechanism | Validation |
|---------|-----------|------------|
| Ports at harbors | Harbor scoring + coastal settlement | >80% coastal settlements at high-scoring harbors |
| Fall-line towns | Mills where rivers drop elevation | Towns cluster at elevation transitions |
| Road corridors | Accumulated desire lines | High-traffic routes become turnpikes |
| Bridge placement | Usage at narrow river crossings | Bridges at crossings under max width |

## Definition of Done

Before marking any milestone complete:

1. `pnpm test` passes with coverage for new functionality
2. `pnpm lint` reports no warnings/errors
3. Documentation updated in appropriate `docs/` subfolder
4. `docs/roadmap.md` status updated
