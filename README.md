# Colonies Simulation

A procedural American East Coast-like terrain generator with historical settlement growth simulation. The system models terrain generation, hydrology, transport networks, land use, settlements, and economic development over time.

## Quick Start

### Generate a World Map

1. **Install dependencies:**
```bash
npm install
```

2. **Build the project:**
```bash
npm run build
```

3. **Generate terrain and export maps:**
```bash
npm run generate
```

This creates three PNG visualization files:
- `height_map.png` - Terrain elevation (blue=water, green/brown=land)
- `flow_accumulation.png` - River network (blue intensity shows flow)
- `moisture_map.png` - Moisture levels (brown=dry, green=wet)

## Development

### Available Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Run all tests
npm test

# Watch tests during development
npm run test:watch

# Lint code for quality issues
npm run lint

# Format code with Prettier
npm run format

# Generate world maps
npm run generate
```

### Testing

The project includes comprehensive tests for:
- Deterministic terrain generation
- Hydrology model validation (flow accumulation, sink prevention)
- Harbor placement algorithms
- Configuration system

Run `npm test` to verify all functionality works correctly.

## Architecture

The simulation uses a layered approach:

- **Physical Layer**: Terrain, hydrology, soils, vegetation
- **Cadastral Layer**: Land parcels and ownership (planned)
- **Network Layer**: Transportation routes (planned)
- **Society Layer**: Settlements and economy (planned)
- **Rendering**: Map visualization and GIF export

### Current Implementation (Step 1)

✅ **Core World Generation**
- Seeded procedural terrain generation
- Realistic hydrology with proper river drainage
- Harbor suitability scoring and port placement
- PNG export system for visualization

### Planned Features

- 🔄 Dynamic transport network with pathfinding
- 🔄 Settlement growth and land use simulation  
- 🔄 Economic modeling with resource flow
- 🔄 Time-lapse GIF export
- 🔄 Interactive visualization

## Configuration

World generation is highly configurable:

```typescript
const config = {
  seed: 12345,              // Deterministic generation
  mapSize: 1000,            // Grid resolution (1000 = 10km x 10km)
  ridgeOrientation: 45,     // Ridge belt angle (degrees)
  riverDensity: 0.5,        // River network density
  coastalPlainWidth: 0.3,   // Fraction of map width
  ridgeHeight: 200,         // Maximum elevation (meters)
  noiseScale: 0.01,         // Terrain variation
  harborMinDepth: 10        // Harbor depth requirement
}
```

## Technical Details

- **Language**: TypeScript with ES modules
- **Testing**: Vitest with comprehensive coverage
- **Code Quality**: ESLint + Prettier
- **Algorithms**: D8 flow routing, simplex noise, multi-criteria optimization
- **Output**: PNG visualization, JSON data export

## Project Status

This project follows a step-by-step implementation approach:

1. ✅ **Project Setup** - TypeScript foundation and tooling
2. ✅ **Core World Generation** - Terrain, hydrology, harbor placement
3. 🔄 **Transport Network** - Pathfinding and infrastructure
4. 🔄 **Land Use and Settlements** - Growth simulation
5. 🔄 **Industry Sites** - Economic modeling
6. 🔄 **Polish and Export** - Rendering and GIF output

See `docs/master_checklist.md` for detailed progress tracking.