import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test } from 'vitest';
import { generateTerrain, buildHydro, buildLandMesh } from '../src/physical/generate';
import { defaultConfig } from '../src/config';
import { createRNG } from '../src/core/rng';
import { PolylineSet } from '../src/types';

const rng = () => createRNG(defaultConfig.seed);

const EPS = 1e-6;

const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

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
  const o1 = orientation(ax, ay, bx, by, cx, cy);
  const o2 = orientation(ax, ay, bx, by, dx, dy);
  const o3 = orientation(cx, cy, dx, dy, ax, ay);
  const o4 = orientation(cx, cy, dx, dy, bx, by);
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(o1) < EPS && Math.abs(o2) < EPS && Math.abs(denom) < EPS) {
    const inRange = (p: number, q: number, r: number) =>
      Math.min(p, q) - EPS <= r && r <= Math.max(p, q) + EPS;
    return (
      (inRange(ax, bx, cx) && inRange(ay, by, cy)) ||
      (inRange(ax, bx, dx) && inRange(ay, by, dy))
    );
  }
  const straddle1 = o1 * o2 <= 0;
  const straddle2 = o3 * o4 <= 0;
  return straddle1 && straddle2;
}

function segmentIntersectsPolylineSet(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  set: PolylineSet
): boolean {
  for (let l = 0; l < set.offsets.length - 1; l++) {
    const start = set.offsets[l];
    const end = set.offsets[l + 1];
    for (let i = start; i < end - 1; i++) {
      const sx = set.lines[i * 2];
      const sy = set.lines[i * 2 + 1];
      const ex = set.lines[(i + 1) * 2];
      const ey = set.lines[(i + 1) * 2 + 1];
      if (segmentsIntersect(ax, ay, bx, by, sx, sy, ex, ey)) return true;
    }
  }
  return false;
}

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

test('buildLandMesh produces coastal Voronoi mesh', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const mesh = buildLandMesh(terrain, hydro, defaultConfig, rng());
  // Debug guard to ease failure triage if sampling changes
  expect(mesh.sitesX.length).toBeGreaterThan(0);
  expect(mesh.cellCount.length).toBe(mesh.sitesX.length);
  expect(mesh.cellCount.length).toBeGreaterThan(1);
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

test('land mesh half-edges are consistent', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const land = buildLandMesh(terrain, hydro, defaultConfig, rng());
  const heCount = land.heCell.length;
  expect(heCount).toBeGreaterThan(0);
  for (let i = 0; i < heCount; i++) {
    const twin = land.heTwin[i];
    expect(land.heTwin[twin]).toBe(i);
    expect(land.heNext[i]).toBeLessThan(heCount);
  }
  for (let c = 0; c < land.cellCount.length; c++) {
    const start = land.cellStart[c];
    const count = land.cellCount[c];
    let steps = 0;
    let he = start;
    do {
      expect(land.heCell[he]).toBe(c);
      he = land.heNext[he];
      steps++;
    } while (he !== start && steps < heCount + 2);
    expect(steps).toBe(count);
  }
});

test('heCrossesRiver flags match geometry intersections', () => {
  const terrain = generateTerrain(defaultConfig, rng());
  const hydro = buildHydro(terrain, defaultConfig);
  const land = buildLandMesh(terrain, hydro, defaultConfig, rng());
  for (let i = 0; i < land.heCell.length; i++) {
    const va = land.heVertA[i];
    const vb = land.heVertB[i];
    const ax = land.vertsX[va];
    const ay = land.vertsY[va];
    const bx = land.vertsX[vb];
    const by = land.vertsY[vb];
    const intersects = segmentIntersectsPolylineSet(ax, ay, bx, by, hydro.river.lines);
    expect(land.heCrossesRiver[i]).toBe(intersects ? 1 : 0);
  }
});

test('debug export writes terrain and hydro grids', () => {
  const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), 'colonies-debug-'));
  const cfg = {
    ...defaultConfig,
    debug: { export_grids: true, output_dir: debugDir },
  };
  try {
    const terrain = generateTerrain(cfg, rng());
    buildHydro(terrain, cfg);
    const elevPath = path.join(debugDir, 'terrain_elevation.json');
    const moisturePath = path.join(debugDir, 'terrain_moisture.json');
    const flowPath = path.join(debugDir, 'hydro_flow.json');
    expect(fs.existsSync(elevPath)).toBe(true);
    expect(fs.existsSync(moisturePath)).toBe(true);
    expect(fs.existsSync(flowPath)).toBe(true);
    const elevData = JSON.parse(fs.readFileSync(elevPath, 'utf8'));
    const moistureData = JSON.parse(fs.readFileSync(moisturePath, 'utf8'));
    const flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    expect(elevData.W).toBe(terrain.W);
    expect(elevData.H).toBe(terrain.H);
    expect(elevData.data.length).toBe(terrain.W * terrain.H);
    expect(moistureData.data.length).toBe(terrain.W * terrain.H);
    expect(flowData.data.length).toBe(terrain.W * terrain.H);
  } finally {
    fs.rmSync(debugDir, { recursive: true, force: true });
  }
});
