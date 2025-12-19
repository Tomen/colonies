import { createNoise2D as simplexCreateNoise2D } from 'simplex-noise';
import { RNG } from '../types';

/**
 * Wrap the simplex-noise generator to use the game's RNG for determinism.
 */
export function createNoise2D(rng: RNG) {
  return simplexCreateNoise2D(() => rng.next());
}
