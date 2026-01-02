import type { WorldConfig, ITerrainGenerator } from '@colonies/shared';
import { VoronoiWorldGenerator } from './voronoi-worldgen.js';

/**
 * Factory function to create a terrain generator.
 *
 * @param config - World configuration
 * @returns A VoronoiWorldGenerator implementing ITerrainGenerator
 */
export function createWorldGenerator(config: WorldConfig): ITerrainGenerator {
  return new VoronoiWorldGenerator(config);
}
