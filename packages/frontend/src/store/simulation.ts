import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorldConfig, Settlement, NetworkEdge } from '@colonies/shared';
import { DEFAULT_CONFIG } from '@colonies/shared';
import type { SerializedTerrain } from '../workers/simulation.worker';

// Re-export type for use in components
export type { SerializedTerrain };

export type SimulationStatus = 'idle' | 'generating' | 'ready' | 'running' | 'paused' | 'error';
export type RiverMode = 'off' | 'line' | 'full';
export type HeightMode = 'flat' | '3d';
export type TextureMode = 'normal' | 'voronoi';

interface VisibleLayers {
  terrain: boolean;
  heightMode: HeightMode;
  textureMode: TextureMode;
  carveRivers: boolean;
  riverMode: RiverMode;
  roads: boolean;
  settlements: boolean;
  parcels: boolean;
}

export interface CameraState {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles (YXZ order)
}

export const DEFAULT_CAMERA: CameraState = {
  position: [1200, 600, 1000],
  rotation: [0, 0, 0],
};

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
  terrain: SerializedTerrain | null;
  settlements: Settlement[];
  edges: NetworkEdge[];
  year: number;

  // UI state
  visibleLayers: VisibleLayers;
  camera: CameraState;

  // Actions
  initWorker: () => void;
  setCameraState: (camera: CameraState) => void;
  resetCamera: () => void;
  setConfig: (config: Partial<WorldConfig>) => void;
  generateWorld: () => void;
  setVisibleLayer: <K extends keyof SimulationState['visibleLayers']>(
    layer: K,
    value: SimulationState['visibleLayers'][K]
  ) => void;
}

const DEFAULT_VISIBLE_LAYERS: VisibleLayers = {
  terrain: true,
  heightMode: '3d',
  textureMode: 'normal',
  carveRivers: true,
  riverMode: 'full',
  roads: true,
  settlements: true,
  parcels: true,
};

export const useSimulationStore = create<SimulationState>()(
  persist(
    (set, get) => ({
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

      visibleLayers: { ...DEFAULT_VISIBLE_LAYERS },
      camera: { ...DEFAULT_CAMERA },

      // Actions
      setCameraState: (camera) => {
        set({ camera });
      },

      resetCamera: () => {
        set({ camera: { ...DEFAULT_CAMERA } });
      },

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

      setVisibleLayer: (layer, value) => {
        set((state) => ({
          visibleLayers: { ...state.visibleLayers, [layer]: value },
        }));
      },
    }),
    {
      name: 'colonies-simulation',
      partialize: (state) => ({
        config: state.config,
        visibleLayers: state.visibleLayers,
        camera: state.camera,
      }),
    }
  )
);
