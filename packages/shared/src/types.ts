export interface Point {
  x: number;
  y: number;
}

/**
 * River representation as explicit polylines with stream order.
 */
export interface River {
  id: string;
  points: Point[]; // Polyline from source to mouth
  strahler: number; // Stream order (1=headwater, higher=major)
  tributaries: River[]; // Child rivers that flow into this one
}

// ============================================================================
// Voronoi Data Structures
// ============================================================================

/**
 * A single Voronoi cell with terrain properties.
 */
export interface VoronoiCell {
  id: number;
  centroid: Point;
  vertices: Point[]; // Polygon boundary vertices
  neighbors: number[]; // Adjacent cell IDs
  elevation: number;
  moisture: number;
  isLand: boolean;
  isCoast: boolean;
  flowsTo: number | null; // ID of downstream cell
  flowAccumulation: number; // Upstream cell count
}

/**
 * An edge between two Voronoi cells.
 */
export interface VoronoiEdge {
  id: number;
  cells: [number, number]; // Adjacent cell IDs
  vertices: [Point, Point]; // Edge endpoints
  isRiver: boolean;
  flowVolume: number;
}

/**
 * Voronoi-based terrain data with polygonal cells.
 */
export interface VoronoiTerrainData {
  type: 'voronoi';
  cells: VoronoiCell[];
  edges: VoronoiEdge[];
  rivers: VoronoiEdge[]; // High-flow edges marked as rivers
  bounds: { width: number; height: number };
}

export interface WorldConfig {
  seed: number;
  mapSize: number;

  // Voronoi parameters
  voronoiCellCount?: number; // Number of Voronoi cells (default: 10000)
  voronoiRelaxation?: number; // Lloyd relaxation iterations (default: 2)
  landThreshold?: number; // Threshold for land vs water (default: -0.1)
  riverThreshold?: number; // Min flow accumulation for rivers (default: 50)
  moistureDiffusion?: number; // Moisture diffusion iterations (default: 5)

  // Island shape parameters
  landFraction?: number; // Fraction of map that is land (default: 0.45)
  islandNoiseScale?: number; // Noise frequency for coastline shape (default: 0.006)
  islandNoiseOctaves?: number; // Coastline complexity (default: 4)

  // Elevation parameters (mapgen4-style hills+mountains dual system)
  peakElevation?: number; // Maximum elevation at mountain peaks in meters (default: 300)
  minPeakElevation?: number; // Minimum elevation to be a river source (default: 50)
  mountainPeakCount?: number; // Number of mountain peak points (default: 5)
  hilliness?: number; // Blend between flat (0) and hilly (1) terrain (default: 0.3)
  elevationBlendPower?: number; // Exponent for coast-to-mountain blend, higher = flatter coasts (default: 2)
  hillNoiseScale?: number; // Frequency for hill noise (default: 0.008)
  hillNoiseAmplitude?: number; // Amplitude multiplier for hill noise (default: 0.4)

  // River parameters
  riverSpacing?: number; // Min distance between river sources (default: 80)
  riverMeanderStrength?: number; // How much rivers curve (default: 0.3)

  // Noise parameters
  noiseScale?: number; // Base frequency of terrain noise (default: 0.005)
  noiseAmplitude?: number; // Fraction of local elevation for noise (default: 0.15)

  // Legacy parameters (kept for backward compatibility)
  /** @deprecated No longer used - island generation doesn't use coastline position */
  coastlinePosition?: number;
  /** @deprecated No longer used - island generation doesn't use coastline waviness */
  coastlineWaviness?: number;
  /** @deprecated No longer used */
  coastlineFrequency?: number;
  /** @deprecated No longer used */
  coastlineMargin?: number;
  /** @deprecated Use peakElevation instead */
  ridgeHeight?: number;
  /** @deprecated No longer used */
  ridgeOrientation?: number;
  /** @deprecated No longer used - rivers are explicit */
  riverDensity?: number;
  /** @deprecated No longer used */
  coastalPlainWidth?: number;
  /** @deprecated No longer used */
  coastalPlainFraction?: number;
  /** @deprecated No longer used */
  piedmontFraction?: number;
  /** @deprecated Use peakElevation instead */
  ridgeElevation?: number;
  /** @deprecated No longer used */
  piedmontElevation?: number;
  /** @deprecated No longer used */
  coastalElevation?: number;
  /** @deprecated No longer used */
  noiseOctaves?: number;
  /** @deprecated No longer used */
  noisePersistence?: number;
  /** @deprecated No longer used */
  ridgeVariation?: number;
  /** @deprecated No longer used */
  oceanDepthGradient?: number;

