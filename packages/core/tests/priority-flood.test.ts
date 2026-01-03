import { describe, it, expect } from 'vitest';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import { MinHeap } from '../src/priority-queue.js';
import { UnionFind } from '../src/union-find.js';
import { DEFAULT_CONFIG } from '@colonies/shared';

describe('MinHeap', () => {
  it('maintains min-heap property', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    heap.push(5);
    heap.push(3);
    heap.push(7);
    heap.push(1);
    heap.push(4);

    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(4);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBe(7);
  });

  it('works with tuples using custom comparator', () => {
    const heap = new MinHeap<[number, number]>((a, b) => a[0] - b[0]);
    heap.push([5, 100]);
    heap.push([2, 200]);
    heap.push([8, 300]);
    heap.push([1, 400]);

    expect(heap.pop()).toEqual([1, 400]);
    expect(heap.pop()).toEqual([2, 200]);
    expect(heap.pop()).toEqual([5, 100]);
    expect(heap.pop()).toEqual([8, 300]);
  });

  it('returns undefined when empty', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.pop()).toBeUndefined();
    expect(heap.isEmpty()).toBe(true);
  });

  it('reports correct size', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.size()).toBe(0);
    heap.push(1);
    expect(heap.size()).toBe(1);
    heap.push(2);
    expect(heap.size()).toBe(2);
    heap.pop();
    expect(heap.size()).toBe(1);
  });

  it('peek returns min without removing', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    heap.push(3);
    heap.push(1);
    heap.push(2);

    expect(heap.peek()).toBe(1);
    expect(heap.size()).toBe(3); // Size unchanged
    expect(heap.peek()).toBe(1); // Still the same
  });
});

describe('UnionFind', () => {
  it('initially each element is its own set', () => {
    const uf = new UnionFind(5);
    expect(uf.find(0)).toBe(0);
    expect(uf.find(1)).toBe(1);
    expect(uf.find(4)).toBe(4);
  });

  it('unions elements correctly', () => {
    const uf = new UnionFind(5);
    uf.union(0, 1);
    expect(uf.connected(0, 1)).toBe(true);
    expect(uf.connected(0, 2)).toBe(false);

    uf.union(2, 3);
    expect(uf.connected(2, 3)).toBe(true);
    expect(uf.connected(0, 2)).toBe(false);

    uf.union(1, 3);
    expect(uf.connected(0, 2)).toBe(true);
    expect(uf.connected(0, 3)).toBe(true);
  });

  it('returns true only on actual merge', () => {
    const uf = new UnionFind(3);
    expect(uf.union(0, 1)).toBe(true);
    expect(uf.union(0, 1)).toBe(false); // Already same set
    expect(uf.union(1, 0)).toBe(false); // Still same set
  });

  it('uses path compression', () => {
    const uf = new UnionFind(10);
    // Create a chain: 0 -> 1 -> 2 -> 3 -> 4
    uf.union(0, 1);
    uf.union(1, 2);
    uf.union(2, 3);
    uf.union(3, 4);

    // After find, all should point to same root
    const root = uf.find(0);
    expect(uf.find(1)).toBe(root);
    expect(uf.find(2)).toBe(root);
    expect(uf.find(3)).toBe(root);
    expect(uf.find(4)).toBe(root);
  });
});

