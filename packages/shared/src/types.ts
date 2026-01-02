export interface Point {
  x: number;
  y: number;
}

// ============================================================================
// Algorithm Selection
// ============================================================================

export type GenerationAlgorithm = 'grid' | 'voronoi';

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

  // Algorithm selection
  generationAlgorithm?: GenerationAlgorithm; // 'grid' (default) or 'voronoi'

  // Voronoi-specific parameters
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
// Grid Terrain Data
// ============================================================================

/**
 * Grid-based terrain data with raster grids.
 */
export interface GridTerrainData {
  type: 'grid';
  // Raster grids
  height: number[][];
  flowAccumulation: number[][];
  moisture: number[][];

  // Vector data
  rivers?: River[]; // Explicit river polylines
}

/**
 * @deprecated Use GridTerrainData instead. Kept for backward compatibility.
 */
export type TerrainData = GridTerrainData;

// ============================================================================
// Terrain Result Union & Generator Interface
// ============================================================================

/**
 * Union type for all terrain data formats.
 */
export type TerrainResult = GridTerrainData | VoronoiTerrainData;

/**
 * Interface for terrain generators.
 */
export interface ITerrainGenerator {
  generateTerrain(): TerrainResult;
  findBestHarbor(terrain: TerrainResult): Point;
}

export interface Settlement {
  id: string;
  position: Point;
  population: number;
  rank: 'hamlet' | 'village' | 'town' | 'city';
  isPort: boolean;
}

export interface RiverCrossing {
  id: string;
  position: Point;
  riverWidth: number;
  status: 'ford' | 'ferry' | 'bridge';
  usage: number;
}

export interface NetworkEdge {
  id: string;
  from: Point;
  to: Point;
  type: 'trail' | 'road' | 'turnpike' | 'river' | 'coastal' | 'ferry' | 'bridge';
  cost: number;
  usage: number;
  crossings: RiverCrossing[];
}

export interface CostField {
  cost: number[][];
  isWater: boolean[][];
  isRiver: boolean[][];
}

export interface PathResult {
  path: Point[];
  totalCost: number;
  crossings: RiverCrossing[];
  success: boolean;
}
