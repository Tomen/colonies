import { readFileSync } from 'fs';
import { WorldConfig } from './types.js';

export class ConfigLoader {
  public static loadFromFile(filePath: string): WorldConfig {
    try {
      const data = readFileSync(filePath, 'utf8');
      const config = JSON.parse(data) as WorldConfig;
      return this.validateConfig(config);
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${error}`);
    }
  }

  public static getDefaultConfig(): WorldConfig {
    return {
      seed: 12345,
      mapSize: 1000, // 10km x 10km with 10m resolution
      ridgeOrientation: 45, // degrees
      riverDensity: 0.5,
      coastalPlainWidth: 0.3, // fraction of map width
      ridgeHeight: 200, // meters
      noiseScale: 0.01, // terrain noise scale
      harborMinDepth: 10, // minimum water depth for harbors
    };
  }

  private static validateConfig(config: WorldConfig): WorldConfig {
    if (config.seed === undefined || config.mapSize === undefined) {
      throw new Error('Config missing required fields: seed, mapSize');
    }
    
    // Set defaults for optional fields
    return {
      ...this.getDefaultConfig(),
      ...config,
    };
  }
}