import type {
  Point,
  NetworkEdge,
  WorldConfig,
  TerrainData,
  CostField,
  PathResult,
  RiverCrossing,
} from '@colonies/shared';

// Priority queue using min-heap for A* pathfinding
class PriorityQueue<T> {
  private heap: T[] = [];

  constructor(private comparator: (a: T, b: T) => number) {}

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const result = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return result;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.comparator(this.heap[index], this.heap[parentIndex]) >= 0) break;
      [this.heap[index], this.heap[parentIndex]] = [
        this.heap[parentIndex],
        this.heap[index],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.comparator(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }
      if (
        rightChild < this.heap.length &&
        this.comparator(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      index = smallest;
    }
  }
}

interface AStarNode {
  position: Point;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

export class TransportNetwork {
  private config: WorldConfig;
  private terrain: TerrainData;
  private costField: CostField;
  private edges: Map<string, NetworkEdge> = new Map();
  private size: number;

  // Direction offsets for 8-directional movement
  private static readonly DX = [-1, 0, 1, 1, 1, 0, -1, -1];
  private static readonly DY = [-1, -1, -1, 0, 1, 1, 1, 0];

  constructor(config: WorldConfig, terrain: TerrainData) {
    this.config = config;
    this.terrain = terrain;
    this.size = terrain.height.length;
    this.costField = this.buildCostField();
  }

  /**
   * Build the movement cost field from terrain data.
   * Cost is based on slope, water presence, and river crossings.
   */
  public buildCostField(): CostField {
    const cost = this.createEmptyGrid();
    const isWater = this.createEmptyBoolGrid();
    const isRiver = this.createEmptyBoolGrid();

    const baseSlopeCost = this.config.baseSlopeCost ?? 0.1;
    const waterCost = this.config.waterCost ?? 100;
    const riverCrossingPenalty = this.config.riverCrossingPenalty ?? 10;
    const minRiverFlow = this.config.minRiverFlowForCrossing ?? 50;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const height = this.terrain.height[y][x];
        const flow = this.terrain.flowAccumulation[y][x];

        // Determine cell type
        isWater[y][x] = height <= 0;
        isRiver[y][x] = flow >= minRiverFlow && height > 0;

        // Calculate base cost
        let cellCost: number;
        if (isWater[y][x]) {
          // Water cells are very expensive to cross on land
          cellCost = waterCost;
        } else {
          // Land cells: base cost + slope factor
          const slope = this.calculateSlope(x, y);
          cellCost = 1.0 + slope * baseSlopeCost;

          // Add river crossing penalty
          if (isRiver[y][x]) {
            cellCost += riverCrossingPenalty;
          }
        }

        cost[y][x] = cellCost;
      }
    }

