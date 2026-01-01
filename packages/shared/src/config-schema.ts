import type { WorldConfig } from './types.js';

/**
 * Default configuration values for world generation.
 * These can be used by both the CLI and frontend.
 */
export const DEFAULT_CONFIG: WorldConfig = {
  seed: 12345,
  mapSize: 1000,
  ridgeOrientation: 45,
  riverDensity: 0.5,
  coastalPlainWidth: 0.3,
  ridgeHeight: 200,
  noiseScale: 0.01,
  coastlineWaviness: 0.3,
  coastlineFrequency: 3,
  noiseOctaves: 3,
  noisePersistence: 0.5,
  ridgeVariation: 0.2,
  // Coastline defaults
  coastlineMargin: 50,
  oceanDepthGradient: 0.5,
  // Transport defaults
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
