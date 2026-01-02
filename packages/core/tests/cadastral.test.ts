import { describe, it, expect, beforeEach } from 'vitest';
import { CadastralManager } from '../src/cadastral.js';
import {
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonBounds,
  generatePointsInPolygon,
  isConvex,
} from '../src/polygon-utils.js';
import { SeededRNG } from '../src/rng.js';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import { DEFAULT_CONFIG } from '@colonies/shared';
import type { Point, VoronoiTerrainData } from '@colonies/shared';

describe('Polygon Utilities', () => {
  describe('pointInPolygon', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it('returns true for point inside square', () => {
      expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    });

    it('returns false for point outside square', () => {
      expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
      expect(pointInPolygon({ x: -5, y: 5 }, square)).toBe(false);
    });

    it('handles concave polygon', () => {
      // L-shaped polygon
      const lShape: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        { x: 0, y: 10 },
      ];

      expect(pointInPolygon({ x: 2, y: 2 }, lShape)).toBe(true);
      expect(pointInPolygon({ x: 7, y: 2 }, lShape)).toBe(true);
      expect(pointInPolygon({ x: 7, y: 7 }, lShape)).toBe(false); // In the cut-out
    });

    it('returns false for empty polygon', () => {
      expect(pointInPolygon({ x: 5, y: 5 }, [])).toBe(false);
    });
  });

  describe('polygonArea', () => {
    it('calculates area of square', () => {
      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      expect(polygonArea(square)).toBe(100);
    });

    it('calculates area of triangle', () => {
      const triangle: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];
      expect(polygonArea(triangle)).toBe(50);
    });

    it('returns 0 for degenerate polygon', () => {
      expect(polygonArea([])).toBe(0);
      expect(polygonArea([{ x: 0, y: 0 }])).toBe(0);
      expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
    });
  });

  describe('polygonCentroid', () => {
    it('finds centroid of square', () => {
      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const centroid = polygonCentroid(square);
      expect(centroid.x).toBeCloseTo(5);
      expect(centroid.y).toBeCloseTo(5);
    });

    it('handles single point', () => {
      const centroid = polygonCentroid([{ x: 5, y: 7 }]);
      expect(centroid.x).toBe(5);
      expect(centroid.y).toBe(7);
    });
  });

  describe('polygonBounds', () => {
    it('calculates bounding box', () => {
      const polygon: Point[] = [
        { x: 2, y: 3 },
        { x: 10, y: 5 },
        { x: 6, y: 12 },
      ];
      const bounds = polygonBounds(polygon);
      expect(bounds.minX).toBe(2);
      expect(bounds.minY).toBe(3);
      expect(bounds.maxX).toBe(10);
      expect(bounds.maxY).toBe(12);
    });
  });

  describe('generatePointsInPolygon', () => {
    it('generates points inside polygon', () => {
      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const rng = new SeededRNG(12345);
      const points = generatePointsInPolygon(square, 10, rng);

      expect(points.length).toBe(10);
      for (const p of points) {
        expect(pointInPolygon(p, square)).toBe(true);
      }
    });

    it('returns empty array for zero count', () => {
      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const rng = new SeededRNG(12345);
      expect(generatePointsInPolygon(square, 0, rng)).toHaveLength(0);
    });
  });

  describe('isConvex', () => {
    it('returns true for convex square', () => {
      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      expect(isConvex(square)).toBe(true);
    });

    it('returns false for concave L-shape', () => {
      const lShape: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        { x: 0, y: 10 },
      ];
      expect(isConvex(lShape)).toBe(false);
    });
  });
});

