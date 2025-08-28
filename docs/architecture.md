# Architecture Overview

This file summarizes the software architecture for implementing the Colonies simulation.
See [`design_overview.md`](design_overview.md) for the full specification and
milestones distilled from the original INPUT.

## Layered Structure
- **Physical layer** – terrain, hydrology, soils and vegetation grids.
- **Cadastral layer** – parcel DCEL and ownership/land‑use attributes.
- **Network layer** – movement graph with roads, ferries and bridges.
- **Society layer** – settlements, population, economy and governance.
- **Rendering/export** – classical map renderer and GIF exporter.

## Modules
These modules will grow as steps are implemented:
- `types.ts` – shared type definitions.
- `worldgen.ts` – physical layer generation.
- `transport.ts` – network creation and pathfinding.
- `growth.ts` – land use, parcels, settlements, and economy.
- `render.ts` – map rendering.
- `export_gif.ts` – GIF export utility.

Each implementation step must update this document with new modules,
interfaces, and data flows.

## Step 0 Implementation Details

### Project Structure
```
src/
├── types.ts          - Core interfaces and types
├── worldgen.ts       - WorldGenerator class for terrain generation
├── transport.ts      - TransportNetwork class for pathfinding and infrastructure
├── growth.ts         - GrowthManager class for settlements and land use
├── render.ts         - MapRenderer class for visualization
└── export_gif.ts     - GifExporter class for time-lapse output

tests/
├── worldgen.test.ts  - Tests for world generation
├── transport.test.ts - Tests for transport network
└── growth.test.ts    - Tests for settlement growth
```

### Key Interfaces (types.ts)
- `WorldConfig` - Configuration parameters for world generation
- `TerrainData` - Raster data for height, flow accumulation, and moisture
- `Settlement` - Settlement entities with population, rank, and location
- `NetworkEdge` - Transport network edges with cost and usage tracking
- `Point` - Basic 2D coordinate structure
- `GifFrame` - Frame data for time-lapse export

### Class Architecture
- **WorldGenerator**: Manages terrain generation with seeded RNG and configurable parameters
- **TransportNetwork**: Handles pathfinding, edge management, and usage tracking
- **GrowthManager**: Controls settlement creation, population updates, and parcel generation
- **MapRenderer**: Provides map visualization and file export capabilities
- **GifExporter**: Accumulates frames and exports time-lapse animations

### Development Tools
- TypeScript with strict mode enabled
- ESLint for code quality and consistency
- Prettier for code formatting
- Vitest for unit testing with coverage
- Build system using TypeScript compiler

## Step 1 Implementation Details

### Physical Layer Algorithms

#### Terrain Generation (WorldGenerator)
- **Seeded RNG (SeededRNG)**: Linear congruential generator for deterministic randomness
- **Height Map Generation**: 
  - Coastal plain to ridge belt transition based on distance from coast
  - Simplex noise overlay for natural terrain variation (50m amplitude)
  - Ridge orientation control via cosine function with configurable angle
  - Ocean depth simulation in coastal zones
- **Configuration System (ConfigLoader)**: JSON-based parameter loading with validation and defaults

#### Hydrology Model
- **Flow Direction Calculation**: 8-direction steepest descent algorithm
- **Flow Accumulation**: Topological sort from high to low elevation, accumulating upstream flow
- **River Network Formation**: Flow accumulation above thresholds forms natural river hierarchy
- **Sink Prevention**: Flow direction ensures all water reaches map boundaries

#### Harbor Scoring Algorithm
- **Coastal Detection**: Identifies water cells adjacent to land
- **Harbor Suitability Factors**:
  - Water depth preference (deeper = better)
  - Shelter calculation (count of adjacent land cells)
  - River access bonus (high flow accumulation nearby)
  - Combined weighted scoring system

#### Moisture Calculation
- **Multi-factor Model**:
  - Elevation effect (higher elevation = drier)
  - River proximity (high flow accumulation = wetter)
  - Coastal effect (distance from ocean)
  - Normalized 0-1 scale for ecosystem modeling

### Data Structures
- **TerrainData**: Contains height, flowAccumulation, and moisture grids (number[][])
- **WorldConfig**: Extended with coastal plain width, ridge height, noise scale parameters
- **PngExporter**: Visualization system with color-coded terrain, flow, and moisture maps

### PNG Export System
- **Height Map**: Blue for water, green-brown gradient for land elevation
- **Flow Accumulation**: Logarithmic scale blue intensity for river visualization
- **Moisture Map**: Brown-to-green gradient representing dryness to wetness

### Key Algorithms Implemented
1. **D8 Flow Direction**: Standard 8-direction flow routing
2. **Topological Flow Accumulation**: Mass-conserving upstream area calculation  
3. **Multi-criteria Harbor Selection**: Weighted scoring for optimal port placement
4. **Procedural Ridge Generation**: Configurable orientation and amplitude control
