/**
 * Street generation for settlements.
 *
 * Creates streets along network edges within settlement territory.
 * Streets have vertices at cell boundaries to avoid rendering artifacts.
 */

import type {
  Point,
  Street,
  StreetType,
  Settlement,
  VoronoiTerrainData,
  VoronoiCell,
  NetworkEdge,
  EdgeType,
} from '@colonies/shared';

// ============================================================================
// Street Configuration
// ============================================================================

/**
 * Street width by type (in meters).
 */
const STREET_WIDTHS: Record<StreetType, number> = {
  lane: 3,
  road: 5,
  main: 8,
};

/**
 * Map network edge type to street type.
 */
function edgeTypeToStreetType(edgeType: EdgeType): StreetType {
  switch (edgeType) {
    case 'turnpike':
      return 'main';
    case 'road':
      return 'road';
    case 'trail':
    case 'none':
    default:
      return 'lane';
  }
}

/**
 * Find the shared edge between two adjacent cells.
 * Returns the midpoint of the shared edge, or null if cells don't share an edge.
 */
function findSharedEdgeMidpoint(cellA: VoronoiCell, cellB: VoronoiCell): Point | null {
  const verticesA = cellA.vertices;
  const verticesB = cellB.vertices;

  // Find vertices that are shared (or very close) between the two cells
  const sharedPoints: Point[] = [];
  const epsilon = 0.1; // Tolerance for floating point comparison

  for (const va of verticesA) {
    for (const vb of verticesB) {
      const dx = va.x - vb.x;
      const dy = va.y - vb.y;
      if (dx * dx + dy * dy < epsilon * epsilon) {
        sharedPoints.push(va);
        break;
      }
    }
  }

  // If we found at least 2 shared points, compute midpoint
  if (sharedPoints.length >= 2) {
    return {
      x: (sharedPoints[0].x + sharedPoints[1].x) / 2,
      y: (sharedPoints[0].y + sharedPoints[1].y) / 2,
    };
  }

  return null;
}

// ============================================================================
// Street Generation
// ============================================================================

/**
 * Generate streets for a settlement based on network edges within its territory.
 *
 * @param settlement - The settlement to generate streets for
 * @param terrain - The terrain data
 * @param networkEdges - All network edges
 * @returns Array of streets within the settlement
 */
export function generateStreetsForSettlement(
  settlement: Settlement,
  terrain: VoronoiTerrainData,
  networkEdges: NetworkEdge[]
): Street[] {
  const claimedCellSet = new Set(settlement.claimedCells);
  const streets: Street[] = [];
  const processedEdges = new Set<string>();
  let nextStreetId = 1;

  // Find all edges where both endpoints are in the settlement's claimed cells
  for (const edge of networkEdges) {
    if (processedEdges.has(edge.id)) continue;

    const fromInSettlement = claimedCellSet.has(edge.fromCell);
    const toInSettlement = claimedCellSet.has(edge.toCell);

    // Only create streets for edges fully within the settlement
    if (fromInSettlement && toInSettlement) {
      processedEdges.add(edge.id);

      const fromCell = terrain.cells[edge.fromCell];
      const toCell = terrain.cells[edge.toCell];

      if (!fromCell || !toCell) continue;

      // Create street path with vertex at cell boundary to avoid rendering artifacts
      const edgeMidpoint = findSharedEdgeMidpoint(fromCell, toCell);
      const path: Point[] = edgeMidpoint
        ? [
            { x: fromCell.centroid.x, y: fromCell.centroid.y },
            edgeMidpoint,
            { x: toCell.centroid.x, y: toCell.centroid.y },
          ]
        : [
            { x: fromCell.centroid.x, y: fromCell.centroid.y },
            { x: toCell.centroid.x, y: toCell.centroid.y },
          ];

      const streetType = edgeTypeToStreetType(edge.type);

      streets.push({
        id: `s${settlement.id}-${nextStreetId++}`,
        fromCell: edge.fromCell,
        toCell: edge.toCell,
        path,
        width: STREET_WIDTHS[streetType],
        type: streetType,
      });
    }
  }

  return streets;
}

/**
 * Generate streets for all settlements.
 *
 * @param settlements - All settlements
 * @param terrain - The terrain data
 * @param networkEdges - All network edges
 * @returns Array of all streets across all settlements
 */
export function generateStreets(
  settlements: Settlement[],
  terrain: VoronoiTerrainData,
  networkEdges: NetworkEdge[]
): Street[] {
  const allStreets: Street[] = [];

  for (const settlement of settlements) {
    const streets = generateStreetsForSettlement(settlement, terrain, networkEdges);
    allStreets.push(...streets);
  }

  return allStreets;
}

/**
 * Create streets as a default grid within a settlement.
 * Used when network data is not available.
 *
 * @param settlement - The settlement
 * @param terrain - The terrain data
 * @returns Array of streets forming a grid pattern
 */
export function generateDefaultStreets(
  settlement: Settlement,
  terrain: VoronoiTerrainData
): Street[] {
  const claimedCellSet = new Set(settlement.claimedCells);
  const streets: Street[] = [];
  const processedPairs = new Set<string>();
  let nextStreetId = 1;

  // Connect adjacent claimed cells
  for (const cellId of settlement.claimedCells) {
    const cell = terrain.cells[cellId];
    if (!cell) continue;

    for (const neighborId of cell.neighbors) {
      if (!claimedCellSet.has(neighborId)) continue;

      // Canonical pair ID to avoid duplicates
      const pairId = cellId < neighborId
        ? `${cellId}-${neighborId}`
        : `${neighborId}-${cellId}`;

      if (processedPairs.has(pairId)) continue;
      processedPairs.add(pairId);

      const neighbor = terrain.cells[neighborId];
      if (!neighbor) continue;

      // Create street path with vertex at cell boundary
      const edgeMidpoint = findSharedEdgeMidpoint(cell, neighbor);
      const path: Point[] = edgeMidpoint
        ? [
            { x: cell.centroid.x, y: cell.centroid.y },
            edgeMidpoint,
            { x: neighbor.centroid.x, y: neighbor.centroid.y },
          ]
        : [
            { x: cell.centroid.x, y: cell.centroid.y },
            { x: neighbor.centroid.x, y: neighbor.centroid.y },
          ];

      // Default to lane type
      streets.push({
        id: `s${settlement.id}-${nextStreetId++}`,
        fromCell: cellId,
        toCell: neighborId,
        path,
        width: STREET_WIDTHS.lane,
        type: 'lane',
      });
    }
  }

  return streets;
}
