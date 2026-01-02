import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { SerializedTerrain, RiverMode, TextureMode } from '../store/simulation';
import type { VoronoiCell } from '@colonies/shared';
import {
  useTerrainHeightStore,
  buildCellHeights,
  buildVertexHeights,
  ELEVATION_SCALE,
  FLAT_HEIGHT,
  OCEAN_DEPTH,
} from '../store/terrainHeight';

interface VoronoiTerrainMeshProps {
  terrain: SerializedTerrain;
  carveRivers: boolean;
  riverMode: RiverMode;
  useHeight: boolean;
  textureMode: TextureMode;
}

// Color palette matching grid renderer
const OCEAN_COLOR = new THREE.Color(0x1a5276);
const COAST_COLOR = new THREE.Color(0x2e86ab);
const LOWLAND_COLOR = new THREE.Color(0x58a05c);
const MIDLAND_COLOR = new THREE.Color(0x8b7355);
const HIGHLAND_COLOR = new THREE.Color(0x6b5344);
const PEAK_COLOR = new THREE.Color(0xffffff);
const RIVER_COLOR = new THREE.Color(0x3498db);
const VORONOI_COLOR = new THREE.Color(0xcccccc); // Light gray for voronoi mode

const RIVER_THRESHOLD = 50;

// V-shaped channel parameters
const W_O = 6; // Outer width: distance between bank lines
const W_I = 3; // Inner width: distance between floor lines
const RIVER_BANK_COLOR = new THREE.Color(0x8b7355); // Brown/muddy bank color

function getTerrainColor(cell: VoronoiCell, maxElevation: number): THREE.Color {
  if (!cell.isLand) return OCEAN_COLOR;
  if (cell.isCoast) return COAST_COLOR;

  const t = Math.min(cell.elevation / maxElevation, 1);

  if (t < 0.2) {
    return LOWLAND_COLOR.clone().lerp(MIDLAND_COLOR, t / 0.2);
  }
  if (t < 0.6) {
    return MIDLAND_COLOR.clone().lerp(HIGHLAND_COLOR, (t - 0.2) / 0.4);
  }
  return HIGHLAND_COLOR.clone().lerp(PEAK_COLOR, (t - 0.6) / 0.4);
}

// Hash vertex coordinates to a string key for consistent lookups
function vertexKey(x: number, y: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

// Pre-compute vertex elevations (no river carving - banks handle that)
function buildVertexElevationMap(cells: VoronoiCell[]): Map<string, number> {
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
  const vertexElevation = new Map<string, number>();

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

    const elevation = landCount > 0 ? sum / landCount : -5;
    vertexElevation.set(key, elevation);
  }

  return vertexElevation;
}

// Find the neighbor cell that shares an edge (both vertices)
function findNeighborForEdge(
  cell: VoronoiCell,
  v0: { x: number; y: number },
  v1: { x: number; y: number },
  cells: VoronoiCell[]
): VoronoiCell | null {
  const eps = 0.01;
  for (const neighborId of cell.neighbors) {
    const neighbor = cells[neighborId];
    if (!neighbor) continue;

    // Check if neighbor has both edge vertices
    let hasV0 = false;
    let hasV1 = false;
    for (const nv of neighbor.vertices) {
      if (Math.abs(nv.x - v0.x) < eps && Math.abs(nv.y - v0.y) < eps) hasV0 = true;
      if (Math.abs(nv.x - v1.x) < eps && Math.abs(nv.y - v1.y) < eps) hasV1 = true;
    }

    if (hasV0 && hasV1) return neighbor;
  }
  return null;
}

// Compute carve depth for a river cell
function computeCarveDepth(cell: VoronoiCell): number {
  return Math.min(
    Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
    cell.elevation * 0.5
  );
}

