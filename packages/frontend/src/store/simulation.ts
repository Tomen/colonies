import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorldConfig, Settlement, NetworkEdge, PathResult } from '@colonies/shared';
import { DEFAULT_CONFIG } from '@colonies/shared';
import type { SerializedTerrain } from '../workers/simulation.worker';

// Re-export type for use in components
export type { SerializedTerrain };

export type SimulationStatus = 'idle' | 'generating' | 'ready' | 'running' | 'paused' | 'error';
export type RiverMode = 'off' | 'line' | 'full';
export type HeightMode = 'flat' | '3d';
export type TextureMode = 'normal' | 'blank' | 'biome' | 'moisture';
export type WireframeMode = 'off' | 'cells';
export type RiverCarvingMode = 'off' | 'on' | 'debug';
export type NetworkMode = 'off' | 'cost' | 'paths';

interface VisibleLayers {
  terrain: boolean;
  heightMode: HeightMode;
  textureMode: TextureMode;
  wireframeMode: WireframeMode;
  carveRivers: RiverCarvingMode;
  riverMode: RiverMode;
  roads: boolean;
  settlements: boolean;
  parcels: boolean;
  networkMode: NetworkMode;
  buildings: boolean;
}

export interface CameraState {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles (YXZ order)
}

export const DEFAULT_CAMERA: CameraState = {
  position: [1200, 600, 1000],
  // Look towards map center (0, 0, 0): pitch down, yaw towards origin
  rotation: [-0.37, -2.27, 0],
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

  // Pathfinding interaction state
  pathfindingEnabled: boolean;
  pathfindingStart: number | null; // cell id
  currentPath: PathResult | null;

  // Cell selection for debug
  selectedCell: number | null;

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
  setPathfindingEnabled: (enabled: boolean) => void;
  setPathfindingStart: (cellId: number | null) => void;
  setCurrentPath: (path: PathResult | null) => void;
  findPath: (fromCell: number, toCell: number) => void;
  setSelectedCell: (cellId: number | null) => void;
}

const DEFAULT_VISIBLE_LAYERS: VisibleLayers = {
  terrain: true,
  heightMode: '3d',
  textureMode: 'normal',
  wireframeMode: 'off',
  carveRivers: 'on',
  riverMode: 'full',
  roads: true,
  settlements: true,
  parcels: true,
  networkMode: 'off',
  buildings: true,
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

      // Pathfinding state
      pathfindingEnabled: false,
      pathfindingStart: null,
      currentPath: null,

      // Cell selection
      selectedCell: null,

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

            case 'TERRAIN_GENERATED': {
              const t = event.terrain;
              // Log warnings for missing optional data
              if (!t.network) console.warn('[Simulation] No transport network generated');
              if (!t.settlements?.length) console.warn('[Simulation] No settlements generated');
              if (!t.buildings?.length) console.warn('[Simulation] No buildings generated');
              set({
                terrain: t,
                status: 'ready',
                progress: 100,
                progressStage: 'Complete',
              });
              break;
            }

            case 'PATH_RESULT':
              set({ currentPath: event.path });
              break;

            case 'ERROR':
              console.error('[Simulation Worker]', event.message);
              set({ status: 'error', error: event.message });
              break;
          }
        };

        worker.onerror = (e) => {
          const message = e.message || e.error?.message || 'Unknown worker error';
          const location = e.filename ? ` at ${e.filename}:${e.lineno}:${e.colno}` : '';
          console.error('[Simulation Worker] Uncaught error:', message + location);
          if (e.error) console.error(e.error);
          set({ status: 'error', error: message });
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

      setPathfindingEnabled: (enabled) => {
        set({
          pathfindingEnabled: enabled,
          pathfindingStart: null,
          currentPath: null,
        });
      },

      setPathfindingStart: (cellId) => {
        set({ pathfindingStart: cellId });
      },

      setCurrentPath: (path) => {
        set({ currentPath: path });
      },

      findPath: (fromCell, toCell) => {
        const { worker } = get();
        if (!worker) return;
        worker.postMessage({ type: 'FIND_PATH', fromCell, toCell });
      },

      setSelectedCell: (cellId) => {
        set({ selectedCell: cellId });
      },
    }),
    {
      name: 'colonies-simulation',
      partialize: (state) => ({
        config: state.config,
        visibleLayers: state.visibleLayers,
        camera: state.camera,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SimulationState>;
        // Cast to Record to handle old persisted values that may not match current types
        const persistedLayers = (persisted.visibleLayers || {}) as Record<string, unknown>;

        // Validate and migrate persisted values
        const validTextureMode = ['normal', 'blank', 'biome', 'moisture'];
        const validWireframeMode = ['off', 'cells'];
        const validRiverMode = ['off', 'line', 'full'];
        const validCarveRivers = ['off', 'on', 'debug'];
        const validNetworkMode = ['off', 'cost', 'paths'];
        const validHeightMode = ['flat', '3d'];

        // Migrate old 'voronoi' textureMode to new values
        let textureMode: TextureMode = DEFAULT_VISIBLE_LAYERS.textureMode;
        let wireframeMode: WireframeMode = DEFAULT_VISIBLE_LAYERS.wireframeMode;
        if (persistedLayers.textureMode === 'voronoi') {
          textureMode = 'blank';
          wireframeMode = 'cells';
        } else if (validTextureMode.includes(persistedLayers.textureMode as string)) {
          textureMode = persistedLayers.textureMode as TextureMode;
        }
        if (validWireframeMode.includes(persistedLayers.wireframeMode as string)) {
          wireframeMode = persistedLayers.wireframeMode as WireframeMode;
        }

        // Validate other modes, using defaults for invalid values
        const riverMode: RiverMode = validRiverMode.includes(persistedLayers.riverMode as string)
          ? (persistedLayers.riverMode as RiverMode)
          : DEFAULT_VISIBLE_LAYERS.riverMode;
        const carveRivers: RiverCarvingMode = validCarveRivers.includes(persistedLayers.carveRivers as string)
          ? (persistedLayers.carveRivers as RiverCarvingMode)
          : DEFAULT_VISIBLE_LAYERS.carveRivers;
        const networkMode: NetworkMode = validNetworkMode.includes(persistedLayers.networkMode as string)
          ? (persistedLayers.networkMode as NetworkMode)
          : DEFAULT_VISIBLE_LAYERS.networkMode;
        const heightMode: HeightMode = validHeightMode.includes(persistedLayers.heightMode as string)
          ? (persistedLayers.heightMode as HeightMode)
          : DEFAULT_VISIBLE_LAYERS.heightMode;

        return {
          ...currentState,
          ...persisted,
          // Merge visibleLayers with validated values
          visibleLayers: {
            ...DEFAULT_VISIBLE_LAYERS,
            ...(persisted.visibleLayers || {}),
            // Override with validated values
            textureMode,
            wireframeMode,
            riverMode,
            carveRivers,
            networkMode,
            heightMode,
          },
          // Merge camera with defaults
          camera: {
            ...DEFAULT_CAMERA,
            ...(persisted.camera || {}),
          },
        };
      },
    }
  )
);
