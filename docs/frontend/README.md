# Frontend Documentation

Interactive web viewer for the Colonies terrain generator.

## Overview

The frontend is a React + Three.js application that renders procedurally generated Voronoi terrain in 3D. Simulation runs in a Web Worker to keep the UI responsive.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │    Web Worker    │     │        Main Thread           │  │
│  │                  │     │                              │  │
│  │  WorldGenerator  │◄───►│  Zustand Store               │  │
│  │  CadastralManager│     │       │                      │  │
│  │  SettlementMgr   │     │       ▼                      │  │
│  │                  │────►│  Three.js Scene              │  │
│  │  (serialized)    │     │       │                      │  │
│  └──────────────────┘     │       ▼                      │  │
│                           │  React Components            │  │
│                           └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Three.js Scene (`src/three/`)

| Component | Description |
|-----------|-------------|
| `TerrainRenderer.tsx` | Orchestrates terrain, parcels, and settlement rendering |
| `VoronoiTerrainMesh.tsx` | Voronoi polygon mesh with river carving |
| `ParcelMesh.tsx` | Settlement parcel boundaries |
| `SettlementMarkers.tsx` | Town location indicators |
| `WaterPlane.tsx` | Animated water surface at sea level |

### UI Components (`src/components/`)

| Component | Description |
|-----------|-------------|
| `ControlPanel.tsx` | Generation parameters, river carving, rendering toggles |
| `StatusBar.tsx` | Progress bar and terrain info |

### State Management (`src/store/`)

Zustand store manages:
- Worker instance and communication
- Simulation status and progress
- Terrain data (Voronoi cells and edges)
- UI state (visible layers, river mode)

### Worker (`src/workers/`)

The simulation worker:
1. Receives config from main thread
2. Runs VoronoiWorldGenerator
3. Generates settlements and parcels
4. Serializes terrain to plain objects
5. Posts data to main thread

## Control Panel

### Generation Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| Seed | number | Deterministic RNG seed |
| Map Size | 100-1000 | World dimensions in units |
| Land Fraction | 30-80% | Island size relative to map |
| Peak Elevation | 100-500m | Maximum terrain height |
| Hilliness | 0-100% | Rolling terrain intensity |
| Coastal Flatness | 1-4 | Exponent for elevation blend (higher = flatter coasts) |
| River Density | 20-200 | Flow threshold for river visibility |
| Island Complexity | 1-6 | Noise octaves for coastline detail |
| Villages | 0-10 | Number of settlements to generate |

### River Carving

Controls whether rivers are carved INTO the terrain mesh as 3D grooves.

| Setting | Effect |
|---------|--------|
| **Off** | Flat terrain, rivers shown only via coloring/lines |
| **On** | Vertices depressed along river paths creating physical channels |

When enabled, river channels are carved using logarithmic depth based on flow accumulation:
- Carve depth: `Math.log(flow / threshold + 1) * 8` meters
- Maximum depth capped at 50% of local terrain elevation
- Both cell vertices and centroids are depressed for smooth channels

### Rendering Toggles

#### Layer Visibility

| Toggle | Description |
|--------|-------------|
| **Terrain** | Show/hide terrain mesh |
| **Parcels** | Show/hide settlement parcel boundaries |
| **Towns** | Show/hide settlement markers |

#### River Mode

Controls how rivers are visualized (independent of carving):

| Mode | Description |
|------|-------------|
| **Off** | No river visualization (carved grooves still visible as terrain shape) |
| **Line** | Debug lines connecting cell centroids along flow paths |
| **Full** | River cells colored blue to highlight water areas |

### Carving × Rendering Matrix

| Carving | River Mode | Visual Result |
|---------|------------|---------------|
| Off | Off | Flat terrain with terrain colors |
| Off | Line | Flat terrain + blue flow lines |
| Off | Full | Flat terrain + cells colored by flow |
| On | Off | Carved grooves, terrain colors only |
| On | Line | Carved grooves + blue debug lines |
| On | Full | Carved grooves + blue water fill |

## Terrain Mesh Generation

### Voronoi Cell Rendering

Each Voronoi cell is rendered using fan triangulation from its centroid:

```
     v0 ─────── v1
      \   /\   /
       \ /  \ /
        c────c    (centroid)
       / \  / \
      /   \/   \
     v3 ─────── v2
```

Triangles: (c, v0, v1), (c, v1, v2), (c, v2, v3), (c, v3, v0)

### Vertex Elevation

Vertex elevations are pre-computed to ensure seamless cell boundaries:

1. Build map of each vertex → all touching cell IDs
2. For each vertex, average elevation of all adjacent land cells
3. Ocean vertices default to -5m (below water plane)

### River Carving Algorithm

When `carveRivers` is enabled:

```typescript
for each vertex:
  maxFlow = max flow accumulation of adjacent cells

  if maxFlow >= RIVER_THRESHOLD (50):
    carveDepth = min(
      log(maxFlow / threshold + 1) * 8,  // logarithmic scaling
      elevation * 0.5                     // cap at 50% depth
    )
    elevation -= carveDepth
```

This creates V-shaped channels that:
- Deepen gradually with increasing flow
- Never cut below half the terrain height
- Produce visible grooves even without color highlighting

### Terrain Coloring

Colors are assigned based on cell properties:

| Condition | Color |
|-----------|-------|
| Ocean (`!isLand`) | Dark blue (#1a5276) |
| Coast (`isCoast`) | Medium blue (#2e86ab) |
| River (full mode, flow ≥ 50) | River blue (#3498db) |
| Lowland (0-20% elevation) | Green (#58a05c → #8b7355) |
| Midland (20-60% elevation) | Brown (#8b7355 → #6b5344) |
| Highland (60-100% elevation) | Brown to white (#6b5344 → #ffffff) |

## Worker Protocol

```typescript
// Commands: Main → Worker
{ type: 'GENERATE', config: WorldConfig }

// Events: Worker → Main
{ type: 'INITIALIZED' }
{ type: 'PROGRESS', percent: number, stage: string }
{ type: 'TERRAIN_GENERATED', terrain: SerializedTerrain }
{ type: 'ERROR', message: string }
```

## Terrain Serialization

Voronoi terrain is serialized as plain objects:

```typescript
interface SerializedTerrain {
  type: 'voronoi';
  cells: VoronoiCell[];
  edges: VoronoiEdge[];
  rivers: VoronoiEdge[];
  bounds: { width: number; height: number };
  parcels: Parcel[];
  settlements: Settlement[];
  harborLocation: Point | null;
}
```

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