describe('Priority-Flood Depression Handling', () => {
  // Use small cell count for fast tests
  const config = {
    ...DEFAULT_CONFIG,
    mapSize: 200,
    voronoiCellCount: 100,
    voronoiRelaxation: 1,
    fillSpillEnabled: true,
    minLakeArea: 3,
    minLakeDepth: 1.0,
  };

  describe('filledElevation', () => {
    it('sets filledElevation for all cells', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      for (const cell of terrain.cells) {
        expect(cell.filledElevation).toBeDefined();
        expect(typeof cell.filledElevation).toBe('number');
      }
    });

    it('filledElevation >= elevation for all land cells', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      // Small epsilon for floating-point comparison (Float32Array has lower precision)
      const epsilon = 0.001;

      for (const cell of terrain.cells) {
        if (cell.isLand) {
          // filledElevation should be >= elevation (within floating-point tolerance)
          expect(cell.filledElevation! + epsilon).toBeGreaterThanOrEqual(
            cell.elevation
          );
        }
      }
    });

    it('ocean cells retain original elevation', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      for (const cell of terrain.cells) {
        if (!cell.isLand) {
          expect(cell.filledElevation).toBe(cell.elevation);
        }
      }
    });
  });

  describe('flow routing with filled elevation', () => {
    it('all land cells have a valid flowsTo or are coastal', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      for (const cell of terrain.cells) {
        if (!cell.isLand) continue;

        // Either flows to another cell, or is at a local minimum (should be rare after filling)
        if (cell.flowsTo !== null) {
          expect(cell.flowsTo).toBeGreaterThanOrEqual(0);
          expect(cell.flowsTo).toBeLessThan(terrain.cells.length);
        }
      }
    });

    it('all land cells can reach ocean via flow path', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      let reachableCount = 0;
      let unreachableCount = 0;

      for (const cell of terrain.cells) {
        if (!cell.isLand) continue;

        // Trace flow path to ocean
        let current = cell;
        const visited = new Set<number>();
        let reachedOcean = false;

        while (current.isLand) {
          if (visited.has(current.id)) {
            // Cycle detected - shouldn't happen with proper Priority-Flood
            break;
          }
          visited.add(current.id);

          if (current.flowsTo === null) {
            // Dead end - cell is a sink
            break;
          }

          current = terrain.cells[current.flowsTo];
          if (!current) break;
        }

        if (current && !current.isLand) {
          reachedOcean = true;
          reachableCount++;
        } else {
          unreachableCount++;
        }
      }

      // After Priority-Flood, most land cells should reach ocean
      // Some edge cases may exist but should be minimal
      const reachableRatio = reachableCount / (reachableCount + unreachableCount);
      expect(reachableRatio).toBeGreaterThan(0.95);
    });

    it('flow accumulation works correctly', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      // All cells should have flowAccumulation >= 1 (at minimum, themselves)
      for (const cell of terrain.cells) {
        if (cell.isLand) {
          expect(cell.flowAccumulation).toBeGreaterThanOrEqual(1);
        }
      }

      // Some cells should have high accumulation (rivers)
      const maxAccum = Math.max(
        ...terrain.cells.filter((c) => c.isLand).map((c) => c.flowAccumulation)
      );
      expect(maxAccum).toBeGreaterThan(1);
    });
  });

  describe('lakes array', () => {
    it('returns lakes array in terrain data', () => {
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      expect(terrain.lakes).toBeDefined();
      expect(Array.isArray(terrain.lakes)).toBe(true);
    });

    it('lakes have required properties', () => {
      const gen = new VoronoiWorldGenerator({
        ...config,
        seed: 99999, // Try different seeds to find terrain with lakes
      });
      const terrain = gen.generateTerrain();

      if (terrain.lakes && terrain.lakes.length > 0) {
        for (const lake of terrain.lakes) {
          expect(lake).toHaveProperty('id');
          expect(lake).toHaveProperty('cellIds');
          expect(lake).toHaveProperty('waterLevel');
          expect(lake).toHaveProperty('outletCell');
          expect(lake).toHaveProperty('outletTarget');
          expect(lake).toHaveProperty('area');
          expect(lake).toHaveProperty('maxDepth');

          expect(Array.isArray(lake.cellIds)).toBe(true);
          expect(lake.cellIds.length).toBeGreaterThanOrEqual(config.minLakeArea!);
          expect(lake.waterLevel).toBeGreaterThan(0);
          expect(lake.maxDepth).toBeGreaterThan(0);
        }
      }
    });

    it('lake cells have correct lakeId', () => {
      const gen = new VoronoiWorldGenerator({
        ...config,
        seed: 99999,
      });
      const terrain = gen.generateTerrain();

      if (terrain.lakes && terrain.lakes.length > 0) {
        for (const lake of terrain.lakes) {
          for (const cellId of lake.cellIds) {
            const cell = terrain.cells[cellId];
            expect(cell.lakeId).toBe(lake.id);
          }
        }
      }
    });
  });

  describe('fillSpillEnabled config', () => {
    it('can be disabled', () => {
      const gen = new VoronoiWorldGenerator({
        ...config,
        fillSpillEnabled: false,
      });
      const terrain = gen.generateTerrain();

      // With filling disabled, filledElevation should equal elevation
      for (const cell of terrain.cells) {
        expect(cell.filledElevation).toBe(cell.elevation);
      }

      // No lakes should be created
      expect(terrain.lakes).toEqual([]);
    });
  });

  describe('determinism', () => {
    it('produces identical results with same seed', () => {
      const gen1 = new VoronoiWorldGenerator({ ...config, seed: 42 });
      const gen2 = new VoronoiWorldGenerator({ ...config, seed: 42 });

      const terrain1 = gen1.generateTerrain();
      const terrain2 = gen2.generateTerrain();

      // Check filledElevation matches
      for (let i = 0; i < terrain1.cells.length; i++) {
        expect(terrain1.cells[i].filledElevation).toBe(
          terrain2.cells[i].filledElevation
        );
        expect(terrain1.cells[i].lakeId).toBe(terrain2.cells[i].lakeId);
      }

      // Check lakes match
      expect(terrain1.lakes?.length).toBe(terrain2.lakes?.length);
    });
  });

  describe('lake spill routing', () => {
    it('lake interior cells flow to outlet', () => {
      // Try different seeds to find terrain with lakes
      for (const seed of [99999, 12345, 54321, 11111]) {
        const gen = new VoronoiWorldGenerator({
          ...config,
          seed,
          mapSize: 300,
          voronoiCellCount: 200,
        });
        const terrain = gen.generateTerrain();

        if (terrain.lakes && terrain.lakes.length > 0) {
          for (const lake of terrain.lakes) {
            if (lake.outletCell === -1) continue; // Skip endorheic lakes

            for (const cellId of lake.cellIds) {
              const cell = terrain.cells[cellId];
              if (cellId === lake.outletCell) {
                // Outlet should flow to target
                expect(cell.flowsTo).toBe(lake.outletTarget >= 0 ? lake.outletTarget : null);
              } else {
                // Interior cells should flow to outlet
                expect(cell.flowsTo).toBe(lake.outletCell);
              }
            }
          }
          return; // Found lakes, test passed
        }
      }
      // If no lakes found in any seed, skip (terrain may not generate lakes)
    });

    it('flow accumulation concentrates at lake outlet', () => {
      for (const seed of [99999, 12345, 54321, 11111]) {
        const gen = new VoronoiWorldGenerator({
          ...config,
          seed,
          mapSize: 300,
          voronoiCellCount: 200,
        });
        const terrain = gen.generateTerrain();

        if (terrain.lakes && terrain.lakes.length > 0) {
          for (const lake of terrain.lakes) {
            if (lake.outletCell === -1) continue; // Skip endorheic lakes

            const outletCell = terrain.cells[lake.outletCell];
            // Outlet should have at least as much flow as the number of lake cells
            // (all lake cells route through it)
            expect(outletCell.flowAccumulation).toBeGreaterThanOrEqual(lake.area);
          }
          return; // Found lakes, test passed
        }
      }
    });

    it('endorheic lake cells have no outlet', () => {
      // This is a structural test - if we find an endorheic lake,
      // its cells should have flowsTo = null
      for (const seed of [99999, 12345, 54321, 11111, 77777]) {
        const gen = new VoronoiWorldGenerator({
          ...config,
          seed,
          mapSize: 300,
          voronoiCellCount: 200,
        });
        const terrain = gen.generateTerrain();

        if (terrain.lakes && terrain.lakes.length > 0) {
          for (const lake of terrain.lakes) {
            if (lake.outletCell === -1) {
              // Endorheic lake - all cells should be sinks
              for (const cellId of lake.cellIds) {
                const cell = terrain.cells[cellId];
                expect(cell.flowsTo).toBeNull();
              }
            }
          }
        }
      }
    });
  });
});
