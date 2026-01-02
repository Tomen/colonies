import { describe, it, expect, beforeEach } from 'vitest';
import { SettlementManager } from '../src/settlements.js';
import { CadastralManager } from '../src/cadastral.js';
import { SeededRNG } from '../src/rng.js';
import { VoronoiWorldGenerator } from '../src/voronoi-worldgen.js';
import { DEFAULT_CONFIG } from '@colonies/shared';
import type { VoronoiTerrainData } from '@colonies/shared';

describe('SettlementManager', () => {
  describe('with Voronoi terrain', () => {
    let terrain: VoronoiTerrainData;
    let cadastral: CadastralManager;
    let settlementManager: SettlementManager;

    beforeEach(() => {
      const config = {
        ...DEFAULT_CONFIG,
        voronoiCellCount: 500, // Small for faster tests
        seed: 12345,
      };
      const generator = new VoronoiWorldGenerator(config);
      terrain = generator.generateTerrain() as VoronoiTerrainData;

      const rng = new SeededRNG(config.seed);
      cadastral = new CadastralManager(terrain, rng);
      settlementManager = new SettlementManager(cadastral, rng);
    });

    it('seeds the requested number of settlements', () => {
      const settlements = settlementManager.seedSettlements(3);
      expect(settlements.length).toBe(3);
    });

    it('gives settlements unique IDs', () => {
      const settlements = settlementManager.seedSettlements(5);
      const ids = settlements.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('gives settlements unique names', () => {
      const settlements = settlementManager.seedSettlements(5);
      const names = settlements.map((s) => s.name);
      // Names may occasionally collide, but should be mostly unique
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBeGreaterThanOrEqual(3);
    });

    it('places settlements on land cells', () => {
      const settlements = settlementManager.seedSettlements(3);
      for (const settlement of settlements) {
        expect(cadastral.isLandCell(settlement.cellId)).toBe(true);
      }
    });

    it('claims cells for each settlement', () => {
      const settlements = settlementManager.seedSettlements(3);
      for (const settlement of settlements) {
        expect(settlement.claimedCells.length).toBeGreaterThan(0);
        expect(settlement.claimedCells).toContain(settlement.cellId);
      }
    });

    it('creates parcels in claimed cells', () => {
      const settlements = settlementManager.seedSettlements(2);
      for (const settlement of settlements) {
        for (const cellId of settlement.claimedCells) {
          const parcels = cadastral.getParcelsInCell(cellId);
          expect(parcels.length).toBeGreaterThan(0);
        }
      }
    });

    it('assigns land uses to parcels', () => {
      const settlements = settlementManager.seedSettlements(1);
      const settlement = settlements[0];

      // Core cell should have residential parcels
      const coreParcels = cadastral.getParcelsInCell(settlement.cellId);
      const residentialCount = coreParcels.filter(
        (p) => p.landUse === 'residential'
      ).length;
      expect(residentialCount).toBeGreaterThan(0);
    });

    it('spaces settlements apart', () => {
      const settlements = settlementManager.seedSettlements(5);

      // Check minimum spacing between all pairs
      for (let i = 0; i < settlements.length; i++) {
        for (let j = i + 1; j < settlements.length; j++) {
          const dx = settlements[i].position.x - settlements[j].position.x;
          const dy = settlements[i].position.y - settlements[j].position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Default minSpacing is 100
          expect(dist).toBeGreaterThanOrEqual(100);
        }
      }
    });

    it('respects custom spacing configuration', () => {
      const rng = new SeededRNG(12345);
      const customManager = new SettlementManager(cadastral, rng, {
        minSpacing: 200,
      });

      const settlements = customManager.seedSettlements(3);

      for (let i = 0; i < settlements.length; i++) {
        for (let j = i + 1; j < settlements.length; j++) {
          const dx = settlements[i].position.x - settlements[j].position.x;
          const dy = settlements[i].position.y - settlements[j].position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          expect(dist).toBeGreaterThanOrEqual(200);
        }
      }
    });

    it('returns fewer settlements if spacing prevents requested count', () => {
      const rng = new SeededRNG(12345);
      const tightManager = new SettlementManager(cadastral, rng, {
        minSpacing: 500, // Very large spacing
      });

      // With very large spacing on small terrain, may not fit all settlements
      const settlements = tightManager.seedSettlements(20);
      expect(settlements.length).toBeLessThanOrEqual(20);
    });

    it('initializes settlements with correct rank based on population', () => {
      const settlements = settlementManager.seedSettlements(1);
      const settlement = settlements[0];

      // Default initial population is 50, which is hamlet rank
      expect(settlement.population).toBe(50);
      expect(settlement.rank).toBe('hamlet');
    });

    it('can expand an existing settlement', () => {
      const settlements = settlementManager.seedSettlements(1);
      const settlement = settlements[0];
      const initialCellCount = settlement.claimedCells.length;

      settlementManager.expandSettlement(settlement.id, 1);

      expect(settlement.claimedCells.length).toBeGreaterThan(initialCellCount);
    });

    it('can update settlement population', () => {
      const settlements = settlementManager.seedSettlements(1);
      const settlement = settlements[0];

      settlementManager.updatePopulation(settlement.id, 500);

      expect(settlement.population).toBe(500);
      expect(settlement.rank).toBe('village');
    });

    it('is deterministic with same seed', () => {
      const config = {
        ...DEFAULT_CONFIG,
        voronoiCellCount: 500,
        seed: 99999,
      };
      const generator1 = new VoronoiWorldGenerator(config);
      const terrain1 = generator1.generateTerrain() as VoronoiTerrainData;
      const rng1 = new SeededRNG(config.seed);
      const cadastral1 = new CadastralManager(terrain1, rng1);
      const manager1 = new SettlementManager(cadastral1, rng1);
      const settlements1 = manager1.seedSettlements(3);

      const generator2 = new VoronoiWorldGenerator(config);
      const terrain2 = generator2.generateTerrain() as VoronoiTerrainData;
      const rng2 = new SeededRNG(config.seed);
      const cadastral2 = new CadastralManager(terrain2, rng2);
      const manager2 = new SettlementManager(cadastral2, rng2);
      const settlements2 = manager2.seedSettlements(3);

      expect(settlements1.map((s) => s.name)).toEqual(
        settlements2.map((s) => s.name)
      );
      expect(settlements1.map((s) => s.cellId)).toEqual(
        settlements2.map((s) => s.cellId)
      );
    });
  });

  describe('edge cases', () => {
    it('handles zero settlement count', () => {
      const config = {
        ...DEFAULT_CONFIG,
        voronoiCellCount: 100,
        seed: 12345,
      };
      const generator = new VoronoiWorldGenerator(config);
      const terrain = generator.generateTerrain() as VoronoiTerrainData;
      const rng = new SeededRNG(config.seed);
      const cadastral = new CadastralManager(terrain, rng);
      const manager = new SettlementManager(cadastral, rng);

      const settlements = manager.seedSettlements(0);
      expect(settlements).toEqual([]);
    });

    it('getSettlement returns null for unknown ID', () => {
      const config = {
        ...DEFAULT_CONFIG,
        voronoiCellCount: 100,
        seed: 12345,
      };
      const generator = new VoronoiWorldGenerator(config);
      const terrain = generator.generateTerrain() as VoronoiTerrainData;
      const rng = new SeededRNG(config.seed);
      const cadastral = new CadastralManager(terrain, rng);
      const manager = new SettlementManager(cadastral, rng);

      expect(manager.getSettlement('nonexistent')).toBeNull();
    });

    it('getSettlements returns empty array when none created', () => {
      const config = {
        ...DEFAULT_CONFIG,
        voronoiCellCount: 100,
        seed: 12345,
      };
      const generator = new VoronoiWorldGenerator(config);
      const terrain = generator.generateTerrain() as VoronoiTerrainData;
      const rng = new SeededRNG(config.seed);
      const cadastral = new CadastralManager(terrain, rng);
      const manager = new SettlementManager(cadastral, rng);

      expect(manager.getSettlements()).toEqual([]);
    });
  });
});
