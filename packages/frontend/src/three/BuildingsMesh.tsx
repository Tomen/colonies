/**
 * BuildingsMesh - Renders procedural 3D buildings.
 *
 * Creates batched geometry for all buildings with walls and roofs.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Building } from '@colonies/shared';
import { useTerrainHeightStore, getCellHeight } from '../store/terrainHeight';
import { useSimulationStore } from '../store/simulation';

interface BuildingsMeshProps {
  buildings: Building[];
}

// Height offset above terrain
const BUILDING_OFFSET = 0.5;

// Roof height as fraction of wall height
const ROOF_HEIGHT_RATIO = 0.4;

/**
 * Parse hex color string to THREE.Color.
 */
function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * Add a box (walls) to the geometry arrays.
 */
function addBox(
  positions: number[],
  colors: number[],
  normals: number[],
  cx: number,
  cy: number,
  cz: number,
  width: number,
  height: number,
  depth: number,
  rotation: number,
  color: THREE.Color
): void {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Transform local point to world coordinates
  const transform = (lx: number, ly: number, lz: number): [number, number, number] => {
    const rx = lx * cos - lz * sin;
    const rz = lx * sin + lz * cos;
    return [cx + rx, cy + ly, cz + rz];
  };

  // Box vertices (local coordinates)
  const v = [
    [-hw, -hh, -hd], // 0: back-bottom-left
    [hw, -hh, -hd], // 1: back-bottom-right
    [hw, hh, -hd], // 2: back-top-right
    [-hw, hh, -hd], // 3: back-top-left
    [-hw, -hh, hd], // 4: front-bottom-left
    [hw, -hh, hd], // 5: front-bottom-right
    [hw, hh, hd], // 6: front-top-right
    [-hw, hh, hd], // 7: front-top-left
  ];

  // Faces (two triangles each)
  const faces = [
    // Front face
    { verts: [4, 5, 6, 7], normal: [0, 0, 1] },
    // Back face
    { verts: [1, 0, 3, 2], normal: [0, 0, -1] },
    // Left face
    { verts: [0, 4, 7, 3], normal: [-1, 0, 0] },
    // Right face
    { verts: [5, 1, 2, 6], normal: [1, 0, 0] },
    // Top face
    { verts: [7, 6, 2, 3], normal: [0, 1, 0] },
    // Bottom face
    { verts: [0, 1, 5, 4], normal: [0, -1, 0] },
  ];

  for (const face of faces) {
    const [a, b, c, d] = face.verts;
    const [nx, ny, nz] = face.normal;

    // Transform normal by rotation
    const rnx = nx * cos - nz * sin;
    const rnz = nx * sin + nz * cos;

    // Triangle 1: a, b, c
    const [ax, ay, az] = transform(v[a][0], v[a][1], v[a][2]);
    const [bx, by, bz] = transform(v[b][0], v[b][1], v[b][2]);
    const [cx2, cy2, cz2] = transform(v[c][0], v[c][1], v[c][2]);
    const [dx, dy, dz] = transform(v[d][0], v[d][1], v[d][2]);

    positions.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
    normals.push(rnx, ny, rnz, rnx, ny, rnz, rnx, ny, rnz);

    // Triangle 2: a, c, d
    positions.push(ax, ay, az, cx2, cy2, cz2, dx, dy, dz);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
    normals.push(rnx, ny, rnz, rnx, ny, rnz, rnx, ny, rnz);
  }
}

/**
 * Add a gable roof to the geometry arrays.
 */
