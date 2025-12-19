import { Config, RNG, TerrainGrid, HydroNetwork, LandMesh, PolylineSet } from '../types';
import { createNoise2D } from './noise';

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

  const noise2D = createNoise2D(rng);
  const angleRad = (cfg.worldgen.ridge_orientation_deg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const freq = 0.1; // cycles per km

  // First pass: generate elevation with oriented noise ridges
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const nx = x / W;
      const rx = x * cosA - y * sinA;
      const ry = x * sinA + y * cosA;
      const n = noise2D(rx * freq, ry * freq);
      const base = (1 - nx) * 100;
      elevationM[idx] = (base + n * 50) * cfg.worldgen.relief_strength;
    }
  }

  // Second pass: derive slope and fertility from elevation
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const left = elevationM[y * W + Math.max(0, x - 1)];
      const right = elevationM[y * W + Math.min(W - 1, x + 1)];
      const down = elevationM[Math.max(0, y - 1) * W + x];
      const up = elevationM[Math.min(H - 1, y + 1) * W + x];
      const dzdx = (right - left) / (2 * cellSizeM);
      const dzdy = (up - down) / (2 * cellSizeM);
      const grad = Math.hypot(dzdx, dzdy);
      const slope = Math.atan(grad);
      slopeRad[idx] = slope;
      fertility[idx] = Math.max(
        0,
        Math.min(255, Math.round((1 - slope / (Math.PI / 2)) * 255))
      );
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
 * Hydrology model: compute D∞ flow directions over the TerrainGrid, accumulate
 * discharge, extract channel cells based on configured river density and trace
 * polylines to the coastline. The resulting RiverGraph includes Strahler order,
 * width estimates, mouth nodes on the coast and fall‑line markers on steep
 * downstream segments.
 */
