# Milestone 3: Network Layer Implementation

Implement the `TransportNetwork` class as designed in [02_network_layer/README.md](../02_network_layer/README.md).

## Overview

The network layer documentation exists but the actual code does not. This task implements A* pathfinding on the Voronoi cell graph, with edge cost calculation, usage tracking, and automatic infrastructure upgrades.

**Dependencies:** Physical Layer (Complete), Voronoi terrain data

**Blocks:** M4 Simulation Engine, M5 Agents, M6 Economy

## Key Decisions

| Question | Answer |
|----------|--------|
| Edge representation | Cell-to-cell adjacency (not point-to-point) |
| Edge initialization | Eager (pre-create all edges at world gen, ~3MB for ~30K edges) |
| Road types | none → trail → road → turnpike (usage-based progression) |
| River crossings | ford → ferry → bridge (usage-based progression) |
| Cost factors | distance × slope × terrain × road_type + river_penalty |

## Data Structures

All interfaces are defined in [02_network_layer/README.md](../02_network_layer/README.md). Key structures:

```typescript
// packages/shared/src/types.ts - Add these

interface NetworkEdge {
  id: string;
  fromCell: number;           // Voronoi cell ID
  toCell: number;             // Voronoi cell ID
  type: EdgeType;
  baseCost: number;           // Distance × terrain factors
  usage: number;              // Accumulated traffic
  crossings: RiverCrossing[]; // River crossings on this edge
}

type EdgeType = 'none' | 'trail' | 'road' | 'turnpike' | 'river' | 'coastal' | 'ferry' | 'bridge';

interface RiverCrossing {
  id: string;
  position: Point;
  edgeId: string;             // The VoronoiEdge this crosses
  riverWidth: number;         // Derived from flow accumulation
  maxFlow: number;            // Maximum flow along crossing
  status: 'ford' | 'ferry' | 'bridge';
  usage: number;
}

interface PathResult {
  success: boolean;
  path: number[];             // Sequence of cell IDs
  totalCost: number;
  crossings: RiverCrossing[];
  edges: NetworkEdge[];       // Edges traversed
}

interface NetworkConfig {
  // Cost factors
  baseSlopeCost: number;          // 0.1 - cost per unit elevation difference
  waterCost: number;              // 100 - discourage water crossing
  riverCrossingPenalty: number;   // 10 - additional cost at rivers

  // Road type multipliers
  trailCostMultiplier: number;    // 1.0
  roadCostMultiplier: number;     // 0.5
  turnpikeCostMultiplier: number; // 0.2

  // Upgrade thresholds
  trailThreshold: number;         // 50 - usage to create trail
  roadThreshold: number;          // 100 - usage to upgrade trail→road
  turnpikeThreshold: number;      // 500 - usage for road→turnpike
  bridgeThreshold: number;        // 200 - usage to build bridge

  // Constraints
  maxBridgeWidth: number;         // 5 - max river cells for bridge
  minRiverFlow: number;           // 50 - flow accumulation to count as river
}
```

## Algorithms

### Edge Cost Calculation

For each edge between adjacent Voronoi cells:

```typescript
function calculateEdgeCost(
  fromCell: VoronoiCell,
  toCell: VoronoiCell,
  edge: NetworkEdge,
  config: NetworkConfig
): number {
  // Base distance (Euclidean between centroids)
  const dx = toCell.centroid.x - fromCell.centroid.x;
  const dy = toCell.centroid.y - fromCell.centroid.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Slope factor (penalize elevation changes)
  const elevationDiff = Math.abs(toCell.elevation - fromCell.elevation);
  const slopeFactor = 1 + elevationDiff * config.baseSlopeCost;

  // Water penalty
  if (!toCell.isLand) {
    return distance * config.waterCost;
  }

  // Road type multiplier
  const roadMultiplier = {
    none: 1.0,
    trail: config.trailCostMultiplier,
    road: config.roadCostMultiplier,
    turnpike: config.turnpikeCostMultiplier,
  }[edge.type] ?? 1.0;

  // River crossing penalty
  let riverPenalty = 0;
  if (edge.crossings.length > 0) {
    for (const crossing of edge.crossings) {
      riverPenalty += crossing.status === 'bridge'
        ? config.riverCrossingPenalty * 0.1  // Bridge reduces penalty
        : config.riverCrossingPenalty;
    }
  }

  return distance * slopeFactor * roadMultiplier + riverPenalty;
}
```

