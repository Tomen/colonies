# Milestone 5: Agent Model and Population Dynamics

Agent-based simulation of population growth, migration, and settlement expansion.

## Overview

This milestone introduces the agent layer that drives the simulation. Agents (individuals, households, companies, settlements) make decisions about migration, land claims, and resource allocation.

**Dependencies:** M3 Network Layer, M4 Simulation Engine

**Provides:** Population dynamics, migration, land expansion, settlement growth

## Agent Model

```
Person (individual)
  └─► Household (family, required membership)
        └─► Settlement (residence)
  └─► Company (optional employment)

Ownership:
  - Household/Company → Parcel (private property)
  - Settlement → Parcel (jurisdiction/commons)

Agency: Households, Companies, and Settlements all make decisions
```

### Implementation Approach

**Phase 1: Aggregate Model**
- Track population as numbers per settlement
- Households implicit (population / avg_household_size)
- No individual person tracking
- Settlements make aggregate decisions

**Phase 2: Individual Agents (Future)**
- Individual people with traits
- Explicit household membership
- Company formation and employment
- Individual migration decisions

## Data Structures

```typescript
// packages/shared/src/types.ts

interface PopulationConfig {
  // Growth rates (annual, applied monthly)
  baseGrowthRate: number;        // 0.02 - 2% base annual growth
  baseMortalityRate: number;     // 0.01 - 1% base annual mortality

  // Capacity
  foodPerPerson: number;         // 10 - food units needed per person per year
  housingPerPerson: number;      // 1 - residential parcels per 50 people

  // Migration
  migrationRate: number;         // 0.05 - 5% of excess population migrates
  migrationDistanceDecay: number; // 0.01 - attractiveness decay per distance
  minMigrationSize: number;      // 10 - minimum migrants to trigger movement

  // New settlement founding
  pioneerGroupSize: number;      // 50 - minimum population to found new settlement
  minDistanceFromExisting: number; // 100 - minimum distance to existing settlement
}

interface SettlementPopulation {
  settlementId: string;
  total: number;
  households: number;            // total / 5 (average household size)
  carryingCapacity: number;      // Derived from terrain
  foodProduction: number;
  housingCapacity: number;
}

interface ForestState {
  cellId: number;
  age: number;                   // Years since last clearing
  density: number;               // 0-1, regrows over time
  cleared: boolean;              // Currently cleared for agriculture
}

interface LandClaim {
  tick: number;
  parcelId: string;
  settlementId: string;
  householdId?: string;          // Optional individual claimant
  previousUse: LandUse;
  newUse: LandUse;
  clearingCost: number;          // Labor/time to clear (if forest)
}

interface PopulationDelta {
  settlementId: string;
  births: number;
  deaths: number;
  immigrantsIn: number;
  emigrantsOut: number;
  netChange: number;
}

interface SettlementChange {
  settlementId: string;
  type: 'rank_up' | 'expanded' | 'port_detected' | 'founded';
  details: Record<string, unknown>;
}
```

## Algorithms

### Carrying Capacity Model

Each settlement's maximum sustainable population:

```typescript
function calculateCarryingCapacity(
  settlement: Settlement,
  cadastral: CadastralManager,
  terrain: VoronoiTerrainData,
  config: PopulationConfig
): number {
  const parcels = cadastral.getParcelsForSettlement(settlement.id);

  let foodCapacity = 0;
  let housingCapacity = 0;

  for (const parcel of parcels) {
    const cell = terrain.cells[parcel.terrainCellId];
    const fertility = cell.moisture * (1 - cell.elevation / terrain.maxElevation);

    switch (parcel.landUse) {
      case 'field':
        foodCapacity += parcel.area * fertility * CROP_YIELD_PER_AREA;
        break;
      case 'pasture':
        foodCapacity += parcel.area * fertility * PASTURE_YIELD_PER_AREA * 0.5;
        break;
      case 'residential':
        housingCapacity += parcel.area * HOUSING_DENSITY;
        break;
    }
  }

  // Trade bonus for ports
  const tradeMultiplier = settlement.isPort ? 1.5 : 1.0;
  const riverBonus = hasRiverAccess(settlement, terrain) ? 1.2 : 1.0;

  const rawFoodCapacity = (foodCapacity * tradeMultiplier * riverBonus) / config.foodPerPerson;
  const rawHousingCapacity = housingCapacity * 50;

  return Math.floor(Math.min(rawFoodCapacity, rawHousingCapacity));
}
```

### Population Update (Phase 2 of tick)

