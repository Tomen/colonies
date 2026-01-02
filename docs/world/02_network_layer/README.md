# Network Layer

The network layer handles pathfinding and dynamic transport infrastructure over the Voronoi terrain.

## Overview

This layer provides:
- Edge-based network on Voronoi cell adjacencies
- Cost calculation based on distance, slope, and altitude
- A* pathfinding between any two land cells
- Usage tracking for road emergence
- Automatic infrastructure upgrades (trail→road→turnpike)
- River crossing detection and ferry/bridge progression

## Implementation

### Core Files

| Package | File | Description |
|---------|------|-------------|
| @colonies/core | `transport.ts` | TransportNetwork class, A* pathfinding |
| @colonies/core | `priority-queue.ts` | Min-heap for A* |
| @colonies/shared | `types.ts` | NetworkEdge, RiverCrossing, PathResult, NetworkConfig |
| @colonies/frontend | `NetworkMesh.tsx` | Cost heatmap and path visualization |
| @colonies/frontend | `CellClickHandler.tsx` | Click-to-path interaction |

### TransportNetwork API

```typescript
class TransportNetwork {
  constructor(terrain: VoronoiTerrainData, config?: Partial<NetworkConfig>)

  // Initialization (called by factory)
  initializeEdges(): void

  // Pathfinding
  findPath(fromCellId: number, toCellId: number): PathResult

  // Edge access
  getEdge(cellA: number, cellB: number): NetworkEdge | undefined
  getEdgesForCell(cellId: number): NetworkEdge[]
  getAllEdges(): NetworkEdge[]

  // Usage tracking
  recordUsage(path: PathResult, amount?: number): void
  processUpgrades(): EdgeUpgrade[]

  // River crossings
  getAllCrossings(): RiverCrossing[]

  // Visualization helpers
  getCostRange(): { min: number; max: number }
  serialize(settlements: Settlement[]): SerializedNetwork
  computeSettlementPaths(settlements: Settlement[]): SettlementPath[]
}

// Factory function
function createTransportNetwork(
  terrain: VoronoiTerrainData,
  config?: Partial<NetworkConfig>
): TransportNetwork
```

## Key Algorithms

### Edge Cost Calculation

For each edge between adjacent Voronoi cells:

```typescript
baseCost = distance × slopeFactor × altitudeFactor

where:
  distance = Euclidean distance between cell centroids
  slopeFactor = 1 + elevationDiff × baseSlopeCost
  altitudeFactor = 1 + avgElevation × altitudeCost
```

The current cost also factors in road type and river crossings:

```typescript
currentCost = baseCost × roadMultiplier + crossingPenalty
```

**Cost factors:**
- **Slope**: Steeper terrain is more expensive to traverse
- **Altitude**: High-altitude travel is expensive even on flat terrain (thin air, harsh conditions)
- **Water**: Water cells have very high cost (effectively impassable)
- **Road type**: Improved roads reduce cost (trail: 1.0×, road: 0.5×, turnpike: 0.2×)
- **River crossings**: Fords/ferries add penalty, bridges reduce it to 10%

### A* Pathfinding

Standard A* on the Voronoi cell graph:
- **Priority queue**: Min-heap based on f-score (g + heuristic)
- **Heuristic**: Euclidean distance to goal cell centroid
- **Neighbors**: All adjacent cells via Voronoi adjacency
- **Edge tracking**: Records edges and crossings used for path result

### River Crossing Detection

When initializing edges, detect river crossings:
1. Find the VoronoiEdge between the two cells
2. Check if `isRiver` and `flowVolume >= minRiverFlow`
3. Calculate river width from flow (log scale)
4. Create RiverCrossing record at edge midpoint

### Edge Upgrade System

