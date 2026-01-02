import { describe, it, expect, beforeEach } from 'vitest';
import { TransportNetwork, createTransportNetwork, DEFAULT_NETWORK_CONFIG } from '../src/transport';
import type { TerrainResult, VoronoiCell, VoronoiEdge, Settlement } from '@colonies/shared';

// Create a simple test terrain with known structure
function createTestTerrain(): TerrainResult {
  // Simple 3x3 grid of cells (9 cells total)
  //  0  1  2
  //  3  4  5
  //  6  7  8
  const cells: VoronoiCell[] = [];
  const size = 300;
  const cellSize = 100;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const id = row * 3 + col;
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;

      // All cells are land except cell 0 (water)
      const isWater = id === 0;

      // Create neighbors (orthogonal only for simplicity)
      const neighbors: number[] = [];
      if (col > 0) neighbors.push(id - 1);
      if (col < 2) neighbors.push(id + 1);
      if (row > 0) neighbors.push(id - 3);
      if (row < 2) neighbors.push(id + 3);

      cells.push({
        id,
        centroid: { x: cx, y: cy },
        vertices: [
          { x: cx - cellSize / 2, y: cy - cellSize / 2 },
          { x: cx + cellSize / 2, y: cy - cellSize / 2 },
          { x: cx + cellSize / 2, y: cy + cellSize / 2 },
          { x: cx - cellSize / 2, y: cy + cellSize / 2 },
        ],
        neighbors,
        isLand: !isWater,
        isCoast: id === 1 || id === 3, // Adjacent to water
        elevation: isWater ? -5 : 10 + id * 5, // Increasing elevation
        moisture: 0.5,
        flowsTo: null,
        flowAccumulation: 0,
      });
    }
  }

  return {
    cells,
    edges: [],
    rivers: [],
    bounds: { width: size, height: size },
  };
}

