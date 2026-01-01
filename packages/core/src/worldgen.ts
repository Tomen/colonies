import { createNoise2D } from 'simplex-noise';
import type { WorldConfig, TerrainData, Point } from '@colonies/shared';
import { SeededRNG } from './rng.js';

export class WorldGenerator {
  private config: WorldConfig;
  private rng: SeededRNG;
  private noise2D: ReturnType<typeof createNoise2D>;

  constructor(config: WorldConfig) {
    this.config = config;
    this.rng = new SeededRNG(config.seed);
    this.noise2D = createNoise2D(() => this.rng.next());
  }

  public generateTerrain(): TerrainData {
    const size = this.config.mapSize;
    const height = this.generateHeightMap(size);
    const flowAccumulation = this.calculateFlowAccumulation(height);
    const moisture = this.calculateMoisture(height, flowAccumulation);

    return { height, flowAccumulation, moisture };
  }

  public findBestHarbor(terrain: TerrainData): Point {
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

  private generateHeightMap(size: number): number[][] {
    const height = this.createEmptyGrid(size);

    // Config parameters
    const coastlineMargin = this.config.coastlineMargin ?? 50;
    const oceanDepthGradient = this.config.oceanDepthGradient ?? 0.5;
    const coastalPlainWidth = Math.floor(size * (this.config.coastalPlainWidth || 0.3));
    const baseRidgeHeight = this.config.ridgeHeight || 200;
    const ridgeVariation = this.config.ridgeVariation ?? 0.2;

    for (let y = 0; y < size; y++) {
      // Wavy coastline position for this row
      const wavyOffset = this.getCoastlineOffset(y, size);
      const coastX = size - coastlineMargin + wavyOffset;

      // Ridge height varies with Y
      const localRidgeHeight = baseRidgeHeight * (1 + ridgeVariation * this.noise2D(0, y * 0.005));

      for (let x = 0; x < size; x++) {
        // Signed distance from coastline (positive = land, negative = ocean)
        const distFromCoast = coastX - x;

        let elevation: number;

        if (distFromCoast < 0) {
          // OCEAN: depth increases toward east edge
          elevation = -5 + distFromCoast * oceanDepthGradient; // distFromCoast is negative
        } else if (distFromCoast < coastalPlainWidth) {
          // COASTAL PLAIN: gentle rise from sea level
          const t = distFromCoast / coastalPlainWidth;
          elevation = t * 20; // Rise to 20m at edge of plain
        } else {
          // INLAND: coastal plain + ridge (asymmetric profile)
          const ridgeDist = distFromCoast - coastalPlainWidth;
          const ridgeWidth = size - coastalPlainWidth - coastlineMargin;
          const ridgeProgress = Math.min(1, ridgeDist / ridgeWidth);

          if (ridgeProgress <= 0.5) {
            // East side of ridge: steep rise using sine curve
            elevation = 20 + localRidgeHeight * Math.sin(ridgeProgress * Math.PI);
          } else {
            // West side of ridge: gentle descent (only drops 30% from peak)
            const peakHeight = 20 + localRidgeHeight;
            const descentProgress = (ridgeProgress - 0.5) * 2; // 0 to 1 after peak
            elevation = peakHeight - descentProgress * localRidgeHeight * 0.3;
          }
        }

        // Add noise scaled by elevation (less on coastal plain, more on ridges)
        // This prevents lakes on low coastal areas while preserving ridge detail
        const baseElevation = Math.max(0, elevation);
        const noiseAmplitude = 5 + baseElevation * 0.1; // 5m at coast, ~25m at ridge
        const noiseScale = distFromCoast < 0 ? 0.3 : 1.0;
        elevation += this.octaveNoise(x, y) * noiseAmplitude * noiseScale;

        // Ridge orientation influence (only on land)
        if (distFromCoast > 0) {
          const ridgeAngle = (this.config.ridgeOrientation * Math.PI) / 180;
          elevation += Math.cos((y - size / 2) * 0.005 + ridgeAngle) * 10;
        }

        height[y][x] = elevation;
      }
    }

    return height;
  }

  private calculateFlowAccumulation(height: number[][]): number[][] {
    const size = height.length;
    const flowAccumulation = this.createEmptyGrid(size);
    const flowDirection = this.calculateFlowDirection(height);

    // riverDensity controls precipitation per cell (0.0-1.0)
    // 0.5 = normal, 1.0 = double precipitation, 0.0 = minimal rivers
    const baseFlow = 0.5 + this.config.riverDensity;

    // Initialize all cells with base flow scaled by riverDensity
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        flowAccumulation[y][x] = baseFlow;
      }
    }

    // Calculate accumulation from high to low elevation
    const cells = [];
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

  private calculateMoisture(height: number[][], flowAccumulation: number[][]): number[][] {
    const size = height.length;
    const moisture = this.createEmptyGrid(size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Base moisture from elevation (higher = drier)
        const elevationEffect = Math.max(0, 1 - height[y][x] / 300);

        // River proximity effect
        const riverEffect = Math.min(1, flowAccumulation[y][x] / 1000);

        // Distance to coast effect (coast is on east side)
        const coastDistance = (size - x) / size;
        const coastalEffect = Math.max(0, 1 - coastDistance);

        moisture[y][x] = (elevationEffect + riverEffect + coastalEffect) / 3;
      }
    }

    return moisture;
  }

  private scoreHarbor(terrain: TerrainData, x: number, y: number): number {
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

  private getCoastlineOffset(y: number, size: number): number {
    const waviness = this.config.coastlineWaviness ?? 0.3;
    const frequency = this.config.coastlineFrequency ?? 3;

    // Use multiple sine waves for natural-looking coastline
    const normalizedY = y / size;
    const primaryWave = Math.sin(normalizedY * Math.PI * 2 * frequency);
    const secondaryWave = Math.sin(normalizedY * Math.PI * 2 * frequency * 2.3 + 1.7) * 0.4;
    const tertiaryWave = Math.sin(normalizedY * Math.PI * 2 * frequency * 0.7 + 0.5) * 0.3;

    // Add noise for irregularity
    const noiseOffset = this.noise2D(0.1, y * 0.02) * 0.5;

    const combinedWave = primaryWave + secondaryWave + tertiaryWave + noiseOffset;

    // Scale by waviness and map width (max offset is 15% of map width)
    return combinedWave * waviness * size * 0.15;
  }

  private octaveNoise(x: number, y: number): number {
    const octaves = this.config.noiseOctaves ?? 3;
    const persistence = this.config.noisePersistence ?? 0.5;
    const baseScale = this.config.noiseScale ?? 0.01;

    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * baseScale * frequency, y * baseScale * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue; // Normalize to -1 to 1
  }
}
