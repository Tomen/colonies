import { Config, RNG, TerrainGrid, HydroNetwork, LandMesh, PolylineSet } from '../types';

/**
 * Deterministic toy terrain generator used for early testing. The map is
 * represented on a coarse 1km grid. Elevation declines toward the coast so that
 * rivers naturally flow east. Additional attributes are populated with simple
 * pseudo‑random values using the provided RNG to guarantee determinism.
 */
export function generateTerrain(cfg: Config, rng: RNG): TerrainGrid {
  const [sizeXKm, sizeYKm] = cfg.map.size_km;
  const cellSizeM = 1000; // 1km resolution for placeholder implementation
  const W = sizeXKm;
  const H = sizeYKm;
  const count = W * H;

  const elevationM = new Float32Array(count);
  const slopeRad = new Float32Array(count);
  const fertility = new Uint8Array(count);
  const soilClass = new Uint8Array(count);
  const moistureIx = new Uint8Array(count);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const nx = x / W;
      // Simple ridge that declines toward the coast (east)
      elevationM[idx] = (1 - nx) * 100 * cfg.worldgen.relief_strength;
      slopeRad[idx] = 0;
      fertility[idx] = Math.floor(rng.next() * 255);
      soilClass[idx] = 0;
      moistureIx[idx] = Math.floor(rng.next() * 255);
    }
  }

  // Coastline is a vertical line offset from the eastern edge by ocean_margin_m
  const coastX = sizeXKm * 1000 - cfg.map.ocean_margin_m;
  const coastLine: PolylineSet = {
    lines: new Float32Array([coastX, 0, coastX, sizeYKm * 1000]),
    offsets: new Uint32Array([0, 2]),
  };
  const nearshoreDepthM = new Float32Array([10, 10]);

  return {
    W,
    H,
    cellSizeM,
    elevationM,
    slopeRad,
    fertility,
    soilClass,
    moistureIx,
    coastline: coastLine,
    nearshoreDepthM,
  };
}

/**
 * Construct a minimal hydrology network: a single river running from west to
 * east terminating at the coastline. This is sufficient to exercise downstream
 * systems while keeping the implementation deterministic and lightweight.
 */
export function buildHydro(terrain: TerrainGrid, cfg: Config): HydroNetwork {
  const widthM = terrain.W * terrain.cellSizeM;
  const heightM = terrain.H * terrain.cellSizeM;
  const coastX = terrain.coastline.lines[0];
  const midY = heightM / 2;

  // Nodes along the river
  const nodes = {
    x: new Float32Array([0, coastX / 2, coastX]),
    y: new Float32Array([midY, midY, midY]),
    flow: new Float32Array([1, 1, 1]),
  };

  // Single polyline representing the river course
  const riverLine: PolylineSet = {
    lines: new Float32Array([0, midY, coastX / 2, midY, coastX, midY]),
    offsets: new Uint32Array([0, 3]),
  };

  const edges = {
    src: new Uint32Array([0, 1]),
    dst: new Uint32Array([1, 2]),
    lineStart: new Uint32Array([0, 1]),
    lineEnd: new Uint32Array([1, 2]),
    lengthM: new Float32Array([coastX / 2, coastX / 2]),
    widthM: new Float32Array([10, 10]),
    slope: new Float32Array([0, 0]),
    order: new Uint8Array([1, 1]),
    fordability: new Float32Array([1, 1]),
  };

  const river = { nodes, edges, lines: riverLine, mouthNodeIds: new Uint32Array([2]) };

  const fallLine = {
    nodeIds: new Uint32Array([1]),
    xy: new Float32Array([coastX / 2, midY]),
  };

  return {
    river,
    coast: terrain.coastline,
    fallLine,
  };
}

/**
 * Produce a trivial land mesh consisting of a single polygonal cell covering the
 * land area up to the coastline. The mesh supplies half‑edge data so later
 * modules can be exercised without requiring a full Voronoi implementation.
 */
export function buildLandMesh(
  terrain: TerrainGrid,
  hydro: HydroNetwork,
  cfg: Config,
  rng: RNG
): LandMesh {
  const widthM = terrain.W * terrain.cellSizeM;
  const heightM = terrain.H * terrain.cellSizeM;
  const coastX = terrain.coastline.lines[0];

  const vertsX = new Float32Array([0, 0, coastX, coastX]);
  const vertsY = new Float32Array([0, heightM, heightM, 0]);

  const heMidX = new Float32Array(4);
  const heMidY = new Float32Array(4);
  const heLen = new Float32Array(4);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const sx = vertsX[i];
    const sy = vertsY[i];
    const ex = vertsX[j];
    const ey = vertsY[j];
    heMidX[i] = (sx + ex) / 2;
    heMidY[i] = (sy + ey) / 2;
    heLen[i] = Math.hypot(ex - sx, ey - sy);
  }

  return {
    sitesX: new Float32Array([widthM / 2]),
    sitesY: new Float32Array([heightM / 2]),
    cellStart: new Uint32Array([0]),
    cellCount: new Uint32Array([4]),
    vertsX,
    vertsY,
    heTwin: new Uint32Array([0, 0, 0, 0]),
    heNext: new Uint32Array([1, 2, 3, 0]),
    heCell: new Uint32Array([0, 0, 0, 0]),
    heMidX,
    heMidY,
    heLen,
    heIsCoast: new Uint8Array([0, 0, 1, 0]),
    heCrossesRiver: new Uint8Array(4),
    elevMean: new Float32Array([0]),
    slopeMean: new Float32Array([0]),
    fertility: new Uint16Array([0]),
    soilClass: new Uint8Array([0]),
    moistureIx: new Uint8Array([0]),
    distToRiverM: new Float32Array([0]),
    distToCoastM: new Float32Array([coastX - widthM / 2]),
    areaM2: new Float32Array([coastX * heightM]),
    centroidX: new Float32Array([widthM / 2]),
    centroidY: new Float32Array([heightM / 2]),
  };
}

