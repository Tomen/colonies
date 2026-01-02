import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import type { VoronoiCell } from '@colonies/shared';
import { useSimulationStore } from '../store/simulation';

interface CellClickHandlerProps {
  cells: VoronoiCell[];
  bounds: { width: number; height: number };
}

/**
 * Invisible mesh that handles click-to-path interactions.
 * Raycasts to find which cell was clicked and manages pathfinding state.
 */
export function CellClickHandler({ cells, bounds }: CellClickHandlerProps) {
  const pathfindingEnabled = useSimulationStore((s) => s.pathfindingEnabled);
  const pathfindingStart = useSimulationStore((s) => s.pathfindingStart);
  const setPathfindingStart = useSimulationStore((s) => s.setPathfindingStart);
  const setCurrentPath = useSimulationStore((s) => s.setCurrentPath);
  const findPath = useSimulationStore((s) => s.findPath);

  // Find which cell contains a point (2D, map coordinates)
  const findCellAtPoint = useCallback(
    (x: number, y: number): VoronoiCell | null => {
      // Quick bounds check
      if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
        return null;
      }

      // Check each cell (could be optimized with spatial index)
      for (const cell of cells) {
        if (pointInPolygon(x, y, cell.vertices)) {
          return cell;
        }
      }
      return null;
    },
    [cells, bounds]
  );

  // Handle click on the terrain
  const handleClick = useCallback(
    (event: THREE.Event) => {
      if (!pathfindingEnabled) return;

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

      // Only allow clicking on land cells
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
    },
    [
      pathfindingEnabled,
      pathfindingStart,
      findCellAtPoint,
      setPathfindingStart,
      setCurrentPath,
      findPath,
    ]
  );

  // Create a simple plane geometry for raycasting
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(bounds.width, bounds.height);
  }, [bounds]);

  if (!pathfindingEnabled) {
    return null;
  }

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

/**
 * Point-in-polygon test using ray casting algorithm
 */
function pointInPolygon(
  x: number,
  y: number,
  vertices: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}
