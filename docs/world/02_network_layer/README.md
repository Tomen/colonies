# Network Layer

The network layer handles pathfinding and dynamic transport infrastructure over the generated terrain.

## Overview

This layer provides:
- Cost field generation based on terrain slope and water features
- A* pathfinding between origin-destination pairs
- Edge management with usage tracking
- Automatic infrastructure upgrades (trail→road→turnpike)
- River crossing detection and ferry/bridge progression

## Classes

- **TransportNetwork** (`src/transport.ts`): Main network management class
- **PriorityQueue**: Internal min-heap for A* pathfinding

### TransportNetwork API

```typescript
class TransportNetwork {
  constructor(config: WorldConfig, terrain: TerrainData)

  // Pathfinding
  findPath(from: Point, to: Point): PathResult

  // Cost field
  buildCostField(): CostField
  getCostField(): CostField

  // Edge management
  addEdge(edge: NetworkEdge): void
  getEdges(): NetworkEdge[]
  updateUsage(edgeId: string, amount: number): void
  processUpgrades(): void

  // River crossings
  detectRiverCrossings(path: Point[]): RiverCrossing[]

  // Visualization
  getUsageHeatmap(): number[][]
}
```

## Key Algorithms

### Cost Field Generation

For each terrain cell, calculate movement cost:

1. **Slope calculation**: Max height difference to 8 neighbors
2. **Water detection**: Cells with height ≤ 0 marked as water
3. **River detection**: Cells with flowAccumulation ≥ threshold
4. **Cost formula**: `cost = baseCost * (1 + slope * slopeCost) + riverPenalty`

Water cells receive very high cost (default: 100) to discourage crossing.

### A* Pathfinding

Standard A* with optimizations:
- **Priority queue**: Min-heap based on f-score (g + heuristic)
- **Movement**: 8-directional with diagonal cost factor (1.414×)
- **Heuristic**: Euclidean distance to goal
- **River tracking**: Detects crossings during path traversal

### River Crossing Detection

Tracks path entry/exit through river cells:
1. **On entry**: Record start position, begin tracking max flow
2. **During crossing**: Count cells, track maximum flow accumulation
3. **On exit**: Measure width, create RiverCrossing record
4. **Status assignment**: 'ford' if too wide for bridge, else 'ferry'

### Edge Upgrade System

`processUpgrades()` checks all edges against usage thresholds:
- **Trail → Road**: At trailToRoadThreshold (default: 100)
- **Road → Turnpike**: At roadToTurnpikeThreshold (default: 500)
- **Ferry → Bridge**: At ferryToBridgeThreshold (default: 200), only if width ≤ maxBridgeWidth

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| baseSlopeCost | 0.1 | Cost multiplier per unit slope |
| waterCost | 100 | Movement cost for water cells |
| riverCrossingPenalty | 10 | Additional cost for river crossings |
| trailToRoadThreshold | 100 | Usage to upgrade trail→road |
| roadToTurnpikeThreshold | 500 | Usage to upgrade road→turnpike |
| ferryToBridgeThreshold | 200 | Usage to upgrade ferry→bridge |
| minRiverFlowForCrossing | 50 | Flow accumulation to detect as river |
| maxBridgeWidth | 5 | Maximum river width for bridge construction |

## Data Structures

### CostField

```typescript
interface CostField {
  cost: number[][];      // Movement cost per cell
  isWater: boolean[][];  // Water cell flags
  isRiver: boolean[][];  // River cell flags
}
```

### PathResult

```typescript
interface PathResult {
  path: Point[];              // Sequence of cells from start to goal
  totalCost: number;          // Cumulative movement cost
  crossings: RiverCrossing[]; // River crossings along path
  success: boolean;           // Whether path was found
}
```

### RiverCrossing

```typescript
interface RiverCrossing {
  id: string;
  position: Point;
  riverWidth: number;
  status: 'ford' | 'ferry' | 'bridge';
  usage: number;
}
```

### NetworkEdge

```typescript
interface NetworkEdge {
  id: string;
  from: Point;
  to: Point;
  type: 'trail' | 'road' | 'turnpike' | 'river' | 'coastal' | 'ferry' | 'bridge';
  cost: number;
  usage: number;
  crossings: RiverCrossing[];
}
```

## Edge Types

| Type | Base Cost | Description |
|------|-----------|-------------|
| trail | 1.0 | Initial unpaved paths |
| road | 0.5 | Upgraded from trails |
| turnpike | 0.2 | Major routes |
| river | 0.3 | Navigable waterways |
| coastal | 0.3 | Sea routes |
| ferry | penalty | River crossing (temporary) |
| bridge | 0.1× penalty | River crossing (permanent) |

## Visual Outputs

| File | Description |
|------|-------------|
| `04_cost_field.png` | Movement cost: dark blue = water, cyan = rivers, green→red = low→high cost |
| `05_usage_heatmap.png` | Edge usage: dark gray = unused, yellow→red = low→high traffic |
