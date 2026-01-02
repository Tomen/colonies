# Milestone 7: Simulation Engine

Central coordinator for the time-stepping simulation loop.

## Overview

The `SimulationEngine` manages time advancement, coordinating all subsystems (network, settlements, economy) through a monthly tick cycle. Each tick executes phases in a fixed order to ensure deterministic results.

**Dependencies:** M3 Network Layer, M4 Settlements, M5 Economy, M6 Agents

**Provides:** Time advancement for all other systems, state snapshots for visualization

## Key Decisions

| Question | Answer |
|----------|--------|
| Tick granularity | Monthly (12 ticks per year) |
| Phase implementation | Minimal stubs initially, filled in by M5/M6 |
| Determinism | Required - seeded RNG throughout |
| Snapshots | Managed by engine, captured at configurable intervals |

## Data Structures

```typescript
// packages/shared/src/types.ts - Add these

interface SimulationConfig {
  // Time
  startYear: number;           // 1600 - simulation start
  ticksPerYear: number;        // 12 - monthly ticks
  maxYear: number;             // 1900 - optional end year

  // Seasonality
  enableSeasons: boolean;      // true - seasonal modifiers
  winterMonths: number[];      // [12, 1, 2] - high travel cost
  summerMonths: number[];      // [6, 7, 8] - high crop yield
}

interface SimulationState {
  // Time
  year: number;
  month: number;               // 1-12
  tick: number;                // Total ticks since start

  // Layer references
  terrain: VoronoiTerrainData;
  cadastral: CadastralManager;
  settlements: SettlementManager;
  network: TransportNetwork;

  // Dynamic state
  resources: Map<string, ResourceInventory>;  // settlementId → inventory
  forestAge: Map<number, number>;              // cellId → years since clearing
}

interface TickResult {
  year: number;
  month: number;
  tick: number;

  // Phase results
  populationChanges: PopulationDelta[];
  landClaims: LandClaim[];
  production: ProductionResult[];
  tradeRoutes: TradeRoute[];
  roadUpgrades: EdgeUpgrade[];
  settlementChanges: SettlementChange[];

  // Events for visualization/logging
  events: SimulationEvent[];
}

interface SimulationEvent {
  tick: number;
  type: 'settlement_founded' | 'settlement_upgraded' | 'road_built' | 'bridge_built' | 'trade_route' | 'population_milestone';
  data: Record<string, unknown>;
}

interface PopulationDelta {
  settlementId: string;
  births: number;
  deaths: number;
  immigrantsIn: number;
  emigrantsOut: number;
  netChange: number;
}

interface LandClaim {
  parcelId: string;
  settlementId: string;
  previousUse: LandUse;
  newUse: LandUse;
}

interface SettlementChange {
  settlementId: string;
  type: 'rank_up' | 'expanded' | 'port_detected';
  details: Record<string, unknown>;
}
```

## Algorithms

### Tick Execution Order

Each tick executes these phases in order (from [world.md](../world.md)):

```typescript
class SimulationEngine {
  tick(): TickResult {
    const result: TickResult = {
      year: this.state.year,
      month: this.state.month,
      tick: this.state.tick,
      populationChanges: [],
      landClaims: [],
      production: [],
      tradeRoutes: [],
      roadUpgrades: [],
      settlementChanges: [],
      events: [],
    };

    // Phase 1: Seasonal modifiers
    const seasonMods = this.calculateSeasonalModifiers();

    // Phase 2: Population (births, deaths, migration)
    result.populationChanges = this.updatePopulation(seasonMods);

    // Phase 3: Land claims and forest clearing
    result.landClaims = this.processLandClaims();

    // Phase 4: Production (farms, forests, industries)
    result.production = this.produceResources(seasonMods);

    // Phase 5: Trade routing and edge usage
    result.tradeRoutes = this.routeTrade();
    result.roadUpgrades = this.state.network.processUpgrades();

    // Phase 6: Settlement growth
    result.settlementChanges = this.growSettlements();

    // Phase 7: Governance (future - taxes, laws)
    // this.applyGovernance();

    // Advance time
    this.advanceTime();

    return result;
  }

  advanceTime(): void {
    this.state.tick++;
    this.state.month++;

    if (this.state.month > 12) {
      this.state.month = 1;
      this.state.year++;
    }
  }
}
```

### Seasonal Modifiers

```typescript
interface SeasonalModifiers {
  travelCostMultiplier: number;   // 1.0 normal, 1.5 winter
  cropYieldMultiplier: number;    // 1.0 normal, 1.2 summer harvest
  constructionAllowed: boolean;   // false in deep winter
  riverFrozen: boolean;           // affects crossings
}

function calculateSeasonalModifiers(month: number, config: SimulationConfig): SeasonalModifiers {
  if (!config.enableSeasons) {
    return { travelCostMultiplier: 1, cropYieldMultiplier: 1, constructionAllowed: true, riverFrozen: false };
  }

  const isWinter = config.winterMonths.includes(month);
  const isSummer = config.summerMonths.includes(month);
  const isDeepWinter = month === 1 || month === 2;

  return {
    travelCostMultiplier: isWinter ? 1.5 : 1.0,
    cropYieldMultiplier: isSummer ? 1.2 : (isWinter ? 0.0 : 1.0),
    constructionAllowed: !isDeepWinter,
    riverFrozen: isDeepWinter,  // Allows crossing without ferry
  };
}
```

