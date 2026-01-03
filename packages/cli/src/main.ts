#!/usr/bin/env node

import { createWorldGenerator } from '@colonies/core';
import { ConfigLoader } from './config.js';

export function generateWorld(): void {
  // Load configuration
  // Default: 10km x 10km map (mapSize=10000), 1 unit = 1 meter
  const config = ConfigLoader.getDefaultConfig();

  console.log('Generating world with config:', config);

  // Generate terrain
  console.log('Generating terrain...');
  const generator = createWorldGenerator(config);
  const terrain = generator.generateTerrain();

  console.log(`Generated Voronoi terrain with ${terrain.cells.length} cells`);
  console.log(`  - Land cells: ${terrain.cells.filter((c) => c.isLand).length}`);
  console.log(`  - Water cells: ${terrain.cells.filter((c) => !c.isLand).length}`);
  console.log(`  - Coast cells: ${terrain.cells.filter((c) => c.isCoast).length}`);
  console.log(`  - River edges: ${terrain.rivers.length}`);

  console.log('Finding best harbor...');
  const harbor = generator.findBestHarbor(terrain);
  console.log(`Best harbor location: (${harbor.x.toFixed(1)}, ${harbor.y.toFixed(1)})`);

  console.log('World generation complete!');
}

// Run if called directly
generateWorld();
