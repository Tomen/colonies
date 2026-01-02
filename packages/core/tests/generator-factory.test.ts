import { describe, it, expect } from 'vitest';
import { createWorldGenerator } from '../src/generator-factory.js';
import { WorldGenerator } from '../src/worldgen.js';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import { DEFAULT_CONFIG } from '@colonies/shared';

describe('createWorldGenerator', () => {
  const baseConfig = { ...DEFAULT_CONFIG, mapSize: 100 };

  it('returns WorldGenerator for grid algorithm', () => {
    const gen = createWorldGenerator({ ...baseConfig, generationAlgorithm: 'grid' });
    expect(gen).toBeInstanceOf(WorldGenerator);
  });

  it('returns VoronoiWorldGenerator when using default config (voronoi)', () => {
    const gen = createWorldGenerator(baseConfig);
    expect(gen).toBeInstanceOf(VoronoiWorldGenerator);
  });

  it('returns VoronoiWorldGenerator for voronoi algorithm', () => {
    const gen = createWorldGenerator({
      ...baseConfig,
      generationAlgorithm: 'voronoi',
    });
    expect(gen).toBeInstanceOf(VoronoiWorldGenerator);
  });

  it('throws for unknown algorithm', () => {
    expect(() =>
      createWorldGenerator({
        ...baseConfig,
        generationAlgorithm: 'bad' as 'grid',
      })
    ).toThrow('Unknown generation algorithm');
  });
});

describe('GridTerrainData has type discriminator', () => {
  it('generateTerrain returns type: grid', () => {
    const gen = new WorldGenerator({ ...DEFAULT_CONFIG, mapSize: 100 });
    const terrain = gen.generateTerrain();
    expect(terrain.type).toBe('grid');
  });
});

describe('VoronoiTerrainData has type discriminator', () => {
  it('generateTerrain returns type: voronoi', () => {
    const gen = new VoronoiWorldGenerator({
      ...DEFAULT_CONFIG,
      mapSize: 100,
      voronoiCellCount: 100,
    });
    const terrain = gen.generateTerrain();
    expect(terrain.type).toBe('voronoi');
  });
});
