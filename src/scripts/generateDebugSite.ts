import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { defaultConfig } from '../config/default.js';
import { createRNG } from '../core/rng.js';
import { buildHydro, generateTerrain } from '../physical/generate.js';
import { Config, HydroNetwork, PolylineSet, TerrainGrid } from '../types.js';

interface SerializablePolyline {
  lines: number[];
  offsets: number[];
}

interface RunRecord {
  seed: number;
  file: string;
}

interface SerializableRun {
  seed: number;
  terrain: {
    W: number;
    H: number;
    cellSizeM: number;
    elevationM: number[];
    moistureIx: number[];
    coastline: SerializablePolyline;
  };
  hydro: {
    river: SerializablePolyline;
    coast: SerializablePolyline;
  };
}

function parseArgs(argv: string[]): { runs: number; outDir: string } {
  let runs = 5;
  let outDir = 'debug-site';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--runs' && argv[i + 1]) {
      runs = Math.max(1, Number.parseInt(argv[i + 1], 10));
      i++;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      outDir = argv[i + 1];
      i++;
    }
  }
  return { runs, outDir };
}

function randomSeeds(count: number): number[] {
  const seeds = new Set<number>();
  while (seeds.size < count) {
    seeds.add(crypto.randomInt(1, 0x7fffffff));
  }
  return Array.from(seeds);
}

function serialisePolyline(set: PolylineSet): SerializablePolyline {
  return {
    lines: Array.from(set.lines),
    offsets: Array.from(set.offsets),
  };
}

function serialiseRun(seed: number, terrain: TerrainGrid, hydro: HydroNetwork): SerializableRun {
  return {
    seed,
    terrain: {
      W: terrain.W,
      H: terrain.H,
      cellSizeM: terrain.cellSizeM,
      elevationM: Array.from(terrain.elevationM),
      moistureIx: Array.from(terrain.moistureIx),
      coastline: serialisePolyline(terrain.coastline),
    },
    hydro: {
      river: serialisePolyline(hydro.river.lines),
      coast: serialisePolyline(hydro.coast),
    },
  };
}

function writeRun(outDir: string, idx: number, seed: number): RunRecord {
  const runConfig: Config = {
    ...defaultConfig,
    seed,
    debug: { export_grids: false, output_dir: '' },
  };
  const terrain = generateTerrain(runConfig, createRNG(seed));
  const hydro = buildHydro(terrain, runConfig);
  const runData = serialiseRun(seed, terrain, hydro);
  const runDir = path.join(outDir, 'runs');
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, `run-${idx}.json`);
  fs.writeFileSync(file, JSON.stringify(runData, null, 2));
  return { seed, file: path.relative(outDir, file) };
}

function buildManifest(runs: RunRecord[]): string {
  const safeJson = JSON.stringify({ generatedAt: new Date().toISOString(), runs }).replace(
    /</g,
    '\\u003c'
  );
  return `<script id="manifest" type="application/json">${safeJson}</script>`;
}

function buildHtml(runs: RunRecord[]): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Colonies Debug Renders</title>
  <style>
    :root { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; }
    body { margin: 0 auto; max-width: 1200px; padding: 24px; }
    header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    h1 { margin: 0; font-size: 28px; }
    p { margin: 4px 0; }
    .runs { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
    .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .meta span { font-size: 12px; color: #8b949e; }
    canvas { width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d; display: block; background: #0b0e14; }
    .legend { font-size: 12px; color: #8b949e; margin-top: 6px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Colonies Debug Renders</h1>
      <p>Five freshly seeded generations rendered from the physical layer outputs.</p>
    </div>
    <p class="legend">Elevation shading with moisture tint, river polylines in blue, coastline in gray.</p>
  </header>
  <main id="runs" class="runs"></main>
  ${buildManifest(runs)}
  <script>
    const manifest = JSON.parse(document.getElementById('manifest').textContent);
    const container = document.getElementById('runs');
    const pixelSize = 40;

    async function loadRun(run) {
      const res = await fetch(run.file);
      if (!res.ok) throw new Error('Failed to load ' + run.file);
      const data = await res.json();
      return { ...run, data };
    }

    function colorForCell(elev, minElev, maxElev, moisture) {
      const t = maxElev === minElev ? 0 : (elev - minElev) / (maxElev - minElev);
      const damp = moisture / 255;
      const r = Math.round(60 + 160 * t);
      const g = Math.round(90 + 90 * t + 80 * damp);
      const b = Math.round(100 + 40 * t + 100 * damp);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function drawPolylines(ctx, set, scale) {
      const coords = set.lines;
      const offsets = set.offsets;
      for (let i = 0; i < offsets.length - 1; i++) {
        const start = offsets[i];
        const end = offsets[i + 1];
        if (end - start < 2) continue;
        ctx.beginPath();
        for (let j = start; j < end; j++) {
          const x = coords[j * 2] * scale;
          const y = coords[j * 2 + 1] * scale;
          if (j === start) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function renderRun(run) {
      const { terrain, hydro, seed } = run.data;
      const width = terrain.W * pixelSize;
      const height = terrain.H * pixelSize;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      const minElev = Math.min(...terrain.elevationM);
      const maxElev = Math.max(...terrain.elevationM);
      for (let y = 0; y < terrain.H; y++) {
        for (let x = 0; x < terrain.W; x++) {
          const idx = y * terrain.W + x;
          ctx.fillStyle = colorForCell(
            terrain.elevationM[idx],
            minElev,
            maxElev,
            terrain.moistureIx[idx]
          );
          ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
      }

      const scale = pixelSize / terrain.cellSizeM;
      ctx.lineWidth = Math.max(1, pixelSize * 0.12);
      ctx.strokeStyle = '#3ea4ff';
      ctx.globalAlpha = 0.9;
      drawPolylines(ctx, hydro.river, scale);
      ctx.strokeStyle = '#8b949e';
      ctx.lineWidth = Math.max(1, pixelSize * 0.08);
      drawPolylines(ctx, { lines: terrain.coastline.lines, offsets: terrain.coastline.offsets }, scale);
      ctx.globalAlpha = 1;

      const card = document.createElement('div');
      card.className = 'card';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('strong');
      title.textContent = 'Seed ' + seed;
      const file = document.createElement('span');
      file.textContent = run.file;
      meta.appendChild(title);
      meta.appendChild(file);
      card.appendChild(meta);
      card.appendChild(canvas);
      container.appendChild(card);
    }

    (async () => {
      for (const run of manifest.runs) {
        try {
          const loaded = await loadRun(run);
          renderRun(loaded);
        } catch (err) {
          const card = document.createElement('div');
          card.className = 'card';
          card.textContent = 'Failed to render ' + run.file + ': ' + err;
          container.appendChild(card);
        }
      }
    })();
  </script>
</body>
</html>
`;
}

function main() {
  const { runs, outDir } = parseArgs(process.argv);
  const seeds = randomSeeds(runs);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const records: RunRecord[] = [];
  seeds.forEach((seed, idx) => records.push(writeRun(outDir, idx + 1, seed)));
  const html = buildHtml(records);
  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, html);
  // eslint-disable-next-line no-console
  console.log(`Wrote debug site with ${records.length} runs to ${indexPath}`);
}

const entryUrl = pathToFileURL(process.argv[1]).href;
if (import.meta.url === entryUrl) {
  main();
}