describe('CadastralManager', () => {
  describe('with Voronoi terrain', () => {
    let terrain: VoronoiTerrainData;
    let rng: SeededRNG;

    beforeEach(() => {
      const config = {
        ...DEFAULT_CONFIG,
        mapSize: 200,
        voronoiCellCount: 100,
        voronoiRelaxation: 1,
      };
      const gen = new VoronoiWorldGenerator(config);
      terrain = gen.generateTerrain();
      rng = new SeededRNG(12345);
    });

    it('subdivides Voronoi cell into multiple parcels', () => {
      const manager = new CadastralManager(terrain, rng);

      // Find a land cell with enough area
      const landCell = terrain.cells.find((c) => c.isLand && c.vertices.length >= 3);
      expect(landCell).toBeDefined();

      const parcels = manager.subdivideCell(landCell!.id);
      expect(parcels.length).toBeGreaterThanOrEqual(1);

      for (const parcel of parcels) {
        expect(parcel.terrainCellId).toBe(landCell!.id);
        expect(parcel.vertices.length).toBeGreaterThanOrEqual(3);
        expect(parcel.area).toBeGreaterThan(0);
      }
    });

    it('returns empty array for water cells', () => {
      const manager = new CadastralManager(terrain, rng);

      const waterCell = terrain.cells.find((c) => !c.isLand);
      if (waterCell) {
        const parcels = manager.subdivideCell(waterCell.id);
        expect(parcels).toHaveLength(0);
      }
    });
  });

  describe('spatial queries', () => {
    let terrain: VoronoiTerrainData;
    let manager: CadastralManager;

    beforeEach(() => {
      const config = {
        ...DEFAULT_CONFIG,
        mapSize: 200,
        voronoiCellCount: 100,
        voronoiRelaxation: 1,
      };
      const gen = new VoronoiWorldGenerator(config);
      terrain = gen.generateTerrain();
      const rng = new SeededRNG(12345);
      manager = new CadastralManager(terrain, rng);

      // Subdivide a few land cells
      const landCells = terrain.cells.filter((c) => c.isLand).slice(0, 3);
      for (const cell of landCells) {
        manager.subdivideCell(cell.id);
      }
    });

    it('finds parcel at point', () => {
      const parcels = manager.getAllParcels();
      expect(parcels.length).toBeGreaterThan(0);

      // Check that we can find each parcel by its centroid
      for (const parcel of parcels) {
        const found = manager.findParcelAt(parcel.centroid);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(parcel.id);
      }
    });

    it('returns null for point outside all parcels', () => {
      // Point far outside the map
      const found = manager.findParcelAt({ x: -1000, y: -1000 });
      expect(found).toBeNull();
    });
  });

  describe('land use and ownership', () => {
    let manager: CadastralManager;

    beforeEach(() => {
      const config = {
        ...DEFAULT_CONFIG,
        mapSize: 200,
        voronoiCellCount: 100,
        voronoiRelaxation: 1,
      };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const rng = new SeededRNG(12345);
      manager = new CadastralManager(terrain, rng);

      // Subdivide a land cell
      const landCell = terrain.cells.find((c) => c.isLand);
      if (landCell) {
        manager.subdivideCell(landCell.id);
      }
    });

    it('updates land use', () => {
      const parcels = manager.getAllParcels();
      expect(parcels.length).toBeGreaterThan(0);

      const parcel = parcels[0];
      expect(parcel.landUse).toBe('wilderness');

      manager.setLandUse(parcel.id, 'residential');
      expect(manager.getParcel(parcel.id)!.landUse).toBe('residential');
    });

    it('updates owner', () => {
      const parcels = manager.getAllParcels();
      expect(parcels.length).toBeGreaterThan(0);

      const parcel = parcels[0];
      expect(parcel.owner).toBeNull();

      manager.setOwner(parcel.id, 'settler-1');
      expect(manager.getParcel(parcel.id)!.owner).toBe('settler-1');
    });

    it('finds parcels by land use', () => {
      const parcels = manager.getAllParcels();
      if (parcels.length >= 2) {
        manager.setLandUse(parcels[0].id, 'field');
        manager.setLandUse(parcels[1].id, 'field');

        const fields = manager.findByLandUse('field');
        expect(fields.length).toBe(2);
      }
    });

    it('finds unclaimed parcels', () => {
      const parcels = manager.getAllParcels();
      const allUnclaimed = manager.findUnclaimed();
      expect(allUnclaimed.length).toBe(parcels.length);

      if (parcels.length > 0) {
        manager.setOwner(parcels[0].id, 'someone');
        expect(manager.findUnclaimed().length).toBe(parcels.length - 1);
      }
    });
  });

  describe('statistics', () => {
    it('reports correct stats', () => {
      const config = {
        ...DEFAULT_CONFIG,
        mapSize: 200,
        voronoiCellCount: 100,
        voronoiRelaxation: 1,
      };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const rng = new SeededRNG(12345);
      const manager = new CadastralManager(terrain, rng);

      // Initially empty
      let stats = manager.getStats();
      expect(stats.totalParcels).toBe(0);
      expect(stats.subdividedCells).toBe(0);

      // Subdivide some cells
      const landCells = terrain.cells.filter((c) => c.isLand).slice(0, 2);
      for (const cell of landCells) {
        manager.subdivideCell(cell.id);
      }

      stats = manager.getStats();
      expect(stats.totalParcels).toBeGreaterThan(0);
      expect(stats.subdividedCells).toBe(landCells.length);
      expect(stats.byLandUse.wilderness).toBe(stats.totalParcels);
    });
  });
});
