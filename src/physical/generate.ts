import { Config, RNG, TerrainGrid, HydroNetwork, LandMesh, PolylineSet } from '../types';
import { Delaunay } from 'd3-delaunay';

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

function sampleSites(
  widthM: number,
  heightM: number,
  coastX: number,
  riverY: number,
  rng: RNG
): [number, number][] {
  const pts: [number, number][] = [];
  const target = 20;
  const minDist = 1000; // 1km minimum spacing
  let attempts = 0;
  while (pts.length < target && attempts < target * 50) {
    attempts++;
    const x = rng.next() * coastX;
    const y = rng.next() * heightM;
    const distCoast = coastX - x;
    const distRiver = Math.abs(y - riverY);
    const weight = 1 / (1 + distCoast / 1000 + distRiver / 1000);
    if (rng.next() > weight) continue;
    let close = false;
    for (const [px, py] of pts) {
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy < minDist * minDist) {
        close = true;
        break;
      }
    }
    if (!close) pts.push([x, y]);
  }
  return pts;
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
  const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (den === 0) return false;
  const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / den;
  const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / den;
  return ua > 0 && ua < 1 && ub > 0 && ub < 1;
}

/**
 * Build a Voronoi land mesh from Poisson‑sampled sites. Half‑edges are
 * annotated for coastline and river crossings.
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
  const riverY = hydro.river.lines[1];

  const pts = sampleSites(widthM, heightM, coastX, riverY, rng);
  const delaunay = Delaunay.from(pts);
  const vor = delaunay.voronoi([0, 0, coastX, heightM]);

  const vertsX: number[] = [];
  const vertsY: number[] = [];
  const heVert: number[] = [];
  const heTwin: number[] = [];
  const heNext: number[] = [];
  const heCell: number[] = [];
  const heMidX: number[] = [];
  const heMidY: number[] = [];
  const heLen: number[] = [];
  const heIsCoast: number[] = [];
  const heCrossesRiver: number[] = [];
  const cellStart: number[] = [];
  const cellCount: number[] = [];
  const vertexMap = new Map<string, number>();
  const edgeMap = new Map<string, number>();

  const riverSegs: [number, number, number, number][] = [];
  const rl = hydro.river.lines;
  for (let i = 0; i < rl.length - 2; i += 2) {
    riverSegs.push([rl[i], rl[i + 1], rl[i + 2], rl[i + 3]]);
  }

  let cellId = 0;
  for (const poly of vor.cellPolygons()) {
    cellStart[cellId] = heVert.length;
    const coords = Array.from(poly);
    let edges: number[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      let v1 = vertexMap.get(`${x1},${y1}`);
      if (v1 === undefined) {
        v1 = vertsX.length;
        vertexMap.set(`${x1},${y1}`, v1);
        vertsX.push(x1);
        vertsY.push(y1);
      }
      let v2 = vertexMap.get(`${x2},${y2}`);
      if (v2 === undefined) {
        v2 = vertsX.length;
        vertexMap.set(`${x2},${y2}`, v2);
        vertsX.push(x2);
        vertsY.push(y2);
      }
      const he = heVert.length;
      heVert.push(v1);
      heCell.push(cellId);
      heMidX.push((x1 + x2) / 2);
      heMidY.push((y1 + y2) / 2);
      heLen.push(Math.hypot(x2 - x1, y2 - y1));
      heIsCoast.push(Math.abs((x1 + x2) / 2 - coastX) < 1e-6 ? 1 : 0);
      const crosses = riverSegs.some(([rx1, ry1, rx2, ry2]) =>
        segmentsIntersect(x1, y1, x2, y2, rx1, ry1, rx2, ry2)
      );
      heCrossesRiver.push(crosses ? 1 : 0);
      const key = `${v1},${v2}`;
      const rkey = `${v2},${v1}`;
      if (edgeMap.has(rkey)) {
        const t = edgeMap.get(rkey)!;
        heTwin[he] = t;
        heTwin[t] = he;
        edgeMap.delete(rkey);
      } else {
        edgeMap.set(key, he);
        heTwin[he] = he;
      }
      edges.push(he);
    }
    for (let j = 0; j < edges.length; j++) {
      heNext[edges[j]] = edges[(j + 1) % edges.length];
    }
    cellCount[cellId] = edges.length;
    cellId++;
  }

  const siteCount = pts.length;
  const sitesX = new Float32Array(siteCount);
  const sitesY = new Float32Array(siteCount);
  const distToCoastM = new Float32Array(siteCount);
  const distToRiverM = new Float32Array(siteCount);
  const areaM2 = new Float32Array(siteCount);
  const centroidX = new Float32Array(siteCount);
  const centroidY = new Float32Array(siteCount);
  for (let i = 0; i < siteCount; i++) {
    const [sx, sy] = pts[i];
    sitesX[i] = sx;
    sitesY[i] = sy;
    distToCoastM[i] = coastX - sx;
    distToRiverM[i] = Math.abs(sy - riverY);
    const poly = vor.cellPolygon(i)!;
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let j = 0; j < poly.length - 1; j++) {
      const [x1, y1] = poly[j];
      const [x2, y2] = poly[j + 1];
      const cross = x1 * y2 - x2 * y1;
      area += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    area *= 0.5;
    cx /= 6 * area;
    cy /= 6 * area;
    areaM2[i] = Math.abs(area);
    centroidX[i] = cx;
    centroidY[i] = cy;
  }

  return {
    sitesX,
    sitesY,
    cellStart: new Uint32Array(cellStart),
    cellCount: new Uint32Array(cellCount),
    vertsX: new Float32Array(vertsX),
    vertsY: new Float32Array(vertsY),
    heVert: new Uint32Array(heVert),
    heTwin: new Uint32Array(heTwin),
    heNext: new Uint32Array(heNext),
    heCell: new Uint32Array(heCell),
    heMidX: new Float32Array(heMidX),
    heMidY: new Float32Array(heMidY),
    heLen: new Float32Array(heLen),
    heIsCoast: new Uint8Array(heIsCoast),
    heCrossesRiver: new Uint8Array(heCrossesRiver),
    elevMean: new Float32Array(siteCount),
    slopeMean: new Float32Array(siteCount),
    fertility: new Uint16Array(siteCount),
    soilClass: new Uint8Array(siteCount),
    moistureIx: new Uint8Array(siteCount),
    distToRiverM,
    distToCoastM,
    areaM2,
    centroidX,
    centroidY,
  };
}

