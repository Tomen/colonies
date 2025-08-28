import { WorldGenerator } from './dist/worldgen.js';
import { ConfigLoader } from './dist/config.js';

console.log('Starting debug generation...');

const config = ConfigLoader.getDefaultConfig();
config.mapSize = 100; // Reasonable size for testing

console.log('Config:', config);

const generator = new WorldGenerator(config);
console.log('Generator created');

console.log('Starting terrain generation...');
const start = Date.now();

try {
  const terrain = generator.generateTerrain();
  const elapsed = Date.now() - start;
  console.log(`Generation completed in ${elapsed}ms`);
  console.log('Terrain dimensions:', terrain.height.length, 'x', terrain.height[0].length);
  
  console.log('Sample heights:', terrain.height[0].slice(0, 5));
  console.log('Sample flow:', terrain.flowAccumulation[0].slice(0, 5));
  
} catch (error) {
  console.error('Error during generation:', error);
}