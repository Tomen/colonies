# Milestone 6: Economy, Production, and Trade

Resource production, consumption, industry siting, and trade routing.

## Overview

This milestone implements the economic layer: parcels produce resources, settlements consume them, and trade routes emerge from accumulated traffic. Industries spawn where inputs and power are available.

**Dependencies:** M3 Network Layer, M4 Simulation Engine, M5 Agent Model

**Provides:** Resource production, trade routing, industry siting

## Key Decisions

| Question | Answer |
|----------|--------|
| Resource model | Storage + spoilage |
| Trade model | Merchant guilds with emergent patterns |
| Information model | Settlement broadcasts (surplus/deficit) |

## Data Structures

```typescript
// packages/shared/src/types.ts

type ResourceType =
  | 'food'      // From fields, pastures
  | 'timber'    // From forests (raw logs)
  | 'lumber'    // Processed timber (sawmill)
  | 'charcoal'  // From timber (charcoal pit)
  | 'iron'      // From ironworks
  | 'textiles'  // From wool/cotton
  | 'bricks'    // From brickworks
  | 'tools';    // From smithy (iron + charcoal)

interface ResourceInventory {
  [K in ResourceType]?: number;
}

interface ResourceStorage {
  inventory: ResourceInventory;
  capacity: ResourceInventory;      // Max storage per resource
  spoilageRates: ResourceInventory; // % lost per tick
}

interface ProductionConfig {
  // Yields per area unit per year
  cropYieldPerArea: number;       // 10 - food per area from fields
  pastureYieldPerArea: number;    // 5 - food per area from pasture
  timberYieldPerArea: number;     // 2 - timber per area from forest per year of age

  // Consumption per capita per year
  foodPerCapita: number;          // 10
  timberPerCapita: number;        // 1 (heating, construction)
  toolsPerCapita: number;         // 0.1

  // Storage
  baseStorageCapacity: number;    // 100 - base storage per resource
  foodSpoilageRate: number;       // 0.05 - 5% food lost per tick

  // Industry recipes
  sawmillRatio: number;           // 2 - lumber per timber
  charcoalRatio: number;          // 0.5 - charcoal per timber
  ironworksOutput: number;        // 10 - iron per tick with water power
  brickworksOutput: number;       // 20 - bricks per tick
  smithyRatio: number;            // 1 - tools per (iron + charcoal)
}

interface ProductionResult {
  tick: number;
  settlementId: string;
  produced: ResourceInventory;
  consumed: ResourceInventory;
  spoiled: ResourceInventory;
  surplus: ResourceInventory;
  deficit: ResourceInventory;
}

interface TradeRoute {
  id: string;
  from: string;                   // Settlement ID
  to: string;                     // Settlement ID
  resource: ResourceType;
  volume: number;                 // Units per tick
  path: number[];                 // Cell IDs
  totalCost: number;              // Path cost
  guildId?: string;               // Merchant guild operating route
}

interface MerchantGuild {
  id: string;
  homeSettlement: string;
  routes: TradeRoute[];
  capital: number;                // Accumulated wealth
  reputation: number;             // Affects trade partner willingness
}

interface Industry {
  id: string;
  type: IndustryType;
  settlementId: string;
  parcelId: string;
  position: Point;
  capacity: number;               // Production capacity
  active: boolean;
  lastProduction: ResourceInventory;
}

type IndustryType =
  | 'sawmill'      // timber → lumber (needs water power)
  | 'charcoal_pit' // timber → charcoal
  | 'ironworks'    // ore + charcoal → iron (needs water power)
  | 'brickworks'   // clay → bricks
  | 'smithy'       // iron + charcoal → tools
  | 'shipyard'     // lumber → ships (needs port)
  | 'mill';        // grain → flour (needs water power)

interface IndustrySiteScore {
  cellId: number;
  type: IndustryType;
  score: number;
  factors: {
    waterPower: number;
    inputAccess: number;
    marketAccess: number;
    existingInfrastructure: number;
  };
}
```

## Algorithms

### Resource Production (Phase 4)

```typescript
function produceResources(
  state: SimulationState,
  seasonMods: SeasonalModifiers,
  config: ProductionConfig
): ProductionResult[] {
  const results: ProductionResult[] = [];

  for (const settlement of state.settlements.getSettlements()) {
    const produced: ResourceInventory = {};
    const consumed: ResourceInventory = {};
    const spoiled: ResourceInventory = {};

    // Agricultural production
    const parcels = state.cadastral.getParcelsForSettlement(settlement.id);
    for (const parcel of parcels) {
      const cell = state.terrain.cells[parcel.terrainCellId];
      const fertility = cell.moisture * (1 - cell.elevation / state.terrain.maxElevation);

      switch (parcel.landUse) {
        case 'field':
          const cropYield = parcel.area * fertility * config.cropYieldPerArea * seasonMods.cropYieldMultiplier;
          produced.food = (produced.food || 0) + cropYield / 12;
          break;

        case 'pasture':
          const pastureYield = parcel.area * fertility * config.pastureYieldPerArea * 0.5;
          produced.food = (produced.food || 0) + pastureYield / 12;
          break;

        case 'forest':
          const forestState = state.forestAge.get(parcel.terrainCellId);
          if (forestState && !forestState.cleared) {
            const timberYield = parcel.area * forestState.age * forestState.density * config.timberYieldPerArea;
            produced.timber = (produced.timber || 0) + timberYield / 12;
          }
          break;
      }
    }

    // Industry production
    const industries = state.industries.getForSettlement(settlement.id);
    for (const industry of industries) {
      if (!industry.active) continue;
      const output = produceFromIndustry(industry, state, config);
      mergeInventory(produced, output);
    }

    // Consumption
    const pop = settlement.population;
    consumed.food = pop * config.foodPerCapita / 12;
    consumed.timber = pop * config.timberPerCapita / 12;
    consumed.tools = pop * config.toolsPerCapita / 12;

    // Apply spoilage
    const storage = state.storage.get(settlement.id);
    if (storage) {
      for (const [resource, rate] of Object.entries(config.spoilageRates || {})) {
        const amount = storage.inventory[resource as ResourceType] || 0;
        const loss = amount * rate;
        spoiled[resource as ResourceType] = loss;
        storage.inventory[resource as ResourceType] = amount - loss;
      }
    }

    // Calculate surplus/deficit
    const surplus: ResourceInventory = {};
    const deficit: ResourceInventory = {};

    for (const resource of Object.keys({ ...produced, ...consumed }) as ResourceType[]) {
      const prod = produced[resource] || 0;
      const cons = consumed[resource] || 0;
      const net = prod - cons;

      if (net > 0) surplus[resource] = net;
      if (net < 0) deficit[resource] = Math.abs(net);
    }

    // Store inventory (respect capacity)
    updateStorage(settlement.id, surplus, state, config);

    results.push({
      tick: state.tick,
      settlementId: settlement.id,
      produced,
      consumed,
      spoiled,
      surplus,
      deficit,
    });
  }

  return results;
}

function updateStorage(
  settlementId: string,
  surplus: ResourceInventory,
  state: SimulationState,
  config: ProductionConfig
): void {
  const storage = state.storage.get(settlementId) || {
    inventory: {},
    capacity: createDefaultCapacity(config),
    spoilageRates: { food: config.foodSpoilageRate },
  };

  for (const [resource, amount] of Object.entries(surplus)) {
    const current = storage.inventory[resource as ResourceType] || 0;
    const capacity = storage.capacity[resource as ResourceType] || config.baseStorageCapacity;
    storage.inventory[resource as ResourceType] = Math.min(current + amount, capacity);
  }

  state.storage.set(settlementId, storage);
}
```

### Industry Production

