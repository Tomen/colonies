import { describe, it, expect } from 'vitest';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import { DEFAULT_CONFIG } from '@colonies/shared';

describe('VoronoiWorldGenerator', () => {
  // Use small cell count for fast tests
  const config = {
    ...DEFAULT_CONFIG,
    mapSize: 200,
    voronoiCellCount: 100,
    voronoiRelaxation: 1,
  };

  describe('generateTerrain', () => {
    it('returns VoronoiTerrainData with type discriminator', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      expect(terrain.type).toBe('voronoi');
    });

    it('generates cells with required properties', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      expect(terrain.cells.length).toBeGreaterThan(0);
      const cell = terrain.cells[0];
      expect(cell).toHaveProperty('id');
      expect(cell).toHaveProperty('centroid');
      expect(cell).toHaveProperty('vertices');
      expect(cell).toHaveProperty('neighbors');
      expect(cell).toHaveProperty('elevation');
      expect(cell).toHaveProperty('moisture');
      expect(cell).toHaveProperty('isLand');
      expect(cell).toHaveProperty('isCoast');
    });

    it('generates both land and ocean cells', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      const landCells = terrain.cells.filter((c) => c.isLand);
      const oceanCells = terrain.cells.filter((c) => !c.isLand);

      expect(landCells.length).toBeGreaterThan(0);
      expect(oceanCells.length).toBeGreaterThan(0);
    });

    it('marks coastal cells correctly', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      const coastalCells = terrain.cells.filter((c) => c.isCoast);
      expect(coastalCells.length).toBeGreaterThan(0);

      // Coastal cells should be land cells with at least one ocean neighbor
      for (const cell of coastalCells) {
        expect(cell.isLand).toBe(true);
        const hasOceanNeighbor = cell.neighbors.some(
          (n) => !terrain.cells[n]?.isLand
        );
        expect(hasOceanNeighbor).toBe(true);
      }
    });

    it('computes elevation based on distance from ocean', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      // Ocean cells should have negative elevation
      const oceanCells = terrain.cells.filter((c) => !c.isLand);
      for (const cell of oceanCells) {
        expect(cell.elevation).toBeLessThan(0);
      }

      // Land cells should have non-negative elevation
      const landCells = terrain.cells.filter((c) => c.isLand);
      for (const cell of landCells) {
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
      }
    });

    it('generates edges including potential rivers', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      expect(terrain.edges.length).toBeGreaterThan(0);
      // Rivers may or may not exist depending on terrain shape
      expect(Array.isArray(terrain.rivers)).toBe(true);
    });

    it('is deterministic with same seed', () => {
      const gen1 = new VoronoiWorldGenerator({ ...config, seed: 42 });
      const gen2 = new VoronoiWorldGenerator({ ...config, seed: 42 });

      const terrain1 = gen1.generateTerrain();
      const terrain2 = gen2.generateTerrain();

      expect(terrain1.cells.length).toBe(terrain2.cells.length);
      expect(terrain1.cells[0].centroid.x).toBe(terrain2.cells[0].centroid.x);
      expect(terrain1.cells[0].elevation).toBe(terrain2.cells[0].elevation);
    });

    it('produces different results with different seeds', () => {
      const gen1 = new VoronoiWorldGenerator({ ...config, seed: 1 });
      const gen2 = new VoronoiWorldGenerator({ ...config, seed: 2 });

      const terrain1 = gen1.generateTerrain();
      const terrain2 = gen2.generateTerrain();

      // Different seeds should produce different centroids
      const differentCentroids = terrain1.cells.some(
        (c, i) => c.centroid.x !== terrain2.cells[i]?.centroid.x
      );
      expect(differentCentroids).toBe(true);
    });

    it('generates correct bounds', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      expect(terrain.bounds.width).toBe(config.mapSize);
      expect(terrain.bounds.height).toBe(config.mapSize);
    });

    it('generates cells with valid neighbors', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      for (const cell of terrain.cells) {
        expect(cell.neighbors.length).toBeGreaterThan(0);
        // All neighbor IDs should reference existing cells
        for (const neighborId of cell.neighbors) {
          expect(neighborId).toBeGreaterThanOrEqual(0);
          expect(neighborId).toBeLessThan(terrain.cells.length);
        }
      }
    });

    it('generates cells with valid vertices', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      for (const cell of terrain.cells) {
        expect(cell.vertices.length).toBeGreaterThanOrEqual(3); // Polygon needs at least 3 vertices
        for (const v of cell.vertices) {
          expect(v.x).toBeGreaterThanOrEqual(0);
          expect(v.x).toBeLessThanOrEqual(config.mapSize);
          expect(v.y).toBeGreaterThanOrEqual(0);
          expect(v.y).toBeLessThanOrEqual(config.mapSize);
        }
      }
    });
  });

  describe('findBestHarbor', () => {
    it('returns a valid point', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const harbor = gen.findBestHarbor(terrain);

      expect(harbor).toHaveProperty('x');
      expect(harbor).toHaveProperty('y');
      expect(harbor.x).toBeGreaterThanOrEqual(0);
      expect(harbor.y).toBeGreaterThanOrEqual(0);
    });

    it('returns a coastal point', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const harbor = gen.findBestHarbor(terrain);

      // Harbor should be near a coastal cell
      const coastalCells = terrain.cells.filter((c) => c.isCoast);
      const nearCoast = coastalCells.some(
        (c) =>
          Math.abs(c.centroid.x - harbor.x) < 50 &&
          Math.abs(c.centroid.y - harbor.y) < 50
      );
      expect(nearCoast).toBe(true);
    });
  });

  describe('performance', () => {
    it('generates 1000 cells within reasonable time', () => {
      const largeConfig = {
        ...config,
        mapSize: 500,
        voronoiCellCount: 1000,
        voronoiRelaxation: 2,
      };

      const gen = new VoronoiWorldGenerator(largeConfig);
      const startTime = Date.now();
      const terrain = gen.generateTerrain();
      const elapsed = Date.now() - startTime;

      expect(terrain.cells.length).toBeGreaterThan(900); // Some cells may be at boundary
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`Voronoi 1000 cells generation completed in ${elapsed}ms`);
    }, 10000);

    it('generates 10000 cells within reasonable time', () => {
      const largeConfig = {
        ...config,
        mapSize: 1000,
        voronoiCellCount: 10000,
        voronoiRelaxation: 2,
      };

      const gen = new VoronoiWorldGenerator(largeConfig);
      const startTime = Date.now();
      const terrain = gen.generateTerrain();
      const elapsed = Date.now() - startTime;

      expect(terrain.cells.length).toBeGreaterThan(9000); // Some cells may be at boundary
      expect(elapsed).toBeLessThan(10000); // Should complete within 10 seconds

      console.log(`Voronoi 10000 cells generation completed in ${elapsed}ms`);
    }, 15000);
  });
});
