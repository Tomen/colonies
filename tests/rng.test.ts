import { expect, test } from 'vitest';
import { createRNG } from '../src/core/rng';

test('createRNG generates deterministic sequences', () => {
  const a = createRNG(123);
  const b = createRNG(123);
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  expect(seqA).toEqual(seqB);
});
