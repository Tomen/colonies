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
} from '@colonies/shared';

export { DEFAULT_CONFIG, validateConfig } from '@colonies/shared';

// Core classes
export { SeededRNG } from './rng.js';
export { WorldGenerator } from './worldgen.js';
export { TransportNetwork } from './transport.js';
export { GrowthManager } from './growth.js';
