import { describe, test, expect } from 'vitest';
import { createWorldGenerator } from '../src/generator-factory.js';
import type { WorldConfig, Biome } from '@colonies/shared';

describe('Biome Assignment', () => {
  const config: WorldConfig = {
    seed: 12345,
    mapSize: 5000,
    voronoiCellCount: 1000,
    voronoiRelaxation: 1,
    landFraction: 0.55,
    peakElevation: 1500,
    riverThreshold: 50,
  };

  test('all cells have a valid biome assigned', () => {
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    const validBiomes: Biome[] = ['sea', 'river', 'lake', 'plains', 'woods', 'mountains'];

    for (const cell of terrain.cells) {
      expect(cell.biome).toBeDefined();
      expect(validBiomes).toContain(cell.biome);
    }
  });

  test('biome distribution has variety', () => {
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    const biomeCounts = new Map<Biome, number>();
    for (const cell of terrain.cells) {
      const count = biomeCounts.get(cell.biome) ?? 0;
      biomeCounts.set(cell.biome, count + 1);
    }

    console.log('Biome distribution:', Object.fromEntries(biomeCounts));

    // Should have at least sea and some land biomes
    expect(biomeCounts.get('sea')).toBeGreaterThan(0);

    // Land biomes should exist (at least some plains, woods, or mountains)
    const landBiomes = (biomeCounts.get('plains') ?? 0) +
                       (biomeCounts.get('woods') ?? 0) +
                       (biomeCounts.get('mountains') ?? 0);
    expect(landBiomes).toBeGreaterThan(0);
  });

  test('sea biome only on non-land cells', () => {
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    for (const cell of terrain.cells) {
      if (cell.biome === 'sea') {
        expect(cell.isLand).toBe(false);
      }
    }
  });

  test('land cells have land biomes', () => {
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    for (const cell of terrain.cells) {
      if (cell.isLand && cell.lakeId == null) {
        // Land cells without lakes should not be 'sea'
        expect(cell.biome).not.toBe('sea');
      }
    }
  });
});
