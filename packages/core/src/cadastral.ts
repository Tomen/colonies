/**
 * Cadastral layer - manages parcels and land use.
 *
 * Provides human-scale lots within Voronoi terrain cells.
 * Each Voronoi cell (~100m) is subdivided into 10-50 smaller parcels.
 * Parcels are generated on-demand when settlements claim terrain cells.
 */

import { Delaunay } from 'd3-delaunay';
import type {
  Point,
  Rect,
  Parcel,
  LandUse,
  VoronoiTerrainData,
} from '@colonies/shared';
import { SeededRNG } from './rng.js';

// Type alias for RNG
type RNG = SeededRNG;
import {
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonBounds,
  generatePointsInPolygon,
} from './polygon-utils.js';

/**
 * Target parcel size in square meters for Voronoi subdivision.
 */
const TARGET_PARCEL_SIZE = 500; // ~22m x 22m lots

/**
 * Minimum parcel area to keep after clipping (avoid tiny fragments).
 */
const MIN_PARCEL_AREA = 50;

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
   * Subdivide a Voronoi cell into multiple parcels using recursive Voronoi.
   * Voronoi cells are ~100m, so we subdivide into 10-50 smaller lots.
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
    const targetCount = Math.max(1, Math.floor(cellArea / TARGET_PARCEL_SIZE));

    if (targetCount <= 1) {
      // Cell is small enough to be a single parcel
      const parcel: Parcel = {
        id: `p${this.nextParcelId++}`,
        vertices: [...cellVertices],
        centroid: polygonCentroid(cellVertices),
        area: cellArea,
        terrainCellId: cellId,
        owner: null,
        landUse: 'wilderness',
      };
      return [parcel];
    }

    // Generate random points inside the cell for sub-Voronoi
    const seedPoints = generatePointsInPolygon(
      cellVertices,
      targetCount,
      this.rng
    );

    if (seedPoints.length < 2) {
      // Fallback: single parcel
      const parcel: Parcel = {
        id: `p${this.nextParcelId++}`,
        vertices: [...cellVertices],
        centroid: polygonCentroid(cellVertices),
        area: cellArea,
        terrainCellId: cellId,
        owner: null,
        landUse: 'wilderness',
      };
      return [parcel];
    }

    // Create sub-Voronoi diagram
    const bounds = polygonBounds(cellVertices);
    const delaunay = Delaunay.from(seedPoints.map((p) => [p.x, p.y]));
    const voronoi = delaunay.voronoi([
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    ]);

    const parcels: Parcel[] = [];

    for (let i = 0; i < seedPoints.length; i++) {
      // Get the Voronoi cell polygon for this seed point
      const polygon = voronoi.cellPolygon(i);
      if (!polygon) continue;

      // Convert to Point[] (polygon is [x,y][] with last = first)
      const subVertices: Point[] = [];
      for (let j = 0; j < polygon.length - 1; j++) {
        subVertices.push({ x: polygon[j][0], y: polygon[j][1] });
      }

      // Clip to parent cell boundary
      const clipped = this.clipToCell(subVertices, cellVertices);
      if (clipped.length < 3) continue;

      const clippedArea = polygonArea(clipped);
      if (clippedArea < MIN_PARCEL_AREA) continue;

      const parcel: Parcel = {
        id: `p${this.nextParcelId++}`,
        vertices: clipped,
        centroid: polygonCentroid(clipped),
        area: clippedArea,
        terrainCellId: cellId,
        owner: null,
        landUse: 'wilderness',
      };

      parcels.push(parcel);
    }

    // If clipping produced no valid parcels, fall back to single parcel
    if (parcels.length === 0) {
      const parcel: Parcel = {
        id: `p${this.nextParcelId++}`,
        vertices: [...cellVertices],
        centroid: polygonCentroid(cellVertices),
        area: cellArea,
        terrainCellId: cellId,
        owner: null,
        landUse: 'wilderness',
      };
      return [parcel];
    }

    return parcels;
  }

  /**
   * Clip a polygon to the parent cell boundary.
   * Uses Sutherland-Hodgman for convex cells, or point-in-polygon filtering.
   */
  private clipToCell(subject: Point[], clipBoundary: Point[]): Point[] {
    // Simple approach: keep vertices that are inside, and find intersections
    // For MVP, we use a simplified clipping that works well for mostly-convex shapes

    const result: Point[] = [];
    const n = subject.length;

    for (let i = 0; i < n; i++) {
      const current = subject[i];
      const next = subject[(i + 1) % n];

      const currentInside = pointInPolygon(current, clipBoundary);
      const nextInside = pointInPolygon(next, clipBoundary);

      if (currentInside) {
        result.push(current);
      }

      // If edge crosses boundary, find intersection
      if (currentInside !== nextInside) {
        const intersection = this.findBoundaryIntersection(
          current,
          next,
          clipBoundary
        );
        if (intersection) {
          result.push(intersection);
        }
      }
    }

    return result;
  }

  /**
   * Find where a line segment intersects a polygon boundary.
   */
  private findBoundaryIntersection(
    a: Point,
    b: Point,
    boundary: Point[]
  ): Point | null {
    const n = boundary.length;

    for (let i = 0; i < n; i++) {
      const c = boundary[i];
      const d = boundary[(i + 1) % n];

      const intersection = this.lineSegmentIntersection(a, b, c, d);
      if (intersection) {
        return intersection;
      }
    }

    return null;
  }

  /**
   * Find intersection of two line segments.
   */
  private lineSegmentIntersection(
    a: Point,
    b: Point,
    c: Point,
    d: Point
  ): Point | null {
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denom) < 1e-10) return null;

    const t =
      ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
    const u =
      -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      };
    }

    return null;
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
