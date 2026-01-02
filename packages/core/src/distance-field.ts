import type { Point } from '@colonies/shared';

/**
 * Distance field computation utilities using BFS.
 * Used for computing distances to coastline, ridge, and rivers.
 */

/**
 * Compute a distance field from seed cells using BFS.
 * Returns grid where each cell contains distance to nearest seed.
 *
 * @param size - Grid size
 * @param seeds - Array of seed points (distance = 0)
 * @param obstacles - Optional predicate for impassable cells
 * @returns Distance field grid
 */
export function computeDistanceField(
  size: number,
  seeds: Point[],
  obstacles?: (x: number, y: number) => boolean
): number[][] {
  const distance = createGrid(size, Infinity);
  const visited = createGrid(size, false);

  // Use a queue for BFS
  const queue: Array<{ x: number; y: number; dist: number }> = [];

  // Initialize seeds
  for (const seed of seeds) {
    if (isValid(seed.x, seed.y, size)) {
      distance[seed.y][seed.x] = 0;
      visited[seed.y][seed.x] = true;
      queue.push({ x: seed.x, y: seed.y, dist: 0 });
    }
  }

  // 8-directional neighbors with distances
  const neighbors = [
    { dx: -1, dy: 0, dist: 1 },
    { dx: 1, dy: 0, dist: 1 },
    { dx: 0, dy: -1, dist: 1 },
    { dx: 0, dy: 1, dist: 1 },
    { dx: -1, dy: -1, dist: Math.SQRT2 },
    { dx: 1, dy: -1, dist: Math.SQRT2 },
    { dx: -1, dy: 1, dist: Math.SQRT2 },
    { dx: 1, dy: 1, dist: Math.SQRT2 },
  ];

  // BFS
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];

    for (const neighbor of neighbors) {
      const nx = current.x + neighbor.dx;
      const ny = current.y + neighbor.dy;

      if (!isValid(nx, ny, size)) continue;
      if (visited[ny][nx]) continue;
      if (obstacles && obstacles(nx, ny)) continue;

      const newDist = current.dist + neighbor.dist;
      distance[ny][nx] = newDist;
      visited[ny][nx] = true;
      queue.push({ x: nx, y: ny, dist: newDist });
    }
  }

  return distance;
}

/**
 * Find all cells at the boundary between two regions.
 * Useful for finding coastline (water/land boundary) or ridge line.
 *
 * @param grid - Input grid
 * @param predicate - Returns true for cells in region A, false for region B
 * @returns Array of boundary points (region A cells adjacent to region B)
 */
export function findBoundary(
  grid: number[][],
  predicate: (value: number) => boolean
): Point[] {
  const size = grid.length;
  const boundary: Point[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!predicate(grid[y][x])) continue;

      // Check if adjacent to region B
      const hasAdjacentB =
        (x > 0 && !predicate(grid[y][x - 1])) ||
        (x < size - 1 && !predicate(grid[y][x + 1])) ||
        (y > 0 && !predicate(grid[y - 1][x])) ||
        (y < size - 1 && !predicate(grid[y + 1][x]));

      if (hasAdjacentB) {
        boundary.push({ x, y });
      }
    }
  }

  return boundary;
}

/**
 * Find cells where grid values are local maxima in the X direction.
 * Used to find ridge lines for east-coast style terrain.
 *
 * @param grid - Elevation grid
 * @param windowSize - Size of window to check for local max (default: 50)
 * @returns Array of ridge points
 */
export function findRidgeLine(grid: number[][], windowSize: number = 50): Point[] {
  const size = grid.length;
  const ridge: Point[] = [];

  for (let y = 0; y < size; y++) {
    // Find local maximum in this row
    let maxX = 0;
    let maxVal = -Infinity;

    for (let x = 0; x < size; x++) {
      if (grid[y][x] > maxVal) {
        maxVal = grid[y][x];
        maxX = x;
      }
    }

    // Verify it's a true local maximum (not at boundary)
    if (maxX > windowSize && maxX < size - windowSize) {
      let isLocalMax = true;
      for (let dx = -windowSize; dx <= windowSize; dx++) {
        if (dx !== 0 && grid[y][maxX + dx] >= maxVal) {
          isLocalMax = false;
          break;
        }
      }
      if (isLocalMax) {
        ridge.push({ x: maxX, y });
      }
    }
  }

  return ridge;
}

