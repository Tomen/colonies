# Milestone 6: Agents & Governance

Individual agent-based simulation with explicit persons, households, and companies.

## Overview

This milestone extends the aggregate population model (M4) to individual agents. Instead of tracking population as numbers, we simulate discrete persons with traits, household membership, and employment.

**Dependencies:** M4 Settlements, M5 Economy

**Provides:** Individual decision-making, household formation, company creation

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

## Data Structures

```typescript
interface Person {
  id: string;
  householdId: string;
  age: number;
  traits: PersonTraits;
  occupation: string | null;
  employerId: string | null;  // Company ID
}

interface PersonTraits {
  health: number;           // 0-1, affects mortality
  ambition: number;         // 0-1, affects migration willingness
  skill: number;            // 0-1, affects productivity
}

interface Household {
  id: string;
  settlementId: string;
  members: string[];        // Person IDs
  head: string;             // Person ID
  parcelId: string | null;  // Owned property
  savings: number;          // Accumulated wealth
}

interface Company {
  id: string;
  type: IndustryType;
  settlementId: string;
  parcelId: string;
  owner: string;            // Household ID
  employees: string[];      // Person IDs
  capital: number;
  capacity: number;
}
```

## Algorithms

### Household Formation

```typescript
function formHousehold(
  person: Person,
  spouse: Person | null,
  state: SimulationState
): Household {
  const household: Household = {
    id: generateId(),
    settlementId: person.settlement,
    members: spouse ? [person.id, spouse.id] : [person.id],
    head: person.id,
    parcelId: null,
    savings: 0,
  };

  // Assign persons to household
  person.householdId = household.id;
  if (spouse) spouse.householdId = household.id;

  // Try to acquire property
  const parcel = findAvailableParcel(household.settlementId, state);
  if (parcel) {
    household.parcelId = parcel.id;
    parcel.owner = household.id;
  }

  return household;
}
```

### Individual Migration Decision

```typescript
function considerMigration(
  household: Household,
  state: SimulationState,
  config: AgentConfig
): MigrationDecision | null {
  const head = state.persons.get(household.head);
  if (!head) return null;

  // Factors affecting migration
  const currentQuality = assessSettlementQuality(household.settlementId, state);
  const opportunities = findBetterOpportunities(household, state);

  // Ambition affects willingness to move
  const threshold = (1 - head.traits.ambition) * config.migrationThreshold;

  for (const opportunity of opportunities) {
    const improvement = opportunity.quality - currentQuality;
    if (improvement > threshold) {
      return {
        household,
        destination: opportunity.settlementId,
        reason: opportunity.reason,
      };
    }
  }

  return null;
}
```

### Company Formation

```typescript
function considerStartingBusiness(
  household: Household,
  state: SimulationState,
  config: AgentConfig
): Company | null {
  // Need minimum savings
  if (household.savings < config.minBusinessCapital) return null;

  // Need suitable site
  const site = findBusinessSite(household.settlementId, state);
  if (!site) return null;

  // Head must have sufficient skill
  const head = state.persons.get(household.head);
  if (!head || head.traits.skill < config.minBusinessSkill) return null;

  return createCompany(household, site, state);
}
```

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| avgHouseholdSize | 5 | Average persons per household |
| marriageAge | 18 | Minimum age for household formation |
| retirementAge | 60 | Age when productivity declines |
| migrationThreshold | 0.3 | Quality improvement needed to migrate |
| minBusinessCapital | 100 | Savings needed to start company |
| minBusinessSkill | 0.6 | Skill needed to run business |

## Tasks

### Phase 1: Individual Persons

- [ ] Add Person, PersonTraits interfaces to types.ts
- [ ] Create person generation from aggregate population
- [ ] Implement age-based mortality
- [ ] Implement trait inheritance for births

### Phase 2: Households

- [ ] Add Household interface to types.ts
- [ ] Implement household formation (marriage)
- [ ] Implement household dissolution (death of head)
- [ ] Implement property ownership

### Phase 3: Companies

- [ ] Add Company interface to types.ts
- [ ] Implement company creation
- [ ] Implement employment assignment
- [ ] Link company production to M5 economy

### Phase 4: Individual Decisions

- [ ] Implement individual migration decisions
- [ ] Implement business formation decisions
- [ ] Implement occupation choices

## Testing & Acceptance

### Unit Tests

- [ ] Person generation creates valid traits
- [ ] Household formation links members correctly
- [ ] Migration decision respects ambition threshold
- [ ] Company creation requires sufficient capital

### Integration Tests

- [ ] Population of individuals matches aggregate count
- [ ] Households form and dissolve over time
- [ ] Companies hire and fire employees
- [ ] Individual migrations aggregate to population flows

## Open Questions

- **[OPEN]** Should persons have names? (affects memory/performance)
- **[OPEN]** How detailed should occupation system be?
- **[OPEN]** Should companies have bankruptcy/failure mechanics?
- **[OPEN]** How to handle governance (laws, taxes, elections)?
