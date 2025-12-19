import { Delaunay } from 'd3-delaunay';
import { Config, RNG, TerrainGrid, HydroNetwork, LandMesh, PolylineSet } from '../types';
import { createNoise2D } from './noise';

const EPS = 1e-6;

type Point = [number, number];

function clampIndex(v: number, max: number): number {
  return Math.min(max - 1, Math.max(0, v));
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const t = c1 / c2;
  const projX = ax + vx * t;
  const projY = ay + vy * t;
  return Math.hypot(px - projX, py - projY);
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

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
      inRange(ax, bx, cx) && inRange(ay, by, cy) ||
      inRange(ax, bx, dx) && inRange(ay, by, dy)
    );
  }

  const straddle1 = o1 * o2 <= 0;
  const straddle2 = o3 * o4 <= 0;
  return straddle1 && straddle2;
}

function forEachSegment(set: PolylineSet, fn: (a: Point, b: Point) => void) {
  if (!set.offsets.length) return;
  for (let i = 0; i < set.offsets.length - 1; i++) {
    const start = set.offsets[i];
    const end = set.offsets[i + 1];
    for (let j = start; j < end - 1; j++) {
      const ax = set.lines[j * 2];
      const ay = set.lines[j * 2 + 1];
      const bx = set.lines[(j + 1) * 2];
      const by = set.lines[(j + 1) * 2 + 1];
      fn([ax, ay], [bx, by]);
    }
  }
}

function segmentIntersectsPolylineSet(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  set: PolylineSet
): boolean {
  let hit = false;
  forEachSegment(set, ([sx, sy], [ex, ey]) => {
    if (!hit && segmentsIntersect(ax, ay, bx, by, sx, sy, ex, ey)) {
      hit = true;
    }
  });
  return hit;
}

function distanceToPolylineSet(px: number, py: number, set: PolylineSet): number {
  let best = Infinity;
  forEachSegment(set, ([sx, sy], [ex, ey]) => {
    const d = pointSegmentDistance(px, py, sx, sy, ex, ey);
    if (d < best) best = d;
  });
  return best;
}

function polygonAreaAndCentroid(points: Point[]): { area: number; cx: number; cy: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < EPS) {
    const meanX = points.reduce((s, p) => s + p[0], 0) / points.length;
    const meanY = points.reduce((s, p) => s + p[1], 0) / points.length;
    return { area: 0, cx: meanX, cy: meanY };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { area: Math.abs(area), cx, cy };
}

function sampleTerrainAt(terrain: TerrainGrid, x: number, y: number) {
  const cx = clampIndex(Math.floor(x / terrain.cellSizeM), terrain.W);
  const cy = clampIndex(Math.floor(y / terrain.cellSizeM), terrain.H);
  const idx = cy * terrain.W + cx;
  return {
    elev: terrain.elevationM[idx],
    slope: terrain.slopeRad[idx],
    fertility: terrain.fertility[idx],
    soil: terrain.soilClass[idx],
    moisture: terrain.moistureIx[idx],
  };
}

function siteWeight(
  x: number,
  y: number,
  coastX: number,
  riverSet: PolylineSet,
  coastline: PolylineSet
): number {
  const distCoast = Math.max(0, distanceToPolylineSet(x, y, coastline));
  const distRiver = distanceToPolylineSet(x, y, riverSet);
  const coastW = Math.exp(-distCoast / 2000);
  const riverW = Math.exp(-distRiver / 1200);
  return Math.min(1, 0.35 + 0.35 * coastW + 0.3 * riverW);
}

