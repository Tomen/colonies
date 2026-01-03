import { useMemo } from 'react';
import * as THREE from 'three';
import type { SerializedTerrain, RiverCarvingMode } from '../store/simulation';
import type { Parcel, VoronoiCell } from '@colonies/shared';
import {
  useTerrainHeightStore,
  getCellHeight,
  vertexKey,
  ELEVATION_SCALE,
  FLAT_HEIGHT,
  OCEAN_DEPTH,
} from '../store/terrainHeight';

interface VoronoiDebugMeshProps {
  terrain: SerializedTerrain;
  parcels: Parcel[];
  useHeight: boolean;
  carveRivers: RiverCarvingMode;
}

const CELL_EDGE_COLOR = 0x000000; // Black
const PARCEL_EDGE_COLOR = 0x666666; // Medium gray
const CENTROID_COLOR = 0x000000; // Black
const RIVER_THRESHOLD = 25;

/**
 * VoronoiDebugMesh renders debug overlays on top of the terrain:
 * - Cell edges (black lines)
 * - Cell centroids (black dots)
 * - Parcel edges (medium gray lines)
 *
 * The terrain fill is handled by VoronoiTerrainMesh with textureMode='voronoi'.
 */
export function VoronoiDebugMesh({ terrain, parcels, useHeight, carveRivers }: VoronoiDebugMeshProps) {
  const cellHeights = useTerrainHeightStore((s) => s.cellHeights);
  const vertexHeights = useTerrainHeightStore((s) => s.vertexHeights);

  const { cellEdgeGeometry, centroidGeometry, parcelEdgeGeometry } =
    useMemo(() => {
      const { cells, bounds } = terrain;

      // Local helper to get vertex Y (uses store data)
      const getVertexY = (x: number, y: number, fallbackElevation: number): number => {
        if (!useHeight) return FLAT_HEIGHT;
        // Try store first, fall back to computing from cell elevation
        const storeHeight = vertexHeights.get(vertexKey(x, y));
        if (storeHeight !== undefined) return storeHeight;
        return fallbackElevation * ELEVATION_SCALE;
      };

      // Local helper for cell Y with river carving (for cell edges/centroids)
      const shouldCarve = carveRivers === 'on' || carveRivers === 'debug';
      const getCarveDepth = (cell: VoronoiCell): number => {
        if (!shouldCarve || !useHeight) return 0;
        if (!cell.isLand || cell.flowAccumulation < RIVER_THRESHOLD) return 0;
        return Math.min(
          Math.log(cell.flowAccumulation / RIVER_THRESHOLD + 1) * 8,
          cell.elevation * 0.5
        );
      };

      const getLocalCellY = (cell: VoronoiCell): number => {
        if (!useHeight) return FLAT_HEIGHT;
        const baseY = cell.isLand ? cell.elevation * ELEVATION_SCALE : OCEAN_DEPTH * ELEVATION_SCALE;
        return baseY - getCarveDepth(cell) * ELEVATION_SCALE;
      };

      // --- Cell edges (black lines) ---
      let totalEdges = 0;
      for (const cell of cells) {
        totalEdges += cell.vertices.length;
      }

      const edgePositions = new Float32Array(totalEdges * 2 * 3);
      let edgeIndex = 0;

      for (const cell of cells) {
        const verts = cell.vertices;
        for (let i = 0; i < verts.length; i++) {
          const v0 = verts[i];
          const v1 = verts[(i + 1) % verts.length];

          const x0 = v0.x - bounds.width / 2;
          const z0 = v0.y - bounds.height / 2;
          const x1 = v1.x - bounds.width / 2;
          const z1 = v1.y - bounds.height / 2;

          const y0 = getVertexY(v0.x, v0.y, cell.elevation) + 0.005;
          const y1 = getVertexY(v1.x, v1.y, cell.elevation) + 0.005;

          edgePositions[edgeIndex * 6 + 0] = x0;
          edgePositions[edgeIndex * 6 + 1] = y0;
          edgePositions[edgeIndex * 6 + 2] = z0;

          edgePositions[edgeIndex * 6 + 3] = x1;
          edgePositions[edgeIndex * 6 + 4] = y1;
          edgePositions[edgeIndex * 6 + 5] = z1;

          edgeIndex++;
        }
      }

      const cellEdgeGeo = new THREE.BufferGeometry();
      cellEdgeGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(edgePositions, 3)
      );

      // --- Centroids (black dots) ---
      const centroidPositions = new Float32Array(cells.length * 3);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        centroidPositions[i * 3 + 0] = cell.centroid.x - bounds.width / 2;
        centroidPositions[i * 3 + 1] = getLocalCellY(cell) + 0.01;
        centroidPositions[i * 3 + 2] = cell.centroid.y - bounds.height / 2;
      }

      const centroidGeo = new THREE.BufferGeometry();
      centroidGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(centroidPositions, 3)
      );

      // --- Parcel edges (medium gray lines) ---
      // Use height store for consistent positioning with ParcelMesh
      let totalParcelEdges = 0;
      for (const parcel of parcels) {
        totalParcelEdges += parcel.vertices.length;
      }

      const parcelEdgePositions = new Float32Array(totalParcelEdges * 2 * 3);
      let parcelEdgeIndex = 0;

      for (const parcel of parcels) {
        // Use shared height store for parcel heights
        const parcelY = getCellHeight(parcel.terrainCellId, cellHeights, useHeight) + 0.003;

        const verts = parcel.vertices;
        for (let i = 0; i < verts.length; i++) {
          const v0 = verts[i];
          const v1 = verts[(i + 1) % verts.length];

          parcelEdgePositions[parcelEdgeIndex * 6 + 0] = v0.x - bounds.width / 2;
          parcelEdgePositions[parcelEdgeIndex * 6 + 1] = parcelY;
          parcelEdgePositions[parcelEdgeIndex * 6 + 2] = v0.y - bounds.height / 2;

          parcelEdgePositions[parcelEdgeIndex * 6 + 3] = v1.x - bounds.width / 2;
          parcelEdgePositions[parcelEdgeIndex * 6 + 4] = parcelY;
          parcelEdgePositions[parcelEdgeIndex * 6 + 5] = v1.y - bounds.height / 2;

          parcelEdgeIndex++;
        }
      }

      const parcelEdgeGeo = new THREE.BufferGeometry();
      parcelEdgeGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(parcelEdgePositions, 3)
      );

      return {
        cellEdgeGeometry: cellEdgeGeo,
        centroidGeometry: centroidGeo,
        parcelEdgeGeometry: parcelEdgeGeo,
      };
    }, [terrain, parcels, useHeight, carveRivers, cellHeights, vertexHeights]);

  return (
    <group position={[terrain.bounds.width / 2, 0, terrain.bounds.height / 2]}>
      {/* Parcel edges - medium gray (render before cell edges so cell edges are on top) */}
      {parcels.length > 0 && (
        <lineSegments geometry={parcelEdgeGeometry}>
          <lineBasicMaterial color={PARCEL_EDGE_COLOR} linewidth={1} />
        </lineSegments>
      )}

      {/* Cell edges - black */}
      <lineSegments geometry={cellEdgeGeometry}>
        <lineBasicMaterial color={CELL_EDGE_COLOR} linewidth={2} />
      </lineSegments>

      {/* Centroids - black dots */}
      <points geometry={centroidGeometry}>
        <pointsMaterial color={CENTROID_COLOR} size={3} sizeAttenuation={false} />
      </points>
    </group>
  );
}
