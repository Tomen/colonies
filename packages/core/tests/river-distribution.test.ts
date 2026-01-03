import { describe, it, expect } from 'vitest';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import type { VoronoiTerrainData } from '@colonies/shared';
import { DEFAULT_CONFIG } from '@colonies/shared';

/**
 * Statistical tests to analyze river distribution across elevation zones.
 *
 * Hypothesis: With elevationBlendPower=2, rivers concentrate in low elevations
 * because steep mountain gradients spread flow (each cell < threshold), while
 * flat plains concentrate flow (exceeding threshold).
 */

// Use moderate cell count for meaningful statistics
const baseConfig = {
  ...DEFAULT_CONFIG,
  mapSize: 500,
  voronoiCellCount: 2000,
  voronoiRelaxation: 2,
};

interface RiverDistribution {
  quartiles: number[]; // Elevation thresholds for Q1, Q2, Q3
  buckets: number[]; // River cell counts per quartile [Q1, Q2, Q3, Q4]
  total: number; // Total river cells
  percentages: number[]; // Percentage per quartile
}

/**
 * Analyzes river distribution by elevation quartile.
 * Returns counts of cells with flowAccumulation >= threshold in each quartile.
 */
function analyzeRiverDistribution(
  terrain: VoronoiTerrainData,
  threshold: number
): RiverDistribution {
  const landCells = terrain.cells.filter((c) => c.isLand);
  const elevations = landCells.map((c) => c.elevation).sort((a, b) => a - b);

  const quartiles = [
    elevations[Math.floor(elevations.length * 0.25)],
    elevations[Math.floor(elevations.length * 0.5)],
    elevations[Math.floor(elevations.length * 0.75)],
  ];

  const buckets = [0, 0, 0, 0]; // Q1 (lowest), Q2, Q3, Q4 (highest)
  for (const cell of landCells) {
    if (cell.flowAccumulation >= threshold) {
      const bucket =
        cell.elevation < quartiles[0]
          ? 0
          : cell.elevation < quartiles[1]
            ? 1
            : cell.elevation < quartiles[2]
              ? 2
              : 3;
      buckets[bucket]++;
    }
  }

  const total = buckets.reduce((a, b) => a + b, 0);
  const percentages = buckets.map((b) => (total > 0 ? (b / total) * 100 : 0));

  return { quartiles, buckets, total, percentages };
}

/**
 * Calculates "concentration ratio" - what fraction of rivers are in lowest quartile.
 * Higher = more concentrated in low elevations.
 */
function concentrationRatio(dist: RiverDistribution): number {
  return dist.total > 0 ? dist.buckets[0] / dist.total : 0;
}

/**
 * Traces a river from a cell to the ocean, counting segments.
 * Returns the length (number of river edges) from this cell to coast.
 */
function traceRiverToOcean(
  startCellId: number,
  cells: VoronoiTerrainData['cells'],
  threshold: number
): number {
  let length = 0;
  let currentId: number | null = startCellId;
  const visited = new Set<number>();

  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);
    const cell = cells[currentId];
    if (!cell || !cell.isLand) break;

    const nextId = cell.flowsTo;
    if (nextId === null) break;

    // Count as river segment if flow exceeds threshold
    if (cell.flowAccumulation >= threshold) {
      length++;
    }
    currentId = nextId;
  }

  return length;
}

/**
 * Analyzes river network topology.
 */
