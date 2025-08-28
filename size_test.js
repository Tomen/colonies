import { WorldGenerator } from './dist/worldgen.js';
import { ConfigLoader } from './dist/config.js';

const sizes = [50, 100, 200, 300, 500, 1000];

for (const size of sizes) {
  console.log(`\nTesting size ${size}x${size} (${size*10}m x ${size*10}m)...`);
  
  const config = ConfigLoader.getDefaultConfig();
  config.mapSize = size;
  
  const start = Date.now();
  
  try {
    const generator = new WorldGenerator(config);
    const terrain = generator.generateTerrain();
    const harbor = generator.findBestHarbor(terrain);
    
    const elapsed = Date.now() - start;
    
    // Count water/land
    let waterCount = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (terrain.height[y][x] <= 0) waterCount++;
      }
    }
    
    console.log(`✅ Success: ${elapsed}ms, Harbor: (${harbor.x}, ${harbor.y}), Water: ${waterCount} cells`);
    
    // Test memory usage
    const memUsage = process.memoryUsage();
    console.log(`   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap`);
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    break;
  }
  
  // Break if taking too long
  const elapsed = Date.now() - start;
  if (elapsed > 10000) {
    console.log('⚠️  Taking too long, stopping tests');
    break;
  }
}