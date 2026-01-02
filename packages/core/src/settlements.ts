/**
 * Settlement manager - handles village/town creation and expansion.
 *
 * Settlements are created by:
 * 1. Selecting random land cells (spaced apart)
 * 2. Claiming cells via CadastralManager
 * 3. Subdividing cells into parcels
 * 4. Assigning land uses (residential, field, etc.)
 */

import type { Settlement, Point, LandUse, Parcel } from '@colonies/shared';
import { SeededRNG } from './rng.js';
import { CadastralManager } from './cadastral.js';

// Village naming - simple procedural names
const NAME_PREFIXES = [
  'Green',
  'Oak',
  'River',
  'Mill',
  'Stone',
  'High',
  'New',
  'East',
  'West',
  'North',
  'South',
  'Red',
  'White',
  'Black',
  'Long',
  'Broad',
];

const NAME_SUFFIXES = [
  'ville',
  'ton',
  'bury',
  'ford',
  'field',
  'wood',
  'dale',
  'haven',
  'port',
  'bridge',
  'hill',
  'vale',
  'creek',
  'springs',
  'landing',
  'hollow',
];

/**
 * Configuration for settlement creation.
 */
interface SettlementConfig {
  /** Minimum distance between settlement centers */
  minSpacing: number;
  /** Initial population for new settlements */
  initialPopulation: number;
  /** Number of rings of cells to claim around core */
  expansionRings: number;
}

const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  minSpacing: 100, // 100 units minimum between villages
  initialPopulation: 50,
  expansionRings: 1, // Core + 1 ring of surrounding cells
};

/**
 * Manages settlement creation and expansion.
 */
export class SettlementManager {
  private cadastral: CadastralManager;
  private rng: SeededRNG;
  private settlements: Map<string, Settlement> = new Map();
  private nextSettlementId = 1;
  private config: SettlementConfig;

  constructor(
    cadastral: CadastralManager,
    rng: SeededRNG,
    config: Partial<SettlementConfig> = {}
  ) {
    this.cadastral = cadastral;
    this.rng = rng;
    this.config = { ...DEFAULT_SETTLEMENT_CONFIG, ...config };
  }

  /**
   * Generate a procedural village name.
   */
  private generateName(): string {
    const prefix = NAME_PREFIXES[this.rng.nextInt(0, NAME_PREFIXES.length - 1)];
    const suffix = NAME_SUFFIXES[this.rng.nextInt(0, NAME_SUFFIXES.length - 1)];
    return `${prefix}${suffix}`;
  }

  /**
   * Calculate rank based on population.
   */
  private calculateRank(population: number): Settlement['rank'] {
    if (population < 100) return 'hamlet';
    if (population < 1000) return 'village';
    if (population < 5000) return 'town';
    return 'city';
  }

  /**
   * Seed N settlements at random land cells with minimum spacing.
   */
  seedSettlements(count: number): Settlement[] {
    const landCells = this.cadastral.getLandCells();
    if (landCells.length === 0 || count <= 0) {
      return [];
    }

    // Select cells with minimum spacing
    const selectedCells = this.selectSpacedCells(landCells, count);

    // Create settlement at each selected cell
    const settlements: Settlement[] = [];
    for (const cellId of selectedCells) {
      const settlement = this.createSettlement(cellId);
      if (settlement) {
        settlements.push(settlement);
      }
    }

    return settlements;
  }

  /**
   * Select N cells from candidates with minimum spacing between them.
   */
  private selectSpacedCells(candidates: number[], count: number): number[] {
    if (candidates.length === 0) return [];

    // Shuffle candidates
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selected: number[] = [];
    const selectedCenters: Point[] = [];

    for (const cellId of shuffled) {
      if (selected.length >= count) break;

      const center = this.cadastral.getCellCenter(cellId);

      // Check spacing from already selected cells
      let tooClose = false;
      for (const existing of selectedCenters) {
        const dx = center.x - existing.x;
        const dy = center.y - existing.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.config.minSpacing) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        selected.push(cellId);
        selectedCenters.push(center);
      }
    }

