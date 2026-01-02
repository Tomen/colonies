import type {
  VoronoiTerrainData,
  VoronoiCell,
  NetworkEdge,
  NetworkConfig,
  RiverCrossing,
  PathResult,
  EdgeType,
  Settlement,
  SettlementPath,
  SerializedNetwork,
} from '@colonies/shared';
import { PriorityQueue } from './priority-queue';

/**
 * Default network configuration values.
 */
export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  // Cost factors
  baseSlopeCost: 0.5,
  altitudeCost: 0.02,
  waterCost: 100,
  riverCrossingPenalty: 10,

  // Road type cost multipliers
  trailCostMultiplier: 1.0,
  roadCostMultiplier: 0.5,
  turnpikeCostMultiplier: 0.2,

  // Upgrade thresholds
  trailThreshold: 50,
  roadThreshold: 100,
  turnpikeThreshold: 500,
  bridgeThreshold: 200,

  // Constraints
  maxBridgeWidth: 5,
  minRiverFlow: 50,
};

/**
 * Manages the transport network on a Voronoi terrain.
 * Provides A* pathfinding and tracks road/crossing upgrades.
 */
export class TransportNetwork {
  private terrain: VoronoiTerrainData;
  private config: NetworkConfig;

  /** Map from edge ID to NetworkEdge */
  private edges: Map<string, NetworkEdge> = new Map();

  /** Map from cell ID to adjacent edge IDs */
  private cellEdges: Map<number, string[]> = new Map();

  /** All river crossings */
  private crossings: Map<string, RiverCrossing> = new Map();

  constructor(terrain: VoronoiTerrainData, config: Partial<NetworkConfig> = {}) {
    this.terrain = terrain;
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
  }

  /**
   * Initialize all edges from terrain adjacencies.
   * Called once at world generation.
   */
  initializeEdges(): void {
    // Create edges for all cell adjacencies
    const processedPairs = new Set<string>();

    for (const cell of this.terrain.cells) {
      if (!this.cellEdges.has(cell.id)) {
        this.cellEdges.set(cell.id, []);
      }

      for (const neighborId of cell.neighbors) {
        // Create canonical pair ID to avoid duplicates
        const pairId =
          cell.id < neighborId
            ? `${cell.id}-${neighborId}`
            : `${neighborId}-${cell.id}`;

        if (processedPairs.has(pairId)) {
          continue;
        }
        processedPairs.add(pairId);

        const neighbor = this.terrain.cells[neighborId];
        if (!neighbor) continue;

        // Create edge
        const edge = this.createEdge(cell, neighbor);
        this.edges.set(edge.id, edge);

        // Link to both cells
        this.cellEdges.get(cell.id)!.push(edge.id);
        if (!this.cellEdges.has(neighborId)) {
          this.cellEdges.set(neighborId, []);
        }
        this.cellEdges.get(neighborId)!.push(edge.id);
      }
    }
  }

  /**
   * Create a network edge between two adjacent cells.
   */
  private createEdge(fromCell: VoronoiCell, toCell: VoronoiCell): NetworkEdge {
    const edgeId = `edge-${fromCell.id}-${toCell.id}`;
    const baseCost = this.calculateBaseCost(fromCell, toCell);

    // Detect river crossings on this edge
    const crossings = this.detectRiverCrossings(edgeId, fromCell.id, toCell.id);

    const edge: NetworkEdge = {
      id: edgeId,
      fromCell: fromCell.id,
      toCell: toCell.id,
      type: 'none',
      baseCost,
      currentCost: baseCost,
      usage: 0,
      crossings,
    };

    // Recalculate current cost with crossings
    edge.currentCost = this.calculateCurrentCost(edge);

    return edge;
  }

  /**
   * Calculate base movement cost between two cells.
   * This is the immutable cost based on terrain.
   */
  private calculateBaseCost(fromCell: VoronoiCell, toCell: VoronoiCell): number {
    // Euclidean distance between centroids
    const dx = toCell.centroid.x - fromCell.centroid.x;
    const dy = toCell.centroid.y - fromCell.centroid.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Water is effectively impassable
    if (!toCell.isLand) {
      return distance * this.config.waterCost;
    }

    // Slope penalty (steeper = more expensive)
    const elevationDiff = Math.abs(toCell.elevation - fromCell.elevation);
    const slopeFactor = 1 + elevationDiff * this.config.baseSlopeCost;

    // Altitude penalty (higher = more expensive, even if flat)
    const avgElevation = (fromCell.elevation + toCell.elevation) / 2;
    const altitudeFactor = 1 + avgElevation * this.config.altitudeCost;

    return distance * slopeFactor * altitudeFactor;
  }

  /**
   * Calculate current movement cost including road type and crossings.
   */
  private calculateCurrentCost(edge: NetworkEdge): number {
    // Road type multiplier
    const roadMultiplier = this.getRoadMultiplier(edge.type);

    // River crossing penalty
    let crossingPenalty = 0;
    for (const crossing of edge.crossings) {
      if (crossing.status === 'bridge') {
        crossingPenalty += this.config.riverCrossingPenalty * 0.1;
      } else {
        crossingPenalty += this.config.riverCrossingPenalty;
      }
    }

    return edge.baseCost * roadMultiplier + crossingPenalty;
  }

