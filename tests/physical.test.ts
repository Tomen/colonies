import { expect, test } from 'vitest';
import { generateTerrain, buildHydro, buildLandMesh } from '../src/physical/generate';
import { defaultConfig } from '../src/config';
import { createRNG } from '../src/core/rng';
import { TerrainGrid } from '../src/types';

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

test('buildHydro assigns Strahler order to upstream and mouth edges', () => {
  const cfg = { ...defaultConfig, map: { ...defaultConfig.map, size_km: [2, 2] } };
  const cellSizeM = 1000;
  const W = 2;
  const H = 2;
  const count = W * H;
  const coastX = 1600;
  const terrain: TerrainGrid = {
    W,
    H,
    cellSizeM,
    elevationM: new Float32Array([2, 1, 2, 0]),
    slopeRad: new Float32Array(count),
    fertility: new Uint8Array(count),
    soilClass: new Uint8Array(count),
    moistureIx: new Uint8Array(count),
    flowDir: new Int8Array([0, -1, 1, -1]),
    flowAccum: new Float32Array([1, 3, 1, 0]),
    coastline: { lines: new Float32Array([coastX, 0, coastX, 2000]), offsets: new Uint32Array([0, 2]) },
    nearshoreDepthM: new Float32Array([5, 5]),
  };
  const hydro = buildHydro(terrain, cfg);
  const nodes = Array.from({ length: hydro.river.nodes.x.length }, (_, i) => ({
    x: hydro.river.nodes.x[i],
    y: hydro.river.nodes.y[i],
  }));
  const findNode = (x: number, y: number) =>
    nodes.findIndex((n) => Math.abs(n.x - x) < 1e-3 && Math.abs(n.y - y) < 1e-3);
  const upstreamA = findNode(cellSizeM / 2, cellSizeM / 2);
  const upstreamB = findNode(cellSizeM / 2, 1.5 * cellSizeM);
  const junction = findNode(1.5 * cellSizeM, cellSizeM / 2);
  const mouth = findNode(coastX, cellSizeM / 2);

  expect(upstreamA).toBeGreaterThanOrEqual(0);
  expect(upstreamB).toBeGreaterThanOrEqual(0);
  expect(junction).toBeGreaterThanOrEqual(0);
  expect(mouth).toBeGreaterThanOrEqual(0);

  const edgeOrder = (src: number, dst: number) => {
    const idx = hydro.river.edges.src.findIndex(
      (s, i) => s === src && hydro.river.edges.dst[i] === dst
    );
    return idx >= 0 ? hydro.river.edges.order[idx] : -1;
  };

  expect(edgeOrder(upstreamA, junction)).toBe(1);
  expect(edgeOrder(upstreamB, junction)).toBe(1);
  expect(edgeOrder(junction, mouth)).toBe(2);
});
