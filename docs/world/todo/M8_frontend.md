# Milestone 8: Frontend Time Controls

UI for simulation control, time display, and interactive features.

## Overview

This step adds the UI layer for controlling the Living World simulation: play/pause, speed control, timeline navigation, and interactive settlement inspection.

**Dependencies:** M4 Simulation Engine, all visualization layers

**Provides:** User control over simulation, information display

## Data Structures

```typescript
// packages/frontend/src/store/simulation.ts - Extend existing

interface TimeState {
  // Playback control
  isPlaying: boolean;
  isPaused: boolean;
  speed: SimulationSpeed;

  // Current time
  year: number;
  month: number;
  tick: number;

  // History for scrubbing
  snapshots: StateSnapshot[];
  currentSnapshotIndex: number;
}

type SimulationSpeed = 1 | 2 | 5 | 10;  // Ticks per second

interface SimulationActions {
  // Playback
  play(): void;
  pause(): void;
  stop(): void;
  setSpeed(speed: SimulationSpeed): void;

  // Navigation
  stepForward(): void;
  stepBackward(): void;
  jumpToYear(year: number): void;
  jumpToTick(tick: number): void;

  // Snapshots
  addSnapshot(snapshot: StateSnapshot): void;
  getSnapshotAt(tick: number): StateSnapshot | null;
}

// Worker protocol extensions
interface WorkerMessage {
  type: 'GENERATE' | 'TICK' | 'FAST_FORWARD' | 'PAUSE' | 'STOP';
  config?: WorldConfig;
  ticks?: number;
}

interface WorkerResponse {
  type: 'INITIALIZED' | 'PROGRESS' | 'TERRAIN_GENERATED' | 'TICK_RESULT' | 'ERROR';
  terrain?: SerializedTerrain;
  result?: TickResult;
  snapshot?: StateSnapshot;
  percent?: number;
  stage?: string;
  message?: string;
}
```

## UI Components

### TimeControlBar

```tsx
// packages/frontend/src/components/TimeControlBar.tsx

interface TimeControlBarProps {
  className?: string;
}

export function TimeControlBar({ className }: TimeControlBarProps) {
  const { isPlaying, speed, year, month } = useSimulationStore();
  const { play, pause, setSpeed, stepForward, stepBackward } = useSimulationActions();

  return (
    <div className={`time-control-bar ${className}`}>
      {/* Playback controls */}
      <div className="playback-controls">
        <button onClick={stepBackward} disabled={isPlaying}>
          <StepBackIcon />
        </button>

        {isPlaying ? (
          <button onClick={pause}>
            <PauseIcon />
          </button>
        ) : (
          <button onClick={play}>
            <PlayIcon />
          </button>
        )}

        <button onClick={stepForward} disabled={isPlaying}>
          <StepForwardIcon />
        </button>
      </div>

      {/* Speed selector */}
      <div className="speed-selector">
        <label>Speed:</label>
        <select value={speed} onChange={e => setSpeed(Number(e.target.value) as SimulationSpeed)}>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
      </div>

      {/* Year display */}
      <div className="year-display">
        <span className="year">{year}</span>
        <span className="month">{monthName(month)}</span>
      </div>
    </div>
  );
}
```

### TimelineSlider

```tsx
// packages/frontend/src/components/TimelineSlider.tsx

interface TimelineSliderProps {
  minYear: number;
  maxYear: number;
  currentYear: number;
  onYearChange: (year: number) => void;
  events?: SimulationEvent[];  // Optional event markers
}

export function TimelineSlider({
  minYear,
  maxYear,
  currentYear,
  onYearChange,
  events = [],
}: TimelineSliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onYearChange(Number(e.target.value));
  };

  // Group events by year for markers
  const eventsByYear = useMemo(() => {
    const map = new Map<number, SimulationEvent[]>();
    for (const event of events) {
      const year = Math.floor(event.tick / 12) + minYear;
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(event);
    }
    return map;
  }, [events, minYear]);

  return (
    <div className="timeline-slider">
      <span className="min-year">{minYear}</span>

      <div className="slider-container">
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={currentYear}
          onChange={handleChange}
        />

        {/* Event markers */}
        <div className="event-markers">
          {Array.from(eventsByYear.entries()).map(([year, yearEvents]) => (
            <div
              key={year}
              className="event-marker"
              style={{ left: `${((year - minYear) / (maxYear - minYear)) * 100}%` }}
              title={yearEvents.map(e => e.type).join(', ')}
            />
          ))}
        </div>
      </div>

      <span className="max-year">{maxYear}</span>
    </div>
  );
}
```

