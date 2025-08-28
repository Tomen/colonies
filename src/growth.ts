import { Settlement, Point } from './types.js';

export class GrowthManager {
  private settlements: Map<string, Settlement> = new Map();

  public addSettlement(settlement: Settlement): void {
    this.settlements.set(settlement.id, settlement);
  }

  public getSettlements(): Settlement[] {
    return Array.from(this.settlements.values());
  }

  public updatePopulation(settlementId: string, newPopulation: number): void {
    const settlement = this.settlements.get(settlementId);
    if (settlement) {
      settlement.population = newPopulation;
      settlement.rank = this.calculateRank(newPopulation);
    }
  }

  public generateParcels(_center: Point): void {
    // Stub implementation
  }

  private calculateRank(population: number): Settlement['rank'] {
    if (population < 100) return 'hamlet';
    if (population < 1000) return 'village';
    if (population < 5000) return 'town';
    return 'city';
  }
}