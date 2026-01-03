import { useState } from 'react';
import { useSimulationStore, type RiverMode, type HeightMode, type TextureMode, type WireframeMode, type RiverCarvingMode, type NetworkMode } from '../store/simulation';

type Tab = 'rendering' | 'generator';

export function ControlPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('rendering');
  const {
    config,
    setConfig,
    generateWorld,
    status,
    visibleLayers,
    setVisibleLayer,
    resetCamera,
    pathfindingEnabled,
    setPathfindingEnabled,
  } = useSimulationStore();

  const isGenerating = status === 'generating';

  return (
    <div className="control-panel">
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'rendering' ? 'active' : ''}`}
          onClick={() => setActiveTab('rendering')}
        >
          Rendering
        </button>
        <button
          className={`tab ${activeTab === 'generator' ? 'active' : ''}`}
          onClick={() => setActiveTab('generator')}
        >
          Generator
        </button>
      </div>

      {activeTab === 'generator' && (
        <div className="tab-content">
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
                min="1000"
                max="20000"
                step="1000"
                value={config.mapSize}
                onChange={(e) => setConfig({ mapSize: parseInt(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{config.mapSize}m</span>
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
                max="3000"
                step="100"
                value={config.peakElevation ?? 1500}
                onChange={(e) => setConfig({ peakElevation: parseInt(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{config.peakElevation ?? 1500}m</span>
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
                min="0"
                max="200"
                step="5"
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

          <div className="control-group">
            <label>Cell Count</label>
            <div className="control-row">
              <input
                type="range"
                min="1000"
                max="20000"
                step="1000"
                value={config.voronoiCellCount ?? 10000}
                onChange={(e) => setConfig({ voronoiCellCount: parseInt(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{config.voronoiCellCount ?? 10000}</span>
            </div>
          </div>

          <div className="control-group">
            <label>Mountain Peaks</label>
            <div className="control-row">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={config.mountainPeakCount ?? 5}
                onChange={(e) => setConfig({ mountainPeakCount: parseInt(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{config.mountainPeakCount ?? 5}</span>
            </div>
          </div>

          <div className="control-group">
            <label>Mountain Ridges</label>
            <div className="pill-toggle">
              <button
                className={`pill-option ${config.ridgeEnabled !== false ? 'active' : ''}`}
                onClick={() => setConfig({ ridgeEnabled: true })}
                disabled={isGenerating}
              >
                On
              </button>
              <button
                className={`pill-option ${config.ridgeEnabled === false ? 'active' : ''}`}
                onClick={() => setConfig({ ridgeEnabled: false })}
                disabled={isGenerating}
              >
                Off
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>Ridge Width</label>
            <div className="control-row">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={config.ridgeWidth ?? 3}
                onChange={(e) => setConfig({ ridgeWidth: parseInt(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{config.ridgeWidth ?? 3}</span>
            </div>
          </div>

          <div className="control-group">
            <label>Hill Amplitude</label>
            <div className="control-row">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.hillNoiseAmplitude ?? 0.4}
                onChange={(e) => setConfig({ hillNoiseAmplitude: parseFloat(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{((config.hillNoiseAmplitude ?? 0.4) * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="control-group">
            <label>Lakes</label>
            <div className="pill-toggle">
              <button
                className={`pill-option ${config.fillSpillEnabled !== false ? 'active' : ''}`}
                onClick={() => setConfig({ fillSpillEnabled: true })}
                disabled={isGenerating}
              >
                On
              </button>
              <button
                className={`pill-option ${config.fillSpillEnabled === false ? 'active' : ''}`}
                onClick={() => setConfig({ fillSpillEnabled: false })}
                disabled={isGenerating}
              >
                Off
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>Villages</label>
            <div className="control-row">
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={config.settlementCount ?? 3}
                onChange={(e) => setConfig({ settlementCount: parseInt(e.target.value) })}
                disabled={isGenerating}
              />
              <span>{config.settlementCount ?? 3}</span>
            </div>
          </div>

          <button onClick={generateWorld} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate World'}
          </button>
        </div>
      )}

      {activeTab === 'rendering' && (
        <div className="tab-content">
          <div className="control-group">
            <label>Height</label>
            <div className="pill-toggle">
              {(['flat', '3d'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`pill-option ${visibleLayers.heightMode === mode ? 'active' : ''}`}
                  onClick={() => setVisibleLayer('heightMode', mode as HeightMode)}
                >
                  {mode === '3d' ? '3D' : 'Flat'}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Textures</label>
            <div className="pill-toggle">
              {(['normal', 'biome', 'moisture', 'blank'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`pill-option ${visibleLayers.textureMode === mode ? 'active' : ''}`}
                  onClick={() => setVisibleLayer('textureMode', mode as TextureMode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Wireframe</label>
            <div className="pill-toggle">
              {(['off', 'cells'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`pill-option ${visibleLayers.wireframeMode === mode ? 'active' : ''}`}
                  onClick={() => setVisibleLayer('wireframeMode', mode as WireframeMode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="layer-toggles">
            <button
              className={`layer-toggle ${visibleLayers.terrain ? 'active' : ''}`}
              onClick={() => setVisibleLayer('terrain', !visibleLayers.terrain)}
            >
              Terrain
            </button>
            <button
              className={`layer-toggle ${visibleLayers.parcels ? 'active' : ''}`}
              onClick={() => setVisibleLayer('parcels', !visibleLayers.parcels)}
            >
              Parcels
            </button>
            <button
              className={`layer-toggle ${visibleLayers.settlements ? 'active' : ''}`}
              onClick={() => setVisibleLayer('settlements', !visibleLayers.settlements)}
            >
              Towns
            </button>
            <button
              className={`layer-toggle ${visibleLayers.buildings ? 'active' : ''}`}
              onClick={() => setVisibleLayer('buildings', !visibleLayers.buildings)}
            >
              Buildings
            </button>
          </div>

          <div className="control-group">
            <label>Rivers</label>
            <div className="pill-toggle">
              {(['off', 'line', 'full'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`pill-option ${visibleLayers.riverMode === mode ? 'active' : ''}`}
                  onClick={() => setVisibleLayer('riverMode', mode as RiverMode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>River Carving</label>
            <div className="pill-toggle">
              {(['off', 'on', 'debug'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`pill-option ${visibleLayers.carveRivers === mode ? 'active' : ''}`}
                  onClick={() => setVisibleLayer('carveRivers', mode as RiverCarvingMode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Network</label>
            <div className="pill-toggle">
              {(['off', 'cost', 'paths'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`pill-option ${visibleLayers.networkMode === mode ? 'active' : ''}`}
                  onClick={() => setVisibleLayer('networkMode', mode as NetworkMode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="layer-toggles">
            <button
              className={`layer-toggle ${pathfindingEnabled ? 'active' : ''}`}
              onClick={() => setPathfindingEnabled(!pathfindingEnabled)}
            >
              Click-to-Path
            </button>
          </div>

          <button className="reset-camera-btn" onClick={resetCamera}>
            Reset Camera
          </button>
        </div>
      )}
    </div>
  );
}
