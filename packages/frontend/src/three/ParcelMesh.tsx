import { useMemo } from 'react';
import * as THREE from 'three';
import type { Parcel, LandUse } from '@colonies/shared';
import { useTerrainHeightStore, getCellHeight } from '../store/terrainHeight';

interface ParcelMeshProps {
  parcels: Parcel[];
  showWireframe?: boolean;
  showFill?: boolean;
}

// Land use colors
const LAND_USE_COLORS: Record<LandUse, number> = {
  wilderness: 0x228b22, // Forest green
  forest: 0x006400, // Dark green
  field: 0xdaa520, // Goldenrod
  pasture: 0x90ee90, // Light green
  residential: 0x8b4513, // Saddle brown
  commercial: 0x4169e1, // Royal blue
  industrial: 0x696969, // Dim gray
  civic: 0xffd700, // Gold
};

const WIREFRAME_COLOR = 0xffffff;

// Small offset above terrain surface to prevent z-fighting
const PARCEL_OFFSET = 1;
const WIREFRAME_OFFSET = 1.5;

export function ParcelMesh({
  parcels,
  showWireframe = true,
  showFill = true,
}: ParcelMeshProps) {
  const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
  const useHeight = useTerrainHeightStore((s) => s.useHeight);

  const { fillGeometry, wireframeGeometry } = useMemo(() => {
    if (parcels.length === 0) {
      return { fillGeometry: null, wireframeGeometry: null };
    }

    // Calculate total triangles needed (fan triangulation)
    let totalTriangles = 0;
    for (const parcel of parcels) {
      if (parcel.vertices.length >= 3) {
        totalTriangles += parcel.vertices.length - 2;
      }
    }

    // Create fill geometry
    const positions = new Float32Array(totalTriangles * 3 * 3);
    const colors = new Float32Array(totalTriangles * 3 * 3);

    // Create wireframe geometry (lines for each edge)
    let totalEdges = 0;
    for (const parcel of parcels) {
      totalEdges += parcel.vertices.length;
    }
    const linePositions = new Float32Array(totalEdges * 2 * 3);

    let triIndex = 0;
    let lineIndex = 0;

    for (const parcel of parcels) {
      const verts = parcel.vertices;
      if (verts.length < 3) continue;

      // Get height from terrain cell
      const baseHeight = getCellHeight(parcel.terrainCellId, cellHeights, useHeight);
      const parcelHeight = baseHeight + PARCEL_OFFSET;
      const wireHeight = baseHeight + WIREFRAME_OFFSET;

      const color = new THREE.Color(LAND_USE_COLORS[parcel.landUse]);

      // Fan triangulation from first vertex
      for (let i = 1; i < verts.length - 1; i++) {
        const v0 = verts[0];
        const v1 = verts[i];
        const v2 = verts[i + 1];

        // Coordinates match terrain (not centered - terrain uses [0, mapSize] range)
        positions[triIndex * 9 + 0] = v0.x;
        positions[triIndex * 9 + 1] = parcelHeight;
        positions[triIndex * 9 + 2] = v0.y;

        positions[triIndex * 9 + 3] = v1.x;
        positions[triIndex * 9 + 4] = parcelHeight;
        positions[triIndex * 9 + 5] = v1.y;

        positions[triIndex * 9 + 6] = v2.x;
        positions[triIndex * 9 + 7] = parcelHeight;
        positions[triIndex * 9 + 8] = v2.y;

        // Colors for each vertex
        for (let j = 0; j < 3; j++) {
          colors[triIndex * 9 + j * 3 + 0] = color.r;
          colors[triIndex * 9 + j * 3 + 1] = color.g;
          colors[triIndex * 9 + j * 3 + 2] = color.b;
        }

        triIndex++;
      }

      // Wireframe edges
      for (let i = 0; i < verts.length; i++) {
        const v0 = verts[i];
        const v1 = verts[(i + 1) % verts.length];

        linePositions[lineIndex * 6 + 0] = v0.x;
        linePositions[lineIndex * 6 + 1] = wireHeight;
        linePositions[lineIndex * 6 + 2] = v0.y;

        linePositions[lineIndex * 6 + 3] = v1.x;
        linePositions[lineIndex * 6 + 4] = wireHeight;
        linePositions[lineIndex * 6 + 5] = v1.y;

        lineIndex++;
      }
    }

    // Create fill geometry
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Create wireframe geometry
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    return { fillGeometry: fillGeo, wireframeGeometry: wireGeo };
  }, [parcels, cellHeights, useHeight]);

  if (!fillGeometry || !wireframeGeometry) {
    return null;
  }

  return (
    <group>
      {showFill && (
        <mesh geometry={fillGeometry}>
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {showWireframe && (
        <lineSegments geometry={wireframeGeometry}>
          <lineBasicMaterial color={WIREFRAME_COLOR} linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
}