### SettlementInfoPanel

```tsx
// packages/frontend/src/components/SettlementInfoPanel.tsx

interface SettlementInfoPanelProps {
  settlement: Settlement | null;
  resources?: ResourceInventory;
  onClose: () => void;
}

export function SettlementInfoPanel({
  settlement,
  resources,
  onClose,
}: SettlementInfoPanelProps) {
  if (!settlement) return null;

  return (
    <div className="settlement-info-panel">
      <div className="header">
        <h3>{settlement.name}</h3>
        <button onClick={onClose}>×</button>
      </div>

      <div className="details">
        <div className="stat">
          <label>Rank</label>
          <span className={`rank rank-${settlement.rank}`}>
            {settlement.rank}
          </span>
        </div>

        <div className="stat">
          <label>Population</label>
          <span>{settlement.population.toLocaleString()}</span>
        </div>

        <div className="stat">
          <label>Type</label>
          <span>{settlement.isPort ? 'Port' : 'Inland'}</span>
        </div>

        <div className="stat">
          <label>Claimed Cells</label>
          <span>{settlement.claimedCells.length}</span>
        </div>
      </div>

      {resources && (
        <div className="resources">
          <h4>Resources</h4>
          {Object.entries(resources).map(([type, amount]) => (
            <div key={type} className="resource">
              <span className="type">{type}</span>
              <span className="amount">{Math.floor(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### LayerToggles Extension

```tsx
// packages/frontend/src/components/LayerToggles.tsx - Extend existing

interface ExtendedVisibleLayers extends VisibleLayers {
  roads: boolean;
  tradeRoutes: boolean;
  populationHeatmap: boolean;
  resourceOverlay: ResourceType | null;
}

export function LayerToggles() {
  const { visibleLayers, setVisibleLayers } = useSimulationStore();

  return (
    <div className="layer-toggles">
      {/* Existing toggles */}
      <Toggle
        label="Terrain"
        checked={visibleLayers.terrain}
        onChange={v => setVisibleLayers({ terrain: v })}
      />
      <Toggle
        label="Parcels"
        checked={visibleLayers.parcels}
        onChange={v => setVisibleLayers({ parcels: v })}
      />
      <Toggle
        label="Settlements"
        checked={visibleLayers.settlements}
        onChange={v => setVisibleLayers({ settlements: v })}
      />

      {/* New toggles */}
      <Toggle
        label="Roads"
        checked={visibleLayers.roads}
        onChange={v => setVisibleLayers({ roads: v })}
      />
      <Toggle
        label="Trade Routes"
        checked={visibleLayers.tradeRoutes}
        onChange={v => setVisibleLayers({ tradeRoutes: v })}
      />
      <Toggle
        label="Population Heatmap"
        checked={visibleLayers.populationHeatmap}
        onChange={v => setVisibleLayers({ populationHeatmap: v })}
      />

      {/* Resource overlay selector */}
      <div className="resource-overlay">
        <label>Resource Overlay</label>
        <select
          value={visibleLayers.resourceOverlay || ''}
          onChange={e => setVisibleLayers({
            resourceOverlay: e.target.value || null
          })}
        >
          <option value="">None</option>
          <option value="food">Food</option>
          <option value="timber">Timber</option>
          <option value="tools">Tools</option>
        </select>
      </div>
    </div>
  );
}
```

## Store Extensions

```typescript
// packages/frontend/src/store/simulation.ts - Full extension

