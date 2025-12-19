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

test('generateTerrain deterministic for seed', () => {
  const terrain1 = generateTerrain(defaultConfig, rng());
  const terrain2 = generateTerrain(defaultConfig, rng());
  const idx = 5 * defaultConfig.map.size_km[0] + 5;
  expect(terrain1.elevationM[idx]).toBeCloseTo(54.182529, 5);
  expect(terrain1.slopeRad[idx]).toBeCloseTo(0.00577, 5);
  expect(terrain1.fertility[idx]).toBe(254);
  expect(terrain1.elevationM[idx]).toBeCloseTo(terrain2.elevationM[idx]);
  expect(terrain1.fertility[idx]).toBe(terrain2.fertility[idx]);
});

test('buildHydro creates river reaching the coast', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const coastX = terrain.coastline.lines[0];
  const mouths = Array.from(hydro.river.mouthNodeIds);
  expect(mouths.length).toBeGreaterThan(0);
  for (const mouth of mouths) {
    expect(hydro.river.nodes.x[mouth]).toBeCloseTo(coastX, 3);
  }
});

test('buildLandMesh returns single coastal cell', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());
  expect(mesh.cellCount.length).toBe(1);
  expect(Array.from(mesh.heIsCoast)).toContain(1);
});

test('river flow conserves mass to the coast', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const cellArea = terrain.cellSizeM * terrain.cellSizeM;
  const expected = cellArea * terrain.W * terrain.H;
  const mouthFlow = Array.from(hydro.river.mouthNodeIds).reduce(
    (sum, idx) => sum + hydro.river.nodes.flow[idx],
    0
  );
  const relativeError = Math.abs(mouthFlow - expected) / expected;
  expect(relativeError).toBeLessThan(1e-3);
});

test('river edges terminate at coast nodes', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const { edges, nodes, mouthNodeIds } = hydro.river;
  const mouthSet = new Set(Array.from(mouthNodeIds));
  const coastX = terrain.coastline.lines[0];
  expect(mouthSet.size).toBeGreaterThan(0);
  for (let i = 0; i < edges.dst.length; i++) {
    if (mouthSet.has(edges.dst[i])) {
      expect(nodes.x[edges.dst[i]]).toBeCloseTo(coastX, 3);
    }
  }
});