    this.costField = { cost, isWater, isRiver };
    return this.costField;
  }

  /**
   * Find path between two points using A* algorithm.
   */
  public findPath(from: Point, to: Point): PathResult {
    // Validate coordinates
    if (
      !this.isValidCoord(from.x, from.y) ||
      !this.isValidCoord(to.x, to.y)
    ) {
      return { path: [], totalCost: Infinity, crossings: [], success: false };
    }

    const openSet = new PriorityQueue<AStarNode>((a, b) => a.f - b.f);
    const closedSet = new Set<string>();
    const gScore = new Map<string, number>();

    const start: AStarNode = {
      position: from,
      g: 0,
      h: this.heuristic(from, to),
      f: this.heuristic(from, to),
      parent: null,
    };

    openSet.push(start);
    gScore.set(this.pointKey(from), 0);

    while (!openSet.isEmpty()) {
      const current = openSet.pop()!;
      const currentKey = this.pointKey(current.position);

      if (
        current.position.x === to.x &&
        current.position.y === to.y
      ) {
        return this.reconstructPath(current);
      }

      if (closedSet.has(currentKey)) continue;
      closedSet.add(currentKey);

      // Check all 8 neighbors
      for (let d = 0; d < 8; d++) {
        const nx = current.position.x + TransportNetwork.DX[d];
        const ny = current.position.y + TransportNetwork.DY[d];

        if (!this.isValidCoord(nx, ny)) continue;

        const neighborKey = this.pointKey({ x: nx, y: ny });
        if (closedSet.has(neighborKey)) continue;

        // Calculate movement cost (diagonal costs more)
        const isDiagonal = d % 2 === 0;
        const distFactor = isDiagonal ? 1.414 : 1.0;
        const moveCost =
          this.costField.cost[ny][nx] * distFactor;

        const tentativeG = current.g + moveCost;

        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          gScore.set(neighborKey, tentativeG);
          const neighbor: Point = { x: nx, y: ny };
          const h = this.heuristic(neighbor, to);

          openSet.push({
            position: neighbor,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current,
          });
        }
      }
    }

    // No path found
    return { path: [], totalCost: Infinity, crossings: [], success: false };
  }

  /**
   * Detect river crossings along a path.
   */
  public detectRiverCrossings(path: Point[]): RiverCrossing[] {
    const crossings: RiverCrossing[] = [];
    let inRiver = false;
    let riverStart: Point | null = null;
    let maxFlow = 0;
    let crossingId = 0;

    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const isRiverCell = this.costField.isRiver[point.y][point.x];
      const flow = this.terrain.flowAccumulation[point.y][point.x];

      if (isRiverCell && !inRiver) {
        // Entering river
        inRiver = true;
        riverStart = point;
        maxFlow = flow;
      } else if (isRiverCell && inRiver) {
        // Still in river
        maxFlow = Math.max(maxFlow, flow);
      } else if (!isRiverCell && inRiver) {
        // Exiting river - create crossing
        const width = this.calculateRiverWidth(riverStart!, point);
        const maxBridgeWidth = this.config.maxBridgeWidth ?? 5;

        crossings.push({
          id: `crossing-${crossingId++}`,
          position: riverStart!,
          riverWidth: width,
          status: width > maxBridgeWidth ? 'ford' : 'ferry',
          usage: 0,
        });

        inRiver = false;
        riverStart = null;
        maxFlow = 0;
      }
    }

    return crossings;
  }

  /**
   * Add an edge to the network.
   */
  public addEdge(edge: NetworkEdge): void {
    this.edges.set(edge.id, edge);
  }

  /**
   * Get all edges in the network.
   */
  public getEdges(): NetworkEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Update usage on an edge.
   */
  public updateUsage(edgeId: string, amount: number): void {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.usage += amount;

      // Also update usage on crossings
      for (const crossing of edge.crossings) {
        crossing.usage += amount;
      }
    }
  }

  /**
   * Process all edges for potential upgrades based on usage.
   */
  public processUpgrades(): void {
    const trailToRoad = this.config.trailToRoadThreshold ?? 100;
    const roadToTurnpike = this.config.roadToTurnpikeThreshold ?? 500;
    const ferryToBridge = this.config.ferryToBridgeThreshold ?? 200;
    const maxBridgeWidth = this.config.maxBridgeWidth ?? 5;

    for (const edge of this.edges.values()) {
      // Upgrade trail -> road -> turnpike
      if (edge.type === 'trail' && edge.usage >= trailToRoad) {
        edge.type = 'road';
        this.recalculateEdgeCost(edge);
      } else if (edge.type === 'road' && edge.usage >= roadToTurnpike) {
        edge.type = 'turnpike';
        this.recalculateEdgeCost(edge);
      }

      // Upgrade ferry -> bridge
      for (const crossing of edge.crossings) {
        if (
          crossing.status === 'ferry' &&
          crossing.usage >= ferryToBridge &&
          crossing.riverWidth <= maxBridgeWidth
        ) {
          crossing.status = 'bridge';
          this.recalculateEdgeCost(edge);
        }
      }
    }
  }

  /**
   * Get the current cost field.
   */
  public getCostField(): CostField {
    return this.costField;
  }

  /**
   * Generate a usage heatmap from edge data.
   */
  public getUsageHeatmap(): number[][] {
    const heatmap = this.createEmptyGrid();

    for (const edge of this.edges.values()) {
      // Simple: add usage to start and end points
      // In a full implementation, would trace along the edge path
      if (this.isValidCoord(edge.from.x, edge.from.y)) {
        heatmap[edge.from.y][edge.from.x] += edge.usage;
      }
      if (this.isValidCoord(edge.to.x, edge.to.y)) {
        heatmap[edge.to.y][edge.to.x] += edge.usage;
      }
    }

    return heatmap;
  }

  // Private helper methods

  private calculateSlope(x: number, y: number): number {
    let maxDiff = 0;
    const height = this.terrain.height[y][x];

    for (let d = 0; d < 8; d++) {
      const nx = x + TransportNetwork.DX[d];
      const ny = y + TransportNetwork.DY[d];

      if (this.isValidCoord(nx, ny)) {
        const diff = Math.abs(height - this.terrain.height[ny][nx]);
        const isDiagonal = d % 2 === 0;
        const dist = isDiagonal ? 1.414 : 1.0;
        maxDiff = Math.max(maxDiff, diff / dist);
      }
    }

    return maxDiff;
  }

  private calculateRiverWidth(start: Point, end: Point): number {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    return Math.max(dx, dy, 1);
  }

  private heuristic(a: Point, b: Point): number {
    // Euclidean distance, scaled by minimum possible cost
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  private reconstructPath(endNode: AStarNode): PathResult {
    const path: Point[] = [];
    let current: AStarNode | null = endNode;

    while (current !== null) {
      path.unshift(current.position);
      current = current.parent;
    }

    const crossings = this.detectRiverCrossings(path);

    return {
      path,
      totalCost: endNode.g,
      crossings,
      success: true,
    };
  }

  private recalculateEdgeCost(edge: NetworkEdge): void {
    // Base cost depends on edge type
    let baseCost: number;
    switch (edge.type) {
      case 'turnpike':
        baseCost = 0.2;
        break;
      case 'road':
        baseCost = 0.5;
        break;
      case 'river':
      case 'coastal':
        baseCost = 0.3;
        break;
      default:
        baseCost = 1.0;
    }

    // Calculate length
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Add crossing costs
    let crossingCost = 0;
    const riverPenalty = this.config.riverCrossingPenalty ?? 10;

    for (const crossing of edge.crossings) {
      switch (crossing.status) {
        case 'ford':
          crossingCost += riverPenalty * 2;
          break;
        case 'ferry':
          crossingCost += riverPenalty;
          break;
        case 'bridge':
          crossingCost += riverPenalty * 0.1;
          break;
      }
    }

    edge.cost = baseCost * length + crossingCost;
  }

  private pointKey(p: Point): string {
    return `${p.x},${p.y}`;
  }

  private isValidCoord(x: number, y: number): boolean {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }

  private createEmptyGrid(): number[][] {
    return Array(this.size)
      .fill(0)
      .map(() => Array(this.size).fill(0));
  }

  private createEmptyBoolGrid(): boolean[][] {
    return Array(this.size)
      .fill(false)
      .map(() => Array(this.size).fill(false));
  }
}
