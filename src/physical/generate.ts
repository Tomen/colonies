import { Config, RNG, TerrainGrid, HydroNetwork, LandMesh, PolylineSet } from '../types';

const dx = [1, 1, 0, -1, -1, -1, 0, 1];
const dy = [0, -1, -1, -1, 0, 1, 1, 1];

function computeFlowDir(elev: Float32Array, W: number, H: number, cell: number): Int8Array {
  const count = W * H;
  const out = new Int8Array(count);
  const diag = Math.sqrt(2) * cell;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      let best = -1;
      let bestSlope = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + dx[d];
        const ny = y + dy[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nIdx = ny * W + nx;
        const dz = elev[idx] - elev[nIdx];
        if (dz <= 0) continue;
        const dist = d % 2 === 0 ? cell : diag;
        const slope = dz / dist;
        if (slope > bestSlope) {
          bestSlope = slope;
          best = d;
        }
      }
      out[idx] = best === -1 ? -1 : best;
    }
  }
  return out;
}

function computeFlowAccum(flowDir: Int8Array, elev: Float32Array, W: number, H: number): Float32Array {
  const count = W * H;
  const acc = new Float32Array(count);
  acc.fill(1);
  const indices = Array.from({ length: count }, (_, i) => i);
  indices.sort((a, b) => elev[b] - elev[a]);
  const offsets = dx.map((_, i) => dx[i] + dy[i] * W);
  for (const idx of indices) {
    const dir = flowDir[idx];
    if (dir === -1) continue;
    const nIdx = idx + offsets[dir];
    acc[nIdx] += acc[idx];
  }
  return acc;
}

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
  const flowDir = new Int8Array(count);
  const flowAccum = new Float32Array(count);

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

  // Compute flow direction and accumulation over the grid
  const dir = computeFlowDir(elevationM, W, H, cellSizeM);
  const acc = computeFlowAccum(dir, elevationM, W, H);
  flowDir.set(dir);
  flowAccum.set(acc);

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
    flowDir,
    flowAccum,
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
  const { W, H, cellSizeM, elevationM, flowDir, flowAccum } = terrain;
  const coastX = terrain.coastline.lines[0];
  const count = W * H;
  let maxAcc = 0;
  for (let i = 0; i < count; i++) maxAcc = Math.max(maxAcc, flowAccum[i]);
  const thresh = (1 - cfg.worldgen.river_density) * maxAcc;
  const isRiver = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (flowAccum[i] >= thresh) isRiver[i] = 1;

  const nodeId = new Int32Array(count).fill(-1);
  const nodesX: number[] = [];
  const nodesY: number[] = [];
  const nodesFlow: number[] = [];
  for (let idx = 0; idx < count; idx++) {
    if (!isRiver[idx]) continue;
    const x = idx % W;
    const y = Math.floor(idx / W);
    nodesX.push(x * cellSizeM + cellSizeM / 2);
    nodesY.push(y * cellSizeM + cellSizeM / 2);
    nodesFlow.push(flowAccum[idx]);
    nodeId[idx] = nodesX.length - 1;
  }

  const mouthNodeIds: number[] = [];
  const mouthByRow = new Map<number, number>();
  const edgeSrc: number[] = [];
  const edgeDst: number[] = [];
  const lineStart: number[] = [];
  const lineEnd: number[] = [];
  const lengthM: number[] = [];
  const widthM: number[] = [];
  const slope: number[] = [];
  const order: number[] = [];
  const fordability: number[] = [];
  const linePts: number[] = [];
  const lineOffsets: number[] = [];
  const offsets = dx.map((_, i) => dx[i] + dy[i] * W);

  for (let idx = 0; idx < count; idx++) {
    if (!isRiver[idx]) continue;
    const src = nodeId[idx];
    const path: number[] = [nodesX[src], nodesY[src]];
    let curIdx = idx;
    let dst = -1;
    let endIdx = -1;
    let guard = 0;
    while (dst === -1 && guard < count) {
      guard++;
      const dir = flowDir[curIdx];
      if (dir === -1) {
        const row = Math.floor(curIdx / W);
        const y = row * cellSizeM + cellSizeM / 2;
        let mouthId = mouthByRow.get(row);
        if (mouthId === undefined) {
          mouthId = nodesX.length;
          nodesX.push(coastX);
          nodesY.push(y);
          nodesFlow.push(flowAccum[idx]);
          mouthNodeIds.push(mouthId);
          mouthByRow.set(row, mouthId);
        } else {
          nodesFlow[mouthId] += flowAccum[idx];
        }
        path.push(coastX, y);
        dst = mouthId;
        break;
      }
      const nIdx = curIdx + offsets[dir];
      if (nIdx < 0 || nIdx >= count) {
        const row = Math.floor(curIdx / W);
        const y = row * cellSizeM + cellSizeM / 2;
        let mouthId = mouthByRow.get(row);
        if (mouthId === undefined) {
          mouthId = nodesX.length;
          nodesX.push(coastX);
          nodesY.push(y);
          nodesFlow.push(flowAccum[idx]);
          mouthNodeIds.push(mouthId);
          mouthByRow.set(row, mouthId);
        } else {
          nodesFlow[mouthId] += flowAccum[idx];
        }
        path.push(coastX, y);
        dst = mouthId;
        break;
      }
      const nx = nIdx % W;
      const ny = Math.floor(nIdx / W);
      const cx = nx * cellSizeM + cellSizeM / 2;
      const cy = ny * cellSizeM + cellSizeM / 2;
      if (isRiver[nIdx]) {
        path.push(cx, cy);
        dst = nodeId[nIdx];
        endIdx = nIdx;
        break;
      }
      path.push(cx, cy);
      curIdx = nIdx;
    }
    if (dst === -1) {
      const row = Math.floor(curIdx / W);
      const y = row * cellSizeM + cellSizeM / 2;
      let mouthId = mouthByRow.get(row);
      if (mouthId === undefined) {
        mouthId = nodesX.length;
        nodesX.push(coastX);
        nodesY.push(y);
        nodesFlow.push(flowAccum[idx]);
        mouthNodeIds.push(mouthId);
        mouthByRow.set(row, mouthId);
      } else {
        nodesFlow[mouthId] += flowAccum[idx];
      }
      path.push(coastX, y);
      dst = mouthId;
    }

    const sx = nodesX[src];
    const sy = nodesY[src];
    const ex = nodesX[dst];
    const ey = nodesY[dst];
    const start = linePts.length / 2;
    lineOffsets.push(start);
    for (let i = 0; i < path.length; i += 2) linePts.push(path[i], path[i + 1]);
    lineStart.push(start);
    lineEnd.push(linePts.length / 2 - 1);
    let len = 0;
    for (let i = 2; i < path.length; i += 2) {
      const dxm = path[i] - path[i - 2];
      const dym = path[i + 1] - path[i - 1];
      len += Math.hypot(dxm, dym);
    }
    lengthM.push(len);
    widthM.push(Math.max(1, Math.sqrt(nodesFlow[src])));
    const elevDst = endIdx >= 0 && endIdx < count ? elevationM[endIdx] : cfg.map.sea_level_m;
    slope.push(len === 0 ? 0 : (elevationM[idx] - elevDst) / len);
    order.push(1);
    fordability.push(1);
    edgeSrc.push(src);
    edgeDst.push(dst);
  }
  lineOffsets.push(linePts.length / 2);

  // Compute Strahler order
  const nodeOrder = new Uint8Array(nodesX.length);
  const incoming: number[][] = Array.from({ length: nodesX.length }, () => []);
  for (let i = 0; i < edgeSrc.length; i++) incoming[edgeDst[i]].push(i);
  const nIdxs = Array.from({ length: nodesX.length }, (_, i) => i);
  nIdxs.sort((a, b) => nodesFlow[a] - nodesFlow[b]);
  for (const n of nIdxs) {
    const inc = incoming[n];
    if (inc.length === 0) {
      nodeOrder[n] = 1;
    } else {
      let max = 0;
      let countMax = 0;
      for (const e of inc) {
        const o = nodeOrder[edgeSrc[e]];
        if (o > max) {
          max = o;
          countMax = 1;
        } else if (o === max) {
          countMax++;
        }
      }
      nodeOrder[n] = countMax > 1 ? (max + 1) : max;
    }
  }
  for (let i = 0; i < edgeSrc.length; i++) order[i] = nodeOrder[edgeSrc[i]];

  const river = {
    nodes: {
      x: Float32Array.from(nodesX),
      y: Float32Array.from(nodesY),
      flow: Float32Array.from(nodesFlow),
    },
    edges: {
      src: Uint32Array.from(edgeSrc),
      dst: Uint32Array.from(edgeDst),
      lineStart: Uint32Array.from(lineStart),
      lineEnd: Uint32Array.from(lineEnd),
      lengthM: Float32Array.from(lengthM),
      widthM: Float32Array.from(widthM),
      slope: Float32Array.from(slope),
      order: Uint8Array.from(order),
      fordability: Float32Array.from(fordability),
    },
    lines: { lines: Float32Array.from(linePts), offsets: Uint32Array.from(lineOffsets) },
    mouthNodeIds: Uint32Array.from(mouthNodeIds),
  };

  const fallIds: number[] = [];
  const fallXY: number[] = [];
  for (let i = 0; i < nodesX.length; i++) {
    const x = nodesX[i];
    if (x >= coastX / 2 - cellSizeM / 2 && x < coastX / 2 + cellSizeM / 2) {
      fallIds.push(i);
      fallXY.push(nodesX[i], nodesY[i]);
    }
  }
  const fallLine = { nodeIds: Uint32Array.from(fallIds), xy: Float32Array.from(fallXY) };

  return { river, coast: terrain.coastline, fallLine };
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
