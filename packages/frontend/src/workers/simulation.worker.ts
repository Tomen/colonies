import { WorldGenerator, TransportNetwork } from '@colonies/core';
import type { WorldConfig, TerrainData } from '@colonies/shared';

interface SerializedTerrainData {
  width: number;
  height: number;
  heightBuffer: Float32Array;
  flowBuffer: Float32Array;
  moistureBuffer: Float32Array;
}

function serializeTerrain(terrain: TerrainData): SerializedTerrainData {
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

  return { width: size, height: size, heightBuffer, flowBuffer, moistureBuffer };
}

function postProgress(percent: number, stage: string) {
  self.postMessage({ type: 'PROGRESS', percent, stage });
}

self.onmessage = (e: MessageEvent) => {
  const { type, config } = e.data;

  if (type === 'GENERATE') {
    try {
      const worldConfig = config as WorldConfig;

      postProgress(0, 'Generating height map...');
      const generator = new WorldGenerator(worldConfig);

      postProgress(20, 'Calculating flow accumulation...');
      const terrain = generator.generateTerrain();

      postProgress(60, 'Building transport network...');
      const _network = new TransportNetwork(worldConfig, terrain);

      postProgress(80, 'Finding harbor locations...');
      const _harbor = generator.findBestHarbor(terrain);

      postProgress(95, 'Serializing terrain data...');
      const serialized = serializeTerrain(terrain);

      // Transfer the buffers for zero-copy
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