### A* Pathfinding on Voronoi Graph

```typescript
function findPath(
  fromCellId: number,
  toCellId: number,
  terrain: VoronoiTerrainData,
  network: TransportNetwork
): PathResult {
  const openSet = new PriorityQueue<number>(); // Min-heap by fScore
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  // Initialize
  gScore.set(fromCellId, 0);
  fScore.set(fromCellId, heuristic(fromCellId, toCellId, terrain));
  openSet.push(fromCellId, fScore.get(fromCellId)!);

  while (!openSet.isEmpty()) {
    const current = openSet.pop()!;

    if (current === toCellId) {
      return reconstructPath(cameFrom, current, terrain, network);
    }

    const currentCell = terrain.cells[current];

    for (const neighborId of currentCell.neighbors) {
      const neighborCell = terrain.cells[neighborId];
      if (!neighborCell) continue;

      // Get or create edge
      const edge = network.getOrCreateEdge(current, neighborId);
      const moveCost = calculateEdgeCost(currentCell, neighborCell, edge, network.config);

      const tentativeG = gScore.get(current)! + moveCost;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + heuristic(neighborId, toCellId, terrain));

        if (!openSet.contains(neighborId)) {
          openSet.push(neighborId, fScore.get(neighborId)!);
        } else {
          openSet.decreaseKey(neighborId, fScore.get(neighborId)!);
        }
      }
    }
  }

  return { success: false, path: [], totalCost: Infinity, crossings: [], edges: [] };
}

function heuristic(fromId: number, toId: number, terrain: VoronoiTerrainData): number {
  const from = terrain.cells[fromId].centroid;
  const to = terrain.cells[toId].centroid;
  return Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
}
```

### River Crossing Detection

When an edge crosses a river (VoronoiEdge with `isRiver: true`):

```typescript
function detectRiverCrossings(
  fromCell: number,
  toCell: number,
  terrain: VoronoiTerrainData,
  config: NetworkConfig
): RiverCrossing[] {
  const crossings: RiverCrossing[] = [];

  // Find the VoronoiEdge between these cells
  const voronoiEdge = terrain.edges.find(e =>
    (e.cells[0] === fromCell && e.cells[1] === toCell) ||
    (e.cells[1] === fromCell && e.cells[0] === toCell)
  );

  if (voronoiEdge?.isRiver && voronoiEdge.flowVolume >= config.minRiverFlow) {
    // Calculate river width from flow
    const width = Math.log2(voronoiEdge.flowVolume / config.minRiverFlow + 1);

    // Midpoint of edge
    const position = {
      x: (voronoiEdge.vertices[0].x + voronoiEdge.vertices[1].x) / 2,
      y: (voronoiEdge.vertices[0].y + voronoiEdge.vertices[1].y) / 2,
    };

    crossings.push({
      id: `crossing-${voronoiEdge.id}`,
      position,
      edgeId: voronoiEdge.id.toString(),
      riverWidth: width,
      maxFlow: voronoiEdge.flowVolume,
      status: 'ford',  // Initial status, upgrades via usage
      usage: 0,
    });
  }

  return crossings;
}
```

### Usage Tracking and Upgrades

