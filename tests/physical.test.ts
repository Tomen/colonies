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

test('buildHydro creates rivers reaching the coast', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const coastX = terrain.coastline.lines[0];
  const lines = hydro.river.lines.lines;
  for (const id of hydro.river.mouthNodeIds) {
    const x = hydro.river.nodes.x[id];
    expect(x).toBeCloseTo(coastX);
    for (let e = 0; e < hydro.river.edges.dst.length; e++) {
      if (hydro.river.edges.dst[e] === id) {
        const end = hydro.river.edges.lineEnd[e];
        expect(lines[2 * end]).toBeCloseTo(coastX);
      }
    }
  }
});

test('river flow is conserved to the coast', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  let total = 0;
  for (const id of hydro.river.mouthNodeIds) total += hydro.river.nodes.flow[id];
  expect(total).toBeCloseTo(terrain.W * terrain.H);
});

test('buildLandMesh returns single coastal cell', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());
  expect(mesh.cellCount.length).toBe(1);
  expect(Array.from(mesh.heIsCoast)).toContain(1);
});
