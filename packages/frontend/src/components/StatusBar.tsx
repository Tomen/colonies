import { useSimulationStore } from '../store/simulation';

export function StatusBar() {
  const { status, progress, progressStage, terrain, config, pathfindingEnabled, pathfindingStart, currentPath, camera } = useSimulationStore();

  const statusText = {
    idle: 'Ready',
    generating: 'Generating...',
    ready: 'World Generated',
    running: 'Simulation Running',
    paused: 'Paused',
    error: 'Error',
  }[status];

  return (
    <div className="status-bar">
      <div className="status-item">
        <div className={`status-indicator ${status}`} />
        <span>{statusText}</span>
      </div>

      {status === 'generating' && (
        <>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span>{progressStage}</span>
        </>
      )}

      {terrain && (
        <>
          <div className="status-item">
            <span>
              Size: {terrain.bounds.width} x {terrain.bounds.height}
            </span>
          </div>
          <div className="status-item">
            <span>Seed: {config.seed}</span>
          </div>
          <div className="status-item">
            <span>
              Cam: ({camera.position[0].toFixed(0)}, {camera.position[1].toFixed(0)}, {camera.position[2].toFixed(0)})
            </span>
          </div>
        </>
      )}

      {pathfindingEnabled && (
        <div className="status-item">
          {pathfindingStart !== null ? (
            <span>Click destination cell...</span>
          ) : (
            <span>Click start cell...</span>
          )}
        </div>
      )}

      {currentPath && currentPath.success && (
        <div className="status-item">
          <span>
            Path: {currentPath.path.length} cells, cost: {currentPath.totalCost.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}
