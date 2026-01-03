import { Delaunay, Voronoi } from 'd3-delaunay';
import { createNoise2D } from 'simplex-noise';
import type {
  WorldConfig,
  VoronoiTerrainData,
  VoronoiCell,
  VoronoiEdge,
  Point,
  ITerrainGenerator,
  TerrainResult,
  Lake,
} from '@colonies/shared';
import { SeededRNG } from './rng.js';
import { MinHeap } from './priority-queue.js';
import { UnionFind } from './union-find.js';

type Point2D = [number, number];

/**
 * Voronoi polygon-based world generator using d3-delaunay.
 *
 * Algorithm:
 * 1. Generate jittered seed points
 * 2. Create Delaunay triangulation and Voronoi diagram
 * 3. Apply Lloyd relaxation for uniform cells
 * 4. Build cell data with island mask
 * 5. Compute elevation via BFS from ocean
 * 6. Compute flow routing and accumulation
 * 7. Build edges and identify rivers
 * 8. Compute moisture diffusion
 */
export class VoronoiWorldGenerator implements ITerrainGenerator {
  private config: WorldConfig;
  private rng: SeededRNG;
  private noise2D: (x: number, y: number) => number;

  constructor(config: WorldConfig) {
    this.config = config;
    this.rng = new SeededRNG(config.seed);
    this.noise2D = createNoise2D(() => this.rng.next());
  }

  public generateTerrain(): VoronoiTerrainData {
    const { mapSize } = this.config;
    const cellCount = this.config.voronoiCellCount ?? 10000;
    const relaxIterations = this.config.voronoiRelaxation ?? 2;

    // 1. Generate seed points (Poisson disk sampling)
    const points = this.generatePoissonDiskPoints(mapSize, cellCount);

    // 2. Create Delaunay triangulation and Voronoi diagram
    let delaunay = Delaunay.from(points);
    let voronoi = delaunay.voronoi([0, 0, mapSize, mapSize]);

    // 3. Lloyd relaxation for more uniform cells
    for (let i = 0; i < relaxIterations; i++) {
      const centroids = this.computeCentroids(voronoi, points.length);
      points.length = 0;
      points.push(...centroids);
      delaunay = Delaunay.from(points);
      voronoi = delaunay.voronoi([0, 0, mapSize, mapSize]);
    }

    // 4. Build cell data with island mask and initial elevation
    const cells = this.buildCells(voronoi, points, mapSize);

    // 5. Compute distance-based elevation using BFS from ocean
    this.computeElevation(cells);

    // 6. Priority-Flood depression filling (creates lakes, sets filledElevation)
    const lakes = this.priorityFloodFill(cells);

    // 7. Compute flow routing and accumulation (uses filledElevation, routes lakes through outlets)
    this.computeFlowRouting(cells, lakes);

    // 8. Build edges and identify rivers
    const { edges, rivers } = this.buildEdges(cells);

    // 9. Compute moisture diffusion from rivers and coast
    this.computeMoisture(cells, rivers);

    // 10. Assign biomes based on terrain properties
    this.assignBiomes(cells);

    return {
      type: 'voronoi',
      cells,
      edges,
      rivers,
      bounds: { width: mapSize, height: mapSize },
      lakes,
    };
  }

