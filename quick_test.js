import { WorldGenerator } from './dist/worldgen.js';
import { ConfigLoader } from './dist/config.js';
import { PngExporter } from './dist/png_exporter.js';

console.log('Quick test...');

const config = ConfigLoader.getDefaultConfig();
config.mapSize = 100;

const generator = new WorldGenerator(config);
console.log('Generating terrain...');
const terrain = generator.generateTerrain();
console.log('Terrain generated');

// Check if we have water
let waterCount = 0;
let landCount = 0;
for (let y = 0; y < 100; y++) {
  for (let x = 0; x < 100; x++) {
    if (terrain.height[y][x] <= 0) waterCount++;
    else landCount++;
  }
}
console.log(`Water cells: ${waterCount}, Land cells: ${landCount}`);

if (waterCount > 0) {
  console.log('Finding harbor...');
  const harbor = generator.findBestHarbor(terrain);
  console.log(`Harbor at: (${harbor.x}, ${harbor.y})`);
  
  console.log('Exporting PNG...');
  PngExporter.exportHeightMap(terrain, 'test_height.png');
  console.log('Done!');
} else {
  console.log('No water found - skipping harbor search');
}