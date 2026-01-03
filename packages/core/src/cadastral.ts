/**
 * Cadastral layer - manages parcels and land use.
 *
 * Provides human-scale lots within Voronoi terrain cells.
 * Each Voronoi cell (~100m) contains a few randomly-placed rectangular parcels.
 * Parcels are generated on-demand when settlements claim terrain cells.
 */

import type {
  Point,
  Rect,
  Parcel,
  LandUse,
  Biome,
  VoronoiTerrainData,
} from '@colonies/shared';
import { SeededRNG } from './rng.js';

// Type alias for RNG
type RNG = SeededRNG;
import {
  pointInPolygon,
  polygonArea,
  polygonBounds,
} from './polygon-utils.js';

/**
 * Target parcel size in square meters.
 * Parcels are squares of this area placed randomly in cells.
 */
const TARGET_PARCEL_SIZE = 2000; // ~45m x 45m lots

/**
 * Margin between adjacent parcels (creates gaps for streets/paths).
 */
const PARCEL_MARGIN = 3; // 3m gap

/**
 * Spatial index using a grid of buckets for fast point queries.
 */
class ParcelSpatialIndex {
  private cellSize: number;
  private grid: Map<string, Set<string>> = new Map();
  private parcels: Map<string, Parcel>;

  constructor(cellSize: number = 50) {
    this.cellSize = cellSize;
    this.parcels = new Map();
  }

  private getCellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  /**
   * Add a parcel to the spatial index.
   */
  add(parcel: Parcel): void {
    this.parcels.set(parcel.id, parcel);

    // Add to all grid cells that the parcel overlaps
    const bounds = polygonBounds(parcel.vertices);
    const minCX = Math.floor(bounds.minX / this.cellSize);
    const minCY = Math.floor(bounds.minY / this.cellSize);
    const maxCX = Math.floor(bounds.maxX / this.cellSize);
    const maxCY = Math.floor(bounds.maxY / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = `${cx},${cy}`;
        if (!this.grid.has(key)) {
          this.grid.set(key, new Set());
        }
        this.grid.get(key)!.add(parcel.id);
      }
    }
  }

  /**
   * Find the parcel containing a point.
   */
  findAt(point: Point): Parcel | null {
    const key = this.getCellKey(point.x, point.y);
    const candidates = this.grid.get(key);
    if (!candidates) return null;

    for (const id of candidates) {
      const parcel = this.parcels.get(id);
      if (parcel && pointInPolygon(point, parcel.vertices)) {
        return parcel;
      }
    }
    return null;
  }

  /**
   * Find all parcels that intersect a rectangle.
   */
  findInRect(bounds: Rect): Parcel[] {
    const results: Parcel[] = [];
    const seen = new Set<string>();

    const minCX = Math.floor(bounds.minX / this.cellSize);
    const minCY = Math.floor(bounds.minY / this.cellSize);
    const maxCX = Math.floor(bounds.maxX / this.cellSize);
    const maxCY = Math.floor(bounds.maxY / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = `${cx},${cy}`;
        const candidates = this.grid.get(key);
        if (!candidates) continue;

        for (const id of candidates) {
          if (seen.has(id)) continue;
          seen.add(id);

          const parcel = this.parcels.get(id);
          if (parcel) {
            results.push(parcel);
          }
        }
      }
    }

    return results;
  }
}

/**
 * Manages the cadastral layer - parcels and land use.
 */
export class CadastralManager {
  private terrain: VoronoiTerrainData;
  private rng: RNG;
  private parcels: Map<string, Parcel> = new Map();
  private parcelsByCell: Map<number, string[]> = new Map();
  private spatialIndex: ParcelSpatialIndex;
  private nextParcelId = 1;

  constructor(terrain: VoronoiTerrainData, rng: RNG) {
    this.terrain = terrain;
    this.rng = rng;
    this.spatialIndex = new ParcelSpatialIndex();
  }

  /**
   * Get all parcels.
   */
  getAllParcels(): Parcel[] {
    return Array.from(this.parcels.values());
  }

  /**
   * Get a parcel by ID.
   */
  getParcel(id: string): Parcel | null {
    return this.parcels.get(id) ?? null;
  }

  /**
   * Find the parcel at a given point.
   */
  findParcelAt(point: Point): Parcel | null {
    return this.spatialIndex.findAt(point);
  }