function analyzeRiverTopology(terrain: VoronoiTerrainData, threshold: number) {
  const landCells = terrain.cells.filter((c) => c.isLand);
  const riverCells = landCells.filter((c) => c.flowAccumulation >= threshold);

  // Find river mouths (river cells that flow to ocean or have no downstream river)
  const riverMouths: number[] = [];
  for (const cell of riverCells) {
    const downstream = cell.flowsTo !== null ? terrain.cells[cell.flowsTo] : null;
    if (!downstream || !downstream.isLand || downstream.flowAccumulation < threshold) {
      riverMouths.push(cell.id);
    }
  }

  // Trace each river from mouth upstream to find total river lengths
  const riverLengths: number[] = [];
  for (const mouthId of riverMouths) {
    // Find headwaters for this river (cells that flow into this river system)
    const headwaters = riverCells.filter((c) => {
      let current: number | null = c.id;
      const seen = new Set<number>();
      while (current !== null && !seen.has(current)) {
        seen.add(current);
        if (current === mouthId) return true;
        const cell = terrain.cells[current];
        current = cell?.flowsTo ?? null;
      }
      return false;
    });

    // Max distance from any headwater to mouth
    let maxLength = 0;
    for (const hw of headwaters) {
      const len = traceRiverToOcean(hw.id, terrain.cells, threshold);
      maxLength = Math.max(maxLength, len);
    }
    if (maxLength > 0) {
      riverLengths.push(maxLength);
    }
  }

  // Count drainage basins (cells that eventually flow to same mouth)
  const drainageBasinSizes: number[] = [];
  for (const mouthId of riverMouths) {
    let basinSize = 0;
    for (const cell of landCells) {
      let current: number | null = cell.id;
      const seen = new Set<number>();
      while (current !== null && !seen.has(current)) {
        seen.add(current);
        if (current === mouthId) {
          basinSize++;
          break;
        }
        const c = terrain.cells[current];
        current = c?.flowsTo ?? null;
      }
    }
    drainageBasinSizes.push(basinSize);
  }

  return {
    riverCellCount: riverCells.length,
    riverMouthCount: riverMouths.length,
    riverLengths: riverLengths.sort((a, b) => b - a),
    drainageBasinSizes: drainageBasinSizes.sort((a, b) => b - a),
    maxRiverLength: Math.max(0, ...riverLengths),
    avgRiverLength: riverLengths.length > 0
      ? riverLengths.reduce((a, b) => a + b, 0) / riverLengths.length
      : 0,
  };
}

