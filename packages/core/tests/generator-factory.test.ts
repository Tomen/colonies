import { describe, it, expect } from 'vitest';
import { createWorldGenerator } from '../src/generator-factory.js';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import { DEFAULT_CONFIG } from '@colonies/shared';

describe('createWorldGenerator', () => {
  const baseConfig = { ...DEFAULT_CONFIG, mapSize: 100 };

  it('returns VoronoiWorldGenerator', () => {
    const gen = createWorldGenerator(baseConfig);
    expect(gen).toBeInstanceOf(VoronoiWorldGenerator);
  });

  it('creates generator with provided config', () => {
    const gen = createWorldGenerator({
      ...baseConfig,
      voronoiCellCount: 500,
    });
    expect(gen).toBeInstanceOf(VoronoiWorldGenerator);
  });
});

describe('VoronoiTerrainData', () => {
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
