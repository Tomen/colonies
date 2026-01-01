import { create } from 'zustand';
import type { WorldConfig, Settlement, NetworkEdge } from '@colonies/shared';
import { DEFAULT_CONFIG } from '@colonies/shared';

export interface SerializedTerrainData {
  width: number;
  height: number;
  heightBuffer: Float32Array;
  flowBuffer: Float32Array;
  moistureBuffer: Float32Array;
}

export type SimulationStatus = 'idle' | 'generating' | 'ready' | 'running' | 'paused' | 'error';

interface SimulationState {
  // Worker
  worker: Worker | null;
  status: SimulationStatus;
  error: string | null;
  progress: number;
  progressStage: string;

  // Config
  config: WorldConfig;

  // Simulation data
  terrain: SerializedTerrainData | null;
  settlements: Settlement[];
  edges: NetworkEdge[];
  year: number;

  // UI state
  visibleLayers: {
    terrain: boolean;
    rivers: boolean;
    roads: boolean;
    settlements: boolean;
  };

  // Actions
  initWorker: () => void;
  setConfig: (config: Partial<WorldConfig>) => void;
  generateWorld: () => void;
  setVisibleLayer: (layer: keyof SimulationState['visibleLayers'], visible: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  // Initial state
  worker: null,
  status: 'idle',
  error: null,
  progress: 0,
  progressStage: '',

  config: { ...DEFAULT_CONFIG },

  terrain: null,
  settlements: [],
  edges: [],
  year: 0,

  visibleLayers: {
    terrain: true,
    rivers: true,
    roads: true,
    settlements: true,
  },

  // Actions
  initWorker: () => {
    const worker = new Worker(
      new URL('../workers/simulation.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e) => {
      const event = e.data;

      switch (event.type) {
        case 'INITIALIZED':
          set({ status: 'idle' });
          // Auto-generate terrain on load
          get().generateWorld();
          break;

        case 'PROGRESS':
          set({ progress: event.percent, progressStage: event.stage });
          break;

        case 'TERRAIN_GENERATED':
          set({
            terrain: event.terrain,
            status: 'ready',
            progress: 100,
            progressStage: 'Complete',
          });
          break;

        case 'ERROR':
          set({ status: 'error', error: event.message });
          break;
      }
    };

    worker.onerror = (e) => {
      set({ status: 'error', error: e.message });
    };

    set({ worker, status: 'idle' });
  },

  setConfig: (partialConfig) => {
    set((state) => ({
      config: { ...state.config, ...partialConfig },
    }));
  },

  generateWorld: () => {
    const { worker, config } = get();
    if (!worker) return;

    set({
      status: 'generating',
      progress: 0,
      progressStage: 'Initializing...',
      terrain: null,
      error: null,
    });

    worker.postMessage({ type: 'GENERATE', config });
  },

  setVisibleLayer: (layer, visible) => {
    set((state) => ({
      visibleLayers: { ...state.visibleLayers, [layer]: visible },
    }));
  },
}));