`processUpgrades()` checks all edges against usage thresholds:
- **none → trail**: At trailThreshold (default: 50)
- **trail → road**: At roadThreshold (default: 100)
- **road → turnpike**: At turnpikeThreshold (default: 500)
- **ford → ferry**: At trailThreshold (default: 50)
- **ferry → bridge**: At bridgeThreshold (default: 200), only if width ≤ maxBridgeWidth

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| baseSlopeCost | 0.5 | Cost multiplier per meter elevation difference |
| altitudeCost | 0.02 | Cost multiplier per meter average elevation |
| waterCost | 100 | Movement cost multiplier for water cells |
| riverCrossingPenalty | 10 | Additional cost for river crossings |
| trailCostMultiplier | 1.0 | Movement cost on trails |
| roadCostMultiplier | 0.5 | Movement cost on roads |
| turnpikeCostMultiplier | 0.2 | Movement cost on turnpikes |
| trailThreshold | 50 | Usage to create trail from nothing |
| roadThreshold | 100 | Usage to upgrade trail→road |
| turnpikeThreshold | 500 | Usage to upgrade road→turnpike |
| bridgeThreshold | 200 | Usage to upgrade ferry→bridge |
| maxBridgeWidth | 5 | Maximum river width (log scale) for bridge |
| minRiverFlow | 50 | Flow accumulation to count as river |

## Data Structures

### NetworkEdge

```typescript
interface NetworkEdge {
  id: string;
  fromCell: number;           // Voronoi cell ID
  toCell: number;             // Voronoi cell ID
  type: EdgeType;             // 'none' | 'trail' | 'road' | 'turnpike'
  baseCost: number;           // Distance × terrain factors (immutable)
  currentCost: number;        // baseCost × road multiplier (changes with upgrades)
  usage: number;              // Accumulated traffic
  crossings: RiverCrossing[]; // River crossings on this edge
}
```

### RiverCrossing

```typescript
interface RiverCrossing {
  id: string;
  edgeId: string;             // Parent network edge
  position: Point;            // Midpoint of crossing
  voronoiEdgeId: number;      // The VoronoiEdge this crosses
  riverWidth: number;         // Derived from flow (log scale)
  maxFlow: number;            // Flow accumulation at crossing
  status: 'ford' | 'ferry' | 'bridge';
  usage: number;
}
```

### PathResult

```typescript
interface PathResult {
  success: boolean;
  path: number[];             // Sequence of cell IDs
  totalCost: number;
  edges: NetworkEdge[];       // Edges traversed
  crossings: RiverCrossing[]; // River crossings encountered
}
```

## Frontend Visualization

### Network Modes

The frontend provides three network visualization modes:

| Mode | Description |
|------|-------------|
| Off | No network visualization |
| Cost | Heatmap showing edge traversal cost (green=cheap, red=expensive) |
| Paths | Colored lines showing pre-computed paths between settlements |

### Cost Heatmap

The cost visualization uses:
- **Land-only filtering**: Water edges excluded from visualization
- **Percentile-based coloring**: Even color distribution regardless of cost curve
- **Green→Yellow→Red gradient**: Low cost to high cost

### Click-to-Path

When pathfinding is enabled:
1. First click selects start cell (land only)
2. Second click finds path to destination
3. Path displayed as white line
4. Click again to start new path

## Edge Types

| Type | Cost Multiplier | Description |
|------|-----------------|-------------|
| none | 1.0 | Unimproved terrain |
| trail | 1.0 | Initial paths (no cost reduction) |
| road | 0.5 | Upgraded from trails |
| turnpike | 0.2 | Major routes |

## Crossing Types

| Status | Penalty | Description |
|--------|---------|-------------|
| ford | 100% | Wading through shallow water |
| ferry | 100% | Boat crossing (same penalty, planned upgrade) |
| bridge | 10% | Permanent crossing (greatly reduced penalty) |

## Tests

Unit tests in `packages/core/tests/`:
- `priority-queue.test.ts` - Min-heap operations
- `transport.test.ts` - A* pathfinding, edge costs, upgrades

Debug tests for cost analysis:
- `network-cost-debug.test.ts` - Terrain elevation and cost distribution analysis
