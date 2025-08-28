import { createNoise2D } from 'simplex-noise';
import { WorldConfig, TerrainData, Point } from './types.js';
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
    const coastalWidth = Math.floor(size * (this.config.coastalPlainWidth || 0.3));
    const ridgeHeight = this.config.ridgeHeight || 200;
    const noiseScale = this.config.noiseScale || 0.01;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Base elevation with coastal plain to ridge transition
        const distFromCoast = x;
        let baseElevation = 0;
        
        if (distFromCoast > coastalWidth) {
          // Ridge zone
          const ridgeProgress = (distFromCoast - coastalWidth) / (size - coastalWidth);
          baseElevation = ridgeHeight * Math.sin(ridgeProgress * Math.PI);
        }

        // Add noise for terrain variation
        const noise = this.noise2D(x * noiseScale, y * noiseScale);
        const terrainNoise = noise * 50; // 50m variation
        
        // Ridge orientation influence
        const ridgeAngle = (this.config.ridgeOrientation * Math.PI) / 180;
        const ridgeInfluence = Math.cos((y - size / 2) * 0.01 + ridgeAngle) * 20;
        
        height[y][x] = baseElevation + terrainNoise + ridgeInfluence;
        
        // Create ocean and coastal areas
        if (x < 20) {
          // Ocean zone - below sea level
          height[y][x] = Math.min(height[y][x], -5 - x * 0.5);
        } else if (x < 50) {
          // Coastal zone - at or near sea level
          height[y][x] = Math.min(height[y][x], 5);
        } else {
          // Inland - ensure above sea level
          height[y][x] = Math.max(1, height[y][x]);
        }
      }
    }

    return height;
  }

  private calculateFlowAccumulation(height: number[][]): number[][] {
    const size = height.length;
    const flowAccumulation = this.createEmptyGrid(size);
    const flowDirection = this.calculateFlowDirection(height);

    // Initialize all cells with base flow of 1
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        flowAccumulation[y][x] = 1;
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
        
        // Distance to coast effect
        const coastDistance = x / size;
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
}