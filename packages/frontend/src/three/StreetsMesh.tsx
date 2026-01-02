/**
 * StreetsMesh - Renders streets as flat ribbons.
 *
 * Creates ribbon geometry along street centerlines.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Street, StreetType } from '@colonies/shared';
import { useTerrainHeightStore, getCellHeight } from '../store/terrainHeight';

interface StreetsMeshProps {
  streets: Street[];
}

// Height offset above terrain (just above parcels)
const STREET_OFFSET = 0.3;

// Street colors by type
const STREET_COLORS: Record<StreetType, THREE.Color> = {
  lane: new THREE.Color(0x8b7355), // Muddy brown
  road: new THREE.Color(0x696969), // Dim gray
  main: new THREE.Color(0x4a4a4a), // Darker gray
};

/**
 * Add a ribbon segment between two points.
 */
function addRibbon(
  positions: number[],
  colors: number[],
  normals: number[],
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  width: number,
  color: THREE.Color
): void {
  // Direction vector
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);

  if (len < 0.001) return;

  // Perpendicular vector (for width)
  const px = (-dz / len) * (width / 2);
  const pz = (dx / len) * (width / 2);

  // Four corners of the ribbon
  const v0 = [x1 + px, y1, z1 + pz]; // Start left
  const v1 = [x1 - px, y1, z1 - pz]; // Start right
  const v2 = [x2 - px, y2, z2 - pz]; // End right
  const v3 = [x2 + px, y2, z2 + pz]; // End left

  // Triangle 1: v0, v1, v2
  positions.push(v0[0], v0[1], v0[2]);
  positions.push(v1[0], v1[1], v1[2]);
  positions.push(v2[0], v2[1], v2[2]);

  colors.push(color.r, color.g, color.b);
  colors.push(color.r, color.g, color.b);
  colors.push(color.r, color.g, color.b);

  normals.push(0, 1, 0);
  normals.push(0, 1, 0);
  normals.push(0, 1, 0);

  // Triangle 2: v0, v2, v3
  positions.push(v0[0], v0[1], v0[2]);
  positions.push(v2[0], v2[1], v2[2]);
  positions.push(v3[0], v3[1], v3[2]);

  colors.push(color.r, color.g, color.b);
  colors.push(color.r, color.g, color.b);
  colors.push(color.r, color.g, color.b);

  normals.push(0, 1, 0);
  normals.push(0, 1, 0);
  normals.push(0, 1, 0);
}

export function StreetsMesh({ streets }: StreetsMeshProps) {
  const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
  const useHeight = useTerrainHeightStore((s) => s.useHeight);

  const geometry = useMemo(() => {
    if (!streets || streets.length === 0) {
      return null;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const normalArr: number[] = [];

    for (const street of streets) {
      const color = STREET_COLORS[street.type];

      // Get heights for endpoints
      const fromHeight = getCellHeight(street.fromCell, cellHeights, useHeight) + STREET_OFFSET;
      const toHeight = getCellHeight(street.toCell, cellHeights, useHeight) + STREET_OFFSET;

      // Process path segments
      for (let i = 0; i < street.path.length - 1; i++) {
        const p1 = street.path[i];
        const p2 = street.path[i + 1];

        // Interpolate height along the path
        const t1 = i / Math.max(1, street.path.length - 1);
        const t2 = (i + 1) / Math.max(1, street.path.length - 1);
        const y1 = fromHeight + (toHeight - fromHeight) * t1;
        const y2 = fromHeight + (toHeight - fromHeight) * t2;

        addRibbon(
          positions,
          colors,
          normalArr,
          p1.x,
          y1,
          p1.y, // Map Y -> Three.js Z
          p2.x,
          y2,
          p2.y,
          street.width,
          color
        );
      }
    }

    if (positions.length === 0) {
      return null;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalArr, 3));

    return geo;
  }, [streets, cellHeights, useHeight]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}
