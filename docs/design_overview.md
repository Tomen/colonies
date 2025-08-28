# Simulation Design Overview

This document condenses the requirements from the original `INPUT.md` file so it can be safely removed.
It describes the vision, layers, entities, and validation criteria for the Colonies simulation.

## Vision
- Generate an American East‑Coast–like map with coastline, rivers and ridges.
- Let time advance as households claim land, clear forests, build roads, and grow
  into towns and cities.
- Present the process as a classical 2D/2.5D map with a time‑lapse of growth.

## Architecture
- Deterministic RNG with seed; data‑driven configuration via JSON/TOML.
- Modular design or ECS with job system/workers for long steps.
- Clean separation between simulation (ticks) and rendering.

## Physical Layer (World Representation)
- **Heightfield:** coastal plain, single inland ridge belt, many west→east rivers;
  knobs for ridge orientation and river density.
- **Hydrology:** flow direction & accumulation, river graph, lakes/estuaries.
- **Soils & fertility:** derived from elevation, slope, coast and river proximity.
- **Vegetation:** age‑structured forest map with regrowth and clearing costs.
- **Climate/seasonality:** optional seasonal multipliers for productivity and travel.
- Data stored as raster grids (height, fertility, forest age, moisture) and vector
  sets (coastline, rivers, water bodies).

## Cadastral Layer (Parcels & Ownership)
- DCEL/half‑edge overlay storing parcel polygons.
- Parcel generation anchored on coastlines, river bends or road junctions with
  metes‑and‑bounds bearings and area constraints.
- Edges snap to rivers/roads or straight bearings; topology must remain valid.
- Parcels track owner id, tenure, and current land use (forest, field, pasture,
  manufactory, town lots).

## Network Layer (Movement & Infrastructure)
- Nodes: settlements, crossings, ports, intersections, mills.
- Edges: trails/roads/turnpikes and optional river/coastal routes with quality &
  usage counters.
- Edge cost = surface cost × slope factor × land‑cover factor + crossing/toll
  penalties; seasonal modifiers possible.
- Desire‑lines: OD trips use A*; accumulated usage upgrades edges and opens
  ferries then bridges at good crossings.

## Settlements & Urbanization
- Settlement entities hold population, services, industries and port status; ranks
  progress hamlet → village → town → city.
- Seeds at sheltered harbors or river mouths; secondary seeds at fall line and
  crossroads.
- Growth driven by attractiveness (market access, harbor quality, flat land,
  resources, governance). Streets begin organic then adopt grids.

## Economy, Land Use & Resources
- Minimal goods: food, timber, lumber, charcoal, iron goods, textiles, bricks,
  tools; data‑driven recipes connect inputs to outputs.
- Agriculture uses parcel fertility/acreage with simple rotation; forests yield
  timber and regrow over time.
- Industries (mills, shipyards, ironworks, brickworks, woodworking) spawn where
  required inputs and power are available.
- Each tick routes goods along the network to satisfy demand; prices optional.

## Agents & Governance
- Households choose to claim land, migrate, or work based on wages and access.
- Enterprises open industries when ROI thresholds are met.
- Governance approves bridges, sets tolls, maintains roads, and forms counties and
  states over time.

## Time & Simulation Loop
Each tick (monthly or seasonal):
1. Apply seasonal modifiers.
2. Update population via births, deaths, migration.
3. Handle parcel claims, forest clearing and field rotation.
4. Produce goods from farms, forests and industries.
5. Route trade, update edge usage, upgrade infrastructure.
6. Grow settlements and lay out new streets.
7. Apply governance decisions.

## Configuration
Editable knobs include terrain shape, harbor scoring weights, parcel size and
frontage bias, network costs & upgrade thresholds, crop yields, migration rates,
and governance parameters. Changing configs should not require recompiling.

## Testing & Validation
- Unit tests for DCEL operations, hydrology mass conservation and pathfinding.
- Golden seeds with KPIs (bridge count, travel times, parcel counts) to detect
  regressions.
- Emergent pattern checks: ports at harbors, fall‑line towns/mills, bridges at
  narrowings, evolving parcel orientation from water‑ to road‑frontage.

## Project Structure & Milestones
Suggested folders: `engine/` (core, math, sim, render), `tools/` for editors,
`config/` for knobs, `tests/` for unit and golden cases, `assets/` for symbols.

Milestones:
1. **M1 Physical world** – terrain, hydrology, soils, vegetation.
2. **M2 Parcels & claims** – DCEL overlay and parcel generator.
3. **M3 Movement network** – pathfinding, desire lines, ferries/bridges.
4. **M4 Settlements & streets** – growth and street generation.
5. **M5 Economy & resources** – goods, industries, trade routing.
6. **M6 Governance & states** – counties, bridges, tolls, state formation.
7. **M7 Polish** – classical rendering, labels, export, save/load, performance.

This overview replaces the previous `INPUT.md` and should be kept up to date as
the implementation proceeds.