// Build geometry for a river cell with V-shaped channel (bank + floor lines)
function buildRiverCellGeometry(
  cell: VoronoiCell,
  cells: VoronoiCell[],
  bounds: { width: number; height: number },
  elevationScale: number,
  carvedElevation: number,
  terrainColor: THREE.Color,
  _riverColor: THREE.Color, // No longer used - banks use RIVER_BANK_COLOR
  vertexElevations: Map<string, number> | null,
  positions: number[],
  colors: number[],
  normals: number[],
  flatHeight: number
) {
  const cx = cell.centroid.x - bounds.width / 2;
  const cz = cell.centroid.y - bounds.height / 2;

  // Heights for this cell
  const yOriginal = elevationScale > 0 ? cell.elevation * elevationScale : flatHeight;
  const yCarved = elevationScale > 0 ? carvedElevation * elevationScale : flatHeight;

  // Helper to push a triangle
  const addTriangle = (
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    color: THREE.Color
  ) => {
    positions.push(p0.x, p0.y, p0.z);
    positions.push(p1.x, p1.y, p1.z);
    positions.push(p2.x, p2.y, p2.z);
    for (let j = 0; j < 3; j++) {
      colors.push(color.r, color.g, color.b);
      normals.push(0, 1, 0);
    }
  };

  // Process each edge of the cell
  for (let i = 0; i < cell.vertices.length; i++) {
    const v0 = cell.vertices[i];
    const v1 = cell.vertices[(i + 1) % cell.vertices.length];

    // Check if neighbor is also a river cell
    const neighbor = findNeighborForEdge(cell, v0, v1, cells);
    const neighborIsRiver =
      neighbor && neighbor.isLand && neighbor.flowAccumulation >= RIVER_THRESHOLD;

    // Vertex positions (world coords, centered)
    const x0 = v0.x - bounds.width / 2;
    const z0 = v0.y - bounds.height / 2;
    const x1 = v1.x - bounds.width / 2;
    const z1 = v1.y - bounds.height / 2;

    // Terrain vertex heights
    const yV0 = vertexElevations
      ? (vertexElevations.get(vertexKey(v0.x, v0.y)) ?? -5) * elevationScale
      : flatHeight;
    const yV1 = vertexElevations
      ? (vertexElevations.get(vertexKey(v1.x, v1.y)) ?? -5) * elevationScale
      : flatHeight;

    if (neighborIsRiver) {
      // === CASE 2: Shared edge with river neighbor ===
      // b and f points are along the edge itself

      // Edge midpoint
      const ex = (v0.x + v1.x) / 2;
      const ey = (v0.y + v1.y) / 2;

      // Edge direction (normalized)
      const edgeDx = v1.x - v0.x;
      const edgeDy = v1.y - v0.y;
      const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
      const edgeDirX = edgeDx / edgeLen;
      const edgeDirY = edgeDy / edgeLen;

      // Clamp widths to edge length
      const halfWo = Math.min(W_O / 2, edgeLen * 0.4);
      const halfWi = Math.min(W_I / 2, edgeLen * 0.2);

      // Bank points (b0, b1) along edge at W_O/2 from midpoint
      const b0x = ex - edgeDirX * halfWo - bounds.width / 2;
      const b0z = ey - edgeDirY * halfWo - bounds.height / 2;
      const b1x = ex + edgeDirX * halfWo - bounds.width / 2;
      const b1z = ey + edgeDirY * halfWo - bounds.height / 2;

      // Floor points (f0, f1) along edge at W_I/2 from midpoint
      const f0x = ex - edgeDirX * halfWi - bounds.width / 2;
      const f0z = ey - edgeDirY * halfWi - bounds.height / 2;
      const f1x = ex + edgeDirX * halfWi - bounds.width / 2;
      const f1z = ey + edgeDirY * halfWi - bounds.height / 2;

      // Heights for shared edge
      const neighborOriginal = neighbor.elevation * elevationScale;
      const yBank = (yOriginal + neighborOriginal) / 2; // Average of both cells' original
      const neighborCarvedElev = neighbor.elevation - computeCarveDepth(neighbor);
      const yFloor = elevationScale > 0
        ? (carvedElevation + neighborCarvedElev) * elevationScale / 2
        : flatHeight;

      // 3D points
      const pV0 = { x: x0, y: yV0, z: z0 };
      const pV1 = { x: x1, y: yV1, z: z1 };
      const pB0 = { x: b0x, y: yBank, z: b0z };
      const pB1 = { x: b1x, y: yBank, z: b1z };
      const pF0 = { x: f0x, y: yFloor, z: f0z };
      const pF1 = { x: f1x, y: yFloor, z: f1z };
      const pC = { x: cx, y: yCarved, z: cz };

      // 5 triangles for shared edge
      addTriangle(pV0, pB0, pC, terrainColor);        // Outer left
      addTriangle(pB0, pF0, pC, RIVER_BANK_COLOR);    // Bank left
      addTriangle(pF0, pF1, pC, RIVER_BANK_COLOR);    // Floor
      addTriangle(pF1, pB1, pC, RIVER_BANK_COLOR);    // Bank right
      addTriangle(pB1, pV1, pC, terrainColor);        // Outer right

    } else {
      // === CASE 1: Edge to non-river neighbor ===
      // b and f points are on spokes from centroid toward vertices

      // Direction from centroid to each vertex
      const dx0 = v0.x - cell.centroid.x;
      const dy0 = v0.y - cell.centroid.y;
      const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);

      const dx1 = v1.x - cell.centroid.x;
      const dy1 = v1.y - cell.centroid.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      // Clamp widths to spoke lengths
      const halfWo0 = Math.min(W_O / 2, len0 * 0.8);
      const halfWi0 = Math.min(W_I / 2, len0 * 0.6);
      const halfWo1 = Math.min(W_O / 2, len1 * 0.8);
      const halfWi1 = Math.min(W_I / 2, len1 * 0.6);

      // Bank points (at W_O/2 from centroid toward vertex)
      const b0x = len0 > 0 ? cell.centroid.x + (dx0 / len0) * halfWo0 : cell.centroid.x;
      const b0z = len0 > 0 ? cell.centroid.y + (dy0 / len0) * halfWo0 : cell.centroid.y;
      const b1x = len1 > 0 ? cell.centroid.x + (dx1 / len1) * halfWo1 : cell.centroid.x;
      const b1z = len1 > 0 ? cell.centroid.y + (dy1 / len1) * halfWo1 : cell.centroid.y;

      // Floor points (at W_I/2 from centroid toward vertex)
      const f0x = len0 > 0 ? cell.centroid.x + (dx0 / len0) * halfWi0 : cell.centroid.x;
      const f0z = len0 > 0 ? cell.centroid.y + (dy0 / len0) * halfWi0 : cell.centroid.y;
      const f1x = len1 > 0 ? cell.centroid.x + (dx1 / len1) * halfWi1 : cell.centroid.x;
      const f1z = len1 > 0 ? cell.centroid.y + (dy1 / len1) * halfWi1 : cell.centroid.y;

      // Apply world centering
      const b0xW = b0x - bounds.width / 2;
      const b0zW = b0z - bounds.height / 2;
      const b1xW = b1x - bounds.width / 2;
      const b1zW = b1z - bounds.height / 2;
      const f0xW = f0x - bounds.width / 2;
      const f0zW = f0z - bounds.height / 2;
      const f1xW = f1x - bounds.width / 2;
      const f1zW = f1z - bounds.height / 2;

      // Heights
      const yBank = yOriginal; // Bank at original centroid height
      const yFloor = yCarved;  // Floor at carved height

      // 3D points
      const pV0 = { x: x0, y: yV0, z: z0 };
      const pV1 = { x: x1, y: yV1, z: z1 };
      const pB0 = { x: b0xW, y: yBank, z: b0zW };
      const pB1 = { x: b1xW, y: yBank, z: b1zW };
      const pF0 = { x: f0xW, y: yFloor, z: f0zW };
      const pF1 = { x: f1xW, y: yFloor, z: f1zW };
      const pC = { x: cx, y: yCarved, z: cz };

      // 5 triangles for non-river edge
      addTriangle(pV0, pV1, pB1, terrainColor);       // Outer terrain 1
      addTriangle(pV0, pB1, pB0, terrainColor);       // Outer terrain 2
      addTriangle(pB0, pB1, pF1, RIVER_BANK_COLOR);   // Bank slope 1
      addTriangle(pB0, pF1, pF0, RIVER_BANK_COLOR);   // Bank slope 2
      addTriangle(pF0, pF1, pC, RIVER_BANK_COLOR);    // Floor
    }
  }
}

