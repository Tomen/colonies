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
  harborMinDepth?: number;
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

export interface NetworkEdge {
  id: string;
  from: Point;
  to: Point;
  type: 'trail' | 'road' | 'turnpike' | 'river' | 'ferry' | 'bridge';
  cost: number;
  usage: number;
}