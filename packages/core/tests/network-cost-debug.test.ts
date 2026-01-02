import { describe, it, expect } from 'vitest';
import { createWorldGenerator } from '../src/generator-factory';
import { createTransportNetwork, DEFAULT_NETWORK_CONFIG } from '../src/transport';
import { DEFAULT_CONFIG } from '@colonies/shared';

/**
 * Debug tests to understand the cost distribution in the network.
 */
describe('Network Cost Distribution Debug', () => {
  it('should analyze terrain elevation distribution', () => {
    const config = { ...DEFAULT_CONFIG, seed: 12345, mapSize: 500 };
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    const landCells = terrain.cells.filter(c => c.isLand);
    const elevations = landCells.map(c => c.elevation);

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const avgElev = elevations.reduce((a, b) => a + b, 0) / elevations.length;

    console.log('\n=== TERRAIN ELEVATION STATS ===');
    console.log(`Land cells: ${landCells.length}`);
    console.log(`Min elevation: ${minElev.toFixed(2)}`);
    console.log(`Max elevation: ${maxElev.toFixed(2)}`);
    console.log(`Avg elevation: ${avgElev.toFixed(2)}`);

    // Distribution buckets
    const buckets = [0, 10, 25, 50, 100, 150, 200, 300];
    console.log('\nElevation distribution:');
    for (let i = 0; i < buckets.length; i++) {
      const low = buckets[i];
      const high = buckets[i + 1] ?? Infinity;
      const count = elevations.filter(e => e >= low && e < high).length;
      const pct = ((count / elevations.length) * 100).toFixed(1);
      console.log(`  ${low}-${high}m: ${count} cells (${pct}%)`);
    }

    expect(maxElev).toBeGreaterThan(50); // Should have some mountains
  });

  it('should analyze elevation differences between adjacent cells', () => {
    const config = { ...DEFAULT_CONFIG, seed: 12345, mapSize: 500 };
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    const elevDiffs: number[] = [];
    const avgElevs: number[] = [];

    for (const cell of terrain.cells) {
      if (!cell.isLand) continue;

      for (const neighborId of cell.neighbors) {
        const neighbor = terrain.cells[neighborId];
        if (!neighbor || !neighbor.isLand) continue;

        // Only count each pair once
        if (cell.id < neighborId) {
          const diff = Math.abs(cell.elevation - neighbor.elevation);
          const avg = (cell.elevation + neighbor.elevation) / 2;
          elevDiffs.push(diff);
          avgElevs.push(avg);
        }
      }
    }

    const minDiff = Math.min(...elevDiffs);
    const maxDiff = Math.max(...elevDiffs);
    const avgDiff = elevDiffs.reduce((a, b) => a + b, 0) / elevDiffs.length;

    console.log('\n=== ADJACENT CELL ELEVATION DIFFERENCES ===');
    console.log(`Total land-land edges: ${elevDiffs.length}`);
    console.log(`Min elevation diff: ${minDiff.toFixed(2)}`);
    console.log(`Max elevation diff: ${maxDiff.toFixed(2)}`);
    console.log(`Avg elevation diff: ${avgDiff.toFixed(2)}`);

    // Distribution of slope differences
    const diffBuckets = [0, 1, 2, 5, 10, 20, 50];
    console.log('\nSlope distribution:');
    for (let i = 0; i < diffBuckets.length; i++) {
      const low = diffBuckets[i];
      const high = diffBuckets[i + 1] ?? Infinity;
      const count = elevDiffs.filter(d => d >= low && d < high).length;
      const pct = ((count / elevDiffs.length) * 100).toFixed(1);
      console.log(`  ${low}-${high}m diff: ${count} edges (${pct}%)`);
    }

    // Average elevation distribution
    console.log('\nAverage elevation of edges:');
    const avgBuckets = [0, 25, 50, 100, 150, 200];
    for (let i = 0; i < avgBuckets.length; i++) {
      const low = avgBuckets[i];
      const high = avgBuckets[i + 1] ?? Infinity;
      const count = avgElevs.filter(e => e >= low && e < high).length;
      const pct = ((count / avgElevs.length) * 100).toFixed(1);
      console.log(`  avg ${low}-${high}m: ${count} edges (${pct}%)`);
    }
  });

  it('should analyze actual network edge costs', () => {
    const config = { ...DEFAULT_CONFIG, seed: 12345, mapSize: 500 };
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();
    const network = createTransportNetwork(terrain, DEFAULT_NETWORK_CONFIG);

    const serialized = network.serialize([]);

    // Filter for land-to-land edges only (same as frontend visualization)
    const validEdges = serialized.edges.filter(e => {
      if (!isFinite(e.baseCost) || e.baseCost <= 0) return false;
      const fromCell = terrain.cells[e.fromCell];
      const toCell = terrain.cells[e.toCell];
      return fromCell?.isLand && toCell?.isLand;
    });

    const costs = validEdges.map(e => e.baseCost);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

    console.log('\n=== NETWORK EDGE COST STATS ===');
    console.log(`Valid edges: ${validEdges.length}`);
    console.log(`Min cost: ${minCost.toFixed(2)}`);
    console.log(`Max cost: ${maxCost.toFixed(2)}`);
    console.log(`Avg cost: ${avgCost.toFixed(2)}`);
    console.log(`Cost range ratio: ${(maxCost / minCost).toFixed(2)}x`);

    // Cost distribution
    const costBuckets = [0, 50, 100, 200, 500, 1000, 2000];
    console.log('\nCost distribution:');
    for (let i = 0; i < costBuckets.length; i++) {
      const low = costBuckets[i];
      const high = costBuckets[i + 1] ?? Infinity;
      const count = costs.filter(c => c >= low && c < high).length;
      const pct = ((count / costs.length) * 100).toFixed(1);
      console.log(`  ${low}-${high}: ${count} edges (${pct}%)`);
    }

    // Sample some high and low cost edges
    const sortedEdges = [...validEdges].sort((a, b) => b.baseCost - a.baseCost);
    console.log('\nTop 5 highest cost edges:');
    for (let i = 0; i < 5 && i < sortedEdges.length; i++) {
      const edge = sortedEdges[i];
      const fromCell = terrain.cells[edge.fromCell];
      const toCell = terrain.cells[edge.toCell];
      console.log(`  ${edge.id}: cost=${edge.baseCost.toFixed(2)}, from elev=${fromCell.elevation.toFixed(1)}, to elev=${toCell.elevation.toFixed(1)}`);
    }

    console.log('\nBottom 5 lowest cost edges:');
    for (let i = sortedEdges.length - 5; i < sortedEdges.length && i >= 0; i++) {
      const edge = sortedEdges[i];
      const fromCell = terrain.cells[edge.fromCell];
      const toCell = terrain.cells[edge.toCell];
      console.log(`  ${edge.id}: cost=${edge.baseCost.toFixed(2)}, from elev=${fromCell.elevation.toFixed(1)}, to elev=${toCell.elevation.toFixed(1)}`);
    }

    // The key assertion - we need meaningful cost variation
    expect(maxCost / minCost).toBeGreaterThan(5); // At least 5x difference
  });

  it('should verify cost formula components', () => {
    const config = { ...DEFAULT_CONFIG, seed: 12345, mapSize: 500 };
    const generator = createWorldGenerator(config);
    const terrain = generator.generateTerrain();

    // Find a coastal cell and a mountain cell
    const landCells = terrain.cells.filter(c => c.isLand);
    const sortedByElev = [...landCells].sort((a, b) => a.elevation - b.elevation);

    const lowCell = sortedByElev[0];
    const highCell = sortedByElev[sortedByElev.length - 1];

    console.log('\n=== COST FORMULA VERIFICATION ===');
    console.log(`Low cell: id=${lowCell.id}, elev=${lowCell.elevation.toFixed(2)}`);
    console.log(`High cell: id=${highCell.id}, elev=${highCell.elevation.toFixed(2)}`);

    // Manual cost calculation for a hypothetical edge
    const dx = 30; // typical distance
    const dy = 30;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Low-low edge (coastal)
    const lowLowDiff = 0;
    const lowLowAvg = lowCell.elevation;
    const lowLowSlope = 1 + lowLowDiff * DEFAULT_NETWORK_CONFIG.baseSlopeCost;
    const lowLowAlt = 1 + lowLowAvg * DEFAULT_NETWORK_CONFIG.altitudeCost;
    const lowLowCost = distance * lowLowSlope * lowLowAlt;

    // High-high edge (mountain plateau)
    const highHighDiff = 0;
    const highHighAvg = highCell.elevation;
    const highHighSlope = 1 + highHighDiff * DEFAULT_NETWORK_CONFIG.baseSlopeCost;
    const highHighAlt = 1 + highHighAvg * DEFAULT_NETWORK_CONFIG.altitudeCost;
    const highHighCost = distance * highHighSlope * highHighAlt;

    // Low-high edge (climbing)
    const lowHighDiff = Math.abs(highCell.elevation - lowCell.elevation);
    const lowHighAvg = (lowCell.elevation + highCell.elevation) / 2;
    const lowHighSlope = 1 + lowHighDiff * DEFAULT_NETWORK_CONFIG.baseSlopeCost;
    const lowHighAlt = 1 + lowHighAvg * DEFAULT_NETWORK_CONFIG.altitudeCost;
    const lowHighCost = distance * lowHighSlope * lowHighAlt;

    console.log(`\nWith baseSlopeCost=${DEFAULT_NETWORK_CONFIG.baseSlopeCost}, altitudeCost=${DEFAULT_NETWORK_CONFIG.altitudeCost}:`);
    console.log(`\nCoastal flat edge (elev ${lowCell.elevation.toFixed(1)}m):`);
    console.log(`  slopeFactor = 1 + 0 * ${DEFAULT_NETWORK_CONFIG.baseSlopeCost} = ${lowLowSlope.toFixed(3)}`);
    console.log(`  altFactor = 1 + ${lowLowAvg.toFixed(1)} * ${DEFAULT_NETWORK_CONFIG.altitudeCost} = ${lowLowAlt.toFixed(3)}`);
    console.log(`  cost = ${distance.toFixed(1)} * ${lowLowSlope.toFixed(3)} * ${lowLowAlt.toFixed(3)} = ${lowLowCost.toFixed(2)}`);

    console.log(`\nMountain plateau edge (elev ${highCell.elevation.toFixed(1)}m):`);
    console.log(`  slopeFactor = 1 + 0 * ${DEFAULT_NETWORK_CONFIG.baseSlopeCost} = ${highHighSlope.toFixed(3)}`);
    console.log(`  altFactor = 1 + ${highHighAvg.toFixed(1)} * ${DEFAULT_NETWORK_CONFIG.altitudeCost} = ${highHighAlt.toFixed(3)}`);
    console.log(`  cost = ${distance.toFixed(1)} * ${highHighSlope.toFixed(3)} * ${highHighAlt.toFixed(3)} = ${highHighCost.toFixed(2)}`);

    console.log(`\nClimbing edge (${lowCell.elevation.toFixed(1)}m → ${highCell.elevation.toFixed(1)}m):`);
    console.log(`  slopeFactor = 1 + ${lowHighDiff.toFixed(1)} * ${DEFAULT_NETWORK_CONFIG.baseSlopeCost} = ${lowHighSlope.toFixed(3)}`);
    console.log(`  altFactor = 1 + ${lowHighAvg.toFixed(1)} * ${DEFAULT_NETWORK_CONFIG.altitudeCost} = ${lowHighAlt.toFixed(3)}`);
    console.log(`  cost = ${distance.toFixed(1)} * ${lowHighSlope.toFixed(3)} * ${lowHighAlt.toFixed(3)} = ${lowHighCost.toFixed(2)}`);

    console.log(`\nCost ratios:`);
    console.log(`  Mountain/Coastal: ${(highHighCost / lowLowCost).toFixed(2)}x`);
    console.log(`  Climbing/Coastal: ${(lowHighCost / lowLowCost).toFixed(2)}x`);
  });
});