  /**
   * Poisson disk sampling using Bridson's algorithm.
   * Generates points with guaranteed minimum spacing and no grid artifacts.
   */
  private generatePoissonDiskPoints(
    size: number,
    targetCount: number
  ): [number, number][] {
    // Calculate minimum distance from target cell count
    // Area per cell ≈ size² / count, cell radius ≈ √(area/π)
    const minDist = Math.sqrt((size * size) / targetCount) * 0.8;
    const cellSize = minDist / Math.SQRT2;
    const gridWidth = Math.ceil(size / cellSize);
    const gridHeight = Math.ceil(size / cellSize);

    // Background grid for spatial queries (-1 = empty)
    const grid: number[] = new Array(gridWidth * gridHeight).fill(-1);
    const points: [number, number][] = [];
    const active: number[] = [];
    const k = 30; // Candidates per iteration

    // Helper to get grid index
    const gridIndex = (x: number, y: number): number => {
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return -1;
      return gy * gridWidth + gx;
    };

    // Check if point is valid (no neighbors within minDist)
    const isValid = (x: number, y: number): boolean => {
      if (x < 0 || x >= size || y < 0 || y >= size) return false;

      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);

      // Check 5x5 neighborhood
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

          const idx = grid[ny * gridWidth + nx];
          if (idx !== -1) {
            const [px, py] = points[idx];
            const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (dist < minDist) return false;
          }
        }
      }
      return true;
    };

    // Start with random seed point
    const x0 = this.rng.next() * size;
    const y0 = this.rng.next() * size;
    points.push([x0, y0]);
    active.push(0);
    const idx0 = gridIndex(x0, y0);
    if (idx0 >= 0) grid[idx0] = 0;

    // Generate points
    while (active.length > 0) {
      // Pick random active point
      const activeIdx = Math.floor(this.rng.next() * active.length);
      const pointIdx = active[activeIdx];
      const [px, py] = points[pointIdx];

      let found = false;
      for (let i = 0; i < k; i++) {
        // Generate random point in annulus [minDist, 2*minDist]
        const angle = this.rng.next() * Math.PI * 2;
        const radius = minDist + this.rng.next() * minDist;
        const nx = px + Math.cos(angle) * radius;
        const ny = py + Math.sin(angle) * radius;

        if (isValid(nx, ny)) {
          const newIdx = points.length;
          points.push([nx, ny]);
          active.push(newIdx);
          const gIdx = gridIndex(nx, ny);
          if (gIdx >= 0) grid[gIdx] = newIdx;
          found = true;
        }
      }

      if (!found) {
        // Remove from active list
        active.splice(activeIdx, 1);
      }
    }

    return points;
  }

  private computeCentroids(
    voronoi: Voronoi<Point2D>,
    count: number
  ): Point2D[] {
    const centroids: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const polygon = voronoi.cellPolygon(i);
      if (!polygon || polygon.length < 4) {
        // Invalid polygon, use original point
        centroids.push([0, 0]);
        continue;
      }

      // Compute centroid using shoelace formula
      let cx = 0,
        cy = 0,
        area = 0;
      for (let j = 0; j < polygon.length - 1; j++) {
        const [x0, y0] = polygon[j];
        const [x1, y1] = polygon[j + 1];
        const cross = x0 * y1 - x1 * y0;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
        area += cross;
      }
      area /= 2;

      if (Math.abs(area) < 0.001) {
        // Degenerate polygon
        centroids.push([polygon[0][0], polygon[0][1]]);
      } else {
        centroids.push([cx / (6 * area), cy / (6 * area)]);
      }
    }
    return centroids;
  }

  private buildCells(
    voronoi: Voronoi<Point2D>,
    points: Point2D[],
    mapSize: number
  ): VoronoiCell[] {
    const cells: VoronoiCell[] = [];
    const center = mapSize / 2;
    const noiseScale = this.config.islandNoiseScale ?? 0.006;
    const noiseOctaves = this.config.islandNoiseOctaves ?? 4;
    const landFraction = this.config.landFraction ?? 0.55;

    // Single island approach:
    // - Base radius determines island size (from landFraction)
    // - Noise only varies the coastline, doesn't create holes
    // landFraction 0.3 -> radius ~0.45 (small island)
    // landFraction 0.55 -> radius ~0.65 (medium island)
    // landFraction 0.8 -> radius ~0.85 (large island)
    const baseRadius = 0.3 + landFraction * 0.7;

    // Coastline variation amplitude (how much noise affects the edge)
    const coastlineVariation = 0.15;

    for (let i = 0; i < points.length; i++) {
      const [cx, cy] = points[i];
      const polygon = voronoi.cellPolygon(i);
      if (!polygon) continue;

      // Remove duplicate closing vertex
      const vertices: Point[] = polygon
        .slice(0, -1)
        .map(([x, y]: Point2D) => ({ x, y }));
      const neighbors = [...voronoi.neighbors(i)];

      // Single island: distance from center vs radius + coastline noise
      const distFromCenter =
        Math.sqrt((cx - center) ** 2 + (cy - center) ** 2) / center;

      // Use angle-based noise for coastline variation
      // This ensures the coastline wobbles but doesn't create internal holes
      const angle = Math.atan2(cy - center, cx - center);
      const coastlineNoise = this.fractalNoise(
        Math.cos(angle) * 2 + cx * noiseScale * 0.5,
        Math.sin(angle) * 2 + cy * noiseScale * 0.5,
        noiseOctaves
      ) * coastlineVariation;

      const effectiveRadius = baseRadius + coastlineNoise;
      const isLand = distFromCenter < effectiveRadius;

      cells.push({
        id: i,
        centroid: { x: cx, y: cy },
        vertices,
        neighbors,
        elevation: isLand ? 0 : -10, // Temporary, refined in computeElevation
        moisture: 0,
        isLand,
        isCoast: false,
        flowsTo: null,
        flowAccumulation: 1,
        biome: isLand ? 'plains' : 'sea', // Default, refined in assignBiomes
      });
    }

    // Mark coastal cells
    for (const cell of cells) {
      if (cell.isLand) {
        cell.isCoast = cell.neighbors.some((n) => !cells[n]?.isLand);
      }
    }

    return cells;
  }

  private fractalNoise(x: number, y: number, octaves: number): number {
    let value = 0,
      amplitude = 1,
      frequency = 1,
      maxAmplitude = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / maxAmplitude;
  }

  private computeElevation(cells: VoronoiCell[]): void {
    const peakElevation = this.config.peakElevation ?? 300;
    const mountainPeakCount = this.config.mountainPeakCount ?? 5;
    const hilliness = this.config.hilliness ?? 0.3;
    const blendPower = this.config.elevationBlendPower ?? 2;
    const hillNoiseScale = this.config.hillNoiseScale ?? 0.008;
    const hillNoiseAmp = this.config.hillNoiseAmplitude ?? 0.4;
    const ridgeEnabled = this.config.ridgeEnabled ?? true;
    const ridgeWidth = this.config.ridgeWidth ?? 3;

    // Step 1: BFS from ocean to compute distance from coast
    const oceanCells = cells.filter((c) => !c.isLand);
    const distFromCoast = new Float32Array(cells.length).fill(Infinity);
    const queue: number[] = [];

    for (const cell of oceanCells) {
      distFromCoast[cell.id] = 0;
      queue.push(cell.id);
    }

    let maxCoastDist = 0;
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      const cell = cells[id];
      for (const neighborId of cell.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor) continue;
        const newDist = distFromCoast[id] + 1;
        if (newDist < distFromCoast[neighborId]) {
          distFromCoast[neighborId] = newDist;
          maxCoastDist = Math.max(maxCoastDist, newDist);
          queue.push(neighborId);
        }
      }
    }

    // Step 2: Select mountain peak locations spread across inland areas
    const landCells = cells.filter((c) => c.isLand);

    // Filter to inland cells (top 60% by distance from coast) - these are peak candidates
    const sortedByDist = [...landCells].sort(
      (a, b) => distFromCoast[b.id] - distFromCoast[a.id]
    );
    const inlandThreshold = Math.floor(landCells.length * 0.6);
    const inlandCells = sortedByDist.slice(0, inlandThreshold);

    // Shuffle inland cells using seeded RNG for variety
    for (let i = inlandCells.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [inlandCells[i], inlandCells[j]] = [inlandCells[j], inlandCells[i]];
    }

    // Pick peaks that are spread apart using Poisson-like spacing
    const peaks: VoronoiCell[] = [];
    const minPeakSpacing = Math.sqrt(
      (this.config.mapSize * this.config.mapSize) / mountainPeakCount
    ) * 0.7; // Increase spacing factor for better distribution

    for (const candidate of inlandCells) {
      if (peaks.length >= mountainPeakCount) break;

      // Check if far enough from existing peaks
      const tooClose = peaks.some((peak) => {
        const dx = candidate.centroid.x - peak.centroid.x;
        const dy = candidate.centroid.y - peak.centroid.y;
        return Math.sqrt(dx * dx + dy * dy) < minPeakSpacing;
      });

      if (!tooClose) {
        peaks.push(candidate);
      }
    }

    // Step 2b: Build ridge lines connecting peaks (if enabled)
    const ridgeCells = new Set<number>();
    for (const peak of peaks) {
      ridgeCells.add(peak.id);
    }

    if (ridgeEnabled && peaks.length >= 2) {
      // Connect each peak to its nearest neighbor(s) forming a ridge network
      const maxRidgeConnectionDist = this.config.mapSize * 0.5;

      for (let i = 0; i < peaks.length; i++) {
        for (let j = i + 1; j < peaks.length; j++) {
          const peakA = peaks[i];
          const peakB = peaks[j];
          const dx = peakB.centroid.x - peakA.centroid.x;
          const dy = peakB.centroid.y - peakA.centroid.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Only connect peaks within reasonable distance
          if (dist > maxRidgeConnectionDist) continue;

          // Find cells along the ridge path using greedy walk
          const ridgePath = this.findRidgePath(cells, peakA.id, peakB.id, distFromCoast);
          for (const cellId of ridgePath) {
            ridgeCells.add(cellId);
          }
        }
      }

      // Expand ridges to create wider mountain ranges
      if (ridgeWidth > 1) {
        const expandedRidge = new Set(ridgeCells);
        for (let w = 1; w < ridgeWidth; w++) {
          const toAdd: number[] = [];
          for (const cellId of expandedRidge) {
            const cell = cells[cellId];
            for (const neighborId of cell.neighbors) {
              const neighbor = cells[neighborId];
              if (neighbor && neighbor.isLand && !expandedRidge.has(neighborId)) {
                toAdd.push(neighborId);
              }
            }
          }
          for (const id of toAdd) {
            expandedRidge.add(id);
          }
        }
        for (const id of expandedRidge) {
          ridgeCells.add(id);
        }
      }
    }

    // Step 3: BFS from ridge cells (or just peaks if ridges disabled) to compute distance
    const distFromPeak = new Float32Array(cells.length).fill(Infinity);
    const peakQueue: number[] = [];

    for (const cellId of ridgeCells) {
      distFromPeak[cellId] = 0;
      peakQueue.push(cellId);
    }

    let maxPeakDist = 0;
    head = 0;
    while (head < peakQueue.length) {
      const id = peakQueue[head++];
      const cell = cells[id];
      for (const neighborId of cell.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor || !neighbor.isLand) continue; // Only propagate on land
        const newDist = distFromPeak[id] + 1;
        if (newDist < distFromPeak[neighborId]) {
          distFromPeak[neighborId] = newDist;
          maxPeakDist = Math.max(maxPeakDist, newDist);
          peakQueue.push(neighborId);
        }
      }
    }

    // Step 4: Compute elevation using mapgen4-style dual system
    for (const cell of cells) {
      if (!cell.isLand) continue;

      // Normalize distances
      const coastT = Math.min(distFromCoast[cell.id] / maxCoastDist, 1);
      // peakT: 1 at peaks/ridges, 0 far from them
      const peakT =
        maxPeakDist > 0
          ? 1 - Math.min(distFromPeak[cell.id] / maxPeakDist, 1)
          : 0;

      // coastFactor gates ALL elevation - you must be inland to be high
      // At coast (coastT=0): coastFactor=0, so elevation=0
      const coastFactor = Math.pow(coastT, blendPower);

      // peakFactor adds bonus for proximity to peaks/ridges
      const peakFactor = Math.pow(peakT, 1.5);

      // Elevation = coastFactor * (gentle base + peak bonus)
      // At coast: 0, inland far from peaks: ~30% of max, at peaks: ~90% of max
      const baseElevation = coastFactor * peakElevation * (0.3 + 0.6 * peakFactor);

      // Hill elevation: low-amplitude noise for gentle rolling terrain
      const hillNoise = this.fractalNoise(
        cell.centroid.x * hillNoiseScale,
        cell.centroid.y * hillNoiseScale,
        4
      );
      // Map noise from [-1,1] to [0,1] range, then scale
      const hillElevation = ((hillNoise + 1) / 2) * hillNoiseAmp * peakElevation;

      // Combine: base terrain + hills (also gated by coastFactor)
      cell.elevation =
        baseElevation +
        hillElevation * hilliness * coastFactor;

      // Ensure minimum elevation for land
      cell.elevation = Math.max(cell.elevation, 1);
    }
  }

  /**
   * Find a path between two cells that stays on high ground (ridge path).
   * Uses A* with distance-from-coast as heuristic to prefer inland routes.
   */
  private findRidgePath(
    cells: VoronoiCell[],
    startId: number,
    endId: number,
    distFromCoast: Float32Array
  ): number[] {
    const endCell = cells[endId];
    const endX = endCell.centroid.x;
    const endY = endCell.centroid.y;

    // A* search preferring high-ground paths
    const openSet = new Map<number, number>(); // cellId -> fScore
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();

    gScore.set(startId, 0);
    const startDist = this.euclideanDist(cells[startId].centroid, endCell.centroid);
    openSet.set(startId, startDist);

    while (openSet.size > 0) {
      // Find cell with lowest fScore
      let currentId = -1;
      let lowestF = Infinity;
      for (const [id, f] of openSet) {
        if (f < lowestF) {
          lowestF = f;
          currentId = id;
        }
      }

      if (currentId === endId) {
        // Reconstruct path
        const path: number[] = [];
        let cur = currentId;
        while (cameFrom.has(cur)) {
          path.push(cur);
          cur = cameFrom.get(cur)!;
        }
        path.push(startId);
        return path.reverse();
      }

      openSet.delete(currentId);
      const current = cells[currentId];
      const currentG = gScore.get(currentId) ?? Infinity;

      for (const neighborId of current.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor || !neighbor.isLand) continue;

        // Cost: prefer cells farther from coast (higher ground)
        // Lower cost = better, so invert distFromCoast
        const coastPenalty = 1 / (distFromCoast[neighborId] + 1);
        const tentativeG = currentG + 1 + coastPenalty * 2;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          const h = this.euclideanDist(neighbor.centroid, { x: endX, y: endY });
          openSet.set(neighborId, tentativeG + h * 0.1);
        }
      }
    }

    // No path found, return direct line (shouldn't happen on connected land)
    return [startId, endId];
  }

  private euclideanDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Priority-Flood algorithm for depression filling.
   * Ensures all land cells can drain to the ocean by filling depressions.
   * Creates lakes where depressions are filled above minLakeDepth.
   *
   * Based on Barnes et al. 2014: "Priority-Flood: An Optimal Depression-Filling
   * and Watershed-Labeling Algorithm for Digital Elevation Models"
   */
  private priorityFloodFill(cells: VoronoiCell[]): Lake[] {
    const fillSpillEnabled = this.config.fillSpillEnabled ?? true;
    const minLakeDepth = this.config.minLakeDepth ?? 1.0;
    const minLakeArea = this.config.minLakeArea ?? 3;

    // Initialize filledElevation to original elevation
    for (const cell of cells) {
      cell.filledElevation = cell.elevation;
      cell.lakeId = null;
    }

    if (!fillSpillEnabled) {
      return [];
    }

    const n = cells.length;
    const filledElevation = new Float32Array(n);
    const processed = new Uint8Array(n);

    // Initialize: land cells start at Infinity, ocean cells at their elevation
    for (let i = 0; i < n; i++) {
      filledElevation[i] = cells[i].isLand ? Infinity : cells[i].elevation;
    }

    // Priority queue: [elevation, cellId] - process lowest first
    const pq = new MinHeap<[number, number]>((a, b) => a[0] - b[0]);

    // Seed queue with ocean-adjacent land cells (the "open drains")
    for (const cell of cells) {
      if (!cell.isLand) {
        processed[cell.id] = 1;
        // Add land neighbors of ocean cells to queue
        for (const neighborId of cell.neighbors) {
          const neighbor = cells[neighborId];
          if (neighbor && neighbor.isLand && !processed[neighborId]) {
            filledElevation[neighborId] = neighbor.elevation;
            pq.push([neighbor.elevation, neighborId]);
            processed[neighborId] = 1;
          }
        }
      }
    }

    // Process queue: flood inward from coast
    while (!pq.isEmpty()) {
      const [, cellId] = pq.pop()!;
      const cell = cells[cellId];

      for (const neighborId of cell.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor || !neighbor.isLand || processed[neighborId]) continue;

        // Key Priority-Flood step: filled = max(own elevation, predecessor's filled)
        const newFilled = Math.max(
          neighbor.elevation,
          filledElevation[cellId]
        );
        filledElevation[neighborId] = newFilled;
        pq.push([newFilled, neighborId]);
        processed[neighborId] = 1;
      }
    }

    // Apply filledElevation to cells
    for (const cell of cells) {
      if (cell.isLand) {
        cell.filledElevation = filledElevation[cell.id];
      }
    }

    // Identify lake basins: cells where filledElevation > elevation + minLakeDepth
    const inLakeBasin = new Uint8Array(n);
    for (const cell of cells) {
      if (!cell.isLand) continue;
      const depthBelowSpill = filledElevation[cell.id] - cell.elevation;
      if (depthBelowSpill > minLakeDepth) {
        inLakeBasin[cell.id] = 1;
      }
    }

    // Build connected lake components using Union-Find
    // Cells with same filledElevation that are adjacent form a lake
    const uf = new UnionFind(n);

    for (const cell of cells) {
      if (!inLakeBasin[cell.id]) continue;

      for (const neighborId of cell.neighbors) {
        if (!inLakeBasin[neighborId]) continue;

        // Same spill level = same lake (within epsilon)
        if (
          Math.abs(filledElevation[cell.id] - filledElevation[neighborId]) <
          0.01
        ) {
          uf.union(cell.id, neighborId);
        }
      }
    }

    // Group cells by their lake root
    const componentCells = new Map<number, number[]>();
    for (const cell of cells) {
      if (!inLakeBasin[cell.id]) continue;
      const root = uf.find(cell.id);
      if (!componentCells.has(root)) {
        componentCells.set(root, []);
      }
      componentCells.get(root)!.push(cell.id);
    }

    // Build Lake objects from components
    const lakes: Lake[] = [];

    for (const [root, cellIds] of componentCells) {
      // Skip lakes that are too small
      if (cellIds.length < minLakeArea) {
        // Clear lake markers for small depressions
        for (const id of cellIds) {
          cells[id].lakeId = null;
        }
        continue;
      }

      const waterLevel = filledElevation[root];
      let outletCell = -1;
      let outletTarget = -1;
      let maxDepth = 0;

      // Find outlet: cell at or near spill level with a lower neighbor outside the lake
      for (const id of cellIds) {
        const cell = cells[id];
        const depth = waterLevel - cell.elevation;
        maxDepth = Math.max(maxDepth, depth);

        // Check for outlet: cell with neighbor outside lake at lower elevation
        for (const neighborId of cell.neighbors) {
          const neighbor = cells[neighborId];
          if (!neighbor) continue;

          // Neighbor is outside this lake component
          const neighborRoot = inLakeBasin[neighborId]
            ? uf.find(neighborId)
            : -1;
          if (neighborRoot !== root) {
            // Check if this is a valid outlet (neighbor is lower or equal)
            if (filledElevation[neighborId] <= waterLevel) {
              // Prefer the cell closest to spill elevation
              if (
                outletCell === -1 ||
                Math.abs(cell.elevation - waterLevel) <
                  Math.abs(cells[outletCell].elevation - waterLevel)
              ) {
                outletCell = id;
                outletTarget = neighborId;
              }
            }
          }
        }
      }

      // Assign final lake ID
      const lakeId = lakes.length;
      for (const id of cellIds) {
        cells[id].lakeId = lakeId;
      }

      lakes.push({
        id: lakeId,
        cellIds,
        waterLevel,
        outletCell,
        outletTarget,
        area: cellIds.length,
        maxDepth,
      });
    }

    return lakes;
  }

  private computeFlowRouting(cells: VoronoiCell[], lakes: Lake[]): void {
    // Build cell-to-lake lookup for efficient routing
    const cellToLake = new Map<number, Lake>();
    for (const lake of lakes) {
      for (const cellId of lake.cellIds) {
        cellToLake.set(cellId, lake);
      }
    }

    // Each land cell flows to its lowest neighbor (using filledElevation)
    // Lake cells route through their outlet for proper flow accumulation
    for (const cell of cells) {
      if (!cell.isLand) continue;

      // Lake cells route to their outlet (spill routing)
      const lake = cellToLake.get(cell.id);
      if (lake) {
        if (lake.outletCell === -1) {
          // Endorheic lake - no outlet (sink)
          cell.flowsTo = null;
        } else if (cell.id === lake.outletCell) {
          // Outlet cell flows to downstream target
          cell.flowsTo = lake.outletTarget >= 0 ? lake.outletTarget : null;
        } else {
          // Interior lake cell flows to outlet
          cell.flowsTo = lake.outletCell;
        }
        continue;
      }

      // Non-lake land cell: standard lowest-neighbor routing
      const myElevation = cell.filledElevation ?? cell.elevation;
      let lowestNeighbor: number | null = null;
      let lowestElevation = myElevation;

      for (const neighborId of cell.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor) continue;

        const neighborElev = neighbor.filledElevation ?? neighbor.elevation;
        if (neighborElev < lowestElevation) {
          lowestElevation = neighborElev;
          lowestNeighbor = neighborId;
        }
      }
      cell.flowsTo = lowestNeighbor;
    }

    // Accumulate flow (sort by filledElevation, high to low)
    const sorted = cells
      .filter((c) => c.isLand)
      .sort((a, b) => {
        const elevA = a.filledElevation ?? a.elevation;
        const elevB = b.filledElevation ?? b.elevation;
        return elevB - elevA;
      });

    for (const cell of sorted) {
      const flowsTo = cell.flowsTo;
      if (flowsTo !== null && cells[flowsTo]) {
        cells[flowsTo].flowAccumulation += cell.flowAccumulation;
      }
    }
  }

  private buildEdges(cells: VoronoiCell[]): {
    edges: VoronoiEdge[];
    rivers: VoronoiEdge[];
  } {
    const edges: VoronoiEdge[] = [];
    const rivers: VoronoiEdge[] = [];
    const riverThreshold = this.config.riverThreshold ?? 50;
    const seen = new Set<string>();

    for (const cell of cells) {
      for (const neighborId of cell.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor) continue;

        // Create unique key for edge
        const key = `${Math.min(cell.id, neighborId)}-${Math.max(cell.id, neighborId)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Find shared vertices between cell polygons
        const sharedVerts = this.findSharedVertices(
          cell.vertices,
          neighbor.vertices
        );
        if (sharedVerts.length < 2) continue;

        const edge: VoronoiEdge = {
          id: edges.length,
          cells: [cell.id, neighborId],
          vertices: [sharedVerts[0], sharedVerts[1]],
          isRiver: false,
          flowVolume: 0,
        };

        // Check if this edge carries river flow
        const flowA = cell.flowAccumulation;
        const flowB = neighbor.flowAccumulation;

        if (cell.flowsTo === neighborId && flowA >= riverThreshold) {
          edge.isRiver = true;
          edge.flowVolume = flowA;
          rivers.push(edge);
        } else if (neighbor.flowsTo === cell.id && flowB >= riverThreshold) {
          edge.isRiver = true;
          edge.flowVolume = flowB;
          rivers.push(edge);
        }

        edges.push(edge);
      }
    }

    return { edges, rivers };
  }

  private findSharedVertices(vertsA: Point[], vertsB: Point[]): Point[] {
    const shared: Point[] = [];
    const epsilon = 0.01;
    for (const a of vertsA) {
      for (const b of vertsB) {
        if (
          Math.abs(a.x - b.x) < epsilon &&
          Math.abs(a.y - b.y) < epsilon
        ) {
          shared.push(a);
          break;
        }
      }
    }
    return shared;
  }

  private computeMoisture(cells: VoronoiCell[], rivers: VoronoiEdge[]): void {
    const diffusionIterations = this.config.moistureDiffusion ?? 5;

    // Initialize moisture at rivers and coast
    const riverCellIds = new Set<number>();
    for (const edge of rivers) {
      riverCellIds.add(edge.cells[0]);
      riverCellIds.add(edge.cells[1]);
    }

    for (const cell of cells) {
      if (!cell.isLand) {
        cell.moisture = 1.0;
      } else if (riverCellIds.has(cell.id) || cell.isCoast) {
        cell.moisture = 1.0;
      }
    }

    // Diffuse moisture to neighbors
    for (let iter = 0; iter < diffusionIterations; iter++) {
      const newMoisture = new Float32Array(cells.length);
      for (const cell of cells) {
        if (!cell.isLand) {
          newMoisture[cell.id] = 1.0;
          continue;
        }
        let neighborSum = 0,
          count = 0;
        for (const neighborId of cell.neighbors) {
          const neighbor = cells[neighborId];
          if (neighbor) {
            neighborSum += neighbor.moisture;
            count++;
          }
        }
        const avgNeighbor = count > 0 ? neighborSum / count : 0;
        newMoisture[cell.id] = cell.moisture * 0.7 + avgNeighbor * 0.3;
      }
      for (const cell of cells) {
        cell.moisture = newMoisture[cell.id];
      }
    }
  }

  /**
   * Assign biomes to cells based on terrain properties.
   * Order matters: sea → lake → river → mountains → woods → plains
   */
  private assignBiomes(cells: VoronoiCell[]): void {
    const peakElev = this.config.peakElevation ?? 1500;
    const mountainThreshold = peakElev * 0.6; // Top 40% = mountains
    const woodsMoistureThreshold = 0.5;
    const riverThreshold = this.config.riverThreshold ?? 50;

    for (const cell of cells) {
      if (!cell.isLand) {
        cell.biome = 'sea';
      } else if (cell.lakeId != null) {
        cell.biome = 'lake';
      } else if (cell.flowAccumulation >= riverThreshold) {
        cell.biome = 'river';
      } else if (cell.elevation > mountainThreshold) {
        cell.biome = 'mountains';
      } else if (cell.moisture > woodsMoistureThreshold) {
        cell.biome = 'woods';
      } else {
        cell.biome = 'plains';
      }
    }
  }

  public findBestHarbor(terrain: TerrainResult): Point {
    if (terrain.type !== 'voronoi') {
      throw new Error(
        'VoronoiWorldGenerator.findBestHarbor requires VoronoiTerrainData'
      );
    }

    // Find coastal cells with good harbor characteristics
    let bestCell: VoronoiCell | null = null;
    let bestScore = -Infinity;

    for (const cell of terrain.cells) {
      if (!cell.isCoast) continue;

      // Harbor score based on:
      // - Low elevation (easy access)
      // - High flow accumulation nearby (river mouth)
      // - Protected from open ocean (many land neighbors)
      const landNeighbors = cell.neighbors.filter(
        (n) => terrain.cells[n]?.isLand
      ).length;
      const shelter = landNeighbors / cell.neighbors.length;
      const riverBonus =
        cell.flowAccumulation > 100 ? 1.0 : cell.flowAccumulation / 100;
      const depthScore = 1 - cell.elevation / 50; // Prefer lower coastal elevations

      const score = shelter * 0.4 + riverBonus * 0.4 + depthScore * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }

    return (
      bestCell?.centroid ?? {
        x: terrain.bounds.width / 2,
        y: terrain.bounds.height / 2,
      }
    );
  }
}
