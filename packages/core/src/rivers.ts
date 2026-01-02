import type { Point } from '@colonies/shared';
import { computeDistanceToPolylines } from './distance-field.js';

/**
 * River representation as explicit polylines with stream order.
 */
export interface River {
  id: string;
  points: Point[]; // Polyline from source to mouth
  strahler: number; // Stream order (1=headwater, higher=major)
  tributaries: River[]; // Child rivers that flow into this one
}

/**
 * Configuration for river generation.
 */
export interface RiverConfig {
  riverSpacing: number; // Min distance between river sources
  riverMeanderStrength: number; // How much rivers curve (0-1)
  minRiverLength: number; // Minimum river length to keep
}

const DEFAULT_RIVER_CONFIG: RiverConfig = {
  riverSpacing: 80,
  riverMeanderStrength: 0.3,
  minRiverLength: 50,
};

/**
 * Generate rivers from ridge to coast.
 *
 * Algorithm:
 * 1. Find ridge line (elevation maxima)
 * 2. Sample river sources along ridge using Poisson disc
 * 3. Trace each river downhill to coast/water
 * 4. Merge rivers at confluences
 * 5. Calculate Strahler numbers
 *
 * @param elevation - Height map grid
 * @param ridgePoints - Points along the ridge line
 * @param config - River generation config
 * @param noise2D - Noise function for meander variation
 * @returns Array of river objects
 */
export function generateRivers(
  elevation: number[][],
  ridgePoints: Point[],
  config: Partial<RiverConfig> = {},
  noise2D?: (x: number, y: number) => number
): River[] {
  const cfg = { ...DEFAULT_RIVER_CONFIG, ...config };
  const size = elevation.length;

  // Sample river sources along ridge using simple spacing
  const sources = sampleRidgeSources(ridgePoints, cfg.riverSpacing);

  // Trace each river downhill
  const riverPaths: Point[][] = [];
  for (const source of sources) {
    const path = traceDownhill(elevation, source, noise2D, cfg.riverMeanderStrength);
    if (path.length >= cfg.minRiverLength) {
      riverPaths.push(path);
    }
  }

  // Merge rivers at confluences and build tree structure
  const rivers = mergeRiversAndCalculateStrahler(riverPaths, size);

  return rivers;
}

/**
 * Sample river sources along ridge using simple spacing.
 */
function sampleRidgeSources(ridgePoints: Point[], spacing: number): Point[] {
  if (ridgePoints.length === 0) return [];

  const sources: Point[] = [];
  let lastY = -Infinity;

  // Sort by Y and sample at regular intervals
  const sorted = [...ridgePoints].sort((a, b) => a.y - b.y);

  for (const point of sorted) {
    if (point.y - lastY >= spacing) {
      sources.push(point);
      lastY = point.y;
    }
  }

  return sources;
}

/**
 * Trace a river path downhill from source until reaching water/edge.
 */
function traceDownhill(
  elevation: number[][],
  source: Point,
  noise2D?: (x: number, y: number) => number,
  meanderStrength: number = 0.3
): Point[] {
  const size = elevation.length;
  const path: Point[] = [{ ...source }];
  const visited = new Set<string>();
  visited.add(`${source.x},${source.y}`);

  let current = { ...source };
  const maxSteps = size * 3; // Prevent infinite loops

  for (let step = 0; step < maxSteps; step++) {
    // Find steepest downhill neighbor
    let bestNeighbor: Point | null = null;
    let bestDrop = 0;

    // 8-directional neighbors
    const neighbors = [
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 },
    ];

    for (const n of neighbors) {
      const nx = current.x + n.dx;
      const ny = current.y + n.dy;

      if (!isValid(nx, ny, size)) continue;
      if (visited.has(`${nx},${ny}`)) continue;

      const drop = elevation[current.y][current.x] - elevation[ny][nx];

      // Add meander bias using noise
      let bias = 0;
      if (noise2D && meanderStrength > 0) {
        bias = noise2D(current.x * 0.02, current.y * 0.02) * meanderStrength * 10;
      }

      const score = drop + bias;
      if (score > bestDrop) {
        bestDrop = score;
        bestNeighbor = { x: nx, y: ny };
      }
    }

    // Stop if no downhill path or reached water
    if (!bestNeighbor) break;
    if (elevation[bestNeighbor.y][bestNeighbor.x] <= 0) {
      // Reached water - add final point and stop
      path.push(bestNeighbor);
      break;
    }

    // Continue tracing
    visited.add(`${bestNeighbor.x},${bestNeighbor.y}`);
    path.push(bestNeighbor);
    current = bestNeighbor;
  }

  return path;
}

/**
 * Merge rivers at confluences and calculate Strahler numbers.
 */
function mergeRiversAndCalculateStrahler(
  riverPaths: Point[][],
  _size: number
): River[] {
  // Create a grid to track which rivers pass through each cell
  const cellToRivers = new Map<string, number[]>();

  for (let i = 0; i < riverPaths.length; i++) {
    for (const p of riverPaths[i]) {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (!cellToRivers.has(key)) {
        cellToRivers.set(key, []);
      }
      cellToRivers.get(key)!.push(i);
    }
  }

  // Find confluence points (cells with multiple rivers)
  const confluences = new Map<string, number[]>();
  for (const [key, rivers] of cellToRivers) {
    if (rivers.length > 1) {
      confluences.set(key, [...new Set(rivers)]);
    }
  }

  // Build simple river objects with Strahler = 1 for now
  // (Full Strahler calculation would require tree merging)
  const rivers: River[] = riverPaths.map((path, i) => ({
    id: `river-${i}`,
    points: path,
    strahler: 1,
    tributaries: [],
  }));

  // Estimate Strahler based on river length and confluences
  for (const river of rivers) {
    // Longer rivers get higher Strahler (simplified heuristic)
    if (river.points.length > 200) river.strahler = 3;
    else if (river.points.length > 100) river.strahler = 2;

    // Rivers with confluences get higher Strahler
    for (const p of river.points) {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (confluences.has(key)) {
        river.strahler = Math.max(river.strahler, 2);
      }
    }
  }

  return rivers;
}

/**
 * Carve river valleys into elevation grid.
 *
 * @param elevation - Height map to modify (mutated in place)
 * @param rivers - River objects to carve
 * @param distanceToRiver - Precomputed distance field (optional, will compute if not provided)
 */
export function carveRiverValleys(
  elevation: number[][],
  rivers: River[],
  distanceToRiver?: number[][]
): void {
  const size = elevation.length;

  // Compute distance to rivers if not provided
  const distToRiver =
    distanceToRiver ?? computeDistanceToPolylines(size, rivers.map((r) => r.points));

  // Build a map from cell to nearest river for Strahler lookup
  const cellToRiver = buildCellToRiverMap(rivers, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = distToRiver[y][x];
      if (dist === Infinity) continue;

      // Get Strahler of nearest river (default 1)
      const nearestRiver = cellToRiver.get(`${x},${y}`);
      const strahler = nearestRiver?.strahler ?? 1;

      // Valley width scales with Strahler
      const valleyWidth = 5 + strahler * 10;

      if (dist < valleyWidth) {
        // Carve valley with parabolic profile
        const valleyDepth = 5 + strahler * 3;
        const t = dist / valleyWidth; // 0 at river, 1 at valley edge
        const carveAmount = valleyDepth * (1 - t * t); // Parabolic

        elevation[y][x] -= carveAmount;
      }
    }
  }
}

/**
 * Build a map from cell coordinates to nearest river.
 */
function buildCellToRiverMap(rivers: River[], size: number): Map<string, River> {
  const cellToRiver = new Map<string, River>();

  for (const river of rivers) {
    for (const p of river.points) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (isValid(x, y, size)) {
        const key = `${x},${y}`;
        // Higher Strahler rivers take precedence
        const existing = cellToRiver.get(key);
        if (!existing || river.strahler > existing.strahler) {
          cellToRiver.set(key, river);
        }
      }
    }
  }

  return cellToRiver;
}

/**
 * Rasterize rivers to boolean grid for network layer compatibility.
 *
 * @param rivers - River objects
 * @param size - Grid size
 * @returns Boolean grid where true = river cell
 */
export function rasterizeRivers(rivers: River[], size: number): boolean[][] {
  const grid: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  for (const river of rivers) {
    for (let i = 0; i < river.points.length - 1; i++) {
      const p1 = river.points[i];
      const p2 = river.points[i + 1];

      // Bresenham line rasterization
      let x0 = Math.round(p1.x);
      let y0 = Math.round(p1.y);
      const x1 = Math.round(p2.x);
      const y1 = Math.round(p2.y);

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      while (true) {
        if (isValid(x0, y0, size)) {
          grid[y0][x0] = true;

          // Make rivers wider based on Strahler
          const width = Math.floor(river.strahler / 2);
          for (let wy = -width; wy <= width; wy++) {
            for (let wx = -width; wx <= width; wx++) {
              if (isValid(x0 + wx, y0 + wy, size)) {
                grid[y0 + wy][x0 + wx] = true;
              }
            }
          }
        }

        if (x0 === x1 && y0 === y1) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
  }

  return grid;
}

// Utility
function isValid(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}
