# Frontend Documentation

Interactive web viewer for the Colonies terrain generator.

## Overview

The frontend is a React + Three.js application that renders procedurally generated terrain in 3D. Simulation runs in a Web Worker to keep the UI responsive.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │    Web Worker    │     │        Main Thread           │  │
│  │                  │     │                              │  │
│  │  WorldGenerator  │◄───►│  Zustand Store               │  │
│  │  TransportNetwork│     │       │                      │  │
│  │                  │     │       ▼                      │  │
│  │  Float32Array    │────►│  Three.js Scene              │  │
│  │  (transferable)  │     │       │                      │  │
│  └──────────────────┘     │       ▼                      │  │
│                           │  React Components            │  │
│                           └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Three.js Scene (`src/three/`)

| Component | Description |
|-----------|-------------|
| `TerrainMesh.tsx` | Height-displaced plane geometry with custom shader |
| `WaterPlane.tsx` | Animated water surface at sea level |

The terrain mesh uses a custom GLSL shader for efficient coloring:
- Blue gradient for water (depth-based)
- Green to brown gradient for land (elevation-based)
- River overlay using flow accumulation texture

### UI Components (`src/components/`)

| Component | Description |
|-----------|-------------|
| `ControlPanel.tsx` | World generation parameters and generate button |
| `StatusBar.tsx` | Progress bar and terrain info |

### State Management (`src/store/`)

Zustand store manages:
- Worker instance and communication
- Simulation status and progress
- Terrain data (Float32Array buffers)
- UI state (visible layers)

### Worker (`src/workers/`)

The simulation worker:
1. Receives config from main thread
2. Runs WorldGenerator and TransportNetwork
3. Serializes terrain to Float32Array
4. Transfers buffers (zero-copy) to main thread

## Worker Protocol

```typescript
// Commands: Main → Worker
{ type: 'GENERATE', config: WorldConfig }

// Events: Worker → Main
{ type: 'INITIALIZED' }
{ type: 'PROGRESS', percent: number, stage: string }
{ type: 'TERRAIN_GENERATED', terrain: SerializedTerrainData }
{ type: 'ERROR', message: string }
```

## Terrain Serialization

Terrain data is serialized to typed arrays for efficient transfer:

```typescript
interface SerializedTerrainData {
  width: number;
  height: number;
  heightBuffer: Float32Array;   // Elevation values
  flowBuffer: Float32Array;     // Flow accumulation
  moistureBuffer: Float32Array; // Moisture values
}
```

Buffers are transferred (not copied) using `postMessage` with transfer list.

## Configuration

Control panel provides real-time adjustment of:

| Parameter | Range | Description |
|-----------|-------|-------------|
| Seed | number | Deterministic RNG seed |
| Map Size | 100-1000 | Grid resolution |
| Ridge Orientation | 0-90° | Ridge belt angle |
| River Density | 0-1 | Precipitation multiplier |
| Coastal Plain Width | 10-50% | Flat coastal area |
| Ridge Height | 50-500m | Maximum elevation |

## Layer Toggles

Toggle visibility of:
- **Terrain** - Show/hide terrain mesh
- **Rivers** - Show/hide river overlay in shader
- **Settlements** - Show/hide town markers (planned)

## Development

```bash
# Start dev server
pnpm dev

# Build for production
pnpm --filter @colonies/frontend build

# Preview production build
pnpm --filter @colonies/frontend preview
```

## Dependencies

| Package | Purpose |
|---------|---------|
| react | UI framework |
| @react-three/fiber | React renderer for Three.js |
| @react-three/drei | Three.js helpers (OrbitControls, etc.) |
| three | 3D graphics library |
| zustand | State management |
| vite | Dev server and bundler |

## Future Work

- [ ] Interactive editing mode (click to place settlements)
- [ ] Time controls (play/pause, speed slider)
- [ ] Settlement markers as instanced meshes
- [ ] Road/bridge visualization
- [ ] Minimap overlay
- [ ] Export to PNG/GIF from browser
