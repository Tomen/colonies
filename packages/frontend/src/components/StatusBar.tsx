import { useSimulationStore } from '../store/simulation';

export function StatusBar() {
  const { status, progress, progressStage, terrain, config } = useSimulationStore();

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
        </>
      )}
    </div>
  );
}
