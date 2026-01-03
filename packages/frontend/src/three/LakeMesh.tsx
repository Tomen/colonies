import { useMemo } from 'react';
import * as THREE from 'three';
import type { SerializedTerrain } from '../store/simulation';
import { ELEVATION_SCALE, FLAT_HEIGHT } from '../store/terrainHeight';

interface LakeMeshProps {
  terrain: SerializedTerrain;
  useHeight: boolean;
}

const LAKE_COLOR = new THREE.Color(0x2980b9); // Deep blue

/**
 * Renders lake surfaces at their spill elevation.
 * Only renders lakes with area >= minLakeArea (already filtered by Priority-Flood).
 */
export function LakeMesh({ terrain, useHeight }: LakeMeshProps) {
  const geometry = useMemo(() => {
    const { cells, bounds, lakes } = terrain;
    if (!lakes || lakes.length === 0) return null;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    const offsetX = bounds.width / 2;
    const offsetZ = bounds.height / 2;

    for (const lake of lakes) {
      // Compute water surface Y position
      const waterY = useHeight
        ? lake.waterLevel * ELEVATION_SCALE + 0.1 // Slight offset to avoid z-fighting
        : FLAT_HEIGHT + 0.1;

      // Render lake surface as union of cell polygons at waterLevel
      for (const cellId of lake.cellIds) {
        const cell = cells[cellId];
        if (!cell || cell.vertices.length < 3) continue;

        // Only render cells that are actually below water level
        if (cell.elevation >= lake.waterLevel) continue;

        const cx = cell.centroid.x - offsetX;
        const cz = cell.centroid.y - offsetZ;

        // Fan triangulation from centroid
        for (let i = 0; i < cell.vertices.length; i++) {
          const v0 = cell.vertices[i];
          const v1 = cell.vertices[(i + 1) % cell.vertices.length];

          const x0 = v0.x - offsetX;
          const z0 = v0.y - offsetZ;
          const x1 = v1.x - offsetX;
          const z1 = v1.y - offsetZ;

          // Triangle: center, v0, v1
          positions.push(cx, waterY, cz);
          positions.push(x0, waterY, z0);
          positions.push(x1, waterY, z1);

          // Flat upward normals
          for (let j = 0; j < 3; j++) {
            normals.push(0, 1, 0);
          }

          // Lake color for all vertices
          for (let j = 0; j < 3; j++) {
            colors.push(LAKE_COLOR.r, LAKE_COLOR.g, LAKE_COLOR.b);
          }
        }
      }
    }

    if (positions.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [terrain, useHeight]);

  if (!geometry) return null;

  const { bounds } = terrain;

  return (
    <mesh
      geometry={geometry}
      position={[bounds.width / 2, 0, bounds.height / 2]}
    >
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        metalness={0.2}
        roughness={0.6}
      />
    </mesh>
  );
}