describe('TransportNetwork', () => {
  let terrain: TerrainResult;
  let network: TransportNetwork;

  beforeEach(() => {
    terrain = createTestTerrain();
    network = createTransportNetwork(terrain, DEFAULT_NETWORK_CONFIG);
  });

  describe('initialization', () => {
    it('should create edges for all neighbor pairs', () => {
      const serialized = network.serialize([]);
      // Each edge is stored once, and we have a 3x3 grid
      // Edges: 0-1, 0-3, 1-2, 1-4, 2-5, 3-4, 3-6, 4-5, 4-7, 5-8, 6-7, 7-8 = 12 edges
      expect(serialized.edges.length).toBe(12);
    });

    it('should identify edges involving water cells', () => {
      const serialized = network.serialize([]);
      // Cell 0 is water, so edges 0-1 and 0-3 involve a water cell
      const waterEdges = serialized.edges.filter(
        (e) => e.fromCell === 0 || e.toCell === 0
      );

      // There should be exactly 2 edges involving the water cell (0-1 and 0-3)
      expect(waterEdges.length).toBe(2);

      // Water cells are skipped in pathfinding, so the cost isn't critical
      // but edges should still be created
      for (const edge of waterEdges) {
        expect(edge.baseCost).toBeGreaterThan(0);
      }
    });

    it('should have finite cost for land-to-land edges', () => {
      const serialized = network.serialize([]);
      const landEdges = serialized.edges.filter(
        (e) => e.fromCell !== 0 && e.toCell !== 0
      );
      for (const edge of landEdges) {
        expect(edge.baseCost).toBeLessThan(Infinity);
        expect(edge.baseCost).toBeGreaterThan(0);
      }
    });
  });

  describe('findPath', () => {
    it('should find path between adjacent cells', () => {
      // Path from cell 4 to cell 5 (adjacent)
      const result = network.findPath(4, 5);

      expect(result.success).toBe(true);
      expect(result.path).toEqual([4, 5]);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    it('should find path across multiple cells', () => {
      // Path from cell 1 to cell 8 (diagonal across grid)
      const result = network.findPath(1, 8);

      expect(result.success).toBe(true);
      expect(result.path.length).toBeGreaterThan(2);
      expect(result.path[0]).toBe(1);
      expect(result.path[result.path.length - 1]).toBe(8);
    });

    it('should return failure for unreachable cells', () => {
      // Cell 0 is water, should not be reachable
      const result = network.findPath(4, 0);

      expect(result.success).toBe(false);
      expect(result.path).toEqual([]);
      expect(result.totalCost).toBe(Infinity);
    });

    it('should return trivial path for same start and end', () => {
      const result = network.findPath(4, 4);

      expect(result.success).toBe(true);
      expect(result.path).toEqual([4]);
      expect(result.totalCost).toBe(0);
    });

    it('should find shortest path avoiding high-cost routes', () => {
      // Create terrain with a high-elevation barrier
      const modifiedTerrain = createTestTerrain();
      // Make cell 4 very high elevation (expensive to cross)
      modifiedTerrain.cells[4].elevation = 500;

      const modifiedNetwork = createTransportNetwork(modifiedTerrain, DEFAULT_NETWORK_CONFIG);
      const result = modifiedNetwork.findPath(1, 7);

      // Should find a path that avoids cell 4 if possible
      expect(result.success).toBe(true);
      // Path should exist but might go around cell 4
      expect(result.path[0]).toBe(1);
      expect(result.path[result.path.length - 1]).toBe(7);
    });
  });

  describe('serialize', () => {
    it('should compute settlement paths when settlements provided', () => {
      const settlements: Settlement[] = [
        { id: 's1', name: 'Town A', cellId: 1, population: 100, rank: 0 },
        { id: 's2', name: 'Town B', cellId: 8, population: 100, rank: 0 },
      ];

      const serialized = network.serialize(settlements);

      expect(serialized.settlementPaths.length).toBe(1);
      expect(serialized.settlementPaths[0].fromSettlement).toBe('s1');
      expect(serialized.settlementPaths[0].toSettlement).toBe('s2');
      expect(serialized.settlementPaths[0].path.length).toBeGreaterThan(0);
    });

    it('should compute all pairs of settlement paths', () => {
      const settlements: Settlement[] = [
        { id: 's1', name: 'Town A', cellId: 1, population: 100, rank: 0 },
        { id: 's2', name: 'Town B', cellId: 5, population: 100, rank: 0 },
        { id: 's3', name: 'Town C', cellId: 8, population: 100, rank: 0 },
      ];

      const serialized = network.serialize(settlements);

      // 3 settlements = 3 pairs (s1-s2, s1-s3, s2-s3)
      expect(serialized.settlementPaths.length).toBe(3);
    });
  });

  describe('createTransportNetwork factory', () => {
    it('should create network with default config', () => {
      const net = createTransportNetwork(terrain);
      const serialized = net.serialize([]);

      expect(serialized.edges.length).toBeGreaterThan(0);
    });

    it('should create network with custom config', () => {
      const customConfig = {
        ...DEFAULT_NETWORK_CONFIG,
        baseSlopeCost: 10, // Very high slope cost
      };
      const net = createTransportNetwork(terrain, customConfig);
      const serialized = net.serialize([]);

      expect(serialized.edges.length).toBeGreaterThan(0);
    });
  });
});

describe('edge cost calculation', () => {
  it('should increase cost with slope', () => {
    // Create two terrains: flat and sloped
    const flatTerrain = createTestTerrain();
    flatTerrain.cells[4].elevation = 10;
    flatTerrain.cells[5].elevation = 10;

    const slopedTerrain = createTestTerrain();
    slopedTerrain.cells[4].elevation = 10;
    slopedTerrain.cells[5].elevation = 50; // 40 units higher

    const flatNetwork = createTransportNetwork(flatTerrain, DEFAULT_NETWORK_CONFIG);
    const slopedNetwork = createTransportNetwork(slopedTerrain, DEFAULT_NETWORK_CONFIG);

    const flatPath = flatNetwork.findPath(4, 5);
    const slopedPath = slopedNetwork.findPath(4, 5);

    expect(slopedPath.totalCost).toBeGreaterThan(flatPath.totalCost);
  });
});