  /**
   * Get all parcels in a terrain cell.
   */
  getParcelsInCell(cellId: number): Parcel[] {
    const ids = this.parcelsByCell.get(cellId);
    if (!ids) return [];
    return ids.map((id) => this.parcels.get(id)!).filter(Boolean);
  }

  /**
   * Check if a terrain cell has been subdivided into parcels.
   */
  isCellSubdivided(cellId: number): boolean {
    return this.parcelsByCell.has(cellId);
  }

  /**
   * Subdivide a terrain cell into parcels.
   * Called when a settlement claims a new cell.
   *
   * @returns The newly created parcels
   */
  subdivideCell(cellId: number): Parcel[] {
    if (this.isCellSubdivided(cellId)) {
      return this.getParcelsInCell(cellId);
    }

    const newParcels = this.subdivideVoronoiCell(cellId, this.terrain);

    // Register parcels
    const parcelIds: string[] = [];
    for (const parcel of newParcels) {
      this.parcels.set(parcel.id, parcel);
      this.spatialIndex.add(parcel);
      parcelIds.push(parcel.id);
    }
    this.parcelsByCell.set(cellId, parcelIds);

    return newParcels;
  }

  /**
   * Subdivide a Voronoi cell into rectangular parcels using random placement.
   * Places non-overlapping squares with margins between them.
   */
  private subdivideVoronoiCell(
    cellId: number,
    terrain: VoronoiTerrainData
  ): Parcel[] {
    const cell = terrain.cells[cellId];
    if (!cell || !cell.isLand) {
      return []; // Water cell or invalid
    }

    const cellVertices = cell.vertices;
    if (cellVertices.length < 3) {
      return [];
    }

    const cellArea = polygonArea(cellVertices);
    const bounds = polygonBounds(cellVertices);
    const cellWidth = bounds.maxX - bounds.minX;
    const cellHeight = bounds.maxY - bounds.minY;
    const cellMinDim = Math.min(cellWidth, cellHeight);

    // Calculate parcel size - use TARGET_PARCEL_SIZE but cap to fit in cell
    // Parcel should be at most 40% of cell's smallest dimension
    const maxParcelSize = cellMinDim * 0.4;
    const idealSize = Math.sqrt(TARGET_PARCEL_SIZE);
    const size = Math.min(idealSize, maxParcelSize);
    const halfSize = size / 2;

    // Skip if cell is too small for any meaningful parcel
    if (size < 2) {
      return [];
    }

    const parcelArea = size * size;
    const targetCount = Math.max(1, Math.floor(cellArea / TARGET_PARCEL_SIZE));

    const parcels: Parcel[] = [];
    const placedRects: Rect[] = [];
    const maxAttempts = targetCount * 20;

    for (let attempt = 0; attempt < maxAttempts && parcels.length < targetCount; attempt++) {
      // Pick random point inside cell
      const point = this.randomPointInPolygon(cellVertices);
      if (!point) continue;

      // Random rotation for the parcel (building will use this)
      // 70% cardinal with variation, 30% fully random
      let rotation: number;
      if (this.rng.next() < 0.7) {
        const baseRotation = Math.floor(this.rng.next() * 4) * (Math.PI / 2);
        const variation = (this.rng.next() - 0.5) * 0.35; // +/- ~10 degrees
        rotation = baseRotation + variation;
      } else {
        rotation = this.rng.next() * Math.PI * 2;
      }

      // Create rotated square vertices
      const vertices = this.createRotatedSquare(point, halfSize, rotation);

      // Check all corners are inside cell
      if (!vertices.every(v => pointInPolygon(v, cellVertices))) continue;

      // Check overlap with existing parcels using bounding box (with margin)
      const rect = this.getRotatedBounds(vertices);
      if (this.overlapsAny(rect, placedRects, PARCEL_MARGIN)) continue;

      placedRects.push(rect);
      parcels.push({
        id: `p${this.nextParcelId++}`,
        vertices,
        centroid: point,
        area: parcelArea,
        rotation,
        terrainCellId: cellId,
        owner: null,
        landUse: 'wilderness',
      });
    }

    return parcels;
  }

  /**
   * Pick a random point inside a polygon using rejection sampling.
   */
  private randomPointInPolygon(vertices: Point[]): Point | null {
    const bounds = polygonBounds(vertices);
    for (let i = 0; i < 100; i++) {
      const x = bounds.minX + this.rng.next() * (bounds.maxX - bounds.minX);
      const y = bounds.minY + this.rng.next() * (bounds.maxY - bounds.minY);
      const point = { x, y };
      if (pointInPolygon(point, vertices)) return point;
    }
    return null;
  }

