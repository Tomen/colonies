# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Colonies simulation project that generates procedural American East-Coast-like maps with historical settlement growth. The simulation models terrain generation, hydrology, transport networks, land use, settlements, and economic development over time, outputting classical 2D maps with time-lapse growth visualization.

## Development Workflow

Follow the sequential implementation steps defined in `docs/master_checklist.md`:

1. **Step 0: Project Setup** - TypeScript/Node.js foundation with testing
2. **Step 1: Core World Generation** - Terrain, hydrology, and harbor placement  
3. **Step 2: Transport Network** - Pathfinding and dynamic infrastructure
4. **Step 3: Land Use and Settlements** - Cadastral layer and urban growth
5. **Step 4: Industry Sites** - Economic modeling and resource flow
6. **Step 5: Rendering and GIF Export** - Visualization and output

## Essential Commands

Based on the project setup requirements in `docs/steps/00_project_setup.md`:

```bash
# Testing (must pass for Definition of Done)
npm test

# Linting (must pass for Definition of Done)  
npm run lint

# Build project
npm run build
```

## Definition of Done

Every implementation step must satisfy ALL criteria in `docs/definition_of_done.md`:
- `npm test` passes with coverage for new functionality
- `npm run lint` reports no warnings or errors
- Architecture docs updated in `docs/architecture.md`
- Step marked complete in `docs/master_checklist.md`
- All acceptance criteria verified
- Code reviewed and approved

## Architecture Overview

The simulation uses a layered architecture:

### Core Modules (per `docs/architecture.md`)
- `types.ts` - Shared type definitions
- `worldgen.ts` - Physical layer generation (terrain, hydrology, soils, vegetation)
- `transport.ts` - Network creation and pathfinding
- `growth.ts` - Land use, parcels, settlements, economy
- `render.ts` - Map rendering
- `export_gif.ts` - GIF export utility

### Data Layers
- **Physical Layer**: Heightfield, hydrology, soils/fertility, vegetation (raster grids)
- **Cadastral Layer**: DCEL overlay with parcel polygons and ownership
- **Network Layer**: Movement graph with roads, ferries, bridges
- **Society Layer**: Settlements, population, economy, governance

## Key Design Principles

- **Deterministic RNG** with seed support
- **Data-driven configuration** via JSON/TOML
- **Modular design** with clean separation between simulation ticks and rendering
- **Sequential step implementation** - each milestone builds on previous work
- **Comprehensive testing** for algorithms like DCEL operations, hydrology, pathfinding

## Agent Guidelines

When working on this repository:
1. Work through steps sequentially as outlined in `docs/steps/`
2. Record progress in `docs/master_checklist.md`
3. Always run `npm test` and `npm run lint` after modifications
4. Update `docs/architecture.md` when functionality changes
5. Use focused commits and cite files/terminal output with line numbers
6. Satisfy the complete Definition of Done before marking steps complete

## Configuration

The system supports runtime configuration without recompilation for:
- Terrain shape parameters
- Harbor scoring weights  
- Parcel size and frontage bias
- Network costs and upgrade thresholds
- Crop yields and migration rates
- Governance parameters