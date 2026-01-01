export interface Point {
  x: number;
  y: number;
}

export interface WorldConfig {
  seed: number;
  mapSize: number;
  ridgeOrientation: number;
  riverDensity: number;
  coastalPlainWidth?: number;
  ridgeHeight?: number;
  noiseScale?: number;
  // Y-axis terrain variation parameters
  coastlineWaviness?: number; // Amplitude of coastline undulation (0-1)
  coastlineFrequency?: number; // Number of major bays/headlands
  noiseOctaves?: number; // Layers of noise at different scales
  noisePersistence?: number; // How much each octave contributes (0-1)
  ridgeVariation?: number; // Y-axis variation in ridge height (0-1)
  // Coastline parameters
  coastlineMargin?: number; // Base distance of coastline from east edge (default: 50)
  oceanDepthGradient?: number; // How fast ocean deepens per cell (default: 0.5)
  // Transport parameters
  baseSlopeCost?: number; // Cost multiplier per unit slope (default: 0.1)
  waterCost?: number; // Cost for water cells (default: 100)
  riverCrossingPenalty?: number; // Penalty for river crossings (default: 10)
  trailToRoadThreshold?: number; // Usage to upgrade trail→road (default: 100)
  roadToTurnpikeThreshold?: number; // Usage to upgrade road→turnpike (default: 500)
  ferryToBridgeThreshold?: number; // Usage to upgrade ferry→bridge (default: 200)
  minRiverFlowForCrossing?: number; // Flow accumulation to consider as river (default: 50)
  maxBridgeWidth?: number; // Max river width for bridges in cells (default: 5)
}

export interface TerrainData {
  height: number[][];
  flowAccumulation: number[][];
  moisture: number[][];
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