  /**
   * Create a rotated square centered at a point.
   */
  private createRotatedSquare(center: Point, halfSize: number, rotation: number): Point[] {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Corners relative to center (before rotation)
    const corners = [
      { x: -halfSize, y: -halfSize },
      { x: halfSize, y: -halfSize },
      { x: halfSize, y: halfSize },
      { x: -halfSize, y: halfSize },
    ];

    // Rotate and translate each corner
    return corners.map(c => ({
      x: center.x + c.x * cos - c.y * sin,
      y: center.y + c.x * sin + c.y * cos,
    }));
  }

  /**
   * Get axis-aligned bounding box of a rotated polygon.
   */
  private getRotatedBounds(vertices: Point[]): Rect {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const v of vertices) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Check if a rectangle overlaps any existing rectangles (with margin).
   */
  private overlapsAny(rect: Rect, others: Rect[], margin: number): boolean {
    for (const other of others) {
      if (
        rect.minX - margin < other.maxX &&
        rect.maxX + margin > other.minX &&
        rect.minY - margin < other.maxY &&
        rect.maxY + margin > other.minY
      ) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Terrain Query Methods (for SettlementManager)
  // ============================================================================

  /**
   * Get all land (non-water) terrain cell IDs.
   */
  getLandCells(): number[] {
    return this.terrain.cells
      .filter((cell) => cell.isLand)
      .map((cell) => cell.id);
  }

  /**
   * Get neighboring cell IDs for a terrain cell.
   */
  getNeighborCells(cellId: number): number[] {
    const cell = this.terrain.cells[cellId];
    return cell ? cell.neighbors : [];
  }

  /**
   * Get the center point of a terrain cell.
   */
  getCellCenter(cellId: number): Point {
    const cell = this.terrain.cells[cellId];
    return cell ? cell.centroid : { x: 0, y: 0 };
  }

  /**
   * Check if a terrain cell is land.
   */
  isLandCell(cellId: number): boolean {
    const cell = this.terrain.cells[cellId];
    return cell?.isLand ?? false;
  }

  /**
   * Get the biome of a terrain cell.
   */
  getCellBiome(cellId: number): Biome {
    const cell = this.terrain.cells[cellId];
    return cell?.biome ?? 'plains';
  }

  /**
   * Batch subdivide multiple cells at once.
   * @returns All parcels created
   */
  subdivideCells(cellIds: number[]): Parcel[] {
    const allParcels: Parcel[] = [];
    for (const cellId of cellIds) {
      const parcels = this.subdivideCell(cellId);
      allParcels.push(...parcels);
    }
    return allParcels;
  }

  // ============================================================================
  // Parcel Management Methods
  // ============================================================================

  /**
   * Update land use for a parcel.
   */
  setLandUse(parcelId: string, landUse: LandUse): void {
    const parcel = this.parcels.get(parcelId);
    if (parcel) {
      parcel.landUse = landUse;
    }
  }

  /**
   * Set owner for a parcel.
   */
  setOwner(parcelId: string, owner: string | null): void {
    const parcel = this.parcels.get(parcelId);
    if (parcel) {
      parcel.owner = owner;
    }
  }

  /**
   * Find parcels by land use.
   */
  findByLandUse(landUse: LandUse): Parcel[] {
    return Array.from(this.parcels.values()).filter(
      (p) => p.landUse === landUse
    );
  }

  /**
   * Find unclaimed parcels.
   */
  findUnclaimed(): Parcel[] {
    return Array.from(this.parcels.values()).filter((p) => p.owner === null);
  }

  /**
   * Get statistics about the cadastral layer.
   */
  getStats(): {
    totalParcels: number;
    subdividedCells: number;
    byLandUse: Record<LandUse, number>;
  } {
    const byLandUse: Record<LandUse, number> = {
      wilderness: 0,
      forest: 0,
      field: 0,
      pasture: 0,
      residential: 0,
      commercial: 0,
      industrial: 0,
      civic: 0,
    };

    for (const parcel of this.parcels.values()) {
      byLandUse[parcel.landUse]++;
    }

    return {
      totalParcels: this.parcels.size,
      subdividedCells: this.parcelsByCell.size,
      byLandUse,
    };
  }
}
