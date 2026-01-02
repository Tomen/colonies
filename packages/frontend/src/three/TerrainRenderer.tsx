import { useSimulationStore } from '../store/simulation';
import { VoronoiTerrainMesh } from './VoronoiTerrainMesh';
import { VoronoiDebugMesh } from './VoronoiDebugMesh';
import { ParcelMesh } from './ParcelMesh';
import { SettlementMarkers } from './SettlementMarkers';
import { NetworkMesh } from './NetworkMesh';
import { CellClickHandler } from './CellClickHandler';

export function TerrainRenderer() {
  const terrain = useSimulationStore((s) => s.terrain);
  const heightMode = useSimulationStore((s) => s.visibleLayers.heightMode);
  const textureMode = useSimulationStore((s) => s.visibleLayers.textureMode);
  const carveRivers = useSimulationStore((s) => s.visibleLayers.carveRivers);
  const riverMode = useSimulationStore((s) => s.visibleLayers.riverMode);
  const showParcels = useSimulationStore((s) => s.visibleLayers.parcels);
  const showSettlements = useSimulationStore((s) => s.visibleLayers.settlements);
  const networkMode = useSimulationStore((s) => s.visibleLayers.networkMode);
  const currentPath = useSimulationStore((s) => s.currentPath);

  if (!terrain) {
    return null;
  }

  const parcels = terrain.parcels || [];
  const settlements = terrain.settlements || [];
  const useHeight = heightMode === '3d';

  return (
    <>
      <VoronoiTerrainMesh
        terrain={terrain}
        carveRivers={carveRivers}
        riverMode={riverMode}
        useHeight={useHeight}
        textureMode={textureMode}
      />
      {textureMode === 'voronoi' && (
        <VoronoiDebugMesh terrain={terrain} parcels={parcels} useHeight={useHeight} carveRivers={carveRivers} />
      )}
      {showParcels && parcels.length > 0 && (
        <ParcelMesh
          parcels={parcels}
          showWireframe={true}
          showFill={true}
        />
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