  // Settlement parameters
  settlementCount?: number; // Number of villages to seed (default: 3)

  // Transport parameters (unchanged)
  baseSlopeCost?: number; // Cost multiplier per unit slope (default: 0.1)
  waterCost?: number; // Cost for water cells (default: 100)
  riverCrossingPenalty?: number; // Penalty for river crossings (default: 10)
  trailToRoadThreshold?: number; // Usage to upgrade trail→road (default: 100)
  roadToTurnpikeThreshold?: number; // Usage to upgrade road→turnpike (default: 500)
  ferryToBridgeThreshold?: number; // Usage to upgrade ferry→bridge (default: 200)
  minRiverFlowForCrossing?: number; // Flow accumulation to consider as river (default: 50)
  maxBridgeWidth?: number; // Max river width for bridges in cells (default: 5)
}

// ============================================================================
// Terrain Result & Generator Interface
// ============================================================================

/**
 * Terrain data format (Voronoi-based).
 */
export type TerrainResult = VoronoiTerrainData;

/**
 * Interface for terrain generators.
 */
export interface ITerrainGenerator {
  generateTerrain(): TerrainResult;
  findBestHarbor(terrain: TerrainResult): Point;
}

export interface Settlement {
  id: string;
  name: string;
  position: Point; // Center location
  cellId: number; // Primary terrain cell
  population: number;
  rank: 'hamlet' | 'village' | 'town' | 'city';
  isPort: boolean;
  claimedCells: number[]; // All terrain cells claimed by this settlement
}

// ============================================================================
// Network Layer (Transport & Pathfinding)
// ============================================================================

/**
 * Edge types for the transport network.
 * Progression: none → trail → road → turnpike (via usage)
 */
export type EdgeType = 'none' | 'trail' | 'road' | 'turnpike';

/**
 * A river crossing point where a network edge crosses a river.
 * Progression: ford → ferry → bridge (via usage)
 */
export interface RiverCrossing {
  id: string;
  edgeId: string; // Parent network edge
  position: Point; // Midpoint of crossing
  voronoiEdgeId: number; // The VoronoiEdge this crosses
  riverWidth: number; // Derived from flow accumulation (log scale)
  maxFlow: number; // Flow accumulation at crossing
  status: 'ford' | 'ferry' | 'bridge';
  usage: number;
}

/**
 * A network edge between two adjacent Voronoi cells.
 * Created eagerly for all cell adjacencies at world gen.
 */
export interface NetworkEdge {
  id: string;
  fromCell: number; // Voronoi cell ID
  toCell: number; // Voronoi cell ID
  type: EdgeType;
  baseCost: number; // Distance × terrain factors (immutable)
  currentCost: number; // baseCost × road multiplier (changes with upgrades)
  usage: number; // Accumulated traffic
  crossings: RiverCrossing[]; // River crossings on this edge
}

/**
 * Configuration for the transport network.
 */
export interface NetworkConfig {
  // Cost factors
  baseSlopeCost: number; // Cost per meter elevation difference (default: 0.5)
  altitudeCost: number; // Cost per meter of average elevation (default: 0.01)
  waterCost: number; // Cost multiplier for water cells (default: 100)
  riverCrossingPenalty: number; // Additional cost per river crossing (default: 10)

  // Road type cost multipliers
  trailCostMultiplier: number; // 1.0 - trails don't reduce cost
  roadCostMultiplier: number; // 0.5 - roads halve cost
  turnpikeCostMultiplier: number; // 0.2 - turnpikes are fast

