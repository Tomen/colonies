import { useSimulationStore } from '../store/simulation';

export function ControlPanel() {
  const {
    config,
    setConfig,
    generateWorld,
    status,
    visibleLayers,
    setVisibleLayer,
  } = useSimulationStore();

  const isGenerating = status === 'generating';

  return (
    <div className="control-panel">
      <h2>World Generator</h2>

      <div className="control-group">
        <label>Seed</label>
        <input
          type="number"
          value={config.seed}
          onChange={(e) => setConfig({ seed: parseInt(e.target.value) || 0 })}
          disabled={isGenerating}
        />
      </div>

      <div className="control-group">
        <label>Map Size</label>
        <div className="control-row">
          <input
            type="range"
            min="100"
            max="1000"
            step="100"
            value={config.mapSize}
            onChange={(e) => setConfig({ mapSize: parseInt(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.mapSize}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Ridge Orientation</label>
        <div className="control-row">
          <input
            type="range"
            min="0"
            max="90"
            value={config.ridgeOrientation}
            onChange={(e) => setConfig({ ridgeOrientation: parseInt(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.ridgeOrientation}°</span>
        </div>
      </div>

      <div className="control-group">
        <label>River Density</label>
        <div className="control-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={config.riverDensity}
            onChange={(e) => setConfig({ riverDensity: parseFloat(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.riverDensity.toFixed(1)}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Coastal Plain Width</label>
        <div className="control-row">
          <input
            type="range"
            min="0.1"
            max="0.5"
            step="0.05"
            value={config.coastalPlainWidth ?? 0.3}
            onChange={(e) => setConfig({ coastalPlainWidth: parseFloat(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{((config.coastalPlainWidth ?? 0.3) * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>Ridge Height</label>
        <div className="control-row">
          <input
            type="range"
            min="50"
            max="500"
            step="10"
            value={config.ridgeHeight ?? 200}
            onChange={(e) => setConfig({ ridgeHeight: parseInt(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.ridgeHeight ?? 200}m</span>
        </div>
      </div>

      <button onClick={generateWorld} disabled={isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate World'}
      </button>

      <div className="layer-toggles">
        <button
          className={`layer-toggle ${visibleLayers.terrain ? 'active' : ''}`}
          onClick={() => setVisibleLayer('terrain', !visibleLayers.terrain)}
        >
          Terrain
        </button>
        <button
          className={`layer-toggle ${visibleLayers.rivers ? 'active' : ''}`}
          onClick={() => setVisibleLayer('rivers', !visibleLayers.rivers)}
        >
          Rivers
        </button>
        <button
          className={`layer-toggle ${visibleLayers.settlements ? 'active' : ''}`}
          onClick={() => setVisibleLayer('settlements', !visibleLayers.settlements)}
        >
          Towns
        </button>
      </div>
    </div>
  );
}
