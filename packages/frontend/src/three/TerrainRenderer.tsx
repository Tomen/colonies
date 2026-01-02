import { useSimulationStore } from '../store/simulation';
import { GridTerrainMesh } from './GridTerrainMesh';
import { VoronoiTerrainMesh } from './VoronoiTerrainMesh';

export function TerrainRenderer() {
  const terrain = useSimulationStore((s) => s.terrain);
  const showRivers = useSimulationStore((s) => s.visibleLayers.rivers);

  if (!terrain) {
    return null;
  }

  if (terrain.type === 'grid') {
    return <GridTerrainMesh terrain={terrain} showRivers={showRivers} />;
  } else if (terrain.type === 'voronoi') {
    return <VoronoiTerrainMesh terrain={terrain} showRivers={showRivers} />;
  }

  return null;
}