```typescript
function produceFromIndustry(
  industry: Industry,
  state: SimulationState,
  config: ProductionConfig
): ResourceInventory {
  const storage = state.storage.get(industry.settlementId);
  if (!storage) return {};

  const inventory = storage.inventory;
  const output: ResourceInventory = {};

  switch (industry.type) {
    case 'sawmill':
      if (hasWaterPower(industry, state) && (inventory.timber || 0) > 0) {
        const timberUsed = Math.min(inventory.timber || 0, industry.capacity);
        output.lumber = timberUsed * config.sawmillRatio;
        inventory.timber = (inventory.timber || 0) - timberUsed;
      }
      break;

    case 'charcoal_pit':
      if ((inventory.timber || 0) > 0) {
        const timberUsed = Math.min(inventory.timber || 0, industry.capacity);
        output.charcoal = timberUsed * config.charcoalRatio;
        inventory.timber = (inventory.timber || 0) - timberUsed;
      }
      break;

    case 'ironworks':
      if (hasWaterPower(industry, state) && (inventory.charcoal || 0) > 0) {
        const charcoalUsed = Math.min(inventory.charcoal || 0, industry.capacity);
        output.iron = charcoalUsed * config.ironworksOutput / industry.capacity;
        inventory.charcoal = (inventory.charcoal || 0) - charcoalUsed;
      }
      break;

    case 'smithy':
      const ironAvail = inventory.iron || 0;
      const charcoalAvail = inventory.charcoal || 0;
      const craftable = Math.min(ironAvail, charcoalAvail, industry.capacity);
      if (craftable > 0) {
        output.tools = craftable * config.smithyRatio;
        inventory.iron = ironAvail - craftable;
        inventory.charcoal = charcoalAvail - craftable;
      }
      break;

    case 'brickworks':
      if (hasClayDeposit(industry, state)) {
        output.bricks = config.brickworksOutput;
      }
      break;

    case 'mill':
      if (hasWaterPower(industry, state) && (inventory.food || 0) > 0) {
        const processed = Math.min(inventory.food || 0, industry.capacity);
        output.food = processed * 1.2; // 20% efficiency gain
        inventory.food = (inventory.food || 0) - processed;
      }
      break;
  }

  return output;
}

function hasWaterPower(industry: Industry, state: SimulationState): boolean {
  const cell = state.terrain.cells[industry.parcelId];
  return cell.flowAccumulation > 100 && cell.elevation > 10;
}

function hasClayDeposit(industry: Industry, state: SimulationState): boolean {
  const cell = state.terrain.cells[industry.parcelId];
  return cell.moisture > 0.6 && cell.elevation < 50;
}
```

### Trade Routing (Phase 5)

```typescript
function routeTrade(state: SimulationState): TradeRoute[] {
  const routes: TradeRoute[] = [];

  // Settlements broadcast surplus/deficit
  const broadcasts = collectBroadcasts(state);

  // Merchant guilds evaluate opportunities
  for (const guild of state.guilds.values()) {
    const newRoutes = evaluateTradeOpportunities(guild, broadcasts, state);
    routes.push(...newRoutes);
  }

  // Execute routes and accumulate network usage
  for (const route of routes) {
    executeTradeRoute(route, state);
  }

  return routes;
}

function collectBroadcasts(state: SimulationState): Map<string, {
  surplus: ResourceInventory;
  deficit: ResourceInventory;
}> {
  const broadcasts = new Map();

  for (const settlement of state.settlements.getSettlements()) {
    const storage = state.storage.get(settlement.id);
    if (!storage) continue;

    const pop = settlement.population;
    const surplus: ResourceInventory = {};
    const deficit: ResourceInventory = {};

    for (const resource of ['food', 'timber', 'tools'] as ResourceType[]) {
      const need = getResourceNeed(resource, pop);
      const have = storage.inventory[resource] || 0;

      if (have > need * 1.2) {
        surplus[resource] = have - need;
      } else if (have < need * 0.8) {
        deficit[resource] = need - have;
      }
    }

    broadcasts.set(settlement.id, { surplus, deficit });
  }

  return broadcasts;
}

function evaluateTradeOpportunities(
  guild: MerchantGuild,
  broadcasts: Map<string, { surplus: ResourceInventory; deficit: ResourceInventory }>,
  state: SimulationState
): TradeRoute[] {
  const routes: TradeRoute[] = [];
  const home = state.settlements.getById(guild.homeSettlement);

  // Find profitable routes from home settlement
  const homeBroadcast = broadcasts.get(guild.homeSettlement);
  if (!homeBroadcast) return routes;

  for (const [resource, available] of Object.entries(homeBroadcast.surplus) as [ResourceType, number][]) {
    // Find nearest settlement with deficit
    let bestDest: { id: string; path: PathResult; demand: number; profit: number } | null = null;

    for (const [destId, destBroadcast] of broadcasts) {
      if (destId === guild.homeSettlement) continue;
      const demand = destBroadcast.deficit[resource] || 0;
      if (demand === 0) continue;

      const dest = state.settlements.getById(destId);
      const path = state.network.findPath(home.cellId, dest.cellId);

      if (path.success) {
        // Calculate profit (simplified: demand - transport cost)
        const profit = demand - path.totalCost * 0.1;
        if (profit > 0 && (!bestDest || profit > bestDest.profit)) {
          bestDest = { id: destId, path, demand, profit };
        }
      }
    }

    if (bestDest) {
      const volume = Math.min(available, bestDest.demand, guild.capital * 10);

      routes.push({
        id: `trade-${state.tick}-${guild.homeSettlement}-${bestDest.id}-${resource}`,
        from: guild.homeSettlement,
        to: bestDest.id,
        resource,
        volume,
        path: bestDest.path.path,
        totalCost: bestDest.path.totalCost,
        guildId: guild.id,
      });
    }
  }

  return routes;
}

function executeTradeRoute(route: TradeRoute, state: SimulationState): void {
  const sourceStorage = state.storage.get(route.from);
  const destStorage = state.storage.get(route.to);

  if (!sourceStorage || !destStorage) return;

  // Transfer resources
  sourceStorage.inventory[route.resource] = (sourceStorage.inventory[route.resource] || 0) - route.volume;
  destStorage.inventory[route.resource] = (destStorage.inventory[route.resource] || 0) + route.volume;

  // Record network usage (drives road upgrades)
  state.network.recordUsage({ path: route.path, edges: [] }, route.volume);

  // Update guild capital
  const guild = state.guilds.get(route.guildId);
  if (guild) {
    guild.capital += route.volume * 0.1; // 10% profit margin
  }
}
```

