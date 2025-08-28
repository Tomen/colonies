import { WorldGenerator } from './worldgen.js';
import { ConfigLoader } from './config.js';
import { PngExporter } from './png_exporter.js';

export function generateWorld(): void {
  // Load configuration
  const config = ConfigLoader.getDefaultConfig();
  
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
  PngExporter.exportHeightMap(terrain, 'height_map.png');
  
  console.log('Exporting flow accumulation...');
  PngExporter.exportFlowAccumulation(terrain, 'flow_accumulation.png');
  
  console.log('Exporting moisture map...');
  PngExporter.exportMoisture(terrain, 'moisture_map.png');
  
  console.log('World generation complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateWorld();
}