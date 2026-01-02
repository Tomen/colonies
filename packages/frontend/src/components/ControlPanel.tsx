import type { GenerationAlgorithm } from '@colonies/shared';
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
  const currentAlgorithm = config.generationAlgorithm ?? 'grid';

  const handleAlgorithmChange = (algorithm: GenerationAlgorithm) => {
    if (algorithm !== currentAlgorithm && !isGenerating) {
      setConfig({ generationAlgorithm: algorithm });
      // Auto-generate after a short delay to let state update
      setTimeout(() => generateWorld(), 0);
    }
  };

  return (
    <div className="control-panel">
      <h2>World Generator</h2>

      <div className="control-group">
        <label>Algorithm</label>
        <div className="pill-toggle">
          <button
            className={`pill-option ${currentAlgorithm === 'grid' ? 'active' : ''}`}
            onClick={() => handleAlgorithmChange('grid')}
            disabled={isGenerating}
          >
            Grid
          </button>
          <button
            className={`pill-option ${currentAlgorithm === 'voronoi' ? 'active' : ''}`}
            onClick={() => handleAlgorithmChange('voronoi')}
            disabled={isGenerating}
          >
            Voronoi
          </button>
        </div>
      </div>

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
        <label>Land Fraction</label>
        <div className="control-row">
          <input
            type="range"
            min="0.3"
            max="0.8"
            step="0.05"
            value={config.landFraction ?? 0.55}
            onChange={(e) => setConfig({ landFraction: parseFloat(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{((config.landFraction ?? 0.55) * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>Peak Elevation</label>
        <div className="control-row">
          <input
            type="range"
            min="100"
            max="500"
            step="25"
            value={config.peakElevation ?? 300}
            onChange={(e) => setConfig({ peakElevation: parseInt(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.peakElevation ?? 300}m</span>
        </div>
      </div>

      <div className="control-group">
        <label>Hilliness</label>
        <div className="control-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={config.hilliness ?? 0.3}
            onChange={(e) => setConfig({ hilliness: parseFloat(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{((config.hilliness ?? 0.3) * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>Coastal Flatness</label>
        <div className="control-row">
          <input
            type="range"
            min="1"
            max="4"
            step="0.5"
            value={config.elevationBlendPower ?? 2}
            onChange={(e) => setConfig({ elevationBlendPower: parseFloat(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.elevationBlendPower ?? 2}</span>
        </div>
      </div>

      <div className="control-group">
        <label>River Density</label>
        <div className="control-row">
          <input
            type="range"
            min="20"
            max="200"
            step="10"
            value={config.riverThreshold ?? 50}
            onChange={(e) => setConfig({ riverThreshold: parseInt(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.riverThreshold ?? 50}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Island Complexity</label>
        <div className="control-row">
          <input
            type="range"
            min="1"
            max="6"
            step="1"
            value={config.islandNoiseOctaves ?? 4}
            onChange={(e) => setConfig({ islandNoiseOctaves: parseInt(e.target.value) })}
            disabled={isGenerating}
          />
          <span>{config.islandNoiseOctaves ?? 4}</span>
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
