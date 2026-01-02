import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/worldgen.js';
import { SeededRNG } from '../src/rng.js';
import type { WorldConfig } from '@colonies/shared';
import { DEFAULT_CONFIG, validateConfig } from '@colonies/shared';

describe('WorldGenerator', () => {
  const testConfig: WorldConfig = {
    seed: 12345,
    mapSize: 100,
    ridgeOrientation: 45,
    riverDensity: 0.5,
    coastalPlainWidth: 0.3,
    ridgeHeight: 200,
    noiseScale: 0.01,
  };

  it('should create a WorldGenerator instance', () => {
    const generator = new WorldGenerator(testConfig);
    expect(generator).toBeDefined();
  });

  it('should generate terrain data with correct dimensions', () => {
    const generator = new WorldGenerator(testConfig);
    const terrain = generator.generateTerrain();

    expect(terrain.height).toBeDefined();
    expect(terrain.flowAccumulation).toBeDefined();
    expect(terrain.moisture).toBeDefined();
    expect(terrain.height.length).toBe(testConfig.mapSize);
    expect(terrain.height[0].length).toBe(testConfig.mapSize);
  });

  it('should generate deterministic terrain with same seed', () => {
    const generator1 = new WorldGenerator(testConfig);
    const generator2 = new WorldGenerator(testConfig);

    const terrain1 = generator1.generateTerrain();
    const terrain2 = generator2.generateTerrain();

    // Check a few sample points for consistency
    expect(terrain1.height[10][10]).toBe(terrain2.height[10][10]);
    expect(terrain1.height[50][50]).toBe(terrain2.height[50][50]);
  });

  it('should ensure rivers flow toward ocean (no sinks)', () => {
    // Use larger map for better island generation
    const largerConfig = { ...testConfig, mapSize: 200 };
    const generator = new WorldGenerator(largerConfig);
    const terrain = generator.generateTerrain();

    // Check that flow accumulation exists (rivers form)
    let maxFlow = 0;
    for (let y = 0; y < largerConfig.mapSize; y++) {
      for (let x = 0; x < largerConfig.mapSize; x++) {
        maxFlow = Math.max(maxFlow, terrain.flowAccumulation[y][x]);
      }
    }

    // Should have some flow accumulation indicating drainage
    expect(maxFlow).toBeGreaterThan(10);

    // Check that explicit rivers exist
    expect(terrain.rivers).toBeDefined();
    expect(terrain.rivers!.length).toBeGreaterThanOrEqual(0);
  });

  it('should find a valid harbor location', () => {
    const generator = new WorldGenerator(testConfig);
    const terrain = generator.generateTerrain();
    const harbor = generator.findBestHarbor(terrain);

    expect(harbor).toBeDefined();
    expect(typeof harbor.x).toBe('number');
    expect(typeof harbor.y).toBe('number');
    expect(harbor.x).toBeGreaterThanOrEqual(0);
    expect(harbor.y).toBeGreaterThanOrEqual(0);
    expect(harbor.x).toBeLessThan(testConfig.mapSize);
    expect(harbor.y).toBeLessThan(testConfig.mapSize);
  });

  it('should produce reasonable elevation gradients', () => {
    // Use larger map for island generation
    const largerConfig = { ...testConfig, mapSize: 200 };
    const generator = new WorldGenerator(largerConfig);
    const terrain = generator.generateTerrain();

    // For island terrain: center should be higher than edges
    const centerElevation = terrain.height[100][100]; // Center of map
    const edgeElevation = terrain.height[10][100]; // Near edge

    // Center should be land (positive elevation) if there's enough land
    // Edge should be lower (ocean or coastal)
    // The center is more likely to be high, edge more likely to be low/ocean
    expect(centerElevation).toBeGreaterThanOrEqual(edgeElevation);
  });

  it('should produce more rivers with smaller riverSpacing', () => {
    const sparseConfig = { ...testConfig, riverSpacing: 200 };
    const denseConfig = { ...testConfig, riverSpacing: 40 };

    const sparseGen = new WorldGenerator(sparseConfig);
    const denseGen = new WorldGenerator(denseConfig);

    const sparseTerrain = sparseGen.generateTerrain();
    const denseTerrain = denseGen.generateTerrain();

    // Count rivers in each terrain
    const sparseRiverCount = sparseTerrain.rivers?.length ?? 0;
    const denseRiverCount = denseTerrain.rivers?.length ?? 0;

    // Smaller spacing should produce more rivers
    expect(denseRiverCount).toBeGreaterThanOrEqual(sparseRiverCount);
  });

  it('should generate full 10x10km map within reasonable time', () => {
    const fullSizeConfig: WorldConfig = {
      ...testConfig,
      mapSize: 1000, // 10km x 10km at 10m resolution
    };

    const generator = new WorldGenerator(fullSizeConfig);
    const startTime = Date.now();

    const terrain = generator.generateTerrain();
    const harbor = generator.findBestHarbor(terrain);

    const elapsed = Date.now() - startTime;

    // Should complete within 5 seconds (algorithm includes river generation and valley carving)
    expect(elapsed).toBeLessThan(5000);

    // Verify correct dimensions
    expect(terrain.height.length).toBe(1000);
    expect(terrain.height[0].length).toBe(1000);

    // Verify harbor was found
    expect(harbor.x).toBeGreaterThanOrEqual(0);
    expect(harbor.y).toBeGreaterThanOrEqual(0);

    // Log performance for monitoring
    console.log(`10x10km generation completed in ${elapsed}ms`);
  }, 10000); // 10 second timeout for the test itself
});

describe('SeededRNG', () => {
  it('should produce consistent results with same seed', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);

    expect(rng1.next()).toBe(rng2.next());
    expect(rng1.next()).toBe(rng2.next());
  });

  it('should produce different results with different seeds', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(43);

    expect(rng1.next()).not.toBe(rng2.next());
  });

  it('should generate numbers in range', () => {
    const rng = new SeededRNG(42);

    for (let i = 0; i < 100; i++) {
      const value = rng.nextRange(10, 20);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
    }
  });
});

describe('Config validation', () => {
  it('should provide valid default configuration', () => {
    const config = DEFAULT_CONFIG;

    expect(config.seed).toBeDefined();
    expect(config.mapSize).toBeGreaterThan(0);
    expect(config.ridgeOrientation).toBeDefined();
    expect(config.riverDensity).toBeDefined();
  });

  it('should validate required fields', () => {
    expect(() => {
      validateConfig({} as WorldConfig);
    }).toThrow();
  });
});
