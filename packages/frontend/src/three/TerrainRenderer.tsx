import { useSimulationStore } from '../store/simulation';
import { VoronoiTerrainMesh } from './VoronoiTerrainMesh';
import { ParcelMesh } from './ParcelMesh';
import { SettlementMarkers } from './SettlementMarkers';
import { NetworkMesh } from './NetworkMesh';
import { CellClickHandler } from './CellClickHandler';
import { BuildingsMesh } from './BuildingsMesh';
import { StreetsMesh } from './StreetsMesh';
import { LakeMesh } from './LakeMesh';

export function TerrainRenderer() {
  const terrain = useSimulationStore((s) => s.terrain);
  const heightMode = useSimulationStore((s) => s.visibleLayers.heightMode);
  const textureMode = useSimulationStore((s) => s.visibleLayers.textureMode);
  const wireframeMode = useSimulationStore((s) => s.visibleLayers.wireframeMode);
  const carveRivers = useSimulationStore((s) => s.visibleLayers.carveRivers);
  const riverMode = useSimulationStore((s) => s.visibleLayers.riverMode);
  const showParcels = useSimulationStore((s) => s.visibleLayers.parcels);
  const showSettlements = useSimulationStore((s) => s.visibleLayers.settlements);
  const showBuildings = useSimulationStore((s) => s.visibleLayers.buildings);
  const networkMode = useSimulationStore((s) => s.visibleLayers.networkMode);
  const currentPath = useSimulationStore((s) => s.currentPath);

  if (!terrain) {
    return null;
  }

  const parcels = terrain.parcels || [];
  const settlements = terrain.settlements || [];
  const buildings = terrain.buildings || [];
  const streets = terrain.streets || [];
  const useHeight = heightMode === '3d';

  return (
    <>
      <VoronoiTerrainMesh
        terrain={terrain}
        carveRivers={carveRivers}
        riverMode={riverMode}
        useHeight={useHeight}
        textureMode={textureMode}
        wireframeMode={wireframeMode}
      />
      {terrain.lakes && terrain.lakes.length > 0 && (
        <LakeMesh terrain={terrain} useHeight={useHeight} />
      )}
      {showParcels && parcels.length > 0 && (
        <ParcelMesh
          parcels={parcels}
          showWireframe={true}
          showFill={true}
        />
      )}
      {showBuildings && streets.length > 0 && (
        <StreetsMesh streets={streets} />
      )}
      {showBuildings && buildings.length > 0 && (
        <BuildingsMesh buildings={buildings} />
      )}
      {showSettlements && settlements.length > 0 && (
        <SettlementMarkers settlements={settlements} />
      )}
      {(networkMode !== 'off' || currentPath) && terrain.network && (
        <NetworkMesh
          cells={terrain.cells}
          edges={terrain.network.edges}
          settlementPaths={terrain.network.settlementPaths}
          currentPath={currentPath}
          mode={networkMode}
        />
      )}
      <CellClickHandler cells={terrain.cells} bounds={terrain.bounds} />
    </>
  );
}