### Industry Siting

```typescript
function scoreIndustrySite(
  cellId: number,
  type: IndustryType,
  state: SimulationState
): IndustrySiteScore {
  const cell = state.terrain.cells[cellId];
  const factors = {
    waterPower: 0,
    inputAccess: 0,
    marketAccess: 0,
    existingInfrastructure: 0,
  };

  // Water power (for mills, sawmills, ironworks)
  if (['sawmill', 'ironworks', 'mill'].includes(type)) {
    if (cell.flowAccumulation > 100) {
      const downstream = state.terrain.cells[cell.flowsTo ?? -1];
      const drop = downstream ? cell.elevation - downstream.elevation : 0;
      factors.waterPower = Math.min(1, drop / 10) * (cell.flowAccumulation / 200);
    }
  }

  // Input access (nearby resources)
  switch (type) {
    case 'sawmill':
    case 'charcoal_pit':
      const forestCells = cell.neighbors.filter(n => {
        const parcel = state.cadastral.getParcelsInCell(n)[0];
        return parcel?.landUse === 'forest';
      });
      factors.inputAccess = Math.min(1, forestCells.length / 3);
      break;

    case 'brickworks':
      factors.inputAccess = cell.moisture > 0.6 && cell.elevation < 50 ? 1 : 0;
      break;

    case 'shipyard':
      factors.inputAccess = cell.isCoast ? 1 : 0;
      break;
  }

  // Market access (roads to settlements)
  const nearbySettlements = state.settlements.getSettlements().filter(s =>
    euclideanDistance(cell.centroid, s.position) < 200
  );
  factors.marketAccess = Math.min(1, nearbySettlements.length / 2);

  // Existing infrastructure
  const roads = state.network.getEdgesForCell(cellId).filter(e => e.type !== 'none');
  factors.existingInfrastructure = Math.min(1, roads.length / 4);

  // Weighted score
  const weights = {
    waterPower: ['sawmill', 'ironworks', 'mill'].includes(type) ? 0.4 : 0,
    inputAccess: 0.3,
    marketAccess: 0.2,
    existingInfrastructure: 0.1,
  };

  const score = Object.entries(factors).reduce(
    (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
    0
  );

  return { cellId, type, score, factors };
}

function spawnIndustries(state: SimulationState): Industry[] {
  const spawned: Industry[] = [];

  for (const settlement of state.settlements.getSettlements()) {
    // Only towns and cities spawn industries
    if (settlement.rank === 'hamlet' || settlement.rank === 'village') continue;

    const storage = state.storage.get(settlement.id);
    if (!storage) continue;

    const inventory = storage.inventory;

    // Need sawmill if timber surplus but lumber deficit
    if ((inventory.timber || 0) > 10 && (inventory.lumber || 0) < 5) {
      const site = findBestSite('sawmill', settlement, state);
      if (site && site.score > 0.5) {
        spawned.push(createIndustry('sawmill', site.cellId, settlement.id, state));
      }
    }

    // Need smithy if iron surplus but tools deficit
    if ((inventory.iron || 0) > 5 && (inventory.tools || 0) < 1) {
      const site = findBestSite('smithy', settlement, state);
      if (site && site.score > 0.3) {
        spawned.push(createIndustry('smithy', site.cellId, settlement.id, state));
      }
    }
  }

  return spawned;
}
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| cropYieldPerArea | 10 | 5-20 | Food per area from fields (annual) |
| pastureYieldPerArea | 5 | 2-10 | Food per area from pasture (annual) |
| timberYieldPerArea | 2 | 1-5 | Timber per area from forest per year of age |
| foodPerCapita | 10 | 5-20 | Food units per person per year |
| timberPerCapita | 1 | 0.5-3 | Timber per person per year |
| toolsPerCapita | 0.1 | 0.05-0.5 | Tools per person per year |
| baseStorageCapacity | 100 | 50-500 | Base storage per resource type |
| foodSpoilageRate | 0.05 | 0.01-0.2 | Food lost per tick |
| sawmillRatio | 2 | 1-4 | Lumber output per timber input |
| charcoalRatio | 0.5 | 0.3-1 | Charcoal output per timber input |
| ironworksOutput | 10 | 5-20 | Iron per tick at full capacity |
| brickworksOutput | 20 | 10-50 | Bricks per tick |
| smithyRatio | 1 | 0.5-2 | Tools per iron+charcoal |
| tradeRangeMultiplier | 2 | 1-5 | Max trade distance as multiple of shortest path |

## Tasks

### Core Implementation

- [ ] Add `ResourceType`, `ResourceInventory`, `ResourceStorage` to types
- [ ] Add `TradeRoute`, `MerchantGuild` to types
- [ ] Add `Industry`, `IndustryType`, `IndustrySiteScore` to types
- [ ] Create `packages/core/src/economy.ts`
- [ ] Implement `produceResources()` for agricultural production
- [ ] Implement storage with capacity and spoilage
- [ ] Implement `produceFromIndustry()` for industry output

### Trade System

- [ ] Create `packages/core/src/trade.ts`
- [ ] Implement `collectBroadcasts()` for surplus/deficit
- [ ] Implement `MerchantGuild` class
- [ ] Implement `evaluateTradeOpportunities()`
- [ ] Implement `executeTradeRoute()`
- [ ] Wire usage accumulation to network

### Industry System

- [ ] Create `packages/core/src/industries.ts`
- [ ] Implement `scoreIndustrySite()` for site selection
- [ ] Implement `spawnIndustries()` for automatic creation
- [ ] Implement industry-specific production logic

### Integration

- [ ] Wire `produceResources()` and `routeTrade()` into SimulationEngine
- [ ] Store resources per settlement in state
- [ ] Emit trade events for visualization

## Testing & Acceptance

### Unit Tests

- [ ] `produceResources`: Field parcels produce food proportional to area × fertility
- [ ] `produceResources`: Consumption scales with population
- [ ] `produceResources`: Spoilage reduces food storage
- [ ] `produceFromIndustry`: Sawmill converts timber to lumber
- [ ] `scoreIndustrySite`: Water power scored correctly near rivers
- [ ] `routeTrade`: Surplus flows to deficit settlements
- [ ] `routeTrade`: Accumulates network usage
- [ ] `MerchantGuild`: Capital increases from profitable trades

### Integration Tests

- [ ] Settlements with more fields support larger populations
- [ ] Trade routes emerge between complementary settlements
- [ ] Industries spawn in suitable locations
- [ ] Road upgrades triggered by trade traffic
- [ ] Merchant guilds expand to multiple routes

### Visual Validation

- [ ] Trade routes visible as animated lines
- [ ] Industry icons appear at production sites
- [ ] Resource flow indicators in settlement panels

## Open Questions

- **[DECIDED]** Should resources have storage limits? → Yes, with spoilage
- **[DECIDED]** How to handle trade patterns? → Merchant guilds with emergent routes
- **[OPEN]** How to handle resource prices (market vs fixed)?
- **[OPEN]** Should trade routes be persistent or recalculated each tick?
- **[OPEN]** How to represent ore deposits (terrain attribute or random)?
- **[OPEN]** Should industries have construction cost/time?
