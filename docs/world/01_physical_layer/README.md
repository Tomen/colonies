# Physical Layer

The physical layer generates the foundational terrain, hydrology, and environmental data for the simulation.

For detailed terrain algorithm documentation, see [terrain-generation.md](terrain-generation.md).

## Overview

This layer creates a 10×10 km terrain grid (at 10m resolution) that simulates an American East Coast-like landscape with:
- Coastal plains transitioning to inland ridge belts
- Realistic river networks draining to the ocean
- Moisture distribution for ecosystem modeling
- Harbor suitability scoring for port placement

## Classes

- **WorldGenerator** (`src/worldgen.ts`): Main terrain generation class
- **SeededRNG** (`src/rng.ts`): Linear congruential generator for deterministic randomness
- **ConfigLoader** (`src/config.ts`): JSON-based configuration with validation and defaults
- **PngExporter** (`src/png_exporter.ts`): Visualization output for terrain data

## Key Algorithms

### Terrain Generation

Height map generation uses multiple techniques:
1. **Coastal-to-ridge transition**: Distance from coast controls base elevation
2. **Simplex noise overlay**: Adds natural terrain variation (50m amplitude)
3. **Ridge orientation**: Cosine function with configurable angle creates directional ridges
4. **Ocean depth**: Negative elevation in coastal zones simulates seafloor

### D8 Flow Direction

Standard 8-direction steepest descent algorithm:
- Each cell points to its lowest neighbor
- Handles all 8 cardinal and diagonal directions
- Ensures water flows downhill toward map boundaries

### Flow Accumulation

Topological sort from high to low elevation:
1. Sort all cells by elevation (highest first)
2. For each cell, add its flow to the downstream neighbor
3. Result: cells in river channels have high accumulated flow
4. `riverDensity` parameter (0.0-1.0) scales precipitation per cell

### Harbor Scoring

Multi-criteria optimization for port placement:
- **Water depth**: Deeper water scores higher
- **Shelter**: Count of adjacent land cells
- **River access**: Bonus for high flow accumulation nearby
- Combined weighted scoring selects optimal harbor location

### Moisture Calculation

Multi-factor model normalized to 0-1 scale:
- **Elevation effect**: Higher elevation = drier
- **River proximity**: High flow accumulation = wetter
- **Coastal effect**: Distance from ocean influences moisture

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| seed | 12345 | Random seed for deterministic generation |
| mapSize | 1000 | Grid size (1000 = 10km at 10m resolution) |
| ridgeOrientation | 45 | Ridge belt angle in degrees |
| riverDensity | 0.5 | River network density (0.0-1.0) |
| coastalPlainWidth | 0.3 | Fraction of map width for coastal plain |
| ridgeHeight | 200 | Maximum elevation in meters |
| noiseScale | 0.01 | Simplex noise frequency |
| coastlineWaviness | 0.3 | Amplitude of coastline variation |
| coastlineFrequency | 3 | Frequency of coastline waves |
| noiseOctaves | 3 | Number of noise octaves |
| noisePersistence | 0.5 | Noise amplitude falloff per octave |
| ridgeVariation | 0.2 | Ridge height variation factor |

## Data Structures

### TerrainData

```typescript
interface TerrainData {
  height: number[][];          // Elevation grid (negative = water)
  flowAccumulation: number[][]; // Upstream cell count per cell
  moisture: number[][];         // Moisture level 0-1
}
```

### WorldConfig

See `src/types.ts` for the full interface definition with all configurable parameters.

## Visual Outputs

| File | Description |
|------|-------------|
| `01_height_map.png` | Terrain elevation: blue = water, green = low land, brown = high land |
| `02_flow_accumulation.png` | River flow intensity (log scale): dark→bright blue |
| `03_moisture_map.png` | Soil moisture: brown = dry, green = wet |
