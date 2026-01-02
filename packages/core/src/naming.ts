/**
 * Settlement name generation.
 *
 * Creates terrain-based names using configurable word lists.
 */

import type { VoronoiTerrainData, VoronoiCell } from '@colonies/shared';
import { SeededRNG } from './rng.js';

// ============================================================================
// Naming Configuration
// ============================================================================

/**
 * Configuration for name generation.
 */
export interface NamingConfig {
  prefixes: {
    river: string[];
    coast: string[];
    hill: string[];
    forest: string[];
    plain: string[];
  };
  suffixes: {
    town: string[];
    geographic: string[];
  };
}

/**
 * Default naming configuration.
 */
export const DEFAULT_NAMING_CONFIG: NamingConfig = {
  prefixes: {
    river: ['River', 'Mill', 'Ford', 'Brook', 'Creek', 'Spring'],
    coast: ['Bay', 'Harbor', 'Port', 'Cove', 'Sea', 'Shore'],
    hill: ['Hill', 'Ridge', 'High', 'Summit', 'Mount', 'Cliff'],
    forest: ['Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Birch', 'Wood'],
    plain: ['Green', 'Fair', 'Broad', 'Long', 'Clear', 'New'],
  },
  suffixes: {
    town: ['town', 'ville', 'burg', 'ford', 'port', 'wick', 'ham', 'ton'],
    geographic: ['side', 'view', 'dale', 'field', 'creek', 'brook', 'wood', 'land'],
  },
};

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Terrain features for a cell.
 */
interface CellFeatures {
  hasRiver: boolean;
  isCoastal: boolean;
  isHighElevation: boolean;
  hasForest: boolean;
}

/**
 * Detect terrain features for a cell.
 */
function detectCellFeatures(
  cell: VoronoiCell,
  terrain: VoronoiTerrainData
): CellFeatures {
  // Calculate elevation thresholds
  const maxElevation = Math.max(...terrain.cells.map((c) => c.elevation));
  const highElevationThreshold = maxElevation * 0.6;

  // River detection: high flow accumulation
  const hasRiver = cell.flowAccumulation > 50;

  // Coastal detection
  const isCoastal = cell.isCoast;

  // High elevation detection
  const isHighElevation = cell.elevation > highElevationThreshold;

  // Forest detection: high moisture, moderate elevation, not coastal
  const hasForest =
    cell.moisture > 0.5 &&
    cell.elevation > 10 &&
    cell.elevation < highElevationThreshold &&
    !cell.isCoast;

  return {
    hasRiver,
    isCoastal,
    isHighElevation,
    hasForest,
  };
}

// ============================================================================
// Name Generation
// ============================================================================

/**
 * Pick a random item from an array.
 */
function pickRandom<T>(arr: T[], rng: SeededRNG): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

/**
 * Generate a settlement name based on terrain features.
 *
 * @param cell - The terrain cell for the settlement
 * @param terrain - Full terrain data
 * @param existingNames - Set of names already used
 * @param rng - Seeded RNG for determinism
 * @param config - Naming configuration
 * @returns A unique settlement name
 */
export function generateSettlementName(
  cell: VoronoiCell,
  terrain: VoronoiTerrainData,
  existingNames: Set<string>,
  rng: SeededRNG,
  config: NamingConfig = DEFAULT_NAMING_CONFIG
): string {
  const features = detectCellFeatures(cell, terrain);

  // Determine prefix based on features (priority order)
  let prefixList: string[];
  if (features.isCoastal) {
    prefixList = config.prefixes.coast;
  } else if (features.hasRiver) {
    prefixList = config.prefixes.river;
  } else if (features.isHighElevation) {
    prefixList = config.prefixes.hill;
  } else if (features.hasForest) {
    prefixList = config.prefixes.forest;
  } else {
    prefixList = config.prefixes.plain;
  }

  // Determine suffix list based on features
  let suffixList: string[];
  if (features.isCoastal || features.hasRiver) {
    // Coastal and river settlements get geographic suffixes more often
    suffixList = rng.next() < 0.6 ? config.suffixes.geographic : config.suffixes.town;
  } else {
    // Other settlements get town suffixes more often
    suffixList = rng.next() < 0.6 ? config.suffixes.town : config.suffixes.geographic;
  }

  // Try to generate a unique name
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prefix = pickRandom(prefixList, rng);
    const suffix = pickRandom(suffixList, rng);

    // Combine prefix and suffix
    let name: string;
    if (suffix.startsWith('town') || suffix.startsWith('ville') || suffix.startsWith('burg')) {
      // These suffixes work better appended directly
      name = prefix + suffix;
    } else if (prefix.endsWith('e') && suffix.startsWith('e')) {
      // Avoid double 'e' (e.g., "Shoreeside")
      name = prefix + suffix.substring(1);
    } else {
      name = prefix + suffix;
    }

    // Check uniqueness
    if (!existingNames.has(name)) {
      return name;
    }
  }

  // Fallback: append a number
  let counter = 1;
  const basePrefix = pickRandom(prefixList, rng);
  const baseSuffix = pickRandom(suffixList, rng);
  let baseName = basePrefix + baseSuffix;

  while (existingNames.has(baseName)) {
    baseName = `${basePrefix}${baseSuffix} ${counter++}`;
  }

  return baseName;
}

/**
 * Generate names for multiple settlements.
 *
 * @param cells - Terrain cells for each settlement
 * @param terrain - Full terrain data
 * @param rng - Seeded RNG
 * @param config - Naming configuration
 * @returns Array of unique settlement names
 */
export function generateSettlementNames(
  cells: VoronoiCell[],
  terrain: VoronoiTerrainData,
  rng: SeededRNG,
  config: NamingConfig = DEFAULT_NAMING_CONFIG
): string[] {
  const existingNames = new Set<string>();
  const names: string[] = [];

  for (const cell of cells) {
    const name = generateSettlementName(cell, terrain, existingNames, rng, config);
    existingNames.add(name);
    names.push(name);
  }

  return names;
}