```typescript
function updatePopulation(
  state: SimulationState,
  seasonMods: SeasonalModifiers,
  config: PopulationConfig
): PopulationDelta[] {
  const deltas: PopulationDelta[] = [];
  const monthlyGrowth = config.baseGrowthRate / 12;
  const monthlyMortality = config.baseMortalityRate / 12;

  for (const settlement of state.settlements.getSettlements()) {
    const capacity = calculateCarryingCapacity(settlement, state.cadastral, state.terrain, config);
    const pop = settlement.population;

    // Logistic growth: slows as population approaches capacity
    const growthFactor = Math.max(0, 1 - pop / capacity);
    const births = Math.floor(pop * monthlyGrowth * growthFactor);

    // Mortality: increases if overcrowded
    const crowdingFactor = pop > capacity ? 1 + (pop - capacity) / capacity : 1;
    const deaths = Math.floor(pop * monthlyMortality * crowdingFactor);

    settlement.population += births - deaths;
    settlement.population = Math.max(1, settlement.population);
    settlement.rank = calculateRank(settlement.population);

    deltas.push({
      settlementId: settlement.id,
      births,
      deaths,
      immigrantsIn: 0,
      emigrantsOut: 0,
      netChange: births - deaths,
    });
  }

  // Process migration after births/deaths
  processMigration(state, deltas, config);

  return deltas;
}
```

### Migration Model

```typescript
function processMigration(
  state: SimulationState,
  deltas: PopulationDelta[],
  config: PopulationConfig
): void {
  const settlements = state.settlements.getSettlements();

  // Identify sources (overcrowded) and destinations (underpopulated)
  const sources: Array<{ settlement: Settlement; excess: number }> = [];
  const destinations: Array<{ settlement: Settlement; capacity: number; attractiveness: number }> = [];

  for (const settlement of settlements) {
    const capacity = calculateCarryingCapacity(settlement, state.cadastral, state.terrain, config);

    if (settlement.population > capacity) {
      sources.push({ settlement, excess: settlement.population - capacity });
    } else if (settlement.population < capacity * 0.8) {
      const attractiveness = calculateAttractiveness(settlement, state);
      destinations.push({ settlement, capacity: capacity - settlement.population, attractiveness });
    }
  }

  // Process migration from each source
  for (const source of sources) {
    const migrants = Math.floor(source.excess * config.migrationRate);
    if (migrants < config.minMigrationSize) continue;

    // Option 1: Move to existing settlement
    const destination = findBestDestination(source.settlement, destinations, state, config);

    // Option 2: Found new settlement (pioneer group)
    if (!destination && migrants >= config.pioneerGroupSize) {
      const newSite = findPioneerSite(source.settlement, state, config);
      if (newSite) {
        foundNewSettlement(newSite, migrants, state);
        continue;
      }
    }

    if (destination) {
      // Transfer population
      source.settlement.population -= migrants;
      destination.settlement.population += migrants;

      // Update deltas
      const sourceDelta = deltas.find(d => d.settlementId === source.settlement.id)!;
      const destDelta = deltas.find(d => d.settlementId === destination.settlement.id)!;
      sourceDelta.emigrantsOut += migrants;
      destDelta.immigrantsIn += migrants;
      sourceDelta.netChange -= migrants;
      destDelta.netChange += migrants;
    }
  }
}

function calculateAttractiveness(settlement: Settlement, state: SimulationState): number {
  let score = 1.0;

  if (settlement.isPort) score += 0.5;
  if (hasRiverAccess(settlement, state.terrain)) score += 0.3;
  score += Math.log10(settlement.population + 1) * 0.1;

  const roadCount = state.network.getEdgesForSettlement(settlement.id)
    .filter(e => e.type !== 'none').length;
  score += roadCount * 0.05;

  return score;
}
```

### Pioneer Settlement Founding