  // Upgrade thresholds (usage required)
  trailThreshold: number; // 50 - usage to create trail from nothing
  roadThreshold: number; // 100 - usage to upgrade trail → road
  turnpikeThreshold: number; // 500 - usage to upgrade road → turnpike
  bridgeThreshold: number; // 200 - usage to upgrade ferry → bridge

  // Constraints
  maxBridgeWidth: number; // 5 - max river width (log scale) for bridge
  minRiverFlow: number; // 50 - flow accumulation to count as river
}

/**
 * Result of A* pathfinding between two cells.
 */
export interface PathResult {
  success: boolean;
  path: number[]; // Sequence of cell IDs
  totalCost: number;
  edges: NetworkEdge[]; // Edges traversed
  crossings: RiverCrossing[]; // River crossings encountered
}

/**
 * Pre-computed path between two settlements (for visualization).
 */
export interface SettlementPath {
  fromSettlement: string; // Settlement ID
  toSettlement: string; // Settlement ID
  path: number[]; // Cell IDs
  cost: number;
}

/**
 * Serialized network data for transfer to frontend.
 */
export interface SerializedNetwork {
  edges: NetworkEdge[];
  crossings: RiverCrossing[];
  settlementPaths: SettlementPath[];
}

/** @deprecated Use cell-based NetworkEdge instead */
export interface CostField {
  cost: number[][];
  isWater: boolean[][];
  isRiver: boolean[][];
}

// ============================================================================
// Cadastral Layer (Parcels & Land Use)
// ============================================================================

/**
 * Land use categories for parcels.
 */
export type LandUse =
  | 'wilderness' // Uncleared land
  | 'forest' // Managed woodland
  | 'field' // Agricultural
  | 'pasture' // Grazing
  | 'residential' // Houses
  | 'commercial' // Shops, warehouses
  | 'industrial' // Mills, workshops
  | 'civic'; // Churches, town halls

/**
 * A parcel represents a human-scale lot within a terrain cell.
 * For Grid terrain: 1 cell = 1 parcel
 * For Voronoi terrain: 1 cell = 10-50 parcels (subdivision)
 */
export interface Parcel {
  id: string;
  vertices: Point[]; // Closed polygon (first != last, implied closure)
  centroid: Point; // Center point for quick spatial queries
  area: number; // Cached area in square meters

  // Terrain reference
  terrainCellId: number; // Parent terrain cell ID

  // Ownership & use
  owner: string | null; // null = unclaimed wilderness
  landUse: LandUse;

  // Optional metadata
  frontage?: 'water' | 'road' | null; // Parcels may have water/road frontage
}

/**
 * Bounding rectangle for spatial queries.
 */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ============================================================================
// Buildings & Streets
// ============================================================================

/**
 * Building types based on land use and function.
 */
export type BuildingType =
  | 'house'
  | 'farmhouse'
  | 'barn'
  | 'shop'
  | 'warehouse'
  | 'church'
  | 'townhall';

/**
 * Roof styles for procedural buildings.
 */
export type RoofType = 'gable' | 'hip' | 'flat';

/**
 * Visual style parameters for a building.
 */
export interface BuildingStyle {
  roofType: RoofType;
  stories: number; // 1-3
  wallColor: string; // Hex color for walls
  roofColor: string; // Hex color for roof
}

/**
 * A building placed on a parcel.
 */
export interface Building {
  id: string;
  parcelId: string; // Parent parcel
  type: BuildingType;
  position: Point; // Center position
  footprint: Point[]; // Building outline vertices (rectangle)
  width: number; // Building width in meters
  depth: number; // Building depth in meters
  height: number; // Building height in meters (walls only)
  rotation: number; // Rotation in radians
  style: BuildingStyle;
}

/**
 * Street types based on importance.
 */
export type StreetType = 'lane' | 'road' | 'main';

/**
 * A street segment within a settlement.
 */
export interface Street {
  id: string;
  fromCell: number; // Source cell ID
  toCell: number; // Destination cell ID
  path: Point[]; // Street centerline points
  width: number; // Street width in meters
  type: StreetType;
}
