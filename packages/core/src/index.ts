// Re-export shared types for convenience
export type {
  Point,
  WorldConfig,
  Settlement,
  RiverCrossing,
  NetworkEdge,
  NetworkConfig,
  EdgeType,
  CostField,
  PathResult,
  SettlementPath,
  SerializedNetwork,
  // Voronoi types
  VoronoiTerrainData,
  VoronoiCell,
  VoronoiEdge,
  TerrainResult,
  ITerrainGenerator,
  // Cadastral types
  LandUse,
  Parcel,
  Rect,
} from '@colonies/shared';

export { DEFAULT_CONFIG, validateConfig } from '@colonies/shared';

// Core classes
export { SeededRNG } from './rng.js';
export { VoronoiWorldGenerator } from './voronoi-worldgen.js';
export { createWorldGenerator } from './generator-factory.js';
export { GrowthManager } from './growth.js';
export { CadastralManager } from './cadastral.js';
export { SettlementManager } from './settlements.js';

// Transport network
export { PriorityQueue } from './priority-queue.js';
export {
  TransportNetwork,
  createTransportNetwork,
  DEFAULT_NETWORK_CONFIG,
} from './transport.js';

// Polygon utilities
export {
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonBounds,
  generatePointsInPolygon,
  clipPolygon,
  isConvex,
} from './polygon-utils.js';

// Buildings & Streets
export { generateBuildings, generateBuildingForParcel } from './buildings.js';
export {
  generateStreets,
  generateStreetsForSettlement,
  generateDefaultStreets,
} from './streets.js';
export {
  generateSettlementName,
  generateSettlementNames,
  DEFAULT_NAMING_CONFIG,
} from './naming.js';
export type { NamingConfig } from './naming.js';
