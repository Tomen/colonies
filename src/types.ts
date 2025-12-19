// Shared type definitions for EastCoast Colonies simulation

export interface TerrainGrid {
  W: number; H: number; cellSizeM: number;
  elevationM: Float32Array; slopeRad: Float32Array;
  fertility: Uint8Array; soilClass: Uint8Array; moistureIx: Uint8Array;
  coastline: PolylineSet;
  nearshoreDepthM: Float32Array;
}

export interface RiverGraph {
  nodes: { x: Float32Array; y: Float32Array; flow: Float32Array; };
  edges: {
    src: Uint32Array; dst: Uint32Array;
    lineStart: Uint32Array; lineEnd: Uint32Array;
    lengthM: Float32Array; widthM: Float32Array; slope: Float32Array; flow: Float32Array;
    order: Uint8Array; fordability: Float32Array;
  };
  lines: PolylineSet; mouthNodeIds: Uint32Array;
}

export interface HydroNetwork {
  river: RiverGraph;
  coast: PolylineSet;
  fallLine: { nodeIds: Uint32Array; xy: Float32Array };
  distToRiverM?: Float32Array; distToCoastM?: Float32Array;
}

export interface LandMesh {
  sitesX: Float32Array; sitesY: Float32Array;
  cellStart: Uint32Array; cellCount: Uint32Array;
  vertsX: Float32Array; vertsY: Float32Array;
  heTwin: Uint32Array; heNext: Uint32Array; heCell: Uint32Array;
  heMidX: Float32Array; heMidY: Float32Array; heLen: Float32Array;
  heIsCoast: Uint8Array; heCrossesRiver: Uint8Array;
  elevMean: Float32Array; slopeMean: Float32Array;
  fertility: Uint16Array; soilClass: Uint8Array; moistureIx: Uint8Array;
  distToRiverM: Float32Array; distToCoastM: Float32Array;
  areaM2: Float32Array; centroidX: Float32Array; centroidY: Float32Array;
}

export enum LandUse { Forest = 0, Field = 1, Pasture = 2, Manufactory = 3, Town = 4 }

export interface LandState {
  use: Uint8Array;
  forestAgeY: Uint16Array;
}

export enum RoadClass { Trail = 0, Road = 1, Turnpike = 2 }

export interface NetState {
  edgeClass: Uint8Array;
  edgeUsage: Float32Array;
  ferry: Uint8Array;
  bridge: Uint8Array;
  ports: Uint32Array;
  landings: Uint32Array;
}

export interface Settlement {
  cellId: number; pop: number; rank: 0|1|2|3;
}

export interface RNG {
  next(): number;
}

export interface Config {
  seed: number;
  map: { size_km: [number, number]; ocean_margin_m: number; sea_level_m: number; };
  time: { start_year: number; tick: string; gif_every_ticks: number; };
  worldgen: {
    relief_strength: number;
    ridge_orientation_deg: number;
    river_density: number;
    harbor: { shelter: number; depth: number; exposure: number };
  };
  transport: {
    overland: boolean; river_navigation: boolean; coastal_shipping: boolean;
    trail_to_road: number; road_to_turnpike: number;
    ferry_open: number; bridge_build: number;
  };
  landuse: { forest_regrowth_years: number; field_claim_radius_km: number };
  industries: {
    mills: boolean; shipyards: boolean; ironworks: boolean; brickworks: boolean; woodworking: boolean;
    spawn_thresholds: { [k: string]: number };
  };
  render: { resolution_px: [number, number]; style: string };
}

export interface Sim {
  phys: { terrain: TerrainGrid; hydro: HydroNetwork; land: LandMesh };
  land: LandState;
  net: NetState;
  towns: Settlement[];
  clock: { year: number; quarter: 0|1|2|3 };
  rng: RNG;
  cfg: Config;
}

export interface ODBundle {
  from: number;
  to: number;
  quantity: number;
}

export interface PolylineSet {
  // Placeholder for geometry collection
  lines: Float32Array;
  offsets: Uint32Array;
}
