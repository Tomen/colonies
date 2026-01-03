# @colonies/cli

Node.js command-line tool for batch terrain generation.

## Purpose

Provides a CLI for generating terrain and exporting PNG visualizations. Uses `@colonies/core` for simulation and adds Node.js-specific I/O.

## Dependencies

- `@colonies/shared` - Types and config
- `@colonies/core` - Simulation logic
- `pngjs` - PNG file writing
- `js-yaml` - YAML config file parsing

## Files

| File | Description |
|------|-------------|
| `main.ts` | Entry point, orchestrates generation |
| `config.ts` | YAML config file loading |
| `png_exporter.ts` | PNG visualization output |

## PNG Outputs

Generated to `output/` (numbered by render order):

| File | Description |
|------|-------------|
| `01_height_map.png` | Terrain elevation |
| `02_flow_accumulation.png` | River network |
| `03_moisture_map.png` | Soil moisture |
| `04_cost_field.png` | Movement cost |
| `05_usage_heatmap.png` | Transport usage |

## Commands

```bash
pnpm build      # Compile TypeScript
pnpm generate   # Run terrain generation
pnpm lint       # Run ESLint
```

## Usage

From monorepo root:
```bash
pnpm generate              # Use default config
pnpm generate config.yaml  # Use custom config file
```

## Config File Format

```yaml
seed: 12345
mapSize: 10000  # 10km x 10km, 1 unit = 1 meter
voronoiCellCount: 10000
settlementCount: 3
```

## Guidelines

- Node.js-specific code is fine here (fs, path, etc.)
- Keep visualization logic in `png_exporter.ts`
- Output files go to `output/` directory
- Add new visualizations with numbered prefixes