export function VoronoiTerrainMesh({
  terrain,
  carveRivers,
  riverMode,
  useHeight,
  textureMode,
}: VoronoiTerrainMeshProps) {
  const meshRef = useRef<THREE.Group>(null);
  const isVoronoiMode = textureMode === 'voronoi';
  const setHeightData = useTerrainHeightStore((s) => s.setHeightData);

  const { terrainGeometry, riverLineGeometry } = useMemo(() => {
    const { cells, bounds } = terrain;
    const maxElevation = Math.max(...cells.map((c: VoronoiCell) => c.elevation), 1);
    const elevationScale = useHeight ? ELEVATION_SCALE : 0;
    const flatHeight = FLAT_HEIGHT;

    // Pre-compute vertex elevations (no river carving at vertices)
    const vertexElevations = useHeight ? buildVertexElevationMap(cells) : null;

    // Helper to get vertex Y coordinate
    const getVertexY = (x: number, y: number, fallback: number): number => {
      if (!useHeight) return flatHeight;
      return (vertexElevations?.get(vertexKey(x, y)) ?? fallback) * 0.5;
    };

    // Helper to get cell center Y coordinate
    const getCellY = (cell: VoronoiCell): number => {
      if (!useHeight) return flatHeight;
      return cell.isLand ? cell.elevation * ELEVATION_SCALE : OCEAN_DEPTH * ELEVATION_SCALE;
    };

    // Build terrain mesh from cell polygons
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];

    for (const cell of cells) {
      if (cell.vertices.length < 3) continue;

      const isRiver = cell.isLand && cell.flowAccumulation >= RIVER_THRESHOLD;
      // In voronoi mode, use gray; otherwise use terrain colors
      const terrainColor = isVoronoiMode ? VORONOI_COLOR : getTerrainColor(cell, maxElevation);
      const riverColor = riverMode === 'full' && !isVoronoiMode ? RIVER_COLOR : terrainColor;

      if (carveRivers && isRiver) {
        // Use bank-based triangulation for river cells (consistent channel width)
        const carveDepth = Math.min(
          Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
          cell.elevation * 0.5
        );
        const carvedElevation = cell.elevation - carveDepth;

        buildRiverCellGeometry(
          cell,
          cells,
          bounds,
          elevationScale,
          carvedElevation,
          terrainColor,
          riverColor,
          vertexElevations,
          positions,
          colors,
          normals,
          flatHeight
        );
      } else {
        // Standard fan triangulation for non-river cells
        const color = isRiver && riverMode === 'full' && !isVoronoiMode ? RIVER_COLOR : terrainColor;
        const yCenter = getCellY(cell);
        const cx = cell.centroid.x - bounds.width / 2;
        const cz = cell.centroid.y - bounds.height / 2;

        for (let i = 0; i < cell.vertices.length; i++) {
          const v0 = cell.vertices[i];
          const v1 = cell.vertices[(i + 1) % cell.vertices.length];

          const x0 = v0.x - bounds.width / 2;
          const z0 = v0.y - bounds.height / 2;
          const x1 = v1.x - bounds.width / 2;
          const z1 = v1.y - bounds.height / 2;

          // Look up pre-computed vertex elevations
          const y0 = getVertexY(v0.x, v0.y, cell.elevation);
          const y1 = getVertexY(v1.x, v1.y, cell.elevation);

          // Centroid
          positions.push(cx, yCenter, cz);
          colors.push(color.r, color.g, color.b);
          normals.push(0, 1, 0);

          // Vertex 0
          positions.push(x0, y0, z0);
          colors.push(color.r, color.g, color.b);
          normals.push(0, 1, 0);

          // Vertex 1
          positions.push(x1, y1, z1);
          colors.push(color.r, color.g, color.b);
          normals.push(0, 1, 0);
        }
      }
    }

    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    terrainGeo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3)
    );
    terrainGeo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3)
    );
    terrainGeo.computeVertexNormals();

    // Build river line geometry for 'line' mode
    const riverPositions: number[] = [];
    const riverColors: number[] = [];

    for (const cell of cells) {
      if (!cell.isLand || cell.flowsTo === null) continue;
      if (cell.flowAccumulation < RIVER_THRESHOLD) continue;

      const downstream = cells[cell.flowsTo];
      if (!downstream) continue;

      // Use flat or elevated Y based on useHeight
      let y0 = getCellY(cell) + 0.5;
      let y1 = getCellY(downstream) + 0.5;

      if (useHeight && carveRivers) {
        const carve0 = Math.min(
          Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
          cell.elevation * 0.5
        );
        const carve1 = Math.min(
          Math.log(downstream.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
          downstream.elevation * 0.5
        );
        y0 = (cell.elevation - carve0) * 0.5 + 0.5;
        y1 = (downstream.elevation - carve1) * 0.5 + 0.5;
      }

      const x0 = cell.centroid.x - bounds.width / 2;
      const z0 = cell.centroid.y - bounds.height / 2;
      const x1 = downstream.centroid.x - bounds.width / 2;
      const z1 = downstream.centroid.y - bounds.height / 2;

      riverPositions.push(x0, y0, z0, x1, y1, z1);

      const intensity = Math.min(cell.flowAccumulation / 200, 1);
      const c = RIVER_COLOR.clone().lerp(new THREE.Color(0x0066cc), intensity);
      riverColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }

    const riverLineGeo = new THREE.BufferGeometry();
    riverLineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(riverPositions, 3)
    );
    riverLineGeo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(riverColors, 3)
    );

    return { terrainGeometry: terrainGeo, riverLineGeometry: riverLineGeo };
  }, [terrain, carveRivers, riverMode, useHeight, isVoronoiMode]);

  // Populate the height store for other components to use
  useEffect(() => {
    const { cells } = terrain;
    const cellHeights = buildCellHeights(cells, useHeight);
    const vertexHeights = buildVertexHeights(cells, useHeight);
    setHeightData(cellHeights, vertexHeights, useHeight);
  }, [terrain, useHeight, setHeightData]);

  return (
    <group
      ref={meshRef}
      position={[terrain.bounds.width / 2, 0, terrain.bounds.height / 2]}
    >
      {/* Terrain mesh */}
      <mesh geometry={terrainGeometry}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} />
      </mesh>

      {/* River lines for 'line' mode */}
      {riverMode === 'line' && (
        <lineSegments geometry={riverLineGeometry}>
          <lineBasicMaterial vertexColors linewidth={2} />
        </lineSegments>
      )}

      {/* 'full' mode colors river cells blue - part of terrain mesh */}
      {/* 'off' mode shows carved grooves without highlighting */}
    </group>
  );
}