function poissonSampleSites(
  terrain: TerrainGrid,
  hydro: HydroNetwork,
  cfg: Config,
  rng: RNG
): { sitesX: number[]; sitesY: number[] } {
  const widthM = terrain.W * terrain.cellSizeM;
  const heightM = terrain.H * terrain.cellSizeM;
  const coastX = terrain.coastline.lines[0];
  const targetCount = Math.max(
    60,
    Math.floor(terrain.W * terrain.H * (0.9 + 0.6 * cfg.worldgen.river_density))
  );
  const baseSpacing = 900;
  const sitesX: number[] = [];
  const sitesY: number[] = [];

  const maxAttempts = targetCount * 80;
  let attempts = 0;
  while (sitesX.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const x = rng.next() * coastX;
    const y = rng.next() * heightM;
    const w = siteWeight(x, y, coastX, hydro.river.lines, terrain.coastline);
    if (rng.next() > w) continue;
    const spacing = baseSpacing * (1 - 0.4 * w);
    let tooClose = false;
    for (let i = 0; i < sitesX.length; i++) {
      if (Math.hypot(sitesX[i] - x, sitesY[i] - y) < spacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    sitesX.push(x);
    sitesY.push(y);
  }

  if (sitesX.length < 3) {
    const anchors: Point[] = [
      [coastX * 0.25, heightM * 0.25],
      [coastX * 0.25, heightM * 0.75],
      [coastX * 0.75, heightM * 0.5],
    ];
    for (const [ax, ay] of anchors) {
      sitesX.push(ax);
      sitesY.push(ay);
    }
  }

  return { sitesX, sitesY };
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
 * Build a Voronoi land mesh from Poisson‑sampled sites biased toward rivers and
 * the coast. Half‑edges are annotated with coastline and river intersections.
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

  const { sitesX, sitesY } = poissonSampleSites(terrain, hydro, cfg, rng);
  const delaunay = Delaunay.from(sitesX.map((x, i) => [x, sitesY[i]] as Point));
  const voronoi = delaunay.voronoi([0, 0, coastX, heightM]);

  const verts: Point[] = [];
  const vertIndex = new Map<string, number>();
  const heCell: number[] = [];
  const heNext: number[] = [];
  const heTwin: number[] = [];
  const heMidX: number[] = [];
  const heMidY: number[] = [];
  const heLen: number[] = [];
  const heIsCoast: number[] = [];
  const heCrossesRiver: number[] = [];
  const cellStart: number[] = [];
  const cellCount: number[] = [];
  const cellElev: number[] = [];
  const cellSlope: number[] = [];
  const cellFert: number[] = [];
  const cellSoil: number[] = [];
  const cellMoist: number[] = [];
  const cellArea: number[] = [];
  const cellCentroidX: number[] = [];
  const cellCentroidY: number[] = [];
  const cellDistRiver: number[] = [];
  const cellDistCoast: number[] = [];

  const startVerts: number[] = [];
  const endVerts: number[] = [];
  const twinLookup = new Map<string, number>();

  for (let cellId = 0; cellId < sitesX.length; cellId++) {
    const polygon = voronoi.cellPolygon(cellId) as Point[];
    if (!polygon || polygon.length < 2) continue;
    if (polygon.length > 1) {
      const [fx, fy] = polygon[0];
      const [lx, ly] = polygon[polygon.length - 1];
      if (Math.abs(fx - lx) < EPS && Math.abs(fy - ly) < EPS) {
        polygon.pop();
      }
    }
    const startHe = heCell.length;
    cellStart.push(startHe);

    const { area, cx, cy } = polygonAreaAndCentroid(polygon);
    cellArea.push(area);
    cellCentroidX.push(cx);
    cellCentroidY.push(cy);
    const tSample = sampleTerrainAt(terrain, cx, cy);
    cellElev.push(tSample.elev);
    cellSlope.push(tSample.slope);
    cellFert.push(tSample.fertility);
    cellSoil.push(tSample.soil);
    cellMoist.push(tSample.moisture);
    cellDistRiver.push(distanceToPolylineSet(cx, cy, hydro.river.lines));
    cellDistCoast.push(Math.abs(coastX - cx));

    for (let i = 0; i < polygon.length; i++) {
      const [ax, ay] = polygon[i] as Point;
      const [bx, by] = polygon[(i + 1) % polygon.length] as Point;
      const keyA = `${ax.toFixed(4)},${ay.toFixed(4)}`;
      const keyB = `${bx.toFixed(4)},${by.toFixed(4)}`;
      const getVert = (key: string, x: number, y: number) => {
        const found = vertIndex.get(key);
        if (found !== undefined) return found;
        const id = verts.length;
        verts.push([x, y]);
        vertIndex.set(key, id);
        return id;
      };
      const va = getVert(keyA, ax, ay);
      const vb = getVert(keyB, bx, by);
      const heId = heCell.length;
      heCell.push(cellId);
      startVerts.push(va);
      endVerts.push(vb);
      heLen.push(Math.hypot(bx - ax, by - ay));
      heMidX.push((ax + bx) * 0.5);
      heMidY.push((ay + by) * 0.5);
      const coastFlag = Math.abs(ax - coastX) < EPS && Math.abs(bx - coastX) < EPS ? 1 : 0;
      heIsCoast.push(coastFlag);
      heCrossesRiver.push(segmentIntersectsPolylineSet(ax, ay, bx, by, hydro.river.lines) ? 1 : 0);
      heNext.push(0); // placeholder
      heTwin.push(heId); // default to self until matched

      const twinKey = `${vb}->${va}`;
      const existing = twinLookup.get(twinKey);
      if (existing !== undefined) {
        heTwin[heId] = existing;
        heTwin[existing] = heId;
      } else {
        twinLookup.set(`${va}->${vb}`, heId);
      }
    }

    const count = heCell.length - startHe;
    cellCount.push(count);
    for (let i = 0; i < count; i++) {
      const heId = startHe + i;
      heNext[heId] = startHe + ((i + 1) % count);
    }
  }

  const vertsX = new Float32Array(verts.length);
  const vertsY = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i++) {
    vertsX[i] = verts[i][0];
    vertsY[i] = verts[i][1];
  }

  return {
    sitesX: Float32Array.from(sitesX),
    sitesY: Float32Array.from(sitesY),
    cellStart: Uint32Array.from(cellStart),
    cellCount: Uint32Array.from(cellCount),
    vertsX,
    vertsY,
    heTwin: Uint32Array.from(heTwin),
    heNext: Uint32Array.from(heNext),
    heCell: Uint32Array.from(heCell),
    heMidX: Float32Array.from(heMidX),
    heMidY: Float32Array.from(heMidY),
    heLen: Float32Array.from(heLen),
    heVertA: Uint32Array.from(startVerts),
    heVertB: Uint32Array.from(endVerts),
    heIsCoast: Uint8Array.from(heIsCoast),
    heCrossesRiver: Uint8Array.from(heCrossesRiver),
    elevMean: Float32Array.from(cellElev),
    slopeMean: Float32Array.from(cellSlope),
    fertility: Uint16Array.from(cellFert),
    soilClass: Uint8Array.from(cellSoil),
    moistureIx: Uint8Array.from(cellMoist),
    distToRiverM: Float32Array.from(cellDistRiver),
    distToCoastM: Float32Array.from(cellDistCoast),
    areaM2: Float32Array.from(cellArea),
    centroidX: Float32Array.from(cellCentroidX),
    centroidY: Float32Array.from(cellCentroidY),
  };
}