function addGableRoof(
  positions: number[],
  colors: number[],
  normals: number[],
  cx: number,
  wallTopY: number,
  cz: number,
  width: number,
  roofHeight: number,
  depth: number,
  rotation: number,
  color: THREE.Color
): void {
  const hw = width / 2;
  const hd = depth / 2;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const transform = (lx: number, ly: number, lz: number): [number, number, number] => {
    const rx = lx * cos - lz * sin;
    const rz = lx * sin + lz * cos;
    return [cx + rx, wallTopY + ly, cz + rz];
  };

  // Roof vertices
  const baseCorners = [
    [-hw, 0, -hd], // 0: back-left
    [hw, 0, -hd], // 1: back-right
    [hw, 0, hd], // 2: front-right
    [-hw, 0, hd], // 3: front-left
  ];

  const ridgePoints = [
    [0, roofHeight, -hd], // 4: back ridge
    [0, roofHeight, hd], // 5: front ridge
  ];

  // Left slope: 0, 3, 5, 4
  const [l0x, l0y, l0z] = transform(baseCorners[0][0], baseCorners[0][1], baseCorners[0][2]);
  const [l3x, l3y, l3z] = transform(baseCorners[3][0], baseCorners[3][1], baseCorners[3][2]);
  const [r5x, r5y, r5z] = transform(ridgePoints[1][0], ridgePoints[1][1], ridgePoints[1][2]);
  const [r4x, r4y, r4z] = transform(ridgePoints[0][0], ridgePoints[0][1], ridgePoints[0][2]);

  // Calculate normal for left slope
  const leftNormal = new THREE.Vector3(-1, hw / roofHeight, 0).normalize();
  const lnx = leftNormal.x * cos - leftNormal.z * sin;
  const lnz = leftNormal.x * sin + leftNormal.z * cos;

  positions.push(l0x, l0y, l0z, l3x, l3y, l3z, r5x, r5y, r5z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  normals.push(lnx, leftNormal.y, lnz, lnx, leftNormal.y, lnz, lnx, leftNormal.y, lnz);

  positions.push(l0x, l0y, l0z, r5x, r5y, r5z, r4x, r4y, r4z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  normals.push(lnx, leftNormal.y, lnz, lnx, leftNormal.y, lnz, lnx, leftNormal.y, lnz);

  // Right slope: 1, 2, 5, 4
  const [r1x, r1y, r1z] = transform(baseCorners[1][0], baseCorners[1][1], baseCorners[1][2]);
  const [r2x, r2y, r2z] = transform(baseCorners[2][0], baseCorners[2][1], baseCorners[2][2]);

  const rightNormal = new THREE.Vector3(1, hw / roofHeight, 0).normalize();
  const rnx = rightNormal.x * cos - rightNormal.z * sin;
  const rnz = rightNormal.x * sin + rightNormal.z * cos;

  positions.push(r1x, r1y, r1z, r4x, r4y, r4z, r5x, r5y, r5z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  normals.push(rnx, rightNormal.y, rnz, rnx, rightNormal.y, rnz, rnx, rightNormal.y, rnz);

  positions.push(r1x, r1y, r1z, r5x, r5y, r5z, r2x, r2y, r2z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  normals.push(rnx, rightNormal.y, rnz, rnx, rightNormal.y, rnz, rnx, rightNormal.y, rnz);

  // Front gable triangle: 3, 2, 5
  positions.push(l3x, l3y, l3z, r2x, r2y, r2z, r5x, r5y, r5z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  const fnz = cos;
  const fnx = -sin;
  normals.push(fnx, 0, fnz, fnx, 0, fnz, fnx, 0, fnz);

  // Back gable triangle: 0, 1, 4
  positions.push(l0x, l0y, l0z, r4x, r4y, r4z, r1x, r1y, r1z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  const bnz = -cos;
  const bnx = sin;
  normals.push(bnx, 0, bnz, bnx, 0, bnz, bnx, 0, bnz);
}

/**
 * Add a flat roof to the geometry arrays.
 */
function addFlatRoof(
  positions: number[],
  colors: number[],
  normals: number[],
  cx: number,
  wallTopY: number,
  cz: number,
  width: number,
  depth: number,
  rotation: number,
  color: THREE.Color
): void {
  const hw = width / 2;
  const hd = depth / 2;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const transform = (lx: number, lz: number): [number, number, number] => {
    const rx = lx * cos - lz * sin;
    const rz = lx * sin + lz * cos;
    return [cx + rx, wallTopY, cz + rz];
  };

  const [ax, ay, az] = transform(-hw, -hd);
  const [bx, by, bz] = transform(hw, -hd);
  const [cx2, cy2, cz2] = transform(hw, hd);
  const [dx, dy, dz] = transform(-hw, hd);

  // Two triangles for flat roof
  positions.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);

  positions.push(ax, ay, az, cx2, cy2, cz2, dx, dy, dz);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
}

export function BuildingsMesh({ buildings }: BuildingsMeshProps) {
  const terrain = useSimulationStore((s) => s.terrain);
  const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
  const useHeight = useTerrainHeightStore((s) => s.useHeight);

  const geometry = useMemo(() => {
    if (!buildings || buildings.length === 0 || !terrain) {
      return null;
    }

    // Build cell ID to parcel cell ID mapping
    const parcelToCellId = new Map<string, number>();
    for (const parcel of terrain.parcels) {
      parcelToCellId.set(parcel.id, parcel.terrainCellId);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const normalArr: number[] = [];

    for (const building of buildings) {
      const cellId = parcelToCellId.get(building.parcelId);
      if (cellId === undefined) continue;

      const baseY = getCellHeight(cellId, cellHeights, useHeight) + BUILDING_OFFSET;
      const wallHeight = building.height;
      const roofHeight = wallHeight * ROOF_HEIGHT_RATIO;

      const wallColor = hexToColor(building.style.wallColor);
      const roofColor = hexToColor(building.style.roofColor);

      // Position in Three.js coordinates (x, y, z where y is up)
      const cx = building.position.x;
      const cz = building.position.y; // Map Y -> Three.js Z

      // Add walls
      addBox(
        positions,
        colors,
        normalArr,
        cx,
        baseY + wallHeight / 2,
        cz,
        building.width,
        wallHeight,
        building.depth,
        building.rotation,
        wallColor
      );

      // Add roof based on type
      const wallTopY = baseY + wallHeight;
      if (building.style.roofType === 'gable') {
        addGableRoof(
          positions,
          colors,
          normalArr,
          cx,
          wallTopY,
          cz,
          building.width,
          roofHeight,
          building.depth,
          building.rotation,
          roofColor
        );
      } else if (building.style.roofType === 'hip') {
        // Hip roof - use gable for now (TODO: proper hip roof)
        addGableRoof(
          positions,
          colors,
          normalArr,
          cx,
          wallTopY,
          cz,
          building.width,
          roofHeight,
          building.depth,
          building.rotation,
          roofColor
        );
      } else {
        // Flat roof
        addFlatRoof(
          positions,
          colors,
          normalArr,
          cx,
          wallTopY,
          cz,
          building.width,
          building.depth,
          building.rotation,
          roofColor
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
  }, [buildings, terrain, cellHeights, useHeight]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  );
}
