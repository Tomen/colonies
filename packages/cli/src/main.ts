#!/usr/bin/env node

import { mkdirSync } from 'fs';
import { WorldGenerator, TransportNetwork } from '@colonies/core';
import { ConfigLoader } from './config.js';
import { PngExporter } from './png_exporter.js';

export function generateWorld(): void {
  // Load configuration
  const config = ConfigLoader.getDefaultConfig();

  // Ensure output directory exists
  mkdirSync('output', { recursive: true });

  // Full size as intended in design spec
  config.mapSize = 1000; // 10km x 10km at 10m resolution

  console.log('Generating world with config:', config);

  // Generate terrain
  const generator = new WorldGenerator(config);
  console.log('Generating terrain...');
  const terrain = generator.generateTerrain();

  console.log('Finding best harbor...');
  const harbor = generator.findBestHarbor(terrain);
  console.log(`Best harbor location: (${harbor.x}, ${harbor.y})`);

  // Export to PNG files
  console.log('Exporting height map...');
  PngExporter.exportHeightMap(terrain, 'output/01_height_map.png');

  console.log('Exporting flow accumulation...');
  PngExporter.exportFlowAccumulation(terrain, 'output/02_flow_accumulation.png');

  console.log('Exporting moisture map...');
  PngExporter.exportMoisture(terrain, 'output/03_moisture_map.png');

  // Build transport network
  console.log('Building transport network...');
  const network = new TransportNetwork(config, terrain);
  const costField = network.getCostField();

  console.log('Exporting cost field...');
  PngExporter.exportCostField(costField, 'output/04_cost_field.png');

  console.log('Exporting usage heatmap...');
  const heatmap = network.getUsageHeatmap();
  PngExporter.exportUsageHeatmap(heatmap, 'output/05_usage_heatmap.png');

  console.log('World generation complete!');
}

// Run if called directly
generateWorld();