  /**
   * Get cost multiplier for road type.
   */
  private getRoadMultiplier(type: EdgeType): number {
    switch (type) {
      case 'trail':
        return this.config.trailCostMultiplier;
      case 'road':
        return this.config.roadCostMultiplier;
      case 'turnpike':
        return this.config.turnpikeCostMultiplier;
      default:
        return 1.0;
    }
  }

  /**
   * Detect river crossings for an edge.
   */
  private detectRiverCrossings(
    edgeId: string,
    fromCellId: number,
    toCellId: number
  ): RiverCrossing[] {
    const crossings: RiverCrossing[] = [];

    // Find the VoronoiEdge between these cells
    const voronoiEdge = this.terrain.edges.find(
      (e) =>
        (e.cells[0] === fromCellId && e.cells[1] === toCellId) ||
        (e.cells[1] === fromCellId && e.cells[0] === toCellId)
    );

    if (
      voronoiEdge?.isRiver &&
      voronoiEdge.flowVolume >= this.config.minRiverFlow
    ) {
      // Calculate river width from flow (log scale)
      const riverWidth = Math.log2(
        voronoiEdge.flowVolume / this.config.minRiverFlow + 1
      );

      // Midpoint of the Voronoi edge
      const position = {
        x: (voronoiEdge.vertices[0].x + voronoiEdge.vertices[1].x) / 2,
        y: (voronoiEdge.vertices[0].y + voronoiEdge.vertices[1].y) / 2,
      };

      const crossing: RiverCrossing = {
        id: `crossing-${voronoiEdge.id}`,
        edgeId,
        position,
        voronoiEdgeId: voronoiEdge.id,
        riverWidth,
        maxFlow: voronoiEdge.flowVolume,
        status: 'ford',
        usage: 0,
      };

      crossings.push(crossing);
      this.crossings.set(crossing.id, crossing);
    }

    return crossings;
  }

  /**
   * A* pathfinding between two cells.
   */
  findPath(fromCellId: number, toCellId: number): PathResult {
    if (fromCellId === toCellId) {
      return {
        success: true,
        path: [fromCellId],
        totalCost: 0,
        edges: [],
        crossings: [],
      };
    }

    const openSet = new PriorityQueue<number>();
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const edgeUsed = new Map<number, NetworkEdge>();

    // Initialize
    gScore.set(fromCellId, 0);
    fScore.set(fromCellId, this.heuristic(fromCellId, toCellId));
    openSet.push(fromCellId, fScore.get(fromCellId)!);

    while (!openSet.isEmpty()) {
      const current = openSet.pop()!;

      if (current === toCellId) {
        return this.reconstructPath(cameFrom, edgeUsed, current);
      }

      const currentCell = this.terrain.cells[current];
      if (!currentCell) continue;

      for (const neighborId of currentCell.neighbors) {
        const neighbor = this.terrain.cells[neighborId];
        if (!neighbor) continue;

        // Get edge between cells
        const edge = this.getEdge(current, neighborId);
        if (!edge) continue;

        // Skip if destination is water (impassable)
        if (!neighbor.isLand) continue;

        const moveCost = edge.currentCost;
        const tentativeG = gScore.get(current)! + moveCost;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          edgeUsed.set(neighborId, edge);
          gScore.set(neighborId, tentativeG);
          fScore.set(
            neighborId,
            tentativeG + this.heuristic(neighborId, toCellId)
          );

          if (!openSet.contains(neighborId)) {
            openSet.push(neighborId, fScore.get(neighborId)!);
          } else {
            openSet.decreaseKey(neighborId, fScore.get(neighborId)!);
          }
        }
      }
    }