interface SimulationState {
  // Existing
  status: 'idle' | 'generating' | 'ready' | 'running' | 'paused';
  terrain: SerializedTerrain | null;
  progress: number;
  config: WorldConfig;
  visibleLayers: ExtendedVisibleLayers;

  // Time state (new)
  time: TimeState;

  // Selection (new)
  selectedSettlement: string | null;

  // History (new)
  snapshots: StateSnapshot[];
  maxSnapshots: number;
}

const initialState: SimulationState = {
  status: 'idle',
  terrain: null,
  progress: 0,
  config: defaultConfig,
  visibleLayers: {
    terrain: true,
    parcels: true,
    settlements: true,
    roads: true,
    tradeRoutes: false,
    populationHeatmap: false,
    resourceOverlay: null,
    // ... existing
  },
  time: {
    isPlaying: false,
    isPaused: false,
    speed: 1,
    year: 1600,
    month: 1,
    tick: 0,
    snapshots: [],
    currentSnapshotIndex: 0,
  },
  selectedSettlement: null,
  snapshots: [],
  maxSnapshots: 1000,
};

export const useSimulationStore = create<SimulationState & SimulationActions>((set, get) => ({
  ...initialState,

  // Playback actions
  play: () => {
    set({ status: 'running', time: { ...get().time, isPlaying: true, isPaused: false } });
    get().startTickLoop();
  },

  pause: () => {
    set({ status: 'paused', time: { ...get().time, isPlaying: false, isPaused: true } });
  },

  stop: () => {
    set({
      status: 'ready',
      time: { ...initialState.time },
    });
  },

  setSpeed: (speed) => {
    set({ time: { ...get().time, speed } });
  },

  stepForward: () => {
    get().worker?.postMessage({ type: 'TICK' });
  },

  stepBackward: () => {
    const { snapshots, time } = get();
    const prevIndex = Math.max(0, time.currentSnapshotIndex - 1);
    if (snapshots[prevIndex]) {
      set({
        time: {
          ...time,
          currentSnapshotIndex: prevIndex,
          year: snapshots[prevIndex].year,
          month: snapshots[prevIndex].month,
          tick: snapshots[prevIndex].tick,
        },
      });
      // Apply snapshot to visualization
      get().applySnapshot(snapshots[prevIndex]);
    }
  },

  jumpToYear: (year) => {
    const { snapshots } = get();
    const targetTick = (year - 1600) * 12;
    const snapshot = snapshots.find(s => s.tick >= targetTick);
    if (snapshot) {
      get().applySnapshot(snapshot);
    }
  },

  // Tick loop
  startTickLoop: () => {
    const loop = () => {
      const { time, status } = get();
      if (status !== 'running') return;

      get().worker?.postMessage({ type: 'TICK' });

      // Schedule next tick based on speed
      const delay = 1000 / time.speed;
      setTimeout(loop, delay);
    };
    loop();
  },

  // Snapshot management
  addSnapshot: (snapshot) => {
    set(state => ({
      snapshots: [...state.snapshots.slice(-state.maxSnapshots + 1), snapshot],
      time: {
        ...state.time,
        currentSnapshotIndex: state.snapshots.length,
      },
    }));
  },

  applySnapshot: (snapshot) => {
    // Update terrain visualization with snapshot state
    set(state => ({
      time: {
        ...state.time,
        year: snapshot.year,
        month: snapshot.month,
        tick: snapshot.tick,
      },
    }));
  },

  // Selection
  selectSettlement: (id) => {
    set({ selectedSettlement: id });
  },

  clearSelection: () => {
    set({ selectedSettlement: null });
  },
}));
```

## Worker Protocol

```typescript
// packages/frontend/src/workers/simulation.worker.ts - Extend

// Handle new message types
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  switch (e.data.type) {
    case 'GENERATE':
      handleGenerate(e.data.config!);
      break;

    case 'TICK':
      handleTick();
      break;

    case 'FAST_FORWARD':
      handleFastForward(e.data.ticks!);
      break;

    case 'PAUSE':
      // No-op on worker side, handled by main thread
      break;

    case 'STOP':
      handleStop();
      break;
  }
};

