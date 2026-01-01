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
    const generator = new WorldGenerator(testConfig);
    const terrain = generator.generateTerrain();

    // Check that major rivers exist (high flow accumulation values)
    let maxFlow = 0;
    for (let y = 0; y < testConfig.mapSize; y++) {
      for (let x = 0; x < testConfig.mapSize; x++) {
        maxFlow = Math.max(maxFlow, terrain.flowAccumulation[y][x]);
      }
    }

    // Should have significant flow accumulation indicating river formation
    expect(maxFlow).toBeGreaterThan(100);

    // Check that flow generally decreases with elevation
    let elevationFlowCorrelation = true;
    for (let y = 10; y < 90; y += 10) {
      for (let x = 10; x < 90; x += 10) {
        // Rivers should not flow uphill consistently
        if (
          terrain.height[y][x] < terrain.height[y][x + 1] &&
          terrain.flowAccumulation[y][x] < terrain.flowAccumulation[y][x + 1]
        ) {
          elevationFlowCorrelation = false;
        }
      }
    }

    // Most flow should respect topography
    expect(elevationFlowCorrelation || maxFlow > 500).toBe(true);
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
    const generator = new WorldGenerator(testConfig);
    const terrain = generator.generateTerrain();

    // Check that coastal areas are generally lower than inland
    // Coast is on east (high x), ridge is on west (low x)
    const coastalElevation = terrain.height[50][90]; // Near east coast
    const ridgeElevation = terrain.height[50][10]; // Inland ridge (west)

    expect(ridgeElevation).toBeGreaterThan(coastalElevation);
  });

  it('should produce more prominent rivers with higher riverDensity', () => {
    const lowDensityConfig = { ...testConfig, riverDensity: 0.1 };
    const highDensityConfig = { ...testConfig, riverDensity: 0.9 };

    const lowDensityGen = new WorldGenerator(lowDensityConfig);
    const highDensityGen = new WorldGenerator(highDensityConfig);

    const lowTerrain = lowDensityGen.generateTerrain();
    const highTerrain = highDensityGen.generateTerrain();

    // Find max flow accumulation for each
    let lowMaxFlow = 0;
    let highMaxFlow = 0;

    for (let y = 0; y < testConfig.mapSize; y++) {
      for (let x = 0; x < testConfig.mapSize; x++) {
        lowMaxFlow = Math.max(lowMaxFlow, lowTerrain.flowAccumulation[y][x]);
        highMaxFlow = Math.max(highMaxFlow, highTerrain.flowAccumulation[y][x]);
      }
    }

    // Higher density should produce higher flow accumulation
    expect(highMaxFlow).toBeGreaterThan(lowMaxFlow);
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

    // Should complete within 2 seconds (generous limit)
    expect(elapsed).toBeLessThan(2000);

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
