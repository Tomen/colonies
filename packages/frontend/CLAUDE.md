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
│   ├── ControlPanel.tsx  # Config sliders, algorithm dropdown
│   ├── StatusBar.tsx
│   └── LayerToggles.tsx
├── store/             # Zustand state
│   └── simulation.ts  # Worker communication, terrain state
├── three/             # Three.js components
│   ├── TerrainRenderer.tsx   # Conditional renderer (grid/voronoi)
│   ├── GridTerrainMesh.tsx   # Grid-based terrain mesh
│   ├── VoronoiTerrainMesh.tsx # Voronoi polygon terrain mesh
│   └── WaterPlane.tsx
└── workers/           # Web Workers
    └── simulation.worker.ts
```

## Architecture

```
React UI ←→ Zustand Store ←→ Web Worker ←→ @colonies/core
                ↓
         Three.js Scene
           (GridTerrainMesh or VoronoiTerrainMesh)
```

1. **ControlPanel** - User adjusts config, selects algorithm, clicks Generate
2. **Zustand Store** - Sends config to worker, receives terrain (grid or voronoi)
3. **Web Worker** - Runs createWorldGenerator() with selected algorithm
4. **TerrainRenderer** - Dispatches to GridTerrainMesh or VoronoiTerrainMesh based on terrain type

## Commands

```bash
pnpm dev      # Start Vite dev server (http://localhost:5173)
pnpm build    # Build for production
pnpm preview  # Preview production build
pnpm lint     # Run ESLint
```

## Key Components

### simulation.ts (Zustand Store)
- Manages WorldConfig state including `generationAlgorithm`
- Communicates with Web Worker
- Stores terrain as `SerializedTerrain` (grid or voronoi)
- Tracks generation progress

### simulation.worker.ts
- Receives config from main thread
- Uses `createWorldGenerator()` factory for algorithm selection
- Serializes terrain (Float32Array transfer for grid, plain objects for voronoi)
- Posts terrain data back to main thread

### TerrainRenderer.tsx
- Reads terrain from Zustand store
- Dispatches to appropriate mesh based on `terrain.type`:
  - `'grid'` -> GridTerrainMesh
  - `'voronoi'` -> VoronoiTerrainMesh

### GridTerrainMesh.tsx
- Creates PlaneGeometry with vertex displacement
- GLSL shaders for elevation-based coloring
- Flow texture for river visualization

### VoronoiTerrainMesh.tsx
- Creates BufferGeometry from cell polygons (fan triangulation)
- Vertex colors based on cell properties
- River edges rendered as line segments

## Guidelines

- Heavy computation goes in the Web Worker
- Keep React components lightweight
- Use Zustand for all shared state
- Three.js components use @react-three/fiber conventions
- Test locally with `pnpm dev` before committing
