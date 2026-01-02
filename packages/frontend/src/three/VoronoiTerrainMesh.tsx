import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { SerializedTerrain, RiverMode, TextureMode, RiverCarvingMode } from '../store/simulation';
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
  carveRivers: RiverCarvingMode;
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

// V-shaped channel parameters (base values, scaled by flow)
const W_O_BASE = 4; // Base outer width: distance between bank lines
const W_I_BASE = 2; // Base inner width: distance between floor lines
const WIDTH_SCALE = 2; // How much width increases with flow
const RIVER_BANK_COLOR = new THREE.Color(0x8b7355); // Brown/muddy bank color

// Debug colors for river carving visualization
const DEBUG_OUTER_COLOR = new THREE.Color(0x00ff00); // Green for outer triangles
const DEBUG_BANK_COLOR = new THREE.Color(0xff0000);  // Red for bank slopes
const DEBUG_FLOOR_COLOR = new THREE.Color(0x0000ff); // Blue for floor

// Darken a color by a factor (0 = original, 1 = black)
function darkenColor(color: THREE.Color, factor: number): THREE.Color {
  return color.clone().multiplyScalar(1 - factor);
}

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

// Pre-compute river surface heights for vertices (average carve depth of adjacent river cells)
function buildVertexRiverHeightMap(cells: VoronoiCell[], vertexElevations: Map<string, number>): Map<string, number> {
  // Build map of vertex -> all touching cell IDs
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

  // Compute river surface height for each vertex
  const vertexRiverHeight = new Map<string, number>();

  for (const [key, cellIds] of vertexCells) {
    const baseElevation = vertexElevations.get(key) ?? 0;

    // Find average carve depth of adjacent river cells
    let carveDepthSum = 0;
    let riverCount = 0;

    for (const id of cellIds) {
      const cell = cells[id];
      if (cell && cell.isLand && cell.flowAccumulation >= RIVER_THRESHOLD) {
        const carveDepth = Math.min(
          Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
          cell.elevation * 0.5
        );
        carveDepthSum += carveDepth;
        riverCount++;
      }
    }

    if (riverCount > 0) {
      const avgCarveDepth = carveDepthSum / riverCount;
      // River surface at 20% of carve depth below original vertex elevation
      vertexRiverHeight.set(key, baseElevation - 0.2 * avgCarveDepth);
    } else {
      // Non-river vertex: use base elevation
      vertexRiverHeight.set(key, baseElevation);
    }
  }

  return vertexRiverHeight;
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
// Keep reference to avoid unused warning during debugging
void computeCarveDepth;

// Build geometry for a river cell with V-shaped channel (bank + floor lines)
// Uses flow-perpendicular width calculation for consistent channel width
function buildRiverCellGeometry(
  cell: VoronoiCell,
  cells: VoronoiCell[],
  bounds: { width: number; height: number },
  elevationScale: number,
  carvedElevation: number,
  terrainColor: THREE.Color,
  _riverColor: THREE.Color, // No longer used - banks use RIVER_BANK_COLOR
  vertexElevations: Map<string, number> | null,
  vertexRiverHeights: Map<string, number> | null,
  positions: number[],
  colors: number[],
  normals: number[],
  flatHeight: number,
  debugMode: boolean
) {
  const cx = cell.centroid.x;
  const cy = cell.centroid.y;
  const cxW = cx - bounds.width / 2;  // World-centered x
  const czW = cy - bounds.height / 2; // World-centered z

  // Heights for this cell
  const yOriginal = elevationScale > 0 ? cell.elevation * elevationScale : flatHeight;
  const yCarved = elevationScale > 0 ? carvedElevation * elevationScale : flatHeight;

  // === Flow-scaled channel widths ===
  const flowFactor = Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1);
  const W_O = W_O_BASE + flowFactor * WIDTH_SCALE;
  const W_I = W_I_BASE + flowFactor * WIDTH_SCALE;

  // === Step 1: Calculate flow direction ===
  let flowDirX = 0;
  let flowDirY = 1; // Default: flow "down" (+Y in map coords)

  if (cell.flowsTo !== null) {
    const downstream = cells[cell.flowsTo];
    if (downstream) {
      const dx = downstream.centroid.x - cx;
      const dy = downstream.centroid.y - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        flowDirX = dx / len;
        flowDirY = dy / len;
      }
    }
  }

  // Flow perpendicular (90° rotation)
  const flowPerpX = -flowDirY;
  const flowPerpY = flowDirX;

  // === Step 2: Pre-compute bank and floor points for each vertex ===
  // Using flow-perpendicular distance calculation
  const bankPoints: { x: number; z: number }[] = [];
  const floorPoints: { x: number; z: number }[] = [];

  for (const v of cell.vertices) {
    // Spoke from centroid to vertex
    const sx = v.x - cx;
    const sy = v.y - cy;
    const spokeLen = Math.sqrt(sx * sx + sy * sy);

    // Perpendicular component: how much moving along spoke contributes to perp distance
    const perpComponent = Math.abs(sx * flowPerpX + sy * flowPerpY);

    if (perpComponent > 0.01 && spokeLen > 0) {
      // Calculate t for bank (parameter along spoke, 0=centroid, 1=vertex)
      // t such that perpendicular distance = W_O/2
      const tBank = Math.min((W_O / 2) / perpComponent, 0.8);
      bankPoints.push({
        x: cx + sx * tBank,
        z: cy + sy * tBank,
      });

      // Calculate t for floor
      const tFloor = Math.min((W_I / 2) / perpComponent, 0.6);
      floorPoints.push({
        x: cx + sx * tFloor,
        z: cy + sy * tFloor,
      });
    } else {
      // Spoke parallel to flow - use fallback fixed distance along spoke
      const dirX = spokeLen > 0 ? sx / spokeLen : 0;
      const dirY = spokeLen > 0 ? sy / spokeLen : 0;
      const distBank = Math.min(W_O / 2, spokeLen * 0.8);
      const distFloor = Math.min(W_I / 2, spokeLen * 0.6);
      bankPoints.push({
        x: cx + dirX * distBank,
        z: cy + dirY * distBank,
      });
      floorPoints.push({
        x: cx + dirX * distFloor,
        z: cy + dirY * distFloor,
      });
    }
  }

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

  // === Step 3: Build triangles for each edge ===
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

    // Bank/floor positions and heights depend on neighbor type
    let b0xW: number, b0zW: number, b1xW: number, b1zW: number;
    let f0xW: number, f0zW: number, f1xW: number, f1zW: number;
    let yBank: number, yFloor: number;

    if (neighborIsRiver) {
      // === Shared river edge: draw triangles connecting spoke and edge points ===

      // Get spoke-based points (s_b, s_f)
      const s_b0 = bankPoints[i];
      const s_b1 = bankPoints[(i + 1) % bankPoints.length];
      const s_f0 = floorPoints[i];
      const s_f1 = floorPoints[(i + 1) % floorPoints.length];

      // Find crossing point X where flow line crosses the shared edge
      const nCx = neighbor.centroid.x;
      const nCy = neighbor.centroid.y;
      const dx_edge = v1.x - v0.x;
      const dy_edge = v1.y - v0.y;
      const edgeLen = Math.sqrt(dx_edge * dx_edge + dy_edge * dy_edge);
      const dx_flow = nCx - cx;
      const dy_flow = nCy - cy;

      const denom = dx_edge * dy_flow - dy_edge * dx_flow;
      let crossX: number, crossY: number;
      if (Math.abs(denom) < 0.001) {
        crossX = (v0.x + v1.x) / 2;
        crossY = (v0.y + v1.y) / 2;
      } else {
        const t = ((cx - v0.x) * dy_flow - (cy - v0.y) * dx_flow) / denom;
        const tClamped = Math.max(0.1, Math.min(0.9, t));
        crossX = v0.x + tClamped * dx_edge;
        crossY = v0.y + tClamped * dy_edge;
      }

      // Edge direction and distances
      const edgeDirX = dx_edge / edgeLen;
      const edgeDirY = dy_edge / edgeLen;
      const distToV0 = Math.sqrt((crossX - v0.x) ** 2 + (crossY - v0.y) ** 2);
      const distToV1 = Math.sqrt((crossX - v1.x) ** 2 + (crossY - v1.y) ** 2);

      // Average flow-scaled widths between this cell and neighbor for smooth transition
      const neighborFlowFactor = Math.log(neighbor.flowAccumulation / RIVER_THRESHOLD + 1);
      const neighborW_O = W_O_BASE + neighborFlowFactor * WIDTH_SCALE;
      const neighborW_I = W_I_BASE + neighborFlowFactor * WIDTH_SCALE;
      const avgW_O = (W_O + neighborW_O) / 2;
      const avgW_I = (W_I + neighborW_I) / 2;

      // Use the SAME flow perpendicular as spoke calculation (not neighbor direction!)
      // This ensures edge widths match spoke widths
      // perpComponent = how much moving along edge contributes to perp distance from flow
      const edgePerpComponent = Math.abs(edgeDirX * flowPerpX + edgeDirY * flowPerpY);

      // If edge is nearly parallel to flow, clamp to avoid huge widths
      const effectivePerp = Math.max(edgePerpComponent, 0.3);

      // Half-widths along edge to achieve perpendicular distance avgW_O/2 from flow
      const halfWoAdjusted = Math.min((avgW_O / 2) / effectivePerp, Math.min(distToV0, distToV1) * 0.9);
      const halfWiAdjusted = Math.min((avgW_I / 2) / effectivePerp, Math.min(distToV0, distToV1) * 0.7);

      // Edge-based bank points (e_b0 toward v0, e_b1 toward v1)
      const e_b0 = { x: crossX - edgeDirX * halfWoAdjusted, z: crossY - edgeDirY * halfWoAdjusted };
      const e_b1 = { x: crossX + edgeDirX * halfWoAdjusted, z: crossY + edgeDirY * halfWoAdjusted };

      // Edge-based floor points (e_f0 toward v0, e_f1 toward v1)
      const e_f0 = { x: crossX - edgeDirX * halfWiAdjusted, z: crossY - edgeDirY * halfWiAdjusted };
      const e_f1 = { x: crossX + edgeDirX * halfWiAdjusted, z: crossY + edgeDirY * halfWiAdjusted };

      // Heights
      const neighborCarveDepth = Math.min(
        Math.log(neighbor.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
        neighbor.elevation * 0.5
      );
      const neighborCarvedY = elevationScale > 0
        ? (neighbor.elevation - neighborCarveDepth) * elevationScale
        : flatHeight;
      const avgBankY = elevationScale > 0
        ? ((cell.elevation + neighbor.elevation) / 2) * elevationScale
        : flatHeight;
      const avgFloorY = (yCarved + neighborCarvedY) / 2;

      // World coordinates for edge points
      const e_b0_w = { x: e_b0.x - bounds.width / 2, z: e_b0.z - bounds.height / 2 };
      const e_b1_w = { x: e_b1.x - bounds.width / 2, z: e_b1.z - bounds.height / 2 };
      const e_f0_w = { x: e_f0.x - bounds.width / 2, z: e_f0.z - bounds.height / 2 };
      const e_f1_w = { x: e_f1.x - bounds.width / 2, z: e_f1.z - bounds.height / 2 };

      // World coordinates for spoke points
      const s_b0_w = { x: s_b0.x - bounds.width / 2, z: s_b0.z - bounds.height / 2 };
      const s_b1_w = { x: s_b1.x - bounds.width / 2, z: s_b1.z - bounds.height / 2 };
      const s_f0_w = { x: s_f0.x - bounds.width / 2, z: s_f0.z - bounds.height / 2 };
      const s_f1_w = { x: s_f1.x - bounds.width / 2, z: s_f1.z - bounds.height / 2 };

      // 3D points
      const pV0 = { x: x0, y: yV0, z: z0 };
      const pV1 = { x: x1, y: yV1, z: z1 };
      const pC = { x: cxW, y: yCarved, z: czW };

      // Spoke points (at cell's heights)
      const pS_B0 = { x: s_b0_w.x, y: yOriginal, z: s_b0_w.z };
      const pS_B1 = { x: s_b1_w.x, y: yOriginal, z: s_b1_w.z };
      const pS_F0 = { x: s_f0_w.x, y: yCarved, z: s_f0_w.z };
      const pS_F1 = { x: s_f1_w.x, y: yCarved, z: s_f1_w.z };

      // Edge points (at averaged heights)
      const pE_B0 = { x: e_b0_w.x, y: avgBankY, z: e_b0_w.z };
      const pE_B1 = { x: e_b1_w.x, y: avgBankY, z: e_b1_w.z };
      const pE_F0 = { x: e_f0_w.x, y: avgFloorY, z: e_f0_w.z };
      const pE_F1 = { x: e_f1_w.x, y: avgFloorY, z: e_f1_w.z };

      // Calculate colors
      const darkenFactor = i * 0.1;
      const outerColor = debugMode ? darkenColor(DEBUG_OUTER_COLOR, darkenFactor) : terrainColor;
      const bankColor = debugMode ? darkenColor(DEBUG_BANK_COLOR, darkenFactor) : RIVER_BANK_COLOR;
      const floorColor = debugMode ? darkenColor(DEBUG_FLOOR_COLOR, darkenFactor) : RIVER_BANK_COLOR;

      // === V0 side triangles ===
      // Outer: v0 -> s_b0 -> e_b0
      addTriangle(pV0, pS_B0, pE_B0, outerColor);
      // Bank: s_b0 -> e_b0 -> e_f0
      addTriangle(pS_B0, pE_B0, pE_F0, bankColor);
      // Bank: s_b0 -> e_f0 -> s_f0
      addTriangle(pS_B0, pE_F0, pS_F0, bankColor);
      // Floor: s_f0 -> e_f0 -> c'
      addTriangle(pS_F0, pE_F0, pC, floorColor);

      // === V1 side triangles ===
      // Outer: v1 -> e_b1 -> s_b1
      addTriangle(pV1, pE_B1, pS_B1, outerColor);
      // Bank: s_b1 -> e_b1 -> e_f1
      addTriangle(pS_B1, pE_B1, pE_F1, bankColor);
      // Bank: s_b1 -> e_f1 -> s_f1
      addTriangle(pS_B1, pE_F1, pS_F1, bankColor);
      // Floor: s_f1 -> e_f1 -> c'
      addTriangle(pS_F1, pE_F1, pC, floorColor);

      // === Center floor triangles (connecting e_f0 and e_f1 through c') ===
      addTriangle(pE_F0, pE_F1, pC, floorColor);

      continue;
    } else {
      // === Non-river neighbor: use spoke-based bank/floor positions ===
      const b0 = bankPoints[i];
      const b1 = bankPoints[(i + 1) % bankPoints.length];
      const f0 = floorPoints[i];
      const f1 = floorPoints[(i + 1) % floorPoints.length];

      b0xW = b0.x - bounds.width / 2;
      b0zW = b0.z - bounds.height / 2;
      b1xW = b1.x - bounds.width / 2;
      b1zW = b1.z - bounds.height / 2;
      f0xW = f0.x - bounds.width / 2;
      f0zW = f0.z - bounds.height / 2;
      f1xW = f1.x - bounds.width / 2;
      f1zW = f1.z - bounds.height / 2;

      // Heights: this cell only
      yBank = yOriginal;
      yFloor = yCarved;
    }

    // 3D points
    const pV0 = { x: x0, y: yV0, z: z0 };
    const pV1 = { x: x1, y: yV1, z: z1 };
    const pB0 = { x: b0xW, y: yBank, z: b0zW };
    const pB1 = { x: b1xW, y: yBank, z: b1zW };
    const pF0 = { x: f0xW, y: yFloor, z: f0zW };
    const pF1 = { x: f1xW, y: yFloor, z: f1zW };
    const pC = { x: cxW, y: yCarved, z: czW };

    // DEBUGGING: Use same triangles for both cases
    // if (neighborIsRiver) {
    //   // Shared river edge: 5 triangles radiating from centroid
    //   addTriangle(pV0, pB0, pC, terrainColor);        // Outer v0 side
    //   addTriangle(pB0, pF0, pC, RIVER_BANK_COLOR);    // Bank v0 side
    //   addTriangle(pF0, pF1, pC, RIVER_BANK_COLOR);    // Floor center
    //   addTriangle(pF1, pB1, pC, RIVER_BANK_COLOR);    // Bank v1 side
    //   addTriangle(pB1, pV1, pC, terrainColor);        // Outer v1 side
    // } else {
    //   // Non-river neighbor: 5 triangles spanning the segment
    //   ...
    // }

    // Calculate colors based on debug mode
    const darkenFactor = i * 0.1; // 10% darker per edge
    const outerColor = debugMode
      ? darkenColor(DEBUG_OUTER_COLOR, darkenFactor)
      : terrainColor;
    const bankColor = debugMode
      ? darkenColor(DEBUG_BANK_COLOR, darkenFactor)
      : RIVER_BANK_COLOR;
    const floorColor = debugMode
      ? darkenColor(DEBUG_FLOOR_COLOR, darkenFactor)
      : RIVER_BANK_COLOR;

    // Same triangles for all edges (for debugging)
    addTriangle(pV0, pV1, pB1, outerColor);       // Outer 1
    addTriangle(pV0, pB1, pB0, outerColor);       // Outer 2
    addTriangle(pB0, pB1, pF1, bankColor);        // Bank slope 1
    addTriangle(pB0, pF1, pF0, bankColor);        // Bank slope 2
    addTriangle(pF0, pF1, pC, floorColor);        // Floor
  }

  // === River polygon: cell polygon using pre-computed river surface heights ===
  const carveDepth = cell.elevation - carvedElevation;
  const riverColor = debugMode ? RIVER_COLOR : RIVER_COLOR;

  // Centroid height: use cell's own carve depth for the center
  const yCenterRiver = elevationScale > 0
    ? (cell.elevation - 0.2 * carveDepth) * elevationScale
    : flatHeight;

  for (let i = 0; i < cell.vertices.length; i++) {
    const v0 = cell.vertices[i];
    const v1 = cell.vertices[(i + 1) % cell.vertices.length];

    const x0 = v0.x - bounds.width / 2;
    const z0 = v0.y - bounds.height / 2;
    const x1 = v1.x - bounds.width / 2;
    const z1 = v1.y - bounds.height / 2;

    // Use pre-computed river surface heights (consistent across cells)
    const yV0_river = vertexRiverHeights
      ? (vertexRiverHeights.get(vertexKey(v0.x, v0.y)) ?? cell.elevation) * elevationScale
      : flatHeight;
    const yV1_river = vertexRiverHeights
      ? (vertexRiverHeights.get(vertexKey(v1.x, v1.y)) ?? cell.elevation) * elevationScale
      : flatHeight;

    const pC_river = { x: cxW, y: yCenterRiver, z: czW };
    const pV0_river = { x: x0, y: yV0_river, z: z0 };
    const pV1_river = { x: x1, y: yV1_river, z: z1 };

    addTriangle(pC_river, pV0_river, pV1_river, riverColor);
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

  const { terrainGeometry, riverLineGeometry, debugLineGeometry, crossingLineGeometry } = useMemo(() => {
    const { cells, bounds } = terrain;
    const maxElevation = Math.max(...cells.map((c: VoronoiCell) => c.elevation), 1);
    const elevationScale = useHeight ? ELEVATION_SCALE : 0;
    const flatHeight = FLAT_HEIGHT;

    // Pre-compute vertex elevations (no river carving at vertices)
    const vertexElevations = useHeight ? buildVertexElevationMap(cells) : null;

    // Pre-compute river surface heights for vertices (consistent across cells)
    const vertexRiverHeights = useHeight && vertexElevations
      ? buildVertexRiverHeightMap(cells, vertexElevations)
      : null;

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

      if (carveRivers !== 'off' && isRiver) {
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
          vertexRiverHeights,
          positions,
          colors,
          normals,
          flatHeight,
          carveRivers === 'debug'
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
    // Skip vertex normal computation in debug mode to see flat triangle colors
    if (carveRivers !== 'debug') {
      terrainGeo.computeVertexNormals();
    }

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

    // Build debug line geometry for shared river edges (centroid to centroid)
    const debugLinePositions: number[] = [];
    const crossingLinePositions: number[] = [];
    const processedPairs = new Set<string>();

    for (const cell of cells) {
      if (!cell.isLand || cell.flowAccumulation < RIVER_THRESHOLD) continue;

      const carveDepth = Math.min(
        Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
        cell.elevation * 0.5
      );
      const cellCarvedY = useHeight
        ? (cell.elevation - carveDepth) * elevationScale
        : flatHeight;

      for (const neighborId of cell.neighbors) {
        const neighbor = cells[neighborId];
        if (!neighbor || !neighbor.isLand || neighbor.flowAccumulation < RIVER_THRESHOLD) continue;

        // Avoid duplicate lines (only process each pair once)
        const pairKey = cell.id < neighborId ? `${cell.id}-${neighborId}` : `${neighborId}-${cell.id}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const neighborCarveDepth = Math.min(
          Math.log(neighbor.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
          neighbor.elevation * 0.5
        );
        const neighborCarvedY = useHeight
          ? (neighbor.elevation - neighborCarveDepth) * elevationScale
          : flatHeight;

        // Line from cell centroid to neighbor centroid at carved heights
        debugLinePositions.push(
          cell.centroid.x - bounds.width / 2,
          cellCarvedY + 0.5,
          cell.centroid.y - bounds.height / 2,
          neighbor.centroid.x - bounds.width / 2,
          neighborCarvedY + 0.5,
          neighbor.centroid.y - bounds.height / 2
        );

        // Find shared edge between cell and neighbor
        const eps = 0.01;
        let sharedV0: { x: number; y: number } | null = null;
        let sharedV1: { x: number; y: number } | null = null;

        for (let i = 0; i < cell.vertices.length; i++) {
          const v0 = cell.vertices[i];
          const v1 = cell.vertices[(i + 1) % cell.vertices.length];

          // Check if neighbor has both vertices
          let hasV0 = false;
          let hasV1 = false;
          for (const nv of neighbor.vertices) {
            if (Math.abs(nv.x - v0.x) < eps && Math.abs(nv.y - v0.y) < eps) hasV0 = true;
            if (Math.abs(nv.x - v1.x) < eps && Math.abs(nv.y - v1.y) < eps) hasV1 = true;
          }

          if (hasV0 && hasV1) {
            sharedV0 = v0;
            sharedV1 = v1;
            break;
          }
        }

        if (sharedV0 && sharedV1) {
          // Find where flow line crosses the shared edge
          const cx = cell.centroid.x;
          const cy = cell.centroid.y;
          const nCx = neighbor.centroid.x;
          const nCy = neighbor.centroid.y;

          // Edge vector
          const dx_edge = sharedV1.x - sharedV0.x;
          const dy_edge = sharedV1.y - sharedV0.y;

          // Flow line vector (between centroids)
          const dx_flow = nCx - cx;
          const dy_flow = nCy - cy;

          // Find intersection parameter t along edge
          const denom = dx_edge * dy_flow - dy_edge * dx_flow;
          let crossX: number, crossY: number;

          if (Math.abs(denom) < 0.001) {
            // Lines parallel - use edge midpoint
            crossX = (sharedV0.x + sharedV1.x) / 2;
            crossY = (sharedV0.y + sharedV1.y) / 2;
          } else {
            const t = ((cx - sharedV0.x) * dy_flow - (cy - sharedV0.y) * dx_flow) / denom;
            // Clamp t to [0.1, 0.9] to keep crossing away from vertices
            const tClamped = Math.max(0.1, Math.min(0.9, t));
            crossX = sharedV0.x + tClamped * dx_edge;
            crossY = sharedV0.y + tClamped * dy_edge;
          }

          // Vertical line at crossing point (from river floor to edge surface)
          const crossXW = crossX - bounds.width / 2;
          const crossZW = crossY - bounds.height / 2;
          const avgCarvedY = (cellCarvedY + neighborCarvedY) / 2; // River floor height

          // Get vertex heights using same formula as getVertexY
          const v0Y = useHeight
            ? (vertexElevations?.get(vertexKey(sharedV0.x, sharedV0.y)) ?? cell.elevation) * 0.5
            : flatHeight;
          const v1Y = useHeight
            ? (vertexElevations?.get(vertexKey(sharedV1.x, sharedV1.y)) ?? cell.elevation) * 0.5
            : flatHeight;

          // Interpolate based on where crossing sits on the edge
          const edgeLen = Math.sqrt(dx_edge * dx_edge + dy_edge * dy_edge);
          const crossDist = Math.sqrt((crossX - sharedV0.x) ** 2 + (crossY - sharedV0.y) ** 2);
          const tEdge = edgeLen > 0 ? crossDist / edgeLen : 0.5;
          const edgeY = v0Y + tEdge * (v1Y - v0Y);

          const lineBottom = avgCarvedY;
          const lineTop = edgeY;

          crossingLinePositions.push(
            crossXW, lineBottom, crossZW,
            crossXW, lineTop, crossZW
          );

          // === Debug lines for b and f points along shared edge ===
          // Edge direction (normalized)
          const edgeDirX = dx_edge / edgeLen;
          const edgeDirY = dy_edge / edgeLen;

          // Distance from crossing to each vertex
          const distToV0 = Math.sqrt((crossX - sharedV0.x) ** 2 + (crossY - sharedV0.y) ** 2);
          const distToV1 = Math.sqrt((crossX - sharedV1.x) ** 2 + (crossY - sharedV1.y) ** 2);

          // Flow-scaled channel widths (average of both cells)
          const avgFlow = (cell.flowAccumulation + neighbor.flowAccumulation) / 2;
          const flowFactorDbg = Math.log(avgFlow / RIVER_THRESHOLD + 1);
          const W_O_dbg = W_O_BASE + flowFactorDbg * WIDTH_SCALE;
          const W_I_dbg = W_I_BASE + flowFactorDbg * WIDTH_SCALE;

          // Use the cell's flow perpendicular (same as spoke calculation)
          // Need to compute flow direction for this cell
          let cellFlowPerpX = -1, cellFlowPerpY = 0; // Default
          if (cell.flowsTo !== null) {
            const downstream = cells[cell.flowsTo];
            if (downstream) {
              const dxFlow = downstream.centroid.x - cell.centroid.x;
              const dyFlow = downstream.centroid.y - cell.centroid.y;
              const flowLen = Math.sqrt(dxFlow * dxFlow + dyFlow * dyFlow);
              if (flowLen > 0) {
                // flowPerp is 90° rotation of flow direction
                cellFlowPerpX = -dyFlow / flowLen;
                cellFlowPerpY = dxFlow / flowLen;
              }
            }
          }

          // perpComponent = how much moving along edge contributes to perp distance from flow
          const edgePerpComponentDbg = Math.abs(edgeDirX * cellFlowPerpX + edgeDirY * cellFlowPerpY);
          const effectivePerpDbg = Math.max(edgePerpComponentDbg, 0.3);

          // Bank and floor half-widths (adjusted, clamped to not exceed distance to vertices)
          const halfWo = Math.min((W_O_dbg / 2) / effectivePerpDbg, Math.min(distToV0, distToV1) * 0.9);
          const halfWi = Math.min((W_I_dbg / 2) / effectivePerpDbg, Math.min(distToV0, distToV1) * 0.7);

          // Bank points at adjusted distance from crossing along edge
          const b0x = crossX - edgeDirX * halfWo;
          const b0y = crossY - edgeDirY * halfWo;
          const b1x = crossX + edgeDirX * halfWo;
          const b1y = crossY + edgeDirY * halfWo;

          // Floor points at adjusted distance from crossing along edge
          const f0x = crossX - edgeDirX * halfWi;
          const f0y = crossY - edgeDirY * halfWi;
          const f1x = crossX + edgeDirX * halfWi;
          const f1y = crossY + edgeDirY * halfWi;

          // World coords
          const v0xW = sharedV0.x - bounds.width / 2;
          const v0zW = sharedV0.y - bounds.height / 2;
          const v1xW = sharedV1.x - bounds.width / 2;
          const v1zW = sharedV1.y - bounds.height / 2;
          const b0xW = b0x - bounds.width / 2;
          const b0zW = b0y - bounds.height / 2;
          const b1xW = b1x - bounds.width / 2;
          const b1zW = b1y - bounds.height / 2;
          const f0xW = f0x - bounds.width / 2;
          const f0zW = f0y - bounds.height / 2;
          const f1xW = f1x - bounds.width / 2;
          const f1zW = f1y - bounds.height / 2;

          // Heights: v at vertex height, b at bank height, f at floor height, e at floor height
          const cellBankY = useHeight ? cell.elevation * 0.5 : flatHeight;
          const neighborBankY = useHeight ? neighbor.elevation * 0.5 : flatHeight;
          const bankY = (cellBankY + neighborBankY) / 2;
          const floorY = avgCarvedY;

          // Draw v0 -> b0 -> f0 -> e (crossing at floor)
          // v0 -> b0
          crossingLinePositions.push(v0xW, v0Y, v0zW, b0xW, bankY, b0zW);
          // b0 -> f0
          crossingLinePositions.push(b0xW, bankY, b0zW, f0xW, floorY, f0zW);
          // f0 -> e
          crossingLinePositions.push(f0xW, floorY, f0zW, crossXW, floorY, crossZW);

          // Draw v1 -> b1 -> f1 -> e (crossing at floor)
          // v1 -> b1
          crossingLinePositions.push(v1xW, v1Y, v1zW, b1xW, bankY, b1zW);
          // b1 -> f1
          crossingLinePositions.push(b1xW, bankY, b1zW, f1xW, floorY, f1zW);
          // f1 -> e
          crossingLinePositions.push(f1xW, floorY, f1zW, crossXW, floorY, crossZW);

          // === Edge-based r lines: r points at 0.8 from f to b along the shared edge ===
          // (Spoke-based r lines are handled by the comprehensive loop below)
          const r_e0_xW = f0xW + 0.8 * (b0xW - f0xW);
          const r_e0_zW = f0zW + 0.8 * (b0zW - f0zW);
          const r_e0_Y = floorY + 0.8 * (bankY - floorY);

          const r_e1_xW = f1xW + 0.8 * (b1xW - f1xW);
          const r_e1_zW = f1zW + 0.8 * (b1zW - f1zW);
          const r_e1_Y = floorY + 0.8 * (bankY - floorY);

          // River line for edge-based projection
          const riverLineStartE = { x: cell.centroid.x - bounds.width / 2, z: cell.centroid.y - bounds.height / 2 };
          const riverLineEndE = { x: neighbor.centroid.x - bounds.width / 2, z: neighbor.centroid.y - bounds.height / 2 };
          const riverDxE = riverLineEndE.x - riverLineStartE.x;
          const riverDzE = riverLineEndE.z - riverLineStartE.z;
          const riverLenSqE = riverDxE * riverDxE + riverDzE * riverDzE;

          const projectOntoRiverLineE = (rx: number, rz: number) => {
            const toRx = rx - riverLineStartE.x;
            const toRz = rz - riverLineStartE.z;
            if (riverLenSqE < 0.001) return { x: riverLineStartE.x, z: riverLineStartE.z };
            const t = Math.max(0, Math.min(1, (toRx * riverDxE + toRz * riverDzE) / riverLenSqE));
            return { x: riverLineStartE.x + t * riverDxE, z: riverLineStartE.z + t * riverDzE };
          };

          const proj_e0 = projectOntoRiverLineE(r_e0_xW, r_e0_zW);
          const proj_e1 = projectOntoRiverLineE(r_e1_xW, r_e1_zW);

          // Draw edge-based r -> projection on river line, at r's height
          crossingLinePositions.push(r_e0_xW, r_e0_Y, r_e0_zW, proj_e0.x, r_e0_Y, proj_e0.z);
          crossingLinePositions.push(r_e1_xW, r_e1_Y, r_e1_zW, proj_e1.x, r_e1_Y, proj_e1.z);
        }
      }
    }

    // === Draw r->river lines for ALL spokes of ALL river cells ===
    for (const cell of cells) {
      if (!cell.isLand || cell.flowAccumulation < RIVER_THRESHOLD) continue;

      const cx_cell = cell.centroid.x;
      const cy_cell = cell.centroid.y;
      const cxW = cx_cell - bounds.width / 2;
      const czW = cy_cell - bounds.height / 2;

      // Cell heights
      const carveDepth = Math.min(
        Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
        cell.elevation * 0.5
      );
      const cellFloorY = useHeight ? (cell.elevation - carveDepth) * elevationScale : flatHeight;
      const cellBankY = useHeight ? cell.elevation * 0.5 : flatHeight;
      const r_Y = cellFloorY + 0.8 * (cellBankY - cellFloorY);

      // Flow direction (for perpendicular distance calculation)
      let flowDirX = 0, flowDirY = 1;
      if (cell.flowsTo !== null) {
        const downstream = cells[cell.flowsTo];
        if (downstream) {
          const dxf = downstream.centroid.x - cx_cell;
          const dyf = downstream.centroid.y - cy_cell;
          const lenf = Math.sqrt(dxf * dxf + dyf * dyf);
          if (lenf > 0) { flowDirX = dxf / lenf; flowDirY = dyf / lenf; }
        }
      }
      const flowPerpX = -flowDirY;
      const flowPerpY = flowDirX;

      // Flow-scaled channel widths
      const flowFactorR = Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1);
      const W_O_r = W_O_BASE + flowFactorR * WIDTH_SCALE;
      const W_I_r = W_I_BASE + flowFactorR * WIDTH_SCALE;

      // For each vertex, compute spoke-based r and draw line to centroid
      for (const v of cell.vertices) {
        const sx = v.x - cx_cell;
        const sy = v.y - cy_cell;
        const spokeLen = Math.sqrt(sx * sx + sy * sy);
        if (spokeLen < 0.01) continue;

        const perpComponent = Math.abs(sx * flowPerpX + sy * flowPerpY);

        let tBank: number, tFloor: number;
        if (perpComponent > 0.01) {
          tBank = Math.min((W_O_r / 2) / perpComponent, 0.8);
          tFloor = Math.min((W_I_r / 2) / perpComponent, 0.6);
        } else {
          tBank = Math.min(W_O_r / 2, spokeLen * 0.8) / spokeLen;
          tFloor = Math.min(W_I_r / 2, spokeLen * 0.6) / spokeLen;
        }

        const bx = cx_cell + sx * tBank;
        const by = cy_cell + sy * tBank;
        const fx = cx_cell + sx * tFloor;
        const fy = cy_cell + sy * tFloor;

        // r at 0.8 from f to b
        const rx = fx + 0.8 * (bx - fx);
        const ry = fy + 0.8 * (by - fy);
        const rxW = rx - bounds.width / 2;
        const rzW = ry - bounds.height / 2;

        // Draw r -> c (centroid) at r's height
        crossingLinePositions.push(rxW, r_Y, rzW, cxW, r_Y, czW);
      }
    }

    const debugLineGeo = new THREE.BufferGeometry();
    debugLineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(debugLinePositions, 3)
    );

    const crossingLineGeo = new THREE.BufferGeometry();
    crossingLineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(crossingLinePositions, 3)
    );
    // Compute line distances for dashed material
    crossingLineGeo.computeBoundingSphere();

    return { terrainGeometry: terrainGeo, riverLineGeometry: riverLineGeo, debugLineGeometry: debugLineGeo, crossingLineGeometry: crossingLineGeo };
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

      {/* Debug lines between river cell centroids */}
      {carveRivers === 'debug' && (
        <lineSegments geometry={debugLineGeometry}>
          <lineBasicMaterial color={0xffff00} linewidth={2} />
        </lineSegments>
      )}

      {/* Vertical lines at river crossing points */}
      {carveRivers === 'debug' && (
        <lineSegments geometry={crossingLineGeometry}>
          <lineDashedMaterial color={0xff00ff} linewidth={2} dashSize={2} gapSize={1} />
        </lineSegments>
      )}

      {/* 'full' mode colors river cells blue - part of terrain mesh */}
      {/* 'off' mode shows carved grooves without highlighting */}
    </group>
  );
}