let engine: SimulationEngine | null = null;

function handleGenerate(config: WorldConfig) {
  // Existing generation code...
  // After terrain generated, create engine
  engine = new SimulationEngine(config.seed, terrain);

  self.postMessage({
    type: 'TERRAIN_GENERATED',
    terrain: serializeTerrain(terrain),
  });
}

function handleTick() {
  if (!engine) return;

  const result = engine.tick();
  const snapshot = engine.captureSnapshot();

  self.postMessage({
    type: 'TICK_RESULT',
    result,
    snapshot,
  });
}

function handleFastForward(ticks: number) {
  if (!engine) return;

  for (let i = 0; i < ticks; i++) {
    engine.tick();

    // Report progress every 12 ticks (1 year)
    if (i % 12 === 0) {
      self.postMessage({
        type: 'PROGRESS',
        percent: (i / ticks) * 100,
        stage: `Simulating year ${engine.state.year}`,
      });
    }
  }

  const snapshot = engine.captureSnapshot();
  self.postMessage({
    type: 'TICK_RESULT',
    result: null,
    snapshot,
  });
}

function handleStop() {
  engine = null;
}
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| defaultSpeed | 1 | 1,2,5,10 | Initial simulation speed |
| maxSnapshots | 1000 | 100-10000 | Maximum stored snapshots |
| autoSaveInterval | 60 | 0-600 | Seconds between auto-saves (0=disabled) |
| showYearOverlay | true | bool | Display year on map |
| showPopulationNumbers | true | bool | Show population in tooltips |

## Tasks

### Store Extensions

- [ ] Add `TimeState` to simulation store
- [ ] Implement `play()`, `pause()`, `stop()` actions
- [ ] Implement `setSpeed()` action
- [ ] Implement `stepForward()`, `stepBackward()` actions
- [ ] Implement `jumpToYear()`, `jumpToTick()` actions
- [ ] Add snapshot management

### Worker Protocol

- [ ] Add `TICK` message handler
- [ ] Add `FAST_FORWARD` message handler
- [ ] Integrate `SimulationEngine` into worker
- [ ] Return `TickResult` and `StateSnapshot` from ticks

### UI Components

- [ ] Create `TimeControlBar` component
- [ ] Create `TimelineSlider` component
- [ ] Create `SettlementInfoPanel` component
- [ ] Extend `LayerToggles` with new options
- [ ] Add keyboard shortcuts (Space=play/pause, arrows=step)

### Visualization Layers

- [ ] Create `RoadsMesh` component
- [ ] Create `TradeRoutesMesh` component (animated)
- [ ] Create `PopulationHeatmap` component
- [ ] Add click-to-select for settlements

### Integration

- [ ] Wire TimeControlBar to store
- [ ] Wire settlement selection to info panel
- [ ] Apply snapshots to visualization
- [ ] Handle year display overlay

## Testing & Acceptance

### Unit Tests

- [ ] `play()`: Sets status to 'running'
- [ ] `pause()`: Sets status to 'paused'
- [ ] `setSpeed()`: Updates speed correctly
- [ ] `addSnapshot()`: Adds to history, respects max
- [ ] `jumpToYear()`: Finds correct snapshot

### Integration Tests

- [ ] Play/pause cycle works without memory leaks
- [ ] Timeline slider jumps to correct state
- [ ] Settlement click shows info panel
- [ ] Speed changes affect tick rate

### Visual Validation

- [ ] Play button animates simulation
- [ ] Year display updates smoothly
- [ ] Timeline slider shows event markers
- [ ] Settlement info panel shows correct data
- [ ] Layer toggles affect visualization

## Open Questions

- **[OPEN]** How to handle very long simulations (memory for snapshots)?
- **[OPEN]** Should there be a "fast forward to year X" button?
- **[OPEN]** Keyboard shortcuts: what's the full mapping?
- **[OPEN]** Mobile touch controls?
- **[OPEN]** Should settlement selection pause simulation?
