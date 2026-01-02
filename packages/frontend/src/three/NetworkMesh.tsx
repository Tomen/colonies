import { useMemo } from 'react';
import * as THREE from 'three';
import type { VoronoiCell, NetworkEdge, SettlementPath, PathResult } from '@colonies/shared';
import { useTerrainHeightStore, getCellHeight } from '../store/terrainHeight';
import type { NetworkMode } from '../store/simulation';

interface NetworkMeshProps {
  cells: VoronoiCell[];
  edges: NetworkEdge[];
  settlementPaths: SettlementPath[];
  currentPath: PathResult | null;
  mode: NetworkMode;
}

// Small offset above terrain surface
const NETWORK_OFFSET = 2;
const PATH_OFFSET = 3;

/**
 * Convert a normalized value (0-1) to color using green→yellow→red heatmap.
 */
function percentileToColor(t: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, t));

  // Green (0, 1, 0) → Yellow (1, 1, 0) → Red (1, 0, 0)
  if (clamped < 0.5) {
    return new THREE.Color(clamped * 2, 1, 0); // green → yellow
  } else {
    return new THREE.Color(1, 2 - clamped * 2, 0); // yellow → red
  }
}

export function NetworkMesh({
  cells,
  edges,
  settlementPaths,
  currentPath,
  mode,
}: NetworkMeshProps) {
  const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
  const useHeight = useTerrainHeightStore((s) => s.useHeight);

  // Build cell lookup for fast access
  const cellMap = useMemo(() => {
    const map = new Map<number, VoronoiCell>();
    for (const cell of cells) {
      map.set(cell.id, cell);
    }
    return map;
  }, [cells]);

  // Create edge geometry (cost heatmap)
  const edgeGeometry = useMemo(() => {
    if (mode !== 'cost' || edges.length === 0) return null;

    // Filter for land-to-land edges only (water edges have artificially high costs)
    const landEdges = edges.filter((e) => {
      if (!isFinite(e.baseCost) || e.baseCost <= 0) return false;
      const fromCell = cellMap.get(e.fromCell);
      const toCell = cellMap.get(e.toCell);
      return fromCell?.isLand && toCell?.isLand;
    });
    if (landEdges.length === 0) return null;

    // Use percentile-based coloring for even distribution
    // Sort costs and create a lookup for percentile ranking
    const sortedCosts = landEdges.map((e) => e.baseCost).sort((a, b) => a - b);
    const costToPercentile = new Map<number, number>();
    for (let i = 0; i < sortedCosts.length; i++) {
      // Use the highest percentile for duplicate costs
      costToPercentile.set(sortedCosts[i], i / (sortedCosts.length - 1));
    }

    const positions = new Float32Array(landEdges.length * 2 * 3);
    const colors = new Float32Array(landEdges.length * 2 * 3);

    let idx = 0;
    for (const edge of landEdges) {
      const fromCell = cellMap.get(edge.fromCell);
      const toCell = cellMap.get(edge.toCell);
      if (!fromCell || !toCell) continue;

      const fromHeight = getCellHeight(edge.fromCell, cellHeights, useHeight) + NETWORK_OFFSET;
      const toHeight = getCellHeight(edge.toCell, cellHeights, useHeight) + NETWORK_OFFSET;

      // Use percentile for even color distribution
      const percentile = costToPercentile.get(edge.baseCost) ?? 0;
      const color = percentileToColor(percentile);

      // From vertex
      positions[idx * 6 + 0] = fromCell.centroid.x;
      positions[idx * 6 + 1] = fromHeight;
      positions[idx * 6 + 2] = fromCell.centroid.y;

      // To vertex
      positions[idx * 6 + 3] = toCell.centroid.x;
      positions[idx * 6 + 4] = toHeight;
      positions[idx * 6 + 5] = toCell.centroid.y;

      // Colors (same for both vertices of line segment)
      colors[idx * 6 + 0] = color.r;
      colors[idx * 6 + 1] = color.g;
      colors[idx * 6 + 2] = color.b;
      colors[idx * 6 + 3] = color.r;
      colors[idx * 6 + 4] = color.g;
      colors[idx * 6 + 5] = color.b;

      idx++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, idx * 6), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, idx * 6), 3));
    return geo;
  }, [edges, cellMap, cellHeights, useHeight, mode]);

  // Create settlement paths geometry
  const pathsGeometry = useMemo(() => {
    if (mode !== 'paths' || settlementPaths.length === 0) return null;

    // Count total line segments
    let totalSegments = 0;
    for (const sp of settlementPaths) {
      if (sp.path.length >= 2) {
        totalSegments += sp.path.length - 1;
      }
    }
    if (totalSegments === 0) return null;

    const positions = new Float32Array(totalSegments * 2 * 3);
    const colors = new Float32Array(totalSegments * 2 * 3);

    // Different colors for different paths
    const pathColors = [
      new THREE.Color(0x00ffff), // Cyan
      new THREE.Color(0xff00ff), // Magenta
      new THREE.Color(0xffff00), // Yellow
      new THREE.Color(0xff8800), // Orange
      new THREE.Color(0x88ff00), // Lime
      new THREE.Color(0x00ff88), // Mint
      new THREE.Color(0x8800ff), // Purple
      new THREE.Color(0xff0088), // Pink
    ];

    let idx = 0;
    let pathIndex = 0;
    for (const sp of settlementPaths) {
      if (sp.path.length < 2) continue;

      const color = pathColors[pathIndex % pathColors.length];
      pathIndex++;

      for (let i = 0; i < sp.path.length - 1; i++) {
        const fromCellId = sp.path[i];
        const toCellId = sp.path[i + 1];
        const fromCell = cellMap.get(fromCellId);
        const toCell = cellMap.get(toCellId);
        if (!fromCell || !toCell) continue;

        const fromHeight = getCellHeight(fromCellId, cellHeights, useHeight) + PATH_OFFSET;
        const toHeight = getCellHeight(toCellId, cellHeights, useHeight) + PATH_OFFSET;

        positions[idx * 6 + 0] = fromCell.centroid.x;
        positions[idx * 6 + 1] = fromHeight;
        positions[idx * 6 + 2] = fromCell.centroid.y;

        positions[idx * 6 + 3] = toCell.centroid.x;
        positions[idx * 6 + 4] = toHeight;
        positions[idx * 6 + 5] = toCell.centroid.y;

        colors[idx * 6 + 0] = color.r;
        colors[idx * 6 + 1] = color.g;
        colors[idx * 6 + 2] = color.b;
        colors[idx * 6 + 3] = color.r;
        colors[idx * 6 + 4] = color.g;
        colors[idx * 6 + 5] = color.b;

        idx++;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, idx * 6), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, idx * 6), 3));
    return geo;
  }, [settlementPaths, cellMap, cellHeights, useHeight, mode]);

  // Create current path geometry (from click-to-path interaction)
  const currentPathGeometry = useMemo(() => {
    if (!currentPath || !currentPath.success || currentPath.path.length < 2) return null;

    const segments = currentPath.path.length - 1;
    const positions = new Float32Array(segments * 2 * 3);

    let idx = 0;
    for (let i = 0; i < currentPath.path.length - 1; i++) {
      const fromCellId = currentPath.path[i];
      const toCellId = currentPath.path[i + 1];
      const fromCell = cellMap.get(fromCellId);
      const toCell = cellMap.get(toCellId);
      if (!fromCell || !toCell) continue;

      const fromHeight = getCellHeight(fromCellId, cellHeights, useHeight) + PATH_OFFSET + 1;
      const toHeight = getCellHeight(toCellId, cellHeights, useHeight) + PATH_OFFSET + 1;

      positions[idx * 6 + 0] = fromCell.centroid.x;
      positions[idx * 6 + 1] = fromHeight;
      positions[idx * 6 + 2] = fromCell.centroid.y;

      positions[idx * 6 + 3] = toCell.centroid.x;
      positions[idx * 6 + 4] = toHeight;
      positions[idx * 6 + 5] = toCell.centroid.y;

      idx++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, idx * 6), 3));
    return geo;
  }, [currentPath, cellMap, cellHeights, useHeight]);

  if (mode === 'off' && !currentPath) {
    return null;
  }

  return (
    <group>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial vertexColors transparent opacity={0.6} />
        </lineSegments>
      )}
      {pathsGeometry && (
        <lineSegments geometry={pathsGeometry}>
          <lineBasicMaterial vertexColors linewidth={2} />
        </lineSegments>
      )}
      {currentPathGeometry && (
        <lineSegments geometry={currentPathGeometry}>
          <lineBasicMaterial color={0xffffff} linewidth={3} />
        </lineSegments>
      )}
    </group>
  );
}
