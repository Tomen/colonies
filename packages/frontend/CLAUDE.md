# @colonies/frontend

Interactive 3D terrain viewer with React and Three.js.

## Purpose

Web-based UI for generating and visualizing terrain in real-time. Runs simulation in a Web Worker to keep the UI responsive.

## Dependencies

- `@colonies/shared` - Types and config
- `@colonies/core` - Simulation logic (runs in worker)
- `react` / `react-dom` - UI framework
- `three` - 3D rendering
- `@react-three/fiber` - React renderer for Three.js
- `@react-three/drei` - Three.js helpers
- `zustand` - State management

## Structure

```
src/
├── main.tsx           # Entry point
├── App.tsx            # Root component
├── components/        # React UI components
│   ├── ControlPanel.tsx  # Config sliders
│   ├── StatusBar.tsx
│   └── LayerToggles.tsx
├── store/             # Zustand state
│   ├── simulation.ts     # Worker communication, terrain state
│   └── terrainHeight.ts  # Height data for consistent Y positioning
├── three/             # Three.js components
│   ├── TerrainRenderer.tsx   # Terrain renderer
│   ├── VoronoiTerrainMesh.tsx # Voronoi polygon terrain mesh
│   ├── ParcelMesh.tsx        # Parcel overlay
│   ├── SettlementMarkers.tsx # Settlement markers
│   └── WaterPlane.tsx
└── workers/           # Web Workers
    └── simulation.worker.ts
```

## Architecture

```
React UI ←→ Zustand Store ←→ Web Worker ←→ @colonies/core
                ↓
         Three.js Scene
           (VoronoiTerrainMesh)
```

1. **ControlPanel** - User adjusts config, clicks Generate
2. **Zustand Store** - Sends config to worker, receives terrain
3. **Web Worker** - Runs createWorldGenerator() for Voronoi terrain
4. **TerrainRenderer** - Renders VoronoiTerrainMesh

## Commands

```bash
pnpm dev      # Start Vite dev server (http://localhost:5173)
pnpm build    # Build for production
pnpm preview  # Preview production build
pnpm lint     # Run ESLint
```

## Key Components

### simulation.ts (Zustand Store)
- Manages WorldConfig state
- Communicates with Web Worker
- Stores terrain as `SerializedTerrain`
- Tracks generation progress

### simulation.worker.ts
- Receives config from main thread
- Uses `createWorldGenerator()` to generate Voronoi terrain
- Runs SettlementManager for village placement
- Posts terrain data back to main thread

### TerrainRenderer.tsx
- Reads terrain from Zustand store
- Renders VoronoiTerrainMesh for terrain
- Renders ParcelMesh for land use overlay
- Renders SettlementMarkers for villages

### VoronoiTerrainMesh.tsx
- Creates BufferGeometry from cell polygons (fan triangulation)
- Vertex colors based on cell properties
- River edges rendered as line segments
- Populates terrainHeight store after geometry is built

### terrainHeight.ts (Height Data Store)
Centralized height data for consistent Y positioning across all 3D overlays.

**Constants:**
- `ELEVATION_SCALE = 0.5` - Multiplier for elevation values
- `FLAT_HEIGHT = 1` - Y coordinate in flat mode
- `OCEAN_DEPTH = -5` - Elevation for water cells

**Data:**
- `cellHeights: Map<cellId, number>` - Rendered Y for cell centers
- `vertexHeights: Map<"x,y", number>` - Rendered Y for cell vertices

**Utility Functions:**
- `getCellHeight(cellId, cellHeights, useHeight)` - For settlements, parcel centroids
- `getVertexHeight(x, y, vertexHeights, useHeight)` - For roads, rivers at cell edges
- `buildCellHeights(cells, useHeight)` - Build cell height map
- `buildVertexHeights(cells, useHeight)` - Build vertex height map

**Usage Pattern:**
```typescript
// In a rendering component
const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
const useHeight = useTerrainHeightStore((s) => s.useHeight);

const y = getCellHeight(cellId, cellHeights, useHeight) + OFFSET;
```

## Guidelines

- Heavy computation goes in the Web Worker
- Keep React components lightweight
- Use Zustand for all shared state
- Three.js components use @react-three/fiber conventions
- **All 3D overlays must use terrainHeight store for Y positioning** - never use hardcoded heights
- Test locally with `pnpm dev` before committing