    return selected;
  }

  /**
   * Create a settlement at a terrain cell.
   */
  createSettlement(cellId: number): Settlement | null {
    if (!this.cadastral.isLandCell(cellId)) {
      return null;
    }

    const center = this.cadastral.getCellCenter(cellId);
    const id = `s${this.nextSettlementId++}`;
    const name = this.generateName();

    // Collect cells to claim (core + rings)
    const claimedCells = this.collectCellsToExpansionRing(
      cellId,
      this.config.expansionRings
    );

    // Subdivide all claimed cells into parcels
    const parcels = this.cadastral.subdivideCells(claimedCells);

    // Assign land uses
    this.assignLandUses(cellId, claimedCells, parcels);

    const settlement: Settlement = {
      id,
      name,
      position: center,
      cellId,
      population: this.config.initialPopulation,
      rank: this.calculateRank(this.config.initialPopulation),
      isPort: false, // TODO: detect coastal cells
      claimedCells,
    };

    this.settlements.set(id, settlement);
    return settlement;
  }

  /**
   * Collect cells up to N rings out from center.
   */
  private collectCellsToExpansionRing(
    centerCellId: number,
    rings: number
  ): number[] {
    const collected = new Set<number>([centerCellId]);
    let frontier = [centerCellId];

    for (let ring = 0; ring < rings; ring++) {
      const nextFrontier: number[] = [];

      for (const cellId of frontier) {
        const neighbors = this.cadastral.getNeighborCells(cellId);
        for (const neighborId of neighbors) {
          if (!collected.has(neighborId) && this.cadastral.isLandCell(neighborId)) {
            collected.add(neighborId);
            nextFrontier.push(neighborId);
          }
        }
      }

      frontier = nextFrontier;
    }

    return Array.from(collected);
  }

  /**
   * Assign land uses to parcels based on distance from settlement center.
   */
  private assignLandUses(
    coreCellId: number,
    claimedCells: number[],
    parcels: Parcel[]
  ): void {
    const coreCenter = this.cadastral.getCellCenter(coreCellId);

    for (const parcel of parcels) {
      const isCore = parcel.terrainCellId === coreCellId;

      // Distance from settlement center
      const dx = parcel.centroid.x - coreCenter.x;
      const dy = parcel.centroid.y - coreCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let landUse: LandUse;

      if (isCore) {
        // Core cell: mostly residential
        landUse = 'residential';
      } else if (distance < 50) {
        // Inner ring: mix of residential and commercial
        landUse = this.rng.next() < 0.3 ? 'commercial' : 'residential';
      } else {
        // Outer rings: agricultural
        landUse = this.rng.next() < 0.7 ? 'field' : 'pasture';
      }

      this.cadastral.setLandUse(parcel.id, landUse);
    }
  }

  /**
   * Get all settlements.
   */
  getSettlements(): Settlement[] {
    return Array.from(this.settlements.values());
  }

  /**
   * Get a settlement by ID.
   */
  getSettlement(id: string): Settlement | null {
    return this.settlements.get(id) ?? null;
  }

  /**
   * Expand an existing settlement by claiming more cells.
   */
  expandSettlement(settlementId: string, additionalRings: number = 1): void {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return;

    const currentCells = new Set(settlement.claimedCells);
    let frontier = [...settlement.claimedCells];

    for (let ring = 0; ring < additionalRings; ring++) {
      const nextFrontier: number[] = [];

      for (const cellId of frontier) {
        const neighbors = this.cadastral.getNeighborCells(cellId);
        for (const neighborId of neighbors) {
          if (!currentCells.has(neighborId) && this.cadastral.isLandCell(neighborId)) {
            currentCells.add(neighborId);
            nextFrontier.push(neighborId);

            // Subdivide and assign land use
            const parcels = this.cadastral.subdivideCell(neighborId);
            for (const parcel of parcels) {
              this.cadastral.setLandUse(parcel.id, 'field');
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    settlement.claimedCells = Array.from(currentCells);
  }

  /**
   * Update settlement population and recalculate rank.
   */
  updatePopulation(settlementId: string, newPopulation: number): void {
    const settlement = this.settlements.get(settlementId);
    if (settlement) {
      settlement.population = newPopulation;
      settlement.rank = this.calculateRank(newPopulation);
    }
  }
}
