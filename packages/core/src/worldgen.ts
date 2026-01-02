import { createNoise2D } from 'simplex-noise';
import type {
  WorldConfig,
  GridTerrainData,
  TerrainResult,
  Point,
  River,
  ITerrainGenerator,
} from '@colonies/shared';
import { SeededRNG } from './rng.js';
import {
  computeDistanceField,
  findCoastlineCells,
  findPeaks,
  smoothstep,
} from './distance-field.js';
import { generateRivers, carveRiverValleys, rasterizeRivers } from './rivers.js';

/**
 * World generator using island-based elevation.
 *
 * Algorithm:
 * 1. Generate island mask using noise + distance-from-center falloff
 * 2. Find coastline cells (land adjacent to water)
 * 3. Compute distance field from coastline
 * 4. Generate elevation based on distance from coast
 * 5. Find peaks for river sources
 * 6. Generate rivers flowing toward any coast
 * 7. Carve river valleys
 * 8. Add distance-scaled noise
 */
export class WorldGenerator implements ITerrainGenerator {
  private config: WorldConfig;
  private rng: SeededRNG;
  private noise2D: ReturnType<typeof createNoise2D>;

  constructor(config: WorldConfig) {
    this.config = config;
    this.rng = new SeededRNG(config.seed);
    this.noise2D = createNoise2D(() => this.rng.next());
  }

  public generateTerrain(): GridTerrainData {
    const size = this.config.mapSize;

    // Generate height map with new algorithm
    const { height, rivers } = this.generateHeightMapWithRivers(size);

    // Calculate flow accumulation (for moisture calculation and validation)
    const flowAccumulation = this.calculateFlowAccumulation(height);

    // Calculate moisture
    const moisture = this.calculateMoisture(height, flowAccumulation, rivers);

    return { type: 'grid', height, flowAccumulation, moisture, rivers };
  }