```typescript
function findPioneerSite(
  source: Settlement,
  state: SimulationState,
  config: PopulationConfig
): number | null {
  // Find suitable unclaimed cells for new settlement
  const candidates: Array<{ cellId: number; score: number }> = [];

  for (const cell of state.terrain.cells) {
    if (!cell.isLand) continue;
    if (cell.isWater) continue;

    // Check distance from existing settlements
    const tooClose = state.settlements.getSettlements().some(s =>
      euclideanDistance(cell.centroid, s.position) < config.minDistanceFromExisting
    );
    if (tooClose) continue;

    // Score the site
    const score = scorePioneerSite(cell, state);
    if (score > 0) {
      candidates.push({ cellId: cell.id, score });
    }
  }

  if (candidates.length === 0) return null;

  // Return best site
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].cellId;
}

function scorePioneerSite(cell: VoronoiCell, state: SimulationState): number {
  let score = 0;

  // Prefer flat land
  score += (1 - cell.elevation / state.terrain.maxElevation) * 10;

  // Prefer fertile (high moisture)
  score += cell.moisture * 10;

  // Strong preference for river access
  if (cell.flowAccumulation > 50) score += 15;

  // Bonus for coastal (future port)
  if (cell.isCoast) score += 10;

  // Penalty for very high elevation
  if (cell.elevation > 200) score -= 20;

  return score;
}

function foundNewSettlement(
  cellId: number,
  population: number,
  state: SimulationState
): Settlement {
  const cell = state.terrain.cells[cellId];

  const settlement = state.settlements.createSettlement({
    position: cell.centroid,
    cellId: cellId,
    population: population,
    rank: calculateRank(population),
    name: generateSettlementName(state),
  });

  // Claim initial territory
  settlement.claimedCells = [cellId];

  // Subdivide and assign initial parcels
  state.cadastral.subdivideCell(cellId);

  return settlement;
}
```

### Land Claims (Phase 3 of tick)

```typescript
function processLandClaims(state: SimulationState): LandClaim[] {
  const claims: LandClaim[] = [];

  for (const settlement of state.settlements.getSettlements()) {
    const capacity = calculateCarryingCapacity(settlement, state.cadastral, state.terrain, config);

    // Need more land if approaching capacity
    if (settlement.population > capacity * 0.7) {
      const newClaims = expandSettlementTerritory(settlement, state);
      claims.push(...newClaims);
    }
  }

  return claims;
}

function expandSettlementTerritory(
  settlement: Settlement,
  state: SimulationState
): LandClaim[] {
  const claims: LandClaim[] = [];
  const claimedCells = new Set(settlement.claimedCells);
  const adjacentCells: number[] = [];

  // Find adjacent unclaimed cells
  for (const cellId of claimedCells) {
    const cell = state.terrain.cells[cellId];
    for (const neighborId of cell.neighbors) {
      if (!claimedCells.has(neighborId) && state.terrain.cells[neighborId]?.isLand) {
        adjacentCells.push(neighborId);
      }
    }
  }

  if (adjacentCells.length === 0) return claims;

  // Score and claim best cell
  const scoredCells = adjacentCells.map(cellId => ({
    cellId,
    score: scoreCellForExpansion(cellId, settlement, state),
  })).sort((a, b) => b.score - a.score);

  const bestCell = scoredCells[0];
  if (bestCell.score > 0) {
    settlement.claimedCells.push(bestCell.cellId);
    state.cadastral.subdivideCell(bestCell.cellId);

    const parcels = state.cadastral.getParcelsInCell(bestCell.cellId);
    for (const parcel of parcels) {
      const landUse = determineLandUse(bestCell.cellId, settlement, state);
      state.cadastral.setLandUse(parcel.id, landUse);
      state.cadastral.setOwner(parcel.id, settlement.id);

      claims.push({
        tick: state.tick,
        parcelId: parcel.id,
        settlementId: settlement.id,
        previousUse: 'wilderness',
        newUse: landUse,
        clearingCost: calculateClearingCost(parcel, state),
      });
    }
  }

  return claims;
}
```

### Forest Management

```typescript
function updateForests(state: SimulationState): void {
  for (const [cellId, forestState] of state.forestAge.entries()) {
    if (forestState.cleared) continue;

    // Regrowth
    forestState.age++;
    forestState.density = Math.min(1, forestState.density + REGROWTH_RATE);
  }
}

function clearForest(
  parcel: Parcel,
  state: SimulationState
): { timber: number; laborCost: number } {
  const forestState = state.forestAge.get(parcel.terrainCellId);
  if (!forestState || forestState.density === 0) {
    return { timber: 0, laborCost: 0 };
  }

  const timber = parcel.area * forestState.age * forestState.density * TIMBER_PER_AREA_PER_YEAR;
  const laborCost = parcel.area * forestState.density * LABOR_PER_AREA;

  forestState.cleared = true;
  forestState.age = 0;
  forestState.density = 0;

  return { timber, laborCost };
}

const REGROWTH_RATE = 0.02;
const TIMBER_PER_AREA_PER_YEAR = 0.1;
const LABOR_PER_AREA = 10;
```

### Settlement Growth (Phase 6 of tick)

