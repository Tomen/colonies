import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { WorldConfig } from '@colonies/shared';
import { DEFAULT_CONFIG, validateConfig } from '@colonies/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Look for config.yaml in repo root (3 levels up from dist/)
const DEFAULT_CONFIG_PATH = join(__dirname, '..', '..', '..', 'config.yaml');

export class ConfigLoader {
  public static loadFromFile(filePath: string): WorldConfig {
    try {
      const data = readFileSync(filePath, 'utf8');
      const config = load(data) as Partial<WorldConfig>;
      return validateConfig(config);
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${error}`);
    }
  }

  public static getDefaultConfig(): WorldConfig {
    // Try to load from config.yaml if it exists
    if (existsSync(DEFAULT_CONFIG_PATH)) {
      return this.loadFromFile(DEFAULT_CONFIG_PATH);
    }

    // Fall back to hardcoded defaults
    return { ...DEFAULT_CONFIG };
  }
}