/**
 * Find coastline cells from an island mask.
 * Coastline cells are land cells (true) adjacent to water cells (false).
 *
 * @param islandMask - Boolean grid where true = land, false = water
 * @returns Array of coastline points
 */
export function findCoastlineCells(islandMask: boolean[][]): Point[] {
  const size = islandMask.length;
  const coastline: Point[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!islandMask[y][x]) continue; // Skip water cells

      // Check if adjacent to water (4-connected)
      const adjacentToWater =
        (x > 0 && !islandMask[y][x - 1]) ||
        (x < size - 1 && !islandMask[y][x + 1]) ||
        (y > 0 && !islandMask[y - 1][x]) ||
        (y < size - 1 && !islandMask[y + 1][x]);

      if (adjacentToWater) {
        coastline.push({ x, y });
      }
    }
  }

  return coastline;
}

/**
 * Find local elevation peaks for river sources.
 * Used for island terrain where rivers flow from peaks toward any coast.
 *
 * @param elevation - Elevation grid
 * @param islandMask - Boolean grid where true = land
 * @param windowSize - Size of window to check for local max
 * @param minElevation - Minimum elevation to be considered a peak
 * @returns Array of peak points
 */
export function findPeaks(
  elevation: number[][],
  islandMask: boolean[][],
  windowSize: number = 80,
  minElevation: number = 50
): Point[] {
  const size = elevation.length;
  const peaks: Point[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  // Scan grid with step size of half window to avoid duplicates
  for (let y = halfWindow; y < size - halfWindow; y += halfWindow) {
    for (let x = halfWindow; x < size - halfWindow; x += halfWindow) {
      // Skip water cells
      if (!islandMask[y][x]) continue;

      const centerElev = elevation[y][x];

      // Skip if below minimum elevation
      if (centerElev < minElevation) continue;

      // Check if local maximum in window
      let isMax = true;
      for (let dy = -halfWindow; dy <= halfWindow && isMax; dy++) {
        for (let dx = -halfWindow; dx <= halfWindow && isMax; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            if (elevation[ny][nx] > centerElev) {
              isMax = false;
            }
          }
        }
      }

      if (isMax) {
        peaks.push({ x, y });
      }
    }
  }

  return peaks;
}

/**
 * Compute distance from each cell to the nearest point in a set of polylines.
 * Used for computing distance to rivers.
 *
 * @param size - Grid size
 * @param polylines - Array of polylines (each polyline is array of points)
 * @returns Distance field grid
 */
export function computeDistanceToPolylines(
  size: number,
  polylines: Point[][]
): number[][] {
  // Rasterize all polylines to get seed points
  const seeds: Point[] = [];
  const added = createGrid(size, false);

  for (const polyline of polylines) {
    for (let i = 0; i < polyline.length - 1; i++) {
      const p1 = polyline[i];
      const p2 = polyline[i + 1];

      // Bresenham's line algorithm to rasterize segment
      const points = rasterizeLine(p1, p2);
      for (const p of points) {
        if (isValid(p.x, p.y, size) && !added[p.y][p.x]) {
          added[p.y][p.x] = true;
          seeds.push(p);
        }
      }
    }
  }

  return computeDistanceField(size, seeds);
}

/**
 * Rasterize a line segment using Bresenham's algorithm.
 */
function rasterizeLine(p1: Point, p2: Point): Point[] {
  const points: Point[] = [];

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
    points.push({ x: x0, y: y0 });

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

  return points;
}

/**
 * Smoothstep interpolation function.
 * Returns smooth transition from 0 to 1 as t goes from 0 to 1.
 */
export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Smoother step interpolation (Ken Perlin's improved version).
 */
export function smootherstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Utility functions

function createGrid<T>(size: number, initialValue: T): T[][] {
  return Array(size)
    .fill(null)
    .map(() => Array(size).fill(initialValue));
}

function isValid(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}
