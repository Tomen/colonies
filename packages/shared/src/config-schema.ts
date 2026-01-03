import type { WorldConfig } from './types.js';

/**
 * Default configuration values for world generation.
 * These can be used by both the CLI and frontend.
 */
export const DEFAULT_CONFIG: WorldConfig = {
  seed: 12345,
  mapSize: 10000, // 10km x 10km, 1 unit = 1 meter

  // Voronoi parameters
  voronoiCellCount: 10000,
  voronoiRelaxation: 2,
  landThreshold: -0.1,
  riverThreshold: 25,
  moistureDiffusion: 5,

  // Lake/depression parameters (Priority-Flood)
  fillSpillEnabled: true,
  minLakeArea: 3,
  minLakeDepth: 1.0,

  // Island shape parameters
  landFraction: 0.55,
  islandNoiseScale: 0.006,
  islandNoiseOctaves: 4,

  // Elevation parameters (mapgen4-style hills+mountains dual system)
  peakElevation: 1500,
  minPeakElevation: 50,
  mountainPeakCount: 5,
  ridgeEnabled: true,
  ridgeWidth: 3,
  hilliness: 0.3,
  elevationBlendPower: 2,
  hillNoiseScale: 0.008,
  hillNoiseAmplitude: 0.4,

  // River parameters
  riverSpacing: 80,
  riverMeanderStrength: 0.3,

  // Noise parameters
  noiseScale: 0.005,
  noiseAmplitude: 0.15,

  // Legacy parameters (for backward compatibility)
  coastlinePosition: 0.85,
  coastlineWaviness: 0.15,
  coastlineFrequency: 2,
  coastalPlainFraction: 0.3,
  piedmontFraction: 0.3,
  ridgeElevation: 350,
  piedmontElevation: 120,
  coastalElevation: 30,
  ridgeOrientation: 45,
  riverDensity: 0.5,
  coastalPlainWidth: 0.3,
  ridgeHeight: 200,
  noiseOctaves: 3,
  noisePersistence: 0.5,
  ridgeVariation: 0.2,
  coastlineMargin: 50,
  oceanDepthGradient: 0.5,

  // Settlement defaults
  settlementCount: 3,

  // Transport defaults (unchanged)
  baseSlopeCost: 0.1,
  waterCost: 100,
  riverCrossingPenalty: 10,
  trailToRoadThreshold: 100,
  roadToTurnpikeThreshold: 500,
  ferryToBridgeThreshold: 200,
  minRiverFlowForCrossing: 50,
  maxBridgeWidth: 5,
};

/**
 * Validates a config object and fills in defaults for missing fields.
 */
export function validateConfig(config: Partial<WorldConfig>): WorldConfig {
  if (config.seed === undefined || config.mapSize === undefined) {
    throw new Error('Config missing required fields: seed, mapSize');
  }

  return {
    ...DEFAULT_CONFIG,
    ...config,
  } as WorldConfig;
}
