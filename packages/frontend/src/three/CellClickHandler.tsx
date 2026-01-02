import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import type { VoronoiCell } from '@colonies/shared';
import { useSimulationStore } from '../store/simulation';

interface CellClickHandlerProps {
  cells: VoronoiCell[];
  bounds: { width: number; height: number };
}

/**
 * Invisible mesh that handles click interactions.
 * When pathfinding is enabled: two-click path finding
 * When pathfinding is disabled: single-click cell selection for debug
 */
export function CellClickHandler({ cells, bounds }: CellClickHandlerProps) {
  const pathfindingEnabled = useSimulationStore((s) => s.pathfindingEnabled);
  const pathfindingStart = useSimulationStore((s) => s.pathfindingStart);
  const setPathfindingStart = useSimulationStore((s) => s.setPathfindingStart);
  const setCurrentPath = useSimulationStore((s) => s.setCurrentPath);
  const findPath = useSimulationStore((s) => s.findPath);
  const setSelectedCell = useSimulationStore((s) => s.setSelectedCell);

  // Find the cell nearest to a point (2D, map coordinates)
  // Uses centroid distance instead of point-in-polygon because the click
  // plane is flat while terrain has elevation, causing offset issues
  const findCellAtPoint = useCallback(
    (x: number, y: number): VoronoiCell | null => {
      // Quick bounds check
      if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
        return null;
      }

      // Find nearest cell by centroid distance
      let nearestCell: VoronoiCell | null = null;
      let nearestDist = Infinity;

      for (const cell of cells) {
        const dx = cell.centroid.x - x;
        const dy = cell.centroid.y - y;
        const dist = dx * dx + dy * dy;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestCell = cell;
        }
      }

      return nearestCell;
    },
    [cells, bounds]
  );

  // Handle click on the terrain
  const handleClick = useCallback(
    (event: THREE.Event) => {
      // Get intersection point
      const intersection = (event as THREE.Event & { point?: THREE.Vector3 }).point;
      if (!intersection) return;

      // Convert from world coordinates back to map coordinates
      // VoronoiTerrainMesh offsets by bounds/2, and positions group at bounds/2
      // So world coords are in range [0, bounds.width] for x and [0, bounds.height] for z
      const mapX = intersection.x;
      const mapY = intersection.z; // z in 3D is y in 2D map

      const cell = findCellAtPoint(mapX, mapY);
      if (!cell) return;

      if (pathfindingEnabled) {
        // Pathfinding mode: two-click path finding (land cells only)
        if (!cell.isLand) return;

        if (pathfindingStart === null) {
          // First click - set start
          setPathfindingStart(cell.id);
          setCurrentPath(null);
        } else {
          // Second click - find path
          findPath(pathfindingStart, cell.id);
          setPathfindingStart(null);
        }
      } else {
        // Selection mode: select cell for debug info
        setSelectedCell(cell.id);
      }
    },
    [
      pathfindingEnabled,
      pathfindingStart,
      findCellAtPoint,
      setPathfindingStart,
      setCurrentPath,
      findPath,
      setSelectedCell,
    ]
  );

  // Create a simple plane geometry for raycasting
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(bounds.width, bounds.height);
  }, [bounds]);

  return (
    <mesh
      geometry={geometry}
      position={[bounds.width / 2, 0.1, bounds.height / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={handleClick}
    >
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
