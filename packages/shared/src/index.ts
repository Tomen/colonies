// Types
export type {
  Point,
  River,
  WorldConfig,
  Settlement,
  // Network types
  EdgeType,
  RiverCrossing,
  NetworkEdge,
  NetworkConfig,
  PathResult,
  SettlementPath,
  SerializedNetwork,
  CostField,
  // Voronoi types
  VoronoiCell,
  VoronoiEdge,
  VoronoiTerrainData,
  Lake,
  // Terrain type and interface
  TerrainResult,
  ITerrainGenerator,
  // Cadastral types
  LandUse,
  Biome,
  Parcel,
  Rect,
  // Building & Street types
  BuildingType,
  BuildingTier,
  RoofType,
  BuildingStyle,
  Building,
  StreetType,
  Street,
} from './types.js';

// Config utilities
export { DEFAULT_CONFIG, validateConfig } from './config-schema.js';
