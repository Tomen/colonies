import { useSimulationStore } from '../store/simulation';

export function CellDebugPanel() {
  const selectedCell = useSimulationStore((s) => s.selectedCell);
  const terrain = useSimulationStore((s) => s.terrain);
  const setSelectedCell = useSimulationStore((s) => s.setSelectedCell);

  if (selectedCell === null || !terrain) return null;

  const cell = terrain.cells[selectedCell];
  if (!cell) return null;

  return (
    <div className="cell-debug-panel">
      <div className="panel-header">
        <span>Cell #{cell.id}</span>
        <button onClick={() => setSelectedCell(null)}>&times;</button>
      </div>
      <div className="debug-grid">
        <span>Centroid:</span>
        <span>
          ({cell.centroid.x.toFixed(1)}, {cell.centroid.y.toFixed(1)})
        </span>
        <span>Elevation:</span>
        <span>{cell.elevation.toFixed(1)}m</span>
        <span>Moisture:</span>
        <span>{cell.moisture.toFixed(2)}</span>
        <span>Land:</span>
        <span>{cell.isLand ? 'Yes' : 'No'}</span>
        <span>Coast:</span>
        <span>{cell.isCoast ? 'Yes' : 'No'}</span>
        <span>Flows to:</span>
        <span>{cell.flowsTo ?? 'None'}</span>
        <span>Flow accum:</span>
        <span>{cell.flowAccumulation}</span>
        <span>Neighbors:</span>
        <span>{cell.neighbors.length} cells</span>
      </div>
    </div>
  );
}
