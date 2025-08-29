import { expect, test } from 'vitest';
import { generateTerrain, buildHydro, buildLandMesh } from '../src/physical/generate';
import { defaultConfig } from '../src/config';
import { createRNG } from '../src/core/rng';

const rng = () => createRNG(defaultConfig.seed);

test('generateTerrain produces grid with coastline', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  expect(terrain.W).toBe(defaultConfig.map.size_km[0]);
  const expectedCoastX = defaultConfig.map.size_km[0] * 1000 - defaultConfig.map.ocean_margin_m;
  expect(terrain.coastline.lines[0]).toBeCloseTo(expectedCoastX);
});

test('buildHydro creates river reaching the coast', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mouthIndex = hydro.river.mouthNodeIds[0];
  const mouthX = hydro.river.nodes.x[mouthIndex];
  expect(mouthX).toBeCloseTo(terrain.coastline.lines[0]);
});

test('buildLandMesh returns single coastal cell', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());
  expect(mesh.cellCount.length).toBe(1);
  expect(Array.from(mesh.heIsCoast)).toContain(1);
});
