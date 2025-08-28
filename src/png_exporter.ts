import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { TerrainData } from './types.js';

export class PngExporter {
  public static exportHeightMap(
    terrain: TerrainData,
    filename: string
  ): void {
    const size = terrain.height.length;
    const png = new PNG({ width: size, height: size });

    // Find min/max for potential normalization
    let _minHeight = Number.MAX_VALUE;
    let _maxHeight = Number.MIN_VALUE;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        _minHeight = Math.min(_minHeight, terrain.height[y][x]);
        _maxHeight = Math.max(_maxHeight, terrain.height[y][x]);
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (size * y + x) << 2;
        
        // Height normalization available if needed for advanced coloring
        
        // Color scheme: blue for water, green-brown for land
        if (terrain.height[y][x] <= 0) {
          // Water - blue gradient
          png.data[idx] = 0;
          png.data[idx + 1] = 100;
          png.data[idx + 2] = Math.max(150, 255 + terrain.height[y][x] * 10);
        } else {
          // Land - green to brown gradient
          const elevation = terrain.height[y][x];
          if (elevation < 50) {
            // Low land - green
            png.data[idx] = Math.floor(50 + elevation);
            png.data[idx + 1] = Math.floor(150 + elevation);
            png.data[idx + 2] = 50;
          } else {
            // High land - brown
            png.data[idx] = Math.floor(100 + elevation * 0.5);
            png.data[idx + 1] = Math.floor(80 + elevation * 0.3);
            png.data[idx + 2] = 50;
          }
        }
        
        png.data[idx + 3] = 255; // Alpha
      }
    }

    const buffer = PNG.sync.write(png);
    writeFileSync(filename, buffer);
  }

  public static exportFlowAccumulation(
    terrain: TerrainData,
    filename: string
  ): void {
    const size = terrain.flowAccumulation.length;
    const png = new PNG({ width: size, height: size });

    // Find max for normalization (use log scale for better visualization)
    let maxFlow = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        maxFlow = Math.max(maxFlow, terrain.flowAccumulation[y][x]);
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (size * y + x) << 2;
        
        // Log scale for better river visualization
        const logFlow = Math.log10(terrain.flowAccumulation[y][x] + 1);
        const maxLogFlow = Math.log10(maxFlow + 1);
        const normalizedFlow = Math.floor((logFlow / maxLogFlow) * 255);
        
        // Color scheme: dark to bright blue for flow
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = normalizedFlow;
        png.data[idx + 3] = 255;
      }
    }

    const buffer = PNG.sync.write(png);
    writeFileSync(filename, buffer);
  }

  public static exportMoisture(terrain: TerrainData, filename: string): void {
    const size = terrain.moisture.length;
    const png = new PNG({ width: size, height: size });

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (size * y + x) << 2;
        
        // Moisture from 0-1, visualize as brown (dry) to green (wet)
        const moisture = Math.max(0, Math.min(1, terrain.moisture[y][x]));
        const moistureValue = Math.floor(moisture * 255);
        
        // Color scheme: brown to green
        png.data[idx] = Math.floor(139 * (1 - moisture)); // Brown component
        png.data[idx + 1] = moistureValue; // Green component
        png.data[idx + 2] = Math.floor(69 * (1 - moisture)); // Brown component
        png.data[idx + 3] = 255;
      }
    }

    const buffer = PNG.sync.write(png);
    writeFileSync(filename, buffer);
  }
}