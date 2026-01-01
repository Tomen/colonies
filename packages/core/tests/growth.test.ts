import { describe, it, expect } from 'vitest';
import { GrowthManager } from '../src/growth.js';
import type { Settlement } from '@colonies/shared';

describe('GrowthManager', () => {
  it('should create a GrowthManager instance', () => {
    const manager = new GrowthManager();
    expect(manager).toBeDefined();
  });

  it('should add and retrieve settlements', () => {
    const manager = new GrowthManager();
    const settlement: Settlement = {
      id: 'test-settlement',
      position: { x: 50, y: 50 },
      population: 100,
      rank: 'hamlet',
      isPort: false,
    };

    manager.addSettlement(settlement);
    const settlements = manager.getSettlements();

    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toEqual(settlement);
  });

  it('should update settlement population and rank', () => {
    const manager = new GrowthManager();
    const settlement: Settlement = {
      id: 'test-settlement',
      position: { x: 50, y: 50 },
      population: 50,
      rank: 'hamlet',
      isPort: false,
    };

    manager.addSettlement(settlement);
    manager.updatePopulation('test-settlement', 600);

    const settlements = manager.getSettlements();
    expect(settlements[0].population).toBe(600);
    expect(settlements[0].rank).toBe('village');
  });
});
