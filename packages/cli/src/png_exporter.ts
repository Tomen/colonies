import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import type { TerrainData, CostField } from '@colonies/shared';

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

  public static exportCostField(costField: CostField, filename: string): void {
    const size = costField.cost.length;
    const png = new PNG({ width: size, height: size });

    // Find max cost for normalization (excluding water which has very high cost)
    let maxLandCost = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!costField.isWater[y][x]) {
          maxLandCost = Math.max(maxLandCost, costField.cost[y][x]);
        }
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (size * y + x) << 2;

        if (costField.isWater[y][x]) {
          // Water - dark blue
          png.data[idx] = 20;
          png.data[idx + 1] = 40;
          png.data[idx + 2] = 100;
        } else if (costField.isRiver[y][x]) {
          // River - cyan
          png.data[idx] = 0;
          png.data[idx + 1] = 200;
          png.data[idx + 2] = 255;
        } else {
          // Land - green (low cost) to red (high cost)
          const normalizedCost = Math.min(1, costField.cost[y][x] / maxLandCost);
          png.data[idx] = Math.floor(normalizedCost * 255); // Red increases with cost
          png.data[idx + 1] = Math.floor((1 - normalizedCost) * 200); // Green decreases
          png.data[idx + 2] = 50;
        }
        png.data[idx + 3] = 255;
      }
    }

    const buffer = PNG.sync.write(png);
    writeFileSync(filename, buffer);
  }

  public static exportUsageHeatmap(
    heatmap: number[][],
    filename: string
  ): void {
    const size = heatmap.length;
    const png = new PNG({ width: size, height: size });

    // Find max usage for normalization
    let maxUsage = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        maxUsage = Math.max(maxUsage, heatmap[y][x]);
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (size * y + x) << 2;

        if (maxUsage === 0 || heatmap[y][x] === 0) {
          // No usage - dark gray background
          png.data[idx] = 30;
          png.data[idx + 1] = 30;
          png.data[idx + 2] = 30;
        } else {
          // Usage - heat gradient from yellow (low) to red (high)
          const logUsage = Math.log10(heatmap[y][x] + 1);
          const maxLogUsage = Math.log10(maxUsage + 1);
          const normalizedUsage = logUsage / maxLogUsage;

          png.data[idx] = 255; // Red always max
          png.data[idx + 1] = Math.floor((1 - normalizedUsage) * 255); // Yellow to red
          png.data[idx + 2] = 0;
        }
        png.data[idx + 3] = 255;
      }
    }

    const buffer = PNG.sync.write(png);
    writeFileSync(filename, buffer);
  }
}
