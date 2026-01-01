import { describe, it, expect, beforeEach } from 'vitest';
import { TransportNetwork } from '../src/transport.js';
import { WorldGenerator } from '../src/worldgen.js';
import type { NetworkEdge, WorldConfig, TerrainData } from '@colonies/shared';

describe('TransportNetwork', () => {
  let config: WorldConfig;
  let terrain: TerrainData;
  let network: TransportNetwork;

  // Use a small map for faster tests
  const testConfig: WorldConfig = {
    seed: 12345,
    mapSize: 100,
    ridgeOrientation: 45,
    riverDensity: 0.5,
    coastalPlainWidth: 0.3,
    ridgeHeight: 200,
    noiseScale: 0.01,
    // Transport config
    baseSlopeCost: 0.1,
    waterCost: 100,
    riverCrossingPenalty: 10,
    trailToRoadThreshold: 100,
    roadToTurnpikeThreshold: 500,
    ferryToBridgeThreshold: 200,
    minRiverFlowForCrossing: 50,
    maxBridgeWidth: 5,
  };

  beforeEach(() => {
    config = testConfig;
    const generator = new WorldGenerator(config);
    terrain = generator.generateTerrain();
    network = new TransportNetwork(config, terrain);
  });

  describe('Initialization', () => {
    it('should create a TransportNetwork instance', () => {
      expect(network).toBeDefined();
    });

    it('should build cost field on construction', () => {
      const costField = network.getCostField();
      expect(costField).toBeDefined();
      expect(costField.cost.length).toBe(config.mapSize);
      expect(costField.isWater.length).toBe(config.mapSize);
      expect(costField.isRiver.length).toBe(config.mapSize);
    });
  });

  describe('Cost Field', () => {
    it('should assign higher cost to water cells', () => {
      const costField = network.getCostField();
      const waterCost = config.waterCost ?? 100;

      // Find any water cell in the map
      let foundWaterCell = false;
      for (let y = 0; y < config.mapSize && !foundWaterCell; y++) {
        for (let x = 0; x < config.mapSize && !foundWaterCell; x++) {
          if (costField.isWater[y][x]) {
            expect(costField.cost[y][x]).toBe(waterCost);
            foundWaterCell = true;
          }
        }
      }
      // Water should exist somewhere on the map
      expect(foundWaterCell).toBe(true);
    });

    it('should assign lower cost to flat land', () => {
      const costField = network.getCostField();

      // Find a land cell that's not a river
      for (let y = 50; y < 60; y++) {
        for (let x = 60; x < 70; x++) {
          if (!costField.isWater[y][x] && !costField.isRiver[y][x]) {
            // Base cost should be close to 1.0 for flat land
            expect(costField.cost[y][x]).toBeGreaterThanOrEqual(1.0);
            expect(costField.cost[y][x]).toBeLessThan(50); // Much less than water
            return;
          }
        }
      }
    });

    it('should detect river cells from flow accumulation', () => {
      const costField = network.getCostField();
      const minFlow = config.minRiverFlowForCrossing ?? 50;

      // Check that river detection matches flow accumulation
      for (let y = 0; y < config.mapSize; y++) {
        for (let x = 0; x < config.mapSize; x++) {
          const flow = terrain.flowAccumulation[y][x];
          const height = terrain.height[y][x];
          const expectedRiver = flow >= minFlow && height > 0;
          expect(costField.isRiver[y][x]).toBe(expectedRiver);
        }
      }
    });
  });

  describe('A* Pathfinding', () => {
    it('should find path between two land points', () => {
      // Find two valid land points
      const from = { x: 60, y: 50 };
      const to = { x: 80, y: 50 };

      const result = network.findPath(from, to);

      expect(result.success).toBe(true);
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.path[0]).toEqual(from);
      expect(result.path[result.path.length - 1]).toEqual(to);
    });

    it('should return failed result for invalid coordinates', () => {
      const from = { x: -1, y: 0 };
      const to = { x: 50, y: 50 };

      const result = network.findPath(from, to);

      expect(result.success).toBe(false);
      expect(result.path.length).toBe(0);
    });

    it('should find path with finite cost', () => {
      const from = { x: 60, y: 50 };
      const to = { x: 70, y: 60 };

      const result = network.findPath(from, to);

      expect(result.success).toBe(true);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.totalCost).toBeLessThan(Infinity);
    });

    it('should find near-optimal path avoiding water', () => {
      // Path should be longer than straight line if it avoids water
      const from = { x: 60, y: 30 };
      const to = { x: 60, y: 70 };

      const result = network.findPath(from, to);

      expect(result.success).toBe(true);
      // Path length should be at least the straight line distance
      const directDist = Math.abs(to.y - from.y);
      expect(result.path.length).toBeGreaterThanOrEqual(directDist);
    });
  });

  describe('Edge Management', () => {
    it('should add and retrieve edges', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'trail',
        cost: 10.0,
        usage: 0,
        crossings: [],
      };

      network.addEdge(edge);
      const edges = network.getEdges();

      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('test-edge');
    });

    it('should update usage on edges', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'trail',
        cost: 10.0,
        usage: 0,
        crossings: [],
      };

      network.addEdge(edge);
      network.updateUsage('test-edge', 50);

      const edges = network.getEdges();
      expect(edges[0].usage).toBe(50);
    });
  });

  describe('Edge Upgrades', () => {
    it('should upgrade trail to road at threshold', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'trail',
        cost: 10.0,
        usage: 0,
        crossings: [],
      };

      network.addEdge(edge);
      network.updateUsage('test-edge', 100);
      network.processUpgrades();

      const edges = network.getEdges();
      expect(edges[0].type).toBe('road');
    });

    it('should upgrade road to turnpike at threshold', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'road',
        cost: 5.0,
        usage: 0,
        crossings: [],
      };

      network.addEdge(edge);
      network.updateUsage('test-edge', 500);
      network.processUpgrades();

      const edges = network.getEdges();
      expect(edges[0].type).toBe('turnpike');
    });

    it('should upgrade ferry to bridge at threshold', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'trail',
        cost: 10.0,
        usage: 0,
        crossings: [
          {
            id: 'crossing-0',
            position: { x: 65, y: 50 },
            riverWidth: 3,
            status: 'ferry',
            usage: 0,
          },
        ],
      };

      network.addEdge(edge);
      network.updateUsage('test-edge', 200);
      network.processUpgrades();

      const edges = network.getEdges();
      expect(edges[0].crossings[0].status).toBe('bridge');
    });

    it('should not upgrade ferry to bridge if river too wide', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'trail',
        cost: 10.0,
        usage: 0,
        crossings: [
          {
            id: 'crossing-0',
            position: { x: 65, y: 50 },
            riverWidth: 10, // Too wide for bridge
            status: 'ferry',
            usage: 0,
          },
        ],
      };

      network.addEdge(edge);
      network.updateUsage('test-edge', 200);
      network.processUpgrades();

      const edges = network.getEdges();
      expect(edges[0].crossings[0].status).toBe('ferry'); // Still ferry
    });
  });

  describe('River Crossing Detection', () => {
    it('should detect crossings when path traverses river cells', () => {
      // Create a path that crosses a river
      const costField = network.getCostField();

      // Find a river cell
      let riverPoint: { x: number; y: number } | null = null;
      for (let y = 30; y < 70 && !riverPoint; y++) {
        for (let x = 50; x < 80 && !riverPoint; x++) {
          if (costField.isRiver[y][x]) {
            riverPoint = { x, y };
          }
        }
      }

      if (riverPoint) {
        // Create path through river
        const path = [
          { x: riverPoint.x - 2, y: riverPoint.y },
          { x: riverPoint.x - 1, y: riverPoint.y },
          riverPoint,
          { x: riverPoint.x + 1, y: riverPoint.y },
          { x: riverPoint.x + 2, y: riverPoint.y },
        ];

        const crossings = network.detectRiverCrossings(path);
        expect(crossings.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Usage Heatmap', () => {
    it('should generate heatmap from edge usage', () => {
      const edge: NetworkEdge = {
        id: 'test-edge',
        from: { x: 60, y: 50 },
        to: { x: 70, y: 50 },
        type: 'trail',
        cost: 10.0,
        usage: 100,
        crossings: [],
      };

      network.addEdge(edge);
      const heatmap = network.getUsageHeatmap();

      expect(heatmap[50][60]).toBe(100);
      expect(heatmap[50][70]).toBe(100);
    });
  });

  describe('Performance', () => {
    it('should find path on 100x100 map in reasonable time', () => {
      const from = { x: 60, y: 20 };
      const to = { x: 60, y: 80 };

      const start = Date.now();
      const result = network.findPath(from, to);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
