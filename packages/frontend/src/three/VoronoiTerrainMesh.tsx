import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SerializedVoronoiTerrain } from '../store/simulation';
import type { VoronoiCell, Point } from '@colonies/shared';

interface VoronoiTerrainMeshProps {
  terrain: SerializedVoronoiTerrain;
  showRivers?: boolean;
}

// Color palette matching grid renderer
const OCEAN_COLOR = new THREE.Color(0x1a5276);
const COAST_COLOR = new THREE.Color(0x2e86ab);
const LOWLAND_COLOR = new THREE.Color(0x58a05c);
const MIDLAND_COLOR = new THREE.Color(0x8b7355);
const HIGHLAND_COLOR = new THREE.Color(0x6b5344);
const PEAK_COLOR = new THREE.Color(0xffffff);
const RIVER_COLOR = new THREE.Color(0x3498db);

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

function getVertexElevation(
  vertex: Point,
  cells: VoronoiCell[],
  currentCell: VoronoiCell
): number {
  // Find cells that share this vertex and average their elevations
  const epsilon = 0.1;
  let totalWeight = 0;
  let weightedSum = 0;

  for (const neighborId of currentCell.neighbors) {
    const neighbor = cells[neighborId];
    if (!neighbor) continue;

    for (const v of neighbor.vertices) {
      if (Math.abs(v.x - vertex.x) < epsilon && Math.abs(v.y - vertex.y) < epsilon) {
        const weight = 1;
        weightedSum += neighbor.elevation * weight;
        totalWeight += weight;
        break;
      }
    }
  }

  // Include current cell
  weightedSum += currentCell.elevation;
  totalWeight += 1;

  return totalWeight > 0 ? weightedSum / totalWeight : currentCell.elevation;
}

export function VoronoiTerrainMesh({ terrain, showRivers = true }: VoronoiTerrainMeshProps) {
  const meshRef = useRef<THREE.Group>(null);

  const { terrainGeometry, riverGeometry } = useMemo(() => {
    const { cells, rivers, bounds } = terrain;
    const maxElevation = Math.max(...cells.map((c) => c.elevation), 1);
    const elevationScale = 0.5; // Same scale as grid renderer

    // Build terrain mesh from cell polygons using fan triangulation
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];

    for (const cell of cells) {
      if (cell.vertices.length < 3) continue;

      const color = getTerrainColor(cell, maxElevation);
      const yCenter = cell.isLand ? cell.elevation * elevationScale : -5;

      // Fan triangulation from centroid
      const cx = cell.centroid.x - bounds.width / 2;
      const cz = cell.centroid.y - bounds.height / 2;

      for (let i = 0; i < cell.vertices.length; i++) {
        const v0 = cell.vertices[i];
        const v1 = cell.vertices[(i + 1) % cell.vertices.length];

        // Triangle: centroid -> v0 -> v1
        const x0 = v0.x - bounds.width / 2;
        const z0 = v0.y - bounds.height / 2;
        const x1 = v1.x - bounds.width / 2;
        const z1 = v1.y - bounds.height / 2;

        // Interpolate elevation at vertices from neighboring cells
        const y0 = cell.isLand
          ? getVertexElevation(v0, cells, cell) * elevationScale
          : -5;
        const y1 = cell.isLand
          ? getVertexElevation(v1, cells, cell) * elevationScale
          : -5;

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
    terrainGeo.computeVertexNormals(); // Proper lighting

    // Build river lines
    const riverPositions: number[] = [];
    const riverColors: number[] = [];

    for (const edge of rivers) {
      const [v0, v1] = edge.vertices;
      const cellA = cells[edge.cells[0]];
      const cellB = cells[edge.cells[1]];
      if (!cellA || !cellB) continue;

      const yA = Math.max(cellA.elevation, 0) * elevationScale + 1; // Slightly above terrain
      const yB = Math.max(cellB.elevation, 0) * elevationScale + 1;

      riverPositions.push(
        v0.x - bounds.width / 2,
        yA,
        v0.y - bounds.height / 2,
        v1.x - bounds.width / 2,
        yB,
        v1.y - bounds.height / 2
      );

      // Width/intensity based on flow volume
      const intensity = Math.min(edge.flowVolume / 200, 1);
      const c = RIVER_COLOR.clone().lerp(new THREE.Color(0x0066cc), intensity);
      riverColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }

    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(riverPositions, 3)
    );
    riverGeo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(riverColors, 3)
    );

    return { terrainGeometry: terrainGeo, riverGeometry: riverGeo };
  }, [terrain]);

  return (
    <group ref={meshRef} position={[terrain.bounds.width / 2, 0, terrain.bounds.height / 2]}>
      {/* Terrain mesh */}
      <mesh geometry={terrainGeometry}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} />
      </mesh>

      {/* River lines */}
      {showRivers && (
        <lineSegments geometry={riverGeometry}>
          <lineBasicMaterial vertexColors linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
}