  public findBestHarbor(terrain: TerrainResult): Point {
    if (terrain.type !== 'grid') {
      throw new Error('WorldGenerator.findBestHarbor requires GridTerrainData');
    }
    const size = terrain.height.length;
    let bestScore = -1;
    let bestHarbor: Point = { x: 0, y: 0 };

    // Check coastline cells (water depth and shelter)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.isCoastal(terrain.height, x, y)) {
          const score = this.scoreHarbor(terrain, x, y);
          if (score > bestScore) {
            bestScore = score;
            bestHarbor = { x, y };
          }
        }
      }
    }

    return bestHarbor;
  }

  /**
   * Generate height map using island-based elevation with explicit rivers.
   */
  private generateHeightMapWithRivers(size: number): {
    height: number[][];
    rivers: River[];
  } {
    // Get config parameters with defaults
    const landFraction = this.config.landFraction ?? 0.45;
    const islandNoiseScale = this.config.islandNoiseScale ?? 0.006;
    const islandNoiseOctaves = this.config.islandNoiseOctaves ?? 4;
    const peakElevation = this.config.peakElevation ?? 300;
    const minPeakElevation = this.config.minPeakElevation ?? 50;
    const noiseScale = this.config.noiseScale ?? 0.005;
    const noiseAmplitude = this.config.noiseAmplitude ?? 0.15;
    const riverSpacing = this.config.riverSpacing ?? 80;
    const riverMeanderStrength = this.config.riverMeanderStrength ?? 0.3;

    // Step 1: Generate island mask using noise + distance-from-center falloff
    const islandMask = this.generateIslandMask(size, landFraction, islandNoiseScale, islandNoiseOctaves);

    // Step 2: Find coastline cells (land adjacent to water)
    const coastlineCells = findCoastlineCells(islandMask);

    // Step 3: Compute distance field from coastline
    const distToCoast = computeDistanceField(size, coastlineCells);

    // Find max distance for normalization (only consider land cells)
    let maxDist = 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (islandMask[y][x] && distToCoast[y][x] < Infinity) {
          maxDist = Math.max(maxDist, distToCoast[y][x]);
        }
      }
    }

    // Step 4: Generate elevation based on distance from coast
    // Use a terrain profile with coastal lowlands, rolling midlands, and highland peaks
    const height = this.createEmptyGrid(size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!islandMask[y][x]) {
          // Ocean: depth increases away from coast
          const dist = distToCoast[y][x];
          height[y][x] = -5 - Math.min(dist, 50) * 0.3;
        } else {
          // Land: use terrain zones for natural elevation profile
          const dist = distToCoast[y][x];
          const t = Math.min(1, dist / maxDist); // 0 at coast, 1 at center

          // Terrain zones:
          // - Coastal (0-0.3): Very gentle rise, 0-15% of peak
          // - Midlands (0.3-0.7): Rolling hills, 15-40% of peak
          // - Highlands (0.7-1.0): Steeper rise to peaks, 40-100% of peak
          let elevation: number;
          if (t < 0.3) {
            // Coastal lowlands - very flat
            const localT = t / 0.3;
            elevation = smoothstep(localT) * 0.15 * peakElevation;
          } else if (t < 0.7) {
            // Rolling midlands
            const localT = (t - 0.3) / 0.4;
            const base = 0.15 * peakElevation;
            elevation = base + smoothstep(localT) * 0.25 * peakElevation;
          } else {
            // Highland peaks
            const localT = (t - 0.7) / 0.3;
            const base = 0.4 * peakElevation;
            elevation = base + smoothstep(localT) * 0.6 * peakElevation;
          }

          height[y][x] = elevation;
        }
      }
    }

    // Step 5: Find peaks for river sources
    const peaks = findPeaks(height, islandMask, riverSpacing, minPeakElevation);

    // If no peaks found, create fallback sources near center
    const riverSources =
      peaks.length > 0
        ? peaks
        : [{ x: Math.floor(size / 2), y: Math.floor(size / 2) }];

    // Step 6: Generate rivers flowing toward any coast
    const rivers = generateRivers(
      height,
      riverSources,
      { riverSpacing, riverMeanderStrength, minRiverLength: 20 },
      this.noise2D
    );

    // Step 7: Carve river valleys
    carveRiverValleys(height, rivers);

    // Step 8: Add noise scaled by distance from rivers
    const riverGrid = rasterizeRivers(rivers, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Skip ocean
        if (!islandMask[y][x]) continue;

        // Check if near river (simple check)
        const nearRiver = this.isNearRiver(x, y, riverGrid, 10);
        const localElevation = Math.max(1, height[y][x]);

        // Noise amplitude: lower near rivers, higher on peaks
        const baseNoiseAmp = localElevation * noiseAmplitude;
        const riverDamping = nearRiver ? 0.3 : 1.0;
        const actualNoiseAmp = baseNoiseAmp * riverDamping;

        // Add noise
        const noise = this.noise2D(x * noiseScale, y * noiseScale);
        height[y][x] += noise * actualNoiseAmp;
      }
    }

    return { height, rivers };
  }

  /**
   * Generate island mask using noise + distance-from-center falloff.
   */
  private generateIslandMask(
    size: number,
    landFraction: number,
    noiseScale: number,
    octaves: number
  ): boolean[][] {
    const mask: boolean[][] = Array(size)
      .fill(null)
      .map(() => Array(size).fill(false));

    const halfSize = size / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Distance from center (normalized 0-1, can exceed 1 at corners)
        const dx = (x - halfSize) / halfSize;
        const dy = (y - halfSize) / halfSize;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);

        // Multi-octave noise for coastline irregularity
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = noiseScale;
        let maxAmplitude = 0;

        for (let o = 0; o < octaves; o++) {
          noiseValue += this.noise2D(x * frequency, y * frequency) * amplitude;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }

        // Normalize noise to [-1, 1] then shift to [0, 1]
        noiseValue = (noiseValue / maxAmplitude) * 0.5 + 0.5;

        // Create island shape: use squared distance for sharper falloff at edges
        // and ensure edges are always water
        const distSquared = distFromCenter * distFromCenter;

        // Strong edge penalty ensures ocean at map boundaries
        // At distFromCenter = 1.0 (edge), penalty = 1.0
        // At distFromCenter = 0.7 (70% to edge), penalty = 0.49
        // At distFromCenter = 0.0 (center), penalty = 0.0
        const edgePenalty = distSquared;

        // Combine: high noise + low distance = land
        // Scale noise contribution and apply edge penalty
        const landValue = noiseValue * landFraction - edgePenalty * 0.5;

        // Positive landValue = land, negative = water
        mask[y][x] = landValue > 0;
      }
    }

    return mask;
  }

  /**
   * Check if a cell is near a river.
   */
  private isNearRiver(
    x: number,
    y: number,
    riverGrid: boolean[][],
    radius: number
  ): boolean {
    const size = riverGrid.length;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.isValidCoord(nx, ny, size) && riverGrid[ny][nx]) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Calculate flow accumulation using D8 algorithm.
   * Kept for moisture calculation and validation.
   */
  private calculateFlowAccumulation(height: number[][]): number[][] {
    const size = height.length;
    const flowAccumulation = this.createEmptyGrid(size);
    const flowDirection = this.calculateFlowDirection(height);

    // Initialize all cells with base flow
    const baseFlow = 1.0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        flowAccumulation[y][x] = baseFlow;
      }
    }

    // Calculate accumulation from high to low elevation
    const cells: Array<{ x: number; y: number; elevation: number }> = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        cells.push({ x, y, elevation: height[y][x] });
      }
    }
    cells.sort((a, b) => b.elevation - a.elevation);

    for (const cell of cells) {
      const { x, y } = cell;
      const direction = flowDirection[y][x];

      if (direction !== -1) {
        const nx = x + this.getDx(direction);
        const ny = y + this.getDy(direction);

        if (this.isValidCoord(nx, ny, size)) {
          flowAccumulation[ny][nx] += flowAccumulation[y][x];
        }
      }
    }

    return flowAccumulation;
  }

  private calculateFlowDirection(height: number[][]): number[][] {
    const size = height.length;
    const flowDirection = this.createEmptyGrid(size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let steepestSlope = 0;
        let direction = -1;

        // Check 8 directions
        for (let d = 0; d < 8; d++) {
          const nx = x + this.getDx(d);
          const ny = y + this.getDy(d);

          if (this.isValidCoord(nx, ny, size)) {
            const slope = height[y][x] - height[ny][nx];
            if (slope > steepestSlope) {
              steepestSlope = slope;
              direction = d;
            }
          }
        }

        flowDirection[y][x] = direction;
      }
    }

    return flowDirection;
  }

  /**
   * Calculate moisture based on elevation, flow accumulation, and rivers.
   */
  private calculateMoisture(
    height: number[][],
    flowAccumulation: number[][],
    rivers: River[]
  ): number[][] {
    const size = height.length;
    const moisture = this.createEmptyGrid(size);

    // Rasterize rivers for proximity check
    const riverGrid = rasterizeRivers(rivers, size);

    // Build coastline distance field for coastal moisture effect
    const coastlineCells: Point[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const isLand = height[y][x] > 0;
        if (!isLand) continue;

        // Check if adjacent to water
        const adjacentToWater =
          (x > 0 && height[y][x - 1] <= 0) ||
          (x < size - 1 && height[y][x + 1] <= 0) ||
          (y > 0 && height[y - 1][x] <= 0) ||
          (y < size - 1 && height[y + 1][x] <= 0);

        if (adjacentToWater) {
          coastlineCells.push({ x, y });
        }
      }
    }

    const distToCoast = computeDistanceField(size, coastlineCells);
    const maxCoastDist = 100; // Cells beyond this distance get no coastal moisture bonus

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Skip water
        if (height[y][x] <= 0) {
          moisture[y][x] = 1.0;
          continue;
        }

        // Base moisture from elevation (higher = drier)
        const elevationEffect = Math.max(0, 1 - height[y][x] / 400);

        // River proximity effect
        const nearRiver = this.isNearRiver(x, y, riverGrid, 20);
        const riverEffect = nearRiver ? 0.8 : Math.min(1, flowAccumulation[y][x] / 1000);

        // Coastal proximity effect (closer to coast = wetter)
        const coastDist = Math.min(distToCoast[y][x], maxCoastDist);
        const coastalEffect = 1 - coastDist / maxCoastDist;

        moisture[y][x] = Math.min(
          1,
          (elevationEffect + riverEffect + coastalEffect) / 3
        );
      }
    }

    return moisture;
  }

  private scoreHarbor(terrain: GridTerrainData, x: number, y: number): number {
    const height = terrain.height;
    const size = height.length;
    let score = 0;

    // Prefer deeper water nearby
    if (height[y][x] < 0) score += Math.abs(height[y][x]) * 2;

    // Check for shelter (protected from open ocean)
    let shelterCount = 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + this.getDx(d);
      const ny = y + this.getDy(d);
      if (this.isValidCoord(nx, ny, size) && height[ny][nx] > 5) {
        shelterCount++;
      }
    }
    score += shelterCount * 10;

    // Prefer locations with river access
    if (terrain.flowAccumulation[y][x] > 100) {
      score += 50;
    }

    // Bonus for river mouth (check if near explicit river)
    if (terrain.rivers) {
      for (const river of terrain.rivers) {
        const mouth = river.points[river.points.length - 1];
        const dist = Math.sqrt((x - mouth.x) ** 2 + (y - mouth.y) ** 2);
        if (dist < 20) {
          score += 100 * (river.strahler / 3); // Higher Strahler = better
        }
      }
    }

    return score;
  }

  private isCoastal(height: number[][], x: number, y: number): boolean {
    const size = height.length;
    const isWater = height[y][x] <= 0;

    if (!isWater) return false;

    // Check if adjacent to land
    for (let d = 0; d < 8; d++) {
      const nx = x + this.getDx(d);
      const ny = y + this.getDy(d);
      if (this.isValidCoord(nx, ny, size) && height[ny][nx] > 0) {
        return true;
      }
    }

    return false;
  }

  private getDx(direction: number): number {
    const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
    return dx[direction];
  }

  private getDy(direction: number): number {
    const dy = [-1, -1, -1, 0, 1, 1, 1, 0];
    return dy[direction];
  }

  private isValidCoord(x: number, y: number, size: number): boolean {
    return x >= 0 && x < size && y >= 0 && y < size;
  }

  private createEmptyGrid(size: number): number[][] {
    return Array(size)
      .fill(0)
      .map(() => Array(size).fill(0));
  }
}
