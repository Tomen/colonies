import { createWorldGenerator, CadastralManager, SettlementManager, SeededRNG } from '@colonies/core';
import type {
  WorldConfig,
  VoronoiTerrainData,
  VoronoiCell,
  VoronoiEdge,
  TerrainResult,
  Parcel,
  Point,
  Settlement,
} from '@colonies/shared';

// Serialized Voronoi terrain (plain objects, no transfer needed)
export interface SerializedTerrain {
  type: 'voronoi';
  cells: VoronoiCell[];
  edges: VoronoiEdge[];
  rivers: VoronoiEdge[];
  bounds: { width: number; height: number };
  parcels: Parcel[];
  settlements: Settlement[];
  harborLocation: Point | null;
}

function serializeTerrain(
  terrain: VoronoiTerrainData,
  parcels: Parcel[],
  settlements: Settlement[],
  harborLocation: Point | null
): SerializedTerrain {
  return {
    type: 'voronoi',
    cells: terrain.cells,
    edges: terrain.edges,
    rivers: terrain.rivers,
    bounds: terrain.bounds,
    parcels,
    settlements,
    harborLocation,
  };
}

/**
 * Generate settlements and their parcels.
 * Uses SettlementManager for proper settlement seeding.
 */
function generateSettlementsAndParcels(
  terrain: TerrainResult,
  config: WorldConfig
): { parcels: Parcel[]; settlements: Settlement[] } {
  const settlementCount = config.settlementCount ?? 3;

  // Skip if no settlements requested
  if (settlementCount <= 0) {
    return { parcels: [], settlements: [] };
  }

  // Create managers with fresh RNG for deterministic results
  const rng = new SeededRNG(config.seed + 1000); // Offset seed to avoid terrain correlation
  const cadastral = new CadastralManager(terrain, rng);
  const settlementManager = new SettlementManager(cadastral, rng);

  // Seed settlements
  const settlements = settlementManager.seedSettlements(settlementCount);

  // Get all generated parcels
  const parcels = cadastral.getAllParcels();

  return { parcels, settlements };
}

function postProgress(percent: number, stage: string) {
  self.postMessage({ type: 'PROGRESS', percent, stage });
}

self.onmessage = (e: MessageEvent) => {
  const { type, config } = e.data;

  if (type === 'GENERATE') {
    try {
      const worldConfig = config as WorldConfig;

      postProgress(0, 'Generating terrain...');
      const generator = createWorldGenerator(worldConfig);

      postProgress(20, 'Building terrain data...');
      const terrain = generator.generateTerrain();

      postProgress(60, 'Finding harbor locations...');
      const harborLocation = generator.findBestHarbor(terrain);

      postProgress(75, 'Generating settlements...');
      const { parcels, settlements } = generateSettlementsAndParcels(terrain, worldConfig);

      postProgress(95, 'Serializing terrain data...');
      const serialized = serializeTerrain(terrain, parcels, settlements, harborLocation);

      self.postMessage({ type: 'TERRAIN_GENERATED', terrain: serialized });
    } catch (error) {
      self.postMessage({
        type: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

// Signal ready
self.postMessage({ type: 'INITIALIZED' });