export function buildHydro(terrain: TerrainGrid, cfg: Config): HydroNetwork {
  const { W, H, cellSizeM, elevationM, coastline } = terrain;
  const seaLevel = cfg.map.sea_level_m;
  const coastX = coastline.lines[0];
  const count = W * H;
  const cellArea = cellSizeM * cellSizeM;

  const routingElev = new Float32Array(count);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const eastTilt = (x / Math.max(1, W - 1)) * 0.01;
      routingElev[idx] = elevationM[idx] - eastTilt;
    }
  }

  const neighborDx = [1, 1, 0, -1, -1, -1, 0, 1];
  const neighborDy = [0, -1, -1, -1, 0, 1, 1, 1];
  const neighborDist = neighborDx.map((dx, i) =>
    Math.hypot(dx, neighborDy[i]) * cellSizeM
  );

  const out1 = new Int32Array(count);
  const out2 = new Int32Array(count);
  const weight2 = new Float32Array(count);
  out1.fill(-1);
  out2.fill(-1);

  const getRouting = (x: number, y: number) => routingElev[y * W + x];
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const left = getRouting(Math.max(0, x - 1), y);
      const right = getRouting(Math.min(W - 1, x + 1), y);
      const down = getRouting(x, Math.max(0, y - 1));
      const up = getRouting(x, Math.min(H - 1, y + 1));
      const dzdx = (right - left) / (2 * cellSizeM);
      const dzdy = (up - down) / (2 * cellSizeM);
      const dirX = -dzdx;
      const dirY = -dzdy;
      const mag = Math.hypot(dirX, dirY);

      const chooseSteepest = () => {
        let best = -1;
        let bestSlope = 0;
        for (let d = 0; d < 8; d++) {
          const nx = x + neighborDx[d];
          const ny = y + neighborDy[d];
          if (!inside(nx, ny)) {
            if (neighborDx[d] === 1) {
              const dist = Math.max(cellSizeM * 0.5, coastX - (x + 0.5) * cellSizeM);
              const slope = (routingElev[idx] - seaLevel) / dist;
              if (slope > bestSlope) {
                bestSlope = slope;
                best = -1;
              }
            }
            continue;
          }
          const drop = routingElev[idx] - getRouting(nx, ny);
          const slope = drop / neighborDist[d];
          if (slope > bestSlope) {
            bestSlope = slope;
            best = ny * W + nx;
          }
        }
        return best;
      };

      if (mag < 1e-5) {
        out1[idx] = chooseSteepest();
        continue;
      }

      const angle = (Math.atan2(dirY, dirX) + 2 * Math.PI) % (2 * Math.PI);
      const scaled = angle / (Math.PI / 4);
      const i0 = Math.floor(scaled) % 8;
      const i1 = (i0 + 1) % 8;
      const t = scaled - Math.floor(scaled);

      const computeSlope = (dirIndex: number) => {
        const nx = x + neighborDx[dirIndex];
        const ny = y + neighborDy[dirIndex];
        if (!inside(nx, ny)) {
          if (neighborDx[dirIndex] === 1) {
            const dist = Math.max(cellSizeM * 0.5, coastX - (x + 0.5) * cellSizeM);
            return (routingElev[idx] - seaLevel) / dist;
          }
          return -Infinity;
        }
        const drop = routingElev[idx] - getRouting(nx, ny);
        return drop / neighborDist[dirIndex];
      };

      const slope0 = computeSlope(i0);
      const slope1 = computeSlope(i1);
      if (slope0 <= 0 && slope1 <= 0) {
        out1[idx] = chooseSteepest();
        continue;
      }

      const total = Math.max(0, slope0) + Math.max(0, slope1);
      const w1 = total > 0 ? Math.max(0, slope1) / total : 0;

      const nx0 = x + neighborDx[i0];
      const ny0 = y + neighborDy[i0];
      const nx1 = x + neighborDx[i1];
      const ny1 = y + neighborDy[i1];

      out1[idx] = inside(nx0, ny0) ? ny0 * W + nx0 : -1;
      out2[idx] = inside(nx1, ny1) ? ny1 * W + nx1 : -1;
      weight2[idx] = w1;
    }
  }

  const accumulation = new Float32Array(count).fill(cellArea);
  const flowOut1 = new Float32Array(count);
  const flowOut2 = new Float32Array(count);

  const orderIdx = Array.from({ length: count }, (_, i) => i);
  orderIdx.sort((a, b) => routingElev[b] - routingElev[a]);

  const mouthMap = new Map<number, number>();
  const mouthFlow: number[] = [];
  const mouthY: number[] = [];

  for (const idx of orderIdx) {
    const flow = accumulation[idx];
    const w2 = weight2[idx];
    const d1 = out1[idx];
    const d2 = out2[idx];
    const share1 = w2 > 0 ? flow * (1 - w2) : flow * (d2 === -1 ? 1 : 1);
    const share2 = w2 > 0 ? flow * w2 : 0;

    const pushToMouth = (amount: number, srcIdx: number) => {
      const cy = Math.floor(srcIdx / W);
      const key = cy;
      let mouthId = mouthMap.get(key);
      if (mouthId === undefined) {
        mouthId = mouthFlow.length;
        mouthMap.set(key, mouthId);
        mouthFlow.push(0);
        mouthY.push((cy + 0.5) * cellSizeM);
      }
      mouthFlow[mouthId] += amount;
    };

    if (d1 >= 0) {
      accumulation[d1] += share1;
      flowOut1[idx] = share1;
    } else if (share1 > 0) {
      flowOut1[idx] = share1;
      pushToMouth(share1, idx);
    }

    if (d2 >= 0 && share2 > 0) {
      accumulation[d2] += share2;
      flowOut2[idx] = share2;
    } else if (d2 === -1 && share2 > 0) {
      flowOut2[idx] = share2;
      pushToMouth(share2, idx);
    }
  }

  const sortedAcc = [...accumulation].sort((a, b) => a - b);
  const desiredFraction = Math.min(0.25, Math.max(0.05, 0.12 * cfg.worldgen.river_density));
  const qIndex = Math.floor((1 - desiredFraction) * (count - 1));
  const accThreshold = Math.max(cellArea, sortedAcc[qIndex]);

  const isChannel = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const mouthBound = out1[i] === -1 || out2[i] === -1;
    if (accumulation[i] >= accThreshold || mouthBound) {
      isChannel[i] = 1;
    }
  }

  const cellToNode = new Int32Array(count).fill(-1);
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const nodeFlow: number[] = [];
  const nodeIsMouth: number[] = [];
  const nodeCellIdx: number[] = [];
  const mouthAggregated: number[] = [];

  for (let i = 0; i < count; i++) {
    if (!isChannel[i]) continue;
    const cx = i % W;
    const cy = Math.floor(i / W);
    cellToNode[i] = nodeX.length;
    nodeX.push((cx + 0.5) * cellSizeM);
    nodeY.push((cy + 0.5) * cellSizeM);
    nodeFlow.push(accumulation[i]);
    nodeIsMouth.push(0);
    nodeCellIdx.push(i);
    mouthAggregated.push(0);
  }

  for (const [, mouthIdx] of mouthMap.entries()) {
    nodeX.push(coastX);
    nodeY.push(mouthY[mouthIdx]);
    nodeFlow.push(mouthFlow[mouthIdx]);
    nodeIsMouth.push(1);
    nodeCellIdx.push(-1);
    mouthAggregated.push(1);
  }

  const lines: number[] = [];
  const offsets: number[] = [0];
  const edgeSrc: number[] = [];
  const edgeDst: number[] = [];
  const edgeLength: number[] = [];
  const edgeWidth: number[] = [];
  const edgeSlope: number[] = [];
  const edgeFlow: number[] = [];
  const edgeLineStart: number[] = [];
  const edgeLineEnd: number[] = [];

  const advanceBranch = (
    startIdx: number,
    startNode: number,
    firstTarget: number,
    startFlow: number
  ) => {
    if (startFlow <= 0) return;
    let current = firstTarget;
    let remaining = startFlow;
    const pts: number[] = [nodeX[startNode], nodeY[startNode]];
    let steps = 0;
    while (steps < count + 2) {
      if (current === -1) {
        const destY = pts[pts.length - 1];
        pts.push(coastX, destY);
        const dstNode = nodeX.findIndex(
          (x, idx) => nodeIsMouth[idx] === 1 && Math.abs(nodeY[idx] - destY) < 1e-3
        );
        const nodeId = dstNode === -1 ? nodeX.length : dstNode;
        if (dstNode === -1) {
          nodeX.push(coastX);
          nodeY.push(destY);
          nodeFlow.push(remaining);
          nodeIsMouth.push(1);
          nodeCellIdx.push(-1);
          mouthAggregated.push(0);
        } else {
          if (!mouthAggregated[nodeId]) {
            nodeFlow[nodeId] += remaining;
          }
        }
        finalizeEdge(startNode, nodeId, pts, remaining, seaLevel);
        return;
      }

      const nodeHit = cellToNode[current];
      const cx = current % W;
      const cy = Math.floor(current / W);
      const centerX = (cx + 0.5) * cellSizeM;
      const centerY = (cy + 0.5) * cellSizeM;
      pts.push(centerX, centerY);
      if (nodeHit >= 0 && nodeHit !== startNode) {
        finalizeEdge(startNode, nodeHit, pts, remaining, elevationM[current]);
        return;
      }

      const f1 = flowOut1[current];
      const f2 = flowOut2[current];
      if (f1 <= 0 && f2 <= 0) {
        current = -1;
        steps++;
        continue;
      }
      if (f1 >= f2) {
        remaining *= f1 > 0 ? f1 / accumulation[current] : 1;
        current = out1[current];
      } else {
        remaining *= f2 / accumulation[current];
        current = out2[current];
      }
      steps++;
    }
  };

  const finalizeEdge = (
    srcNode: number,
    dstNode: number,
    pts: number[],
    flow: number,
    dstElev: number
  ) => {
    const startOffset = lines.length / 2;
    for (let i = 0; i < pts.length; i++) lines.push(pts[i]);
    offsets.push(lines.length / 2);
    edgeLineStart.push(startOffset);
    edgeLineEnd.push(offsets[offsets.length - 1] - 1);
    edgeSrc.push(srcNode);
    edgeDst.push(dstNode);
    let len = 0;
    for (let i = 0; i < pts.length - 2; i += 2) {
      const dx = pts[i + 2] - pts[i];
      const dy = pts[i + 3] - pts[i + 1];
      len += Math.hypot(dx, dy);
    }
    edgeLength.push(len);
    const baseWidth = Math.pow(flow / cellArea, 0.4) * 6;
    edgeWidth.push(Math.max(3, baseWidth));
    const srcElev = nodeCellIdx[srcNode] >= 0 ? elevationM[nodeCellIdx[srcNode]] : seaLevel;
    const slope = len > 0 ? (srcElev - dstElev) / len : 0;
    edgeSlope.push(Math.max(0, slope));
    edgeFlow.push(flow);
  };

  for (let i = 0; i < count; i++) {
    if (!isChannel[i]) continue;
    const nodeId = cellToNode[i];
    const f1 = flowOut1[i];
    const f2 = flowOut2[i];
    if (f1 > 0) advanceBranch(i, nodeId, out1[i], f1);
    if (f2 > 0) advanceBranch(i, nodeId, out2[i], f2);
  }

  const nodeOrder = new Uint8Array(nodeX.length).fill(1);
  const outgoingByNode: number[][] = Array.from({ length: nodeX.length }, () => []);
  const incomingByNode: number[][] = Array.from({ length: nodeX.length }, () => []);
  for (let e = 0; e < edgeSrc.length; e++) {
    outgoingByNode[edgeSrc[e]].push(e);
    incomingByNode[edgeDst[e]].push(e);
  }

  const nodePriority = nodeCellIdx.map((ci, idx) => (ci >= 0 ? routingElev[ci] : -Infinity));
  const nodeOrderIdx = Array.from({ length: nodeX.length }, (_, i) => i).sort(
    (a, b) => nodePriority[b] - nodePriority[a]
  );

  const edgeOrder = new Uint8Array(edgeSrc.length);
  for (const n of nodeOrderIdx) {
    const incoming = incomingByNode[n];
    if (incoming.length > 0) {
      let maxOrd = 1;
      let maxCount = 0;
      for (const e of incoming) {
        const ord = edgeOrder[e];
        if (ord > maxOrd) {
          maxOrd = ord;
          maxCount = 1;
        } else if (ord === maxOrd) {
          maxCount++;
        }
      }
      nodeOrder[n] = maxCount > 1 ? (maxOrd + 1) as number : maxOrd;
    }
    for (const e of outgoingByNode[n]) {
      edgeOrder[e] = nodeOrder[n];
    }
  }

  const fordability = edgeWidth.map((w) => Math.max(0.05, Math.min(1, 18 / (w + 1))));

  const fallLineNodeIds: number[] = [];
  const fallLineXY: number[] = [];
  for (let n = 0; n < nodeX.length; n++) {
    const edges = outgoingByNode[n];
    let maxSlope = 0;
    for (const e of edges) {
      if (edgeSlope[e] > maxSlope) maxSlope = edgeSlope[e];
    }
    if (maxSlope > 0.02 && nodeIsMouth[n] === 0) {
      fallLineNodeIds.push(n);
      fallLineXY.push(nodeX[n], nodeY[n]);
    }
  }

  const river = {
    nodes: {
      x: Float32Array.from(nodeX),
      y: Float32Array.from(nodeY),
      flow: Float32Array.from(nodeFlow),
    },
    edges: {
      src: Uint32Array.from(edgeSrc),
      dst: Uint32Array.from(edgeDst),
      lineStart: Uint32Array.from(edgeLineStart),
      lineEnd: Uint32Array.from(edgeLineEnd),
      lengthM: Float32Array.from(edgeLength),
      widthM: Float32Array.from(edgeWidth),
      slope: Float32Array.from(edgeSlope),
      flow: Float32Array.from(edgeFlow),
      order: Uint8Array.from(edgeOrder),
      fordability: Float32Array.from(fordability),
    },
    lines: {
      lines: Float32Array.from(lines),
      offsets: Uint32Array.from(offsets),
    },
    mouthNodeIds: Uint32Array.from(
      nodeIsMouth.flatMap((m, i) => (m ? [i] : []))
    ),
  };

  return {
    river,
    coast: coastline,
    fallLine: {
      nodeIds: Uint32Array.from(fallLineNodeIds),
      xy: Float32Array.from(fallLineXY),
    },
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
