import { RNG } from '../types';

// Mulberry32 RNG for deterministic sequences
export function createRNG(seed: number): RNG {
  let s = seed >>> 0;
  return {
    next(): number {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
