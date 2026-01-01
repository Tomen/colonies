# Terrain Generation

Technical documentation for the terrain generation algorithm in `src/worldgen.ts`.

## Overview

The terrain simulates an American East Coast profile:
- **Ocean** on the east (high X values)
- **Coastal plain** rising gently from the shore
- **Ridge/mountains** on the west (low X values)

The coastline is wavy with configurable bays and headlands. Multi-octave simplex noise adds natural variation throughout.

## Terrain Profile

```
West                                                              East
  ▲
  │     Ridge Peak
  │    ╱╲
  │   ╱  ╲
  │  ╱    ╲___________
  │ ╱                  ╲___Coastal Plain___
  │╱                                       ╲___
──┼─────────────────────────────────────────────────────────────▶ X
  │                                             ╲___Ocean___
  │
  ▼ Elevation
```

## Terrain Zones

### Zone 1: Ocean (`distFromCoast < 0`)

Water zone east of the coastline.

```
elevation = -5 + distFromCoast × oceanDepthGradient
```

- Starts at -5m at coastline
- Deepens toward east edge (distFromCoast is negative, so depth increases)
- Noise reduced to 30% amplitude for smoother water

### Zone 2: Coastal Plain (`0 ≤ distFromCoast < coastalPlainWidth`)

Gentle slope from sea level inland.

```
t = distFromCoast / coastalPlainWidth
elevation = t × 20
```

- Linear rise from 0m at coast to 20m at plain edge
- Full noise amplitude applied

### Zone 3: Inland/Ridge (`distFromCoast ≥ coastalPlainWidth`)

Mountainous interior with sinusoidal ridge profile.

```
ridgeDist = distFromCoast - coastalPlainWidth
ridgeProgress = min(1, ridgeDist / ridgeWidth)
elevation = 20 + ridgeHeight × sin(ridgeProgress × π)
```

- Starts at 20m (coastal plain top)
- Rises to 20 + ridgeHeight at peak
- Falls back toward west edge
- Ridge orientation adds Y-axis variation

## Coastline Generation

The coastline position varies along Y to create bays and headlands.

### Base Position
```
coastX = size - coastlineMargin + wavyOffset
```

### Wavy Offset Calculation (`getCoastlineOffset`)

Combines multiple sine waves for natural appearance:

```
normalizedY = y / size

primaryWave   = sin(normalizedY × 2π × frequency)
secondaryWave = sin(normalizedY × 2π × frequency × 2.3 + 1.7) × 0.4
tertiaryWave  = sin(normalizedY × 2π × frequency × 0.7 + 0.5) × 0.3
noiseOffset   = noise2D(0.1, y × 0.02) × 0.5

combinedWave = primaryWave + secondaryWave + tertiaryWave + noiseOffset
wavyOffset   = combinedWave × waviness × size × 0.15
```

Maximum offset is ±15% of map width (scaled by waviness).

## Noise Generation

### Octave Noise (`octaveNoise`)

Fractal Brownian motion using simplex noise:

```
for i in 0..octaves:
    total += noise2D(x × scale × freq, y × scale × freq) × amplitude
    amplitude *= persistence
    frequency *= 2

return total / maxValue  // Normalized to [-1, 1]
```

- Each octave adds finer detail at half the amplitude
- `persistence` controls how quickly amplitude falls off
- Result multiplied by 50m for terrain variation

### Noise Application by Zone

| Zone | Noise Multiplier | Effect |
|------|------------------|--------|
| Ocean | 0.3 | Smoother water surface |
| Coastal Plain | 1.0 | Full variation |
| Inland/Ridge | 1.0 | Full variation |

## Configuration Parameters

### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `seed` | number | 12345 | Random seed for deterministic generation |
| `mapSize` | number | 1000 | Grid size (1000 = 10km × 10km at 10m resolution) |

### Coastline Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `coastlineMargin` | number | 50 | Base distance of coastline from east edge (cells) |
| `oceanDepthGradient` | number | 0.5 | Depth increase per cell moving east (meters) |
| `coastlineWaviness` | number | 0.3 | Amplitude of coastline undulation (0-1) |
| `coastlineFrequency` | number | 3 | Number of major bays/headlands |

### Terrain Shape Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `coastalPlainWidth` | number | 0.3 | Fraction of map width for coastal plain (0-1) |
| `ridgeHeight` | number | 200 | Peak ridge elevation above coastal plain (meters) |
| `ridgeOrientation` | number | 45 | Ridge angle in degrees |
| `ridgeVariation` | number | 0.2 | Y-axis variation in ridge height (0-1) |

### Noise Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `noiseScale` | number | 0.01 | Base frequency of simplex noise |
| `noiseOctaves` | number | 3 | Number of noise layers (more = finer detail) |
| `noisePersistence` | number | 0.5 | Amplitude falloff per octave (0-1) |

## Algorithm Flow

```
generateHeightMap(size):
    for each row y:
        wavyOffset = getCoastlineOffset(y, size)
        coastX = size - coastlineMargin + wavyOffset
        localRidgeHeight = ridgeHeight × (1 + ridgeVariation × noise)

        for each cell x:
            distFromCoast = coastX - x

            if distFromCoast < 0:
                // Ocean
                elevation = -5 + distFromCoast × oceanDepthGradient
                noiseScale = 0.3
            else if distFromCoast < coastalPlainWidth:
                // Coastal Plain
                elevation = (distFromCoast / coastalPlainWidth) × 20
                noiseScale = 1.0
            else:
                // Inland/Ridge
                ridgeProgress = (distFromCoast - coastalPlainWidth) / ridgeWidth
                elevation = 20 + localRidgeHeight × sin(ridgeProgress × π)
                noiseScale = 1.0
                elevation += ridgeOrientationInfluence

            elevation += octaveNoise(x, y) × 50 × noiseScale
            height[y][x] = elevation
```

## Known Issues

### 1. Lakes on Coastal Plain

**Problem**: The coastal plain rises only 0-20m, but noise adds ±50m. This can push coastal areas below sea level, creating lakes.

**Cause**:
```
Coastal plain: 0 to 20m
Noise: ±50m
Net range: -30m to +70m ← negative = underwater
```

### 2. Abrupt Terrain Transitions

**Problem**: The transition from coastal plain to ridge can feel sudden.

**Cause**: Uniform ±50m noise dominates on the low-elevation coastal plain but is proportionally smaller on the high-elevation ridge, creating visual discontinuity.

## Related Files

- `src/worldgen.ts` - Implementation
- `src/types.ts` - WorldConfig interface
- `src/config.ts` - Default values
- `config.yaml` - User configuration
