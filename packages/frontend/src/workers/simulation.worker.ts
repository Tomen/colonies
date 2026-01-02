import { createWorldGenerator, TransportNetwork } from '@colonies/core';
import type {
  WorldConfig,
  GridTerrainData,
  VoronoiTerrainData,
  VoronoiCell,
  VoronoiEdge,
  TerrainResult,
} from '@colonies/shared';

// Serialized grid terrain (transferable buffers)
export interface SerializedGridTerrain {
  type: 'grid';
  width: number;
  height: number;
  heightBuffer: Float32Array;
  flowBuffer: Float32Array;
  moistureBuffer: Float32Array;
}

// Serialized Voronoi terrain (plain objects, no transfer needed)
export interface SerializedVoronoiTerrain {
  type: 'voronoi';
  cells: VoronoiCell[];
  edges: VoronoiEdge[];
  rivers: VoronoiEdge[];
  bounds: { width: number; height: number };
}

export type SerializedTerrain = SerializedGridTerrain | SerializedVoronoiTerrain;

function serializeGridTerrain(terrain: GridTerrainData): SerializedGridTerrain {
  const size = terrain.height.length;
  const heightBuffer = new Float32Array(size * size);
  const flowBuffer = new Float32Array(size * size);
  const moistureBuffer = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      heightBuffer[idx] = terrain.height[y][x];
      flowBuffer[idx] = terrain.flowAccumulation[y][x];
      moistureBuffer[idx] = terrain.moisture[y][x];
    }
  }

  return {
    type: 'grid',
    width: size,
    height: size,
    heightBuffer,
    flowBuffer,
    moistureBuffer,
  };
}

function serializeVoronoiTerrain(
  terrain: VoronoiTerrainData
): SerializedVoronoiTerrain {
  // Voronoi cells are already plain objects, just pass through
  return {
    type: 'voronoi',
    cells: terrain.cells,
    edges: terrain.edges,
    rivers: terrain.rivers,
    bounds: terrain.bounds,
  };
}

function serializeTerrain(terrain: TerrainResult): SerializedTerrain {
  if (terrain.type === 'grid') {
    return serializeGridTerrain(terrain);
  } else {
    return serializeVoronoiTerrain(terrain);
  }
}

function postProgress(percent: number, stage: string) {
  self.postMessage({ type: 'PROGRESS', percent, stage });
}

self.onmessage = (e: MessageEvent) => {
  const { type, config } = e.data;

  if (type === 'GENERATE') {
    try {
      const worldConfig = config as WorldConfig;
      const algorithm = worldConfig.generationAlgorithm ?? 'grid';

      postProgress(0, `Generating terrain (${algorithm})...`);
      const generator = createWorldGenerator(worldConfig);

      postProgress(20, 'Building terrain data...');
      const terrain = generator.generateTerrain();

      // TransportNetwork only works with grid for now
      if (terrain.type === 'grid') {
        postProgress(60, 'Building transport network...');
        new TransportNetwork(worldConfig, terrain);
      } else {
        postProgress(60, 'Transport network not available for Voronoi...');
      }

      postProgress(80, 'Finding harbor locations...');
      generator.findBestHarbor(terrain);

      postProgress(95, 'Serializing terrain data...');
      const serialized = serializeTerrain(terrain);

      // Transfer buffers for grid (zero-copy), or just post for Voronoi
      if (serialized.type === 'grid') {
        self.postMessage(
          { type: 'TERRAIN_GENERATED', terrain: serialized },
          {
            transfer: [
              serialized.heightBuffer.buffer,
              serialized.flowBuffer.buffer,
              serialized.moistureBuffer.buffer,
            ],
          }
        );
      } else {
        self.postMessage({ type: 'TERRAIN_GENERATED', terrain: serialized });
      }
    } catch (error) {
      self.postMessage({
        type: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

// Signal ready
self.postMessage({ type: 'INITIALIZED' });