### Determinism Requirements

The simulation MUST be deterministic:

```typescript
class SimulationEngine {
  private rng: SeededRandom;  // From existing rng.ts

  constructor(seed: number, terrain: VoronoiTerrainData) {
    this.rng = new SeededRandom(seed);
    // ... initialize state
  }

  // All random decisions use this.rng
  // Same seed + same config = same results
}
```

Determinism checklist:
- [ ] All random choices use seeded RNG
- [ ] Iteration order over Maps/Sets is deterministic (use arrays or sorted keys)
- [ ] Floating point operations produce consistent results
- [ ] No dependency on wall-clock time

### State Snapshots

For time-lapse visualization, capture state at intervals:

```typescript
interface StateSnapshot {
  tick: number;
  year: number;
  month: number;

  // Lightweight copies of key state
  settlements: SettlementSnapshot[];
  roads: RoadSnapshot[];
  population: Map<string, number>;
}

interface SettlementSnapshot {
  id: string;
  position: Point;
  population: number;
  rank: SettlementRank;
  claimedCells: number[];
}

interface RoadSnapshot {
  fromCell: number;
  toCell: number;
  type: EdgeType;
}

function captureSnapshot(state: SimulationState): StateSnapshot {
  return {
    tick: state.tick,
    year: state.year,
    month: state.month,
    settlements: state.settlements.getSettlements().map(s => ({
      id: s.id,
      position: s.position,
      population: s.population,
      rank: s.rank,
      claimedCells: [...s.claimedCells],
    })),
    roads: Array.from(state.network.edges.values())
      .filter(e => e.type !== 'none')
      .map(e => ({
        fromCell: e.fromCell,
        toCell: e.toCell,
        type: e.type,
      })),
    population: new Map(
      state.settlements.getSettlements().map(s => [s.id, s.population])
    ),
  };
}
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| startYear | 1600 | 1000-2000 | Simulation start year |
| ticksPerYear | 12 | 1-52 | Ticks per year (12=monthly, 4=seasonal) |
| maxYear | 1900 | startYear+1 - 2100 | Optional end year |
| enableSeasons | true | bool | Enable seasonal modifiers |
| winterMonths | [12,1,2] | month[] | Months with winter effects |
| summerMonths | [6,7,8] | month[] | Months with summer effects |
| snapshotInterval | 12 | 1-120 | Ticks between state snapshots |

## Tasks

### Core Implementation

- [ ] Add `SimulationConfig`, `SimulationState`, `TickResult` to `packages/shared/src/types.ts`
- [ ] Create `packages/core/src/simulation-engine.ts`
- [ ] Implement `SimulationEngine` class with constructor
- [ ] Implement `tick()` method with phase ordering
- [ ] Implement `calculateSeasonalModifiers()`
- [ ] Implement `advanceTime()`
- [ ] Implement `captureSnapshot()`
- [ ] Implement `fastForward(ticks: number)` for batch processing

### Phase Stubs

Initial implementation with stub phases (detailed in M5/M6 todo files):

- [ ] `updatePopulation()` - stub returns empty array (see M5_agents.md)
- [ ] `processLandClaims()` - stub returns empty array (see M5_agents.md)
- [ ] `produceResources()` - stub returns empty array (see M6_economy.md)
- [ ] `routeTrade()` - stub returns empty array (see M6_economy.md)
- [ ] `growSettlements()` - stub returns empty array (see M5_agents.md)

### Integration

- [ ] Add engine creation to world generation pipeline
- [ ] Export engine state in worker messages
- [ ] Add `getState()` for external access

## Testing & Acceptance

### Unit Tests

- [ ] `tick()`: Advances time correctly (month wraps, year increments)
- [ ] `tick()`: Phases execute in correct order
- [ ] `calculateSeasonalModifiers()`: Returns correct values for each month
- [ ] `captureSnapshot()`: Captures settlement and road state
- [ ] Determinism: Same seed produces identical results after N ticks

### Integration Tests

- [ ] Engine initializes from terrain and settlements
- [ ] `fastForward(120)` runs 10 years without error
- [ ] State snapshots can be used to reconstruct visualization

### Performance Tests

- [ ] 10K cells, 50 settlements: tick() < 100ms
- [ ] Memory stable after 1000 ticks (no leaks)

## Open Questions

- **[DECIDED]** Tick granularity → **Monthly** (12 ticks per year)
- **[DECIDED]** Phase implementation → **Minimal stubs**, filled in by M5/M6
- **[OPEN]** Should tick results be emitted as events (pub/sub) or returned directly?
- **[OPEN]** How to handle "pause" - stop between phases or only between ticks?
- **[OPEN]** Should snapshots be stored in engine or managed externally?
- **[OPEN]** Phase 7 (Governance) - what decisions? Defer to future milestone?
