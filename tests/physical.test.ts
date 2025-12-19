import { expect, test } from 'vitest';
import { generateTerrain, buildHydro, buildLandMesh } from '../src/physical/generate';
import { defaultConfig } from '../src/config';
import { createRNG } from '../src/core/rng';

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (den === 0) return false;
  const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / den;
  const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / den;
  return ua > 0 && ua < 1 && ub > 0 && ub < 1;
}

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

test('buildLandMesh generates coastal mesh', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());
  expect(mesh.cellCount.length).toBeGreaterThan(1);
  expect(Array.from(mesh.heIsCoast)).toContain(1);
});

test('land mesh half-edges are consistent', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());

  for (let i = 0; i < mesh.heNext.length; i++) {
    const twin = mesh.heTwin[i];
    expect(mesh.heTwin[twin]).toBe(i);
  }

  for (let c = 0; c < mesh.cellCount.length; c++) {
    let count = 0;
    let he = mesh.cellStart[c];
    do {
      he = mesh.heNext[he];
      count++;
    } while (he !== mesh.cellStart[c] && count < mesh.heNext.length + 1);
    expect(count).toBe(mesh.cellCount[c]);
  }
});

test('heCrossesRiver matches geometric intersection', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());

  const riverSegments: [number, number, number, number][] = [];
  const rl = hydro.river.lines;
  for (let i = 0; i < rl.length - 3; i += 2) {
    riverSegments.push([rl[i], rl[i + 1], rl[i + 2], rl[i + 3]]);
  }

  for (let i = 0; i < mesh.heNext.length; i++) {
    const v1 = mesh.heVert[i];
    const v2 = mesh.heVert[mesh.heNext[i]];
    const x1 = mesh.vertsX[v1];
    const y1 = mesh.vertsY[v1];
    const x2 = mesh.vertsX[v2];
    const y2 = mesh.vertsY[v2];
    const crosses = riverSegments.some(([rx1, ry1, rx2, ry2]) =>
      segmentsIntersect(x1, y1, x2, y2, rx1, ry1, rx2, ry2)
    );
    expect(mesh.heCrossesRiver[i]).toBe(crosses ? 1 : 0);
  }
});
