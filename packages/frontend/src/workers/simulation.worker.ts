import {
  createWorldGenerator,
  CadastralManager,
  SettlementManager,
  SeededRNG,
  createTransportNetwork,
  TransportNetwork,
  generateBuildings,
  generateStreets,
  generateSettlementName,
  DEFAULT_NAMING_CONFIG,
} from '@colonies/core';
import type {
  WorldConfig,
  VoronoiTerrainData,
  VoronoiCell,
  VoronoiEdge,
  TerrainResult,
  Parcel,
  Point,
  Settlement,
  SerializedNetwork,
  Building,
  Street,
} from '@colonies/shared';

// Keep reference to network for pathfinding requests
let currentNetwork: TransportNetwork | null = null;

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
  network: SerializedNetwork | null;
  buildings: Building[];
  streets: Street[];
}

function serializeTerrain(
  terrain: VoronoiTerrainData,
  parcels: Parcel[],
  settlements: Settlement[],
  harborLocation: Point | null,
  network: SerializedNetwork | null,
  buildings: Building[],
  streets: Street[]
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
    network,
    buildings,
    streets,
  };
}

/**
 * Generate settlements, parcels, buildings, and streets.
 * Uses SettlementManager for proper settlement seeding.
 */
function generateSettlementsAndParcels(
  terrain: TerrainResult,
  config: WorldConfig,
  networkEdges: { fromCell: number; toCell: number; type: string }[]
): { parcels: Parcel[]; settlements: Settlement[]; buildings: Building[]; streets: Street[] } {
  const settlementCount = config.settlementCount ?? 3;

  // Skip if no settlements requested
  if (settlementCount <= 0) {
    return { parcels: [], settlements: [], buildings: [], streets: [] };
  }

  // Create managers with fresh RNG for deterministic results
  const rng = new SeededRNG(config.seed + 1000); // Offset seed to avoid terrain correlation
  const cadastral = new CadastralManager(terrain, rng);
  const settlementManager = new SettlementManager(cadastral, rng);

  // Seed settlements
  const settlements = settlementManager.seedSettlements(settlementCount);

  // Generate terrain-based names for settlements
  const existingNames = new Set<string>();
  for (const settlement of settlements) {
    const cell = terrain.cells[settlement.cellId];
    if (cell) {
      const name = generateSettlementName(cell, terrain, existingNames, rng, DEFAULT_NAMING_CONFIG);
      existingNames.add(name);
      settlement.name = name;
    }
  }

  // Get all generated parcels
  const parcels = cadastral.getAllParcels();

  // Generate buildings for all parcels
  const buildingRng = new SeededRNG(config.seed + 2000); // Separate seed for buildings
  const buildings = generateBuildings(parcels, buildingRng);

  // Generate streets for all settlements
  // Convert network edges to the format expected by generateStreets
  const networkEdgeFormat = networkEdges.map((e, i) => ({
    id: `e${i}`,
    fromCell: e.fromCell,
    toCell: e.toCell,
    type: e.type as 'none' | 'trail' | 'road' | 'turnpike',
    baseCost: 0,
    currentCost: 0,
    usage: 0,
    crossings: [],
  }));
  const streets = generateStreets(settlements, terrain, networkEdgeFormat);

  return { parcels, settlements, buildings, streets };
}

function postProgress(percent: number, stage: string) {
  self.postMessage({ type: 'PROGRESS', percent, stage });
}

self.onmessage = (e: MessageEvent) => {
  const { type, config, fromCell, toCell } = e.data;

  if (type === 'FIND_PATH') {
    if (!currentNetwork) {
      self.postMessage({
        type: 'PATH_RESULT',
        path: { success: false, path: [], totalCost: Infinity, edges: [], crossings: [] },
      });
      return;
    }

    const path = currentNetwork.findPath(fromCell as number, toCell as number);
    self.postMessage({ type: 'PATH_RESULT', path });
    return;
  }

  if (type === 'GENERATE') {
    try {
      const worldConfig = config as WorldConfig;

      postProgress(0, 'Generating terrain...');
      const generator = createWorldGenerator(worldConfig);

      postProgress(20, 'Building terrain data...');
      const terrain = generator.generateTerrain();

      postProgress(50, 'Building transport network...');
      const network = createTransportNetwork(terrain);
      currentNetwork = network; // Store for pathfinding requests

      postProgress(60, 'Finding harbor locations...');
      const harborLocation = generator.findBestHarbor(terrain);

      postProgress(70, 'Generating settlements and buildings...');
      // Extract edge info for street generation
      const networkEdges = network.getAllEdges().map((e) => ({
        fromCell: e.fromCell,
        toCell: e.toCell,
        type: e.type,
      }));
      const { parcels, settlements, buildings, streets } = generateSettlementsAndParcels(
        terrain,
        worldConfig,
        networkEdges
      );

      postProgress(90, 'Serializing data...');
      const serializedNetwork = network.serialize(settlements);
      const serialized = serializeTerrain(
        terrain,
        parcels,
        settlements,
        harborLocation,
        serializedNetwork,
        buildings,
        streets
      );

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