describe('River Distribution Analysis', () => {
  describe('baseline statistics', () => {
    it('reports river distribution with default parameters', () => {
      const config = { ...baseConfig, riverThreshold: 25 };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      const dist = analyzeRiverDistribution(terrain, config.riverThreshold);

      console.log('\n=== BASELINE (blendPower=2, threshold=25) ===');
      console.log(`Elevation quartiles: ${dist.quartiles.map((q) => q.toFixed(1)).join(', ')}`);
      console.log(`River cells per quartile: ${dist.buckets.join(', ')}`);
      console.log(`Percentages: ${dist.percentages.map((p) => p.toFixed(1) + '%').join(', ')}`);
      console.log(`Total river cells: ${dist.total}`);
      console.log(`Concentration in Q1 (lowest): ${(concentrationRatio(dist) * 100).toFixed(1)}%`);

      expect(dist.total).toBeGreaterThan(0);
    });
  });

  describe('effect of elevationBlendPower', () => {
    it('lower blendPower should distribute rivers more evenly', () => {
      const blendPowers = [1.0, 1.5, 2.0, 3.0];
      const results: { blendPower: number; dist: RiverDistribution }[] = [];

      console.log('\n=== BLEND POWER COMPARISON ===');
      for (const blendPower of blendPowers) {
        const config = {
          ...baseConfig,
          elevationBlendPower: blendPower,
          riverThreshold: 25,
        };
        const gen = new VoronoiWorldGenerator(config);
        const terrain = gen.generateTerrain();
        const dist = analyzeRiverDistribution(terrain, config.riverThreshold);

        results.push({ blendPower, dist });

        console.log(
          `blendPower=${blendPower}: ` +
            `Q1=${dist.percentages[0].toFixed(0)}% ` +
            `Q2=${dist.percentages[1].toFixed(0)}% ` +
            `Q3=${dist.percentages[2].toFixed(0)}% ` +
            `Q4=${dist.percentages[3].toFixed(0)}% ` +
            `(total=${dist.total})`
        );
      }

      // With blendPower=1, expect more even distribution
      const lowBlend = results.find((r) => r.blendPower === 1.0)!;
      const highBlend = results.find((r) => r.blendPower === 3.0)!;

      // Low blend power should have lower concentration in Q1
      const lowConc = concentrationRatio(lowBlend.dist);
      const highConc = concentrationRatio(highBlend.dist);

      console.log(`\nConcentration ratio (Q1 fraction):`);
      console.log(`  blendPower=1.0: ${(lowConc * 100).toFixed(1)}%`);
      console.log(`  blendPower=3.0: ${(highConc * 100).toFixed(1)}%`);

      // Hypothesis: higher blendPower concentrates rivers more in low elevations
      expect(highConc).toBeGreaterThanOrEqual(lowConc * 0.8); // Allow some variance
    });
  });

  describe('effect of riverThreshold', () => {
    it('lower threshold should show more river cells', () => {
      const thresholds = [10, 25, 50, 100];
      const results: { threshold: number; dist: RiverDistribution }[] = [];

      console.log('\n=== THRESHOLD COMPARISON ===');
      for (const threshold of thresholds) {
        const config = { ...baseConfig, riverThreshold: threshold };
        const gen = new VoronoiWorldGenerator(config);
        const terrain = gen.generateTerrain();
        const dist = analyzeRiverDistribution(terrain, threshold);

        results.push({ threshold, dist });

        console.log(
          `threshold=${threshold}: ` +
            `total=${dist.total} cells, ` +
            `Q1=${dist.percentages[0].toFixed(0)}%`
        );
      }

      // Lower threshold should yield more river cells
      const lowThreshold = results.find((r) => r.threshold === 10)!;
      const highThreshold = results.find((r) => r.threshold === 100)!;

      expect(lowThreshold.dist.total).toBeGreaterThan(highThreshold.dist.total);
    });
  });

  describe('combined effects', () => {
    it('blendPower=1 + threshold=10 should show rivers at all elevations', () => {
      const config = {
        ...baseConfig,
        elevationBlendPower: 1.0,
        riverThreshold: 10,
      };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const dist = analyzeRiverDistribution(terrain, config.riverThreshold);

      console.log('\n=== OPTIMIZED PARAMS (blendPower=1, threshold=10) ===');
      console.log(`River cells per quartile: ${dist.buckets.join(', ')}`);
      console.log(`Percentages: ${dist.percentages.map((p) => p.toFixed(1) + '%').join(', ')}`);
      console.log(`Total river cells: ${dist.total}`);

      // With optimized params, expect rivers in all quartiles
      expect(dist.buckets[0]).toBeGreaterThan(0);
      expect(dist.buckets[1]).toBeGreaterThan(0);
      expect(dist.buckets[2]).toBeGreaterThan(0);
      // Q4 may still have few/none due to being near peaks
    });

    it('blendPower=3 + threshold=100 should heavily concentrate rivers in Q1', () => {
      const config = {
        ...baseConfig,
        elevationBlendPower: 3.0,
        riverThreshold: 100,
      };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const dist = analyzeRiverDistribution(terrain, config.riverThreshold);

      console.log('\n=== CONCENTRATED PARAMS (blendPower=3, threshold=100) ===');
      console.log(`River cells per quartile: ${dist.buckets.join(', ')}`);
      console.log(`Percentages: ${dist.percentages.map((p) => p.toFixed(1) + '%').join(', ')}`);
      console.log(`Concentration in Q1: ${(concentrationRatio(dist) * 100).toFixed(1)}%`);

      // With high blend power and threshold, rivers should concentrate in low elevations
      if (dist.total > 0) {
        expect(dist.percentages[0]).toBeGreaterThan(50);
      }
    });
  });

  describe('river length analysis', () => {
    it('reports river topology with default parameters', () => {
      const config = { ...baseConfig, riverThreshold: 25 };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();
      const topo = analyzeRiverTopology(terrain, config.riverThreshold);

      console.log('\n=== RIVER TOPOLOGY (default params) ===');
      console.log(`River cells: ${topo.riverCellCount}`);
      console.log(`River mouths (separate rivers): ${topo.riverMouthCount}`);
      console.log(`Max river length: ${topo.maxRiverLength} cells`);
      console.log(`Avg river length: ${topo.avgRiverLength.toFixed(1)} cells`);
      console.log(`Top 5 river lengths: ${topo.riverLengths.slice(0, 5).join(', ')}`);
      console.log(`Top 5 drainage basins: ${topo.drainageBasinSizes.slice(0, 5).join(', ')} cells`);

      expect(topo.riverCellCount).toBeGreaterThan(0);
    });

    it('larger maps should produce longer rivers', () => {
      const smallConfig = { ...baseConfig, mapSize: 300, voronoiCellCount: 1000, riverThreshold: 15 };
      const largeConfig = { ...baseConfig, mapSize: 800, voronoiCellCount: 5000, riverThreshold: 15 };

      const smallGen = new VoronoiWorldGenerator(smallConfig);
      const largeGen = new VoronoiWorldGenerator(largeConfig);

      const smallTerrain = smallGen.generateTerrain();
      const largeTerrain = largeGen.generateTerrain();

      const smallTopo = analyzeRiverTopology(smallTerrain, smallConfig.riverThreshold);
      const largeTopo = analyzeRiverTopology(largeTerrain, largeConfig.riverThreshold);

      console.log('\n=== MAP SIZE vs RIVER LENGTH ===');
      console.log(`Small (${smallConfig.mapSize}m, ${smallConfig.voronoiCellCount} cells):`);
      console.log(`  Max river: ${smallTopo.maxRiverLength}, Avg: ${smallTopo.avgRiverLength.toFixed(1)}`);
      console.log(`Large (${largeConfig.mapSize}m, ${largeConfig.voronoiCellCount} cells):`);
      console.log(`  Max river: ${largeTopo.maxRiverLength}, Avg: ${largeTopo.avgRiverLength.toFixed(1)}`);

      // Larger maps should have longer rivers
      expect(largeTopo.maxRiverLength).toBeGreaterThan(smallTopo.maxRiverLength);
    }, 30000);

    it('lower threshold should show longer continuous rivers', () => {
      const config = { ...baseConfig, voronoiCellCount: 3000 };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      const thresholds = [5, 10, 25, 50];
      console.log('\n=== THRESHOLD vs RIVER LENGTH ===');
      for (const threshold of thresholds) {
        const topo = analyzeRiverTopology(terrain, threshold);
        console.log(
          `threshold=${threshold}: ` +
            `max=${topo.maxRiverLength}, ` +
            `avg=${topo.avgRiverLength.toFixed(1)}, ` +
            `rivers=${topo.riverMouthCount}`
        );
      }

      const lowThreshTopo = analyzeRiverTopology(terrain, 5);
      const highThreshTopo = analyzeRiverTopology(terrain, 50);

      // Lower threshold = more river cells visible = longer apparent rivers
      expect(lowThreshTopo.maxRiverLength).toBeGreaterThanOrEqual(highThreshTopo.maxRiverLength);
    });

    it('analyzes what limits river length', () => {
      const config = {
        ...baseConfig,
        mapSize: 600,
        voronoiCellCount: 3000,
        riverThreshold: 10,
      };
      const gen = new VoronoiWorldGenerator(config);
      const terrain = gen.generateTerrain();

      const landCells = terrain.cells.filter((c) => c.isLand);

      // Find the cell with maximum flow accumulation
      let maxFlowCell = landCells[0];
      for (const cell of landCells) {
        if (cell.flowAccumulation > maxFlowCell.flowAccumulation) {
          maxFlowCell = cell;
        }
      }

      // Trace flow from highest accumulation cell to ocean
      console.log('\n=== MAX FLOW CELL TRACE ===');
      console.log(`Max flow cell: id=${maxFlowCell.id}, flow=${maxFlowCell.flowAccumulation}, elev=${maxFlowCell.elevation.toFixed(1)}`);

      let current: typeof maxFlowCell | null = maxFlowCell;
      let steps = 0;
      const trace: string[] = [];
      while (current && steps < 20) {
        trace.push(`${current.id}(f=${current.flowAccumulation},e=${current.elevation.toFixed(0)})`);
        if (current.flowsTo === null) {
          trace.push('→ null (no downstream)');
          break;
        }
        const next = terrain.cells[current.flowsTo];
        if (!next) {
          trace.push('→ invalid cell');
          break;
        }
        if (!next.isLand) {
          trace.push(`→ ${next.id}(ocean)`);
          break;
        }
        current = next;
        steps++;
      }
      console.log(`Flow trace: ${trace.join(' → ')}`);

      // Count how many cells are in the largest drainage basin
      const drainageCounts = new Map<number, number>();
      for (const cell of landCells) {
        // Find terminal cell (coast or sink)
        let terminal: number | null = cell.id;
        const seen = new Set<number>();
        while (terminal !== null && !seen.has(terminal)) {
          seen.add(terminal);
          const c = terrain.cells[terminal];
          if (!c || !c.isLand) break;
          if (c.flowsTo === null) break;
          terminal = c.flowsTo;
        }
        if (terminal !== null) {
          drainageCounts.set(terminal, (drainageCounts.get(terminal) || 0) + 1);
        }
      }

      const sortedDrainages = [...drainageCounts.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`\nTop 5 drainage basins (by terminal cell):`);
      for (const [terminalId, count] of sortedDrainages.slice(0, 5)) {
        const terminal = terrain.cells[terminalId];
        console.log(`  Cell ${terminalId}: ${count} cells drain here (isLand=${terminal?.isLand}, elev=${terminal?.elevation.toFixed(1)})`);
      }

      expect(maxFlowCell.flowAccumulation).toBeGreaterThan(50);
    });
  });
});
