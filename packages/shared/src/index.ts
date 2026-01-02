// Types
export type {
  Point,
  River,
  WorldConfig,
  TerrainData,
  Settlement,
  RiverCrossing,
  NetworkEdge,
  CostField,
  PathResult,
  // Algorithm selection
  GenerationAlgorithm,
  // Voronoi types
  VoronoiCell,
  VoronoiEdge,
  VoronoiTerrainData,
  // Grid types
  GridTerrainData,
  // Union type and interface
  TerrainResult,
  ITerrainGenerator,
} from './types.js';

// Config utilities
export { DEFAULT_CONFIG, validateConfig } from './config-schema.js';