```typescript
function growSettlements(state: SimulationState): SettlementChange[] {
  const changes: SettlementChange[] = [];

  for (const settlement of state.settlements.getSettlements()) {
    // Check for rank upgrade
    const newRank = calculateRank(settlement.population);
    if (newRank !== settlement.rank) {
      const oldRank = settlement.rank;
      settlement.rank = newRank;
      changes.push({
        settlementId: settlement.id,
        type: 'rank_up',
        details: { from: oldRank, to: newRank },
      });
    }

    // Check for expansion need
    const capacity = calculateCarryingCapacity(settlement, state.cadastral, state.terrain, config);
    if (settlement.population > capacity * 0.8) {
      const expanded = attemptExpansion(settlement, state);
      if (expanded) {
        changes.push({
          settlementId: settlement.id,
          type: 'expanded',
          details: { newCells: expanded.newCells },
        });
      }
    }

    // Update port status
    const wasPort = settlement.isPort;
    updatePortStatus(settlement, state.terrain);
    if (settlement.isPort && !wasPort) {
      changes.push({
        settlementId: settlement.id,
        type: 'port_detected',
        details: {},
      });
    }
  }

  return changes;
}
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| baseGrowthRate | 0.02 | 0.01-0.10 | Annual population growth rate |
| baseMortalityRate | 0.01 | 0.005-0.05 | Annual mortality rate |
| foodPerPerson | 10 | 5-20 | Food units per person per year |
| housingPerPerson | 0.02 | 0.01-0.1 | Residential parcel area per person |
| migrationRate | 0.05 | 0.01-0.20 | Fraction of excess that migrates |
| migrationDistanceDecay | 0.01 | 0.001-0.1 | Distance penalty for migration |
| minMigrationSize | 10 | 1-100 | Minimum migrants to move |
| pioneerGroupSize | 50 | 20-200 | Minimum population to found new settlement |
| minDistanceFromExisting | 100 | 50-300 | Minimum distance for new settlement |
| expansionThreshold | 0.8 | 0.5-0.95 | Capacity ratio to trigger expansion |
| forestRegrowthRate | 0.02 | 0.01-0.1 | Annual forest density regrowth |

## Tasks

### Phase 1: Aggregate Model

- [ ] Add population interfaces to `packages/shared/src/types.ts`
- [ ] Create `packages/core/src/population.ts`
- [ ] Implement `calculateCarryingCapacity()`
- [ ] Implement `updatePopulation()` with births/deaths
- [ ] Implement `processMigration()` between settlements
- [ ] Implement `processLandClaims()`
- [ ] Implement `expandSettlementTerritory()`
- [ ] Implement `growSettlements()` phase

### Forest Management

- [ ] Add `ForestState` tracking
- [ ] Implement `updateForests()` for regrowth
- [ ] Implement `clearForest()` for land conversion

### Pioneer Settlements

- [ ] Implement `findPioneerSite()` for new settlement location
- [ ] Implement `foundNewSettlement()` for settlement creation
- [ ] Integrate pioneer founding into migration

### Port Detection

- [ ] Implement `detectPort()` algorithm
- [ ] Implement `updatePortStatus()` in growth phase

### Integration

- [ ] Wire phases into SimulationEngine.tick()
- [ ] Pass PopulationConfig through WorldConfig

## Testing & Acceptance

### Unit Tests

- [ ] `calculateCarryingCapacity`: Returns expected value for known parcels
- [ ] `updatePopulation`: Population grows when below capacity
- [ ] `updatePopulation`: Population shrinks when above capacity
- [ ] `processMigration`: Migrants flow from overcrowded to underpopulated
- [ ] `findPioneerSite`: Returns valid unclaimed cell
- [ ] `detectPort`: Returns true for coastal cells with good shelter
- [ ] `clearForest`: Returns timber proportional to age × density

### Integration Tests

- [ ] Settlement expands when population exceeds 80% capacity
- [ ] Forest clearing generates timber and changes land use
- [ ] Rank upgrades at correct population thresholds
- [ ] New settlements founded when migration cannot satisfy demand
- [ ] Port status detected for coastal settlements

### Visual Validation

- [ ] Population numbers visible in settlement tooltips
- [ ] Settlement markers grow with rank
- [ ] Claimed territory expands over time
- [ ] New settlements appear over time
- [ ] Forest parcels convert to fields

## Open Questions

- **[DECIDED]** Should migration require road connection? → Path cost used, but not required
- **[DECIDED]** How to handle settlement founding? → Pioneer multi-stage process
- **[OPEN]** Should carrying capacity include trade-imported food?
- **[OPEN]** Age demographics - track young/working/old for labor force?
- **[OPEN]** How to name generated settlements?
