import { create } from 'zustand';
import type { VoronoiCell } from '@colonies/shared';

// Constants matching VoronoiTerrainMesh
export const ELEVATION_SCALE = 0.5;
export const FLAT_HEIGHT = 1;
export const OCEAN_DEPTH = -5;

// Hash vertex coordinates to a string key
export function vertexKey(x: number, y: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

interface TerrainHeightState {
  // Height data
  cellHeights: Map<number, number>;
  vertexHeights: Map<string, number>;
  useHeight: boolean;

  // Actions
  setHeightData: (
    cellHeights: Map<number, number>,
    vertexHeights: Map<string, number>,
    useHeight: boolean
  ) => void;
  clear: () => void;
}

export const useTerrainHeightStore = create<TerrainHeightState>((set) => ({
  cellHeights: new Map(),
  vertexHeights: new Map(),
  useHeight: true,

  setHeightData: (cellHeights, vertexHeights, useHeight) => {
    set({ cellHeights, vertexHeights, useHeight });
  },

  clear: () => {
    set({
      cellHeights: new Map(),
      vertexHeights: new Map(),
    });
  },
}));

/**
 * Get the rendered Y coordinate for a cell center.
 * Use for settlements, parcel centroids, and other cell-based features.
 */
export function getCellHeight(
  cellId: number,
  cellHeights: Map<number, number>,
  useHeight: boolean
): number {
  if (!useHeight) return FLAT_HEIGHT;
  return cellHeights.get(cellId) ?? FLAT_HEIGHT;
}

/**
 * Get the rendered Y coordinate for a vertex (cell boundary point).
 * Use for roads, rivers, and features at cell edges.
 * Includes river carving effects.
 */
export function getVertexHeight(
  x: number,
  y: number,
  vertexHeights: Map<string, number>,
  useHeight: boolean
): number {
  if (!useHeight) return FLAT_HEIGHT;
  return vertexHeights.get(vertexKey(x, y)) ?? FLAT_HEIGHT;
}

/**
 * Build cell heights map from cells array.
 * Call this from VoronoiTerrainMesh after geometry is computed.
 */
export function buildCellHeights(
  cells: VoronoiCell[],
  useHeight: boolean
): Map<number, number> {
  const heights = new Map<number, number>();

  for (const cell of cells) {
    if (!useHeight) {
      heights.set(cell.id, FLAT_HEIGHT);
    } else if (cell.isLand) {
      heights.set(cell.id, cell.elevation * ELEVATION_SCALE);
    } else {
      heights.set(cell.id, OCEAN_DEPTH * ELEVATION_SCALE);
    }
  }

  return heights;
}

/**
 * Build vertex heights map from cells array.
 * Vertices are averaged from adjacent land cells.
 */
export function buildVertexHeights(
  cells: VoronoiCell[],
  useHeight: boolean
): Map<string, number> {
  if (!useHeight) {
    return new Map();
  }

  // Step 1: Build map of vertex -> all touching cell IDs
  const vertexCells = new Map<string, number[]>();

  for (const cell of cells) {
    for (const v of cell.vertices) {
      const key = vertexKey(v.x, v.y);
      if (!vertexCells.has(key)) {
        vertexCells.set(key, []);
      }
      vertexCells.get(key)!.push(cell.id);
    }
  }

  // Step 2: Compute elevation for each unique vertex (average of adjacent land cells)
  const vertexHeights = new Map<string, number>();

  for (const [key, cellIds] of vertexCells) {
    let sum = 0;
    let landCount = 0;

    for (const id of cellIds) {
      const cell = cells[id];
      if (cell && cell.isLand) {
        sum += cell.elevation;
        landCount++;
      }
    }

    const elevation = landCount > 0 ? sum / landCount : OCEAN_DEPTH;
    vertexHeights.set(key, elevation * ELEVATION_SCALE);
  }

  return vertexHeights;
}