```typescript
function recordUsage(path: PathResult, amount: number, network: TransportNetwork): void {
  for (const edge of path.edges) {
    edge.usage += amount;
  }

  for (const crossing of path.crossings) {
    crossing.usage += amount;
  }
}

function processUpgrades(network: TransportNetwork): EdgeUpgrade[] {
  const upgrades: EdgeUpgrade[] = [];
  const config = network.config;

  for (const edge of network.edges.values()) {
    const oldType = edge.type;

    // Check upgrade thresholds
    if (edge.type === 'none' && edge.usage >= config.trailThreshold) {
      edge.type = 'trail';
    } else if (edge.type === 'trail' && edge.usage >= config.roadThreshold) {
      edge.type = 'road';
    } else if (edge.type === 'road' && edge.usage >= config.turnpikeThreshold) {
      edge.type = 'turnpike';
    }

    if (edge.type !== oldType) {
      upgrades.push({ edge, from: oldType, to: edge.type });
    }

    // Check river crossing upgrades
    for (const crossing of edge.crossings) {
      const oldStatus = crossing.status;

      if (crossing.status === 'ford' && crossing.usage >= config.trailThreshold) {
        crossing.status = 'ferry';
      } else if (crossing.status === 'ferry' && crossing.usage >= config.bridgeThreshold) {
        if (crossing.riverWidth <= config.maxBridgeWidth) {
          crossing.status = 'bridge';
        }
      }

      if (crossing.status !== oldStatus) {
        upgrades.push({ crossing, from: oldStatus, to: crossing.status });
      }
    }
  }

  return upgrades;
}
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| baseSlopeCost | 0.1 | 0-1 | Cost multiplier per meter elevation difference |
| waterCost | 100 | 10-1000 | Cost multiplier for water cells (effectively impassable) |
| riverCrossingPenalty | 10 | 1-50 | Additional cost per river crossing |
| trailCostMultiplier | 1.0 | 0.5-2.0 | Movement cost on trails |
| roadCostMultiplier | 0.5 | 0.2-1.0 | Movement cost on roads |
| turnpikeCostMultiplier | 0.2 | 0.1-0.5 | Movement cost on turnpikes |
| trailThreshold | 50 | 10-200 | Usage to create trail from nothing |
| roadThreshold | 100 | 50-500 | Usage to upgrade trail→road |
| turnpikeThreshold | 500 | 200-2000 | Usage to upgrade road→turnpike |
| bridgeThreshold | 200 | 50-1000 | Usage to upgrade ferry→bridge |
| maxBridgeWidth | 5 | 1-20 | Maximum river width (log scale) for bridge |
| minRiverFlow | 50 | 10-200 | Flow accumulation to count as river |

## Tasks

### Core Implementation

- [ ] Add `NetworkEdge`, `RiverCrossing`, `PathResult`, `NetworkConfig` to `packages/shared/src/types.ts`
- [ ] Create `packages/core/src/transport.ts` with `TransportNetwork` class
- [ ] Implement `PriorityQueue` class (min-heap for A*)
- [ ] Implement `findPath()` A* algorithm
- [ ] Implement `calculateEdgeCost()` with all factors
- [ ] Implement `detectRiverCrossings()`
- [ ] Implement `recordUsage()` and `processUpgrades()`

### Integration

- [ ] Add `TransportNetwork` to world generation pipeline
- [ ] Initialize network from terrain on world creation
- [ ] Export network state in `SerializedTerrain`

### Visualization

- [ ] Create `RoadsMesh.tsx` component for rendering roads
- [ ] Color roads by type (trail=brown, road=gray, turnpike=yellow)
- [ ] Render bridge/ferry markers at crossings
- [ ] Add "roads" layer toggle to ControlPanel

## Testing & Acceptance

### Unit Tests

- [ ] `PriorityQueue`: push, pop, decreaseKey operations correct
- [ ] `findPath`: Returns shortest path on simple graph
- [ ] `findPath`: Returns failure for unreachable destination
- [ ] `calculateEdgeCost`: Slope increases cost correctly
- [ ] `calculateEdgeCost`: Water cells have high cost
- [ ] `detectRiverCrossings`: Identifies crossings on river edges
- [ ] `processUpgrades`: Triggers at correct thresholds

### Integration Tests

- [ ] Path from settlement A to settlement B uses existing roads when available
- [ ] Heavy traffic creates trails, then roads, then turnpikes
- [ ] River crossings upgrade from ford to ferry to bridge
- [ ] Bridges only form at rivers under max width

### Visual Validation

- [ ] Roads visible in frontend with correct coloring
- [ ] Bridges appear at river crossings
- [ ] Road network connects settlements after traffic accumulation

## Open Questions

- **[DECIDED]** Should edges be lazily created or eagerly? → **Eager** - Pre-create all edges at world gen (~3MB for ~30K edges). Simpler code, consistent memory footprint.
- **[OPEN]** How to handle seasonal effects (winter increases all costs)?
- **[OPEN]** Should there be a "road maintenance" cost that degrades unused roads?
