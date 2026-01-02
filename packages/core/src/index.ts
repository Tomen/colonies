// Re-export shared types for convenience
export type {
  Point,
  WorldConfig,
  TerrainData,
  Settlement,
  RiverCrossing,
  NetworkEdge,
  CostField,
  PathResult,
  // New types for pluggable generation
  GenerationAlgorithm,
  GridTerrainData,
  VoronoiTerrainData,
  VoronoiCell,
  VoronoiEdge,
  TerrainResult,
  ITerrainGenerator,
} from '@colonies/shared';

export { DEFAULT_CONFIG, validateConfig } from '@colonies/shared';

// Core classes
export { SeededRNG } from './rng.js';
export { WorldGenerator } from './worldgen.js';
export { VoronoiWorldGenerator } from './voronoi-worldgen.js';
export { createWorldGenerator } from './generator-factory.js';
export { TransportNetwork } from './transport.js';
export { GrowthManager } from './growth.js';