    // No path found
    return {
      success: false,
      path: [],
      totalCost: Infinity,
      edges: [],
      crossings: [],
    };
  }

  /**
   * Heuristic for A* (Euclidean distance).
   */
  private heuristic(fromCellId: number, toCellId: number): number {
    const from = this.terrain.cells[fromCellId]?.centroid;
    const to = this.terrain.cells[toCellId]?.centroid;
    if (!from || !to) return Infinity;

    return Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
  }

  /**
   * Reconstruct path from A* result.
   */
  private reconstructPath(
    cameFrom: Map<number, number>,
    edgeUsed: Map<number, NetworkEdge>,
    current: number
  ): PathResult {
    const path: number[] = [current];
    const edges: NetworkEdge[] = [];
    const crossingsSet = new Set<RiverCrossing>();
    let totalCost = 0;

    while (cameFrom.has(current)) {
      const prev = cameFrom.get(current)!;
      const edge = edgeUsed.get(current);

      if (edge) {
        edges.push(edge);
        totalCost += edge.currentCost;
        for (const crossing of edge.crossings) {
          crossingsSet.add(crossing);
        }
      }

      path.unshift(prev);
      current = prev;
    }

    return {
      success: true,
      path,
      totalCost,
      edges,
      crossings: Array.from(crossingsSet),
    };
  }

  /**
   * Get edge between two cells.
   */
  getEdge(cellA: number, cellB: number): NetworkEdge | undefined {
    // Try both orderings
    const id1 = `edge-${cellA}-${cellB}`;
    const id2 = `edge-${cellB}-${cellA}`;
    return this.edges.get(id1) ?? this.edges.get(id2);
  }

  /**
   * Get all edges connected to a cell.
   */
  getEdgesForCell(cellId: number): NetworkEdge[] {
    const edgeIds = this.cellEdges.get(cellId) ?? [];
    return edgeIds
      .map((id) => this.edges.get(id))
      .filter((e): e is NetworkEdge => e !== undefined);
  }

  /**
   * Record usage on a path (for road upgrades).
   */
  recordUsage(path: PathResult, amount: number = 1): void {
    for (const edge of path.edges) {
      edge.usage += amount;
    }
    for (const crossing of path.crossings) {
      crossing.usage += amount;
    }
  }

  /**
   * Process upgrades based on accumulated usage.
   * Returns list of upgrades that occurred.
   */
  processUpgrades(): Array<{
    type: 'road' | 'crossing';
    id: string;
    from: string;
    to: string;
  }> {
    const upgrades: Array<{
      type: 'road' | 'crossing';
      id: string;
      from: string;
      to: string;
    }> = [];

    for (const edge of this.edges.values()) {
      const oldType = edge.type;

      // Check upgrade thresholds
      if (edge.type === 'none' && edge.usage >= this.config.trailThreshold) {
        edge.type = 'trail';
      } else if (
        edge.type === 'trail' &&
        edge.usage >= this.config.roadThreshold
      ) {
        edge.type = 'road';
      } else if (
        edge.type === 'road' &&
        edge.usage >= this.config.turnpikeThreshold
      ) {
        edge.type = 'turnpike';
      }

      if (edge.type !== oldType) {
        edge.currentCost = this.calculateCurrentCost(edge);
        upgrades.push({
          type: 'road',
          id: edge.id,
          from: oldType,
          to: edge.type,
        });
      }

      // Check crossing upgrades
      for (const crossing of edge.crossings) {
        const oldStatus = crossing.status;

        if (
          crossing.status === 'ford' &&
          crossing.usage >= this.config.trailThreshold
        ) {
          crossing.status = 'ferry';
        } else if (
          crossing.status === 'ferry' &&
          crossing.usage >= this.config.bridgeThreshold
        ) {
          if (crossing.riverWidth <= this.config.maxBridgeWidth) {
            crossing.status = 'bridge';
          }
        }

        if (crossing.status !== oldStatus) {
          edge.currentCost = this.calculateCurrentCost(edge);
          upgrades.push({
            type: 'crossing',
            id: crossing.id,
            from: oldStatus,
            to: crossing.status,
          });
        }
      }
    }

    return upgrades;
  }

  /**
   * Compute paths between all settlement pairs.
   */
  computeSettlementPaths(settlements: Settlement[]): SettlementPath[] {
    const paths: SettlementPath[] = [];

    for (let i = 0; i < settlements.length; i++) {
      for (let j = i + 1; j < settlements.length; j++) {
        const from = settlements[i];
        const to = settlements[j];

        const result = this.findPath(from.cellId, to.cellId);
        if (result.success) {
          paths.push({
            fromSettlement: from.id,
            toSettlement: to.id,
            path: result.path,
            cost: result.totalCost,
          });
        }
      }
    }

    return paths;
  }

  /**
   * Get all edges (for visualization).
   */
  getAllEdges(): NetworkEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get all crossings (for visualization).
   */
  getAllCrossings(): RiverCrossing[] {
    return Array.from(this.crossings.values());
  }

  /**
   * Get min and max costs for visualization scaling.
   */
  getCostRange(): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;

    for (const edge of this.edges.values()) {
      // Only consider land-to-land edges
      const fromCell = this.terrain.cells[edge.fromCell];
      const toCell = this.terrain.cells[edge.toCell];
      if (!fromCell?.isLand || !toCell?.isLand) continue;

      if (edge.baseCost < min) min = edge.baseCost;
      if (edge.baseCost > max) max = edge.baseCost;
    }

    return { min, max };
  }

  /**
   * Serialize network data for frontend.
   */
  serialize(settlements: Settlement[]): SerializedNetwork {
    return {
      edges: this.getAllEdges(),
      crossings: this.getAllCrossings(),
      settlementPaths: this.computeSettlementPaths(settlements),
    };
  }
}

/**
 * Create and initialize a transport network from terrain.
 */
export function createTransportNetwork(
  terrain: VoronoiTerrainData,
  config: Partial<NetworkConfig> = {}
): TransportNetwork {
  const network = new TransportNetwork(terrain, config);
  network.initializeEdges();
  return network;
}
