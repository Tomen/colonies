import type { WorldConfig, ITerrainGenerator } from '@colonies/shared';
import { WorldGenerator } from './worldgen.js';
import { VoronoiWorldGenerator } from './voronoi-worldgen.js';

/**
 * Factory function to create the appropriate terrain generator
 * based on the config's generationAlgorithm setting.
 *
 * @param config - World configuration with optional generationAlgorithm
 * @returns A terrain generator implementing ITerrainGenerator
 */
export function createWorldGenerator(config: WorldConfig): ITerrainGenerator {
  const algorithm = config.generationAlgorithm ?? 'grid';

  switch (algorithm) {
    case 'grid':
      return new WorldGenerator(config);
    case 'voronoi':
      return new VoronoiWorldGenerator(config);
    default:
      throw new Error(`Unknown generation algorithm: '${algorithm}'`);
  }
}
