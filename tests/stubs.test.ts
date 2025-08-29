import {
  generateTerrain,
  buildHydro,
  buildLandMesh
} from '../src/worldgen';
import {
  initNetwork,
  edgeCost,
  buildOD,
  routeFlowsAndAccumulateUsage,
  applyUpgrades
} from '../src/transport';
import {
  updateLandUse,
  updateSettlements,
  updateIndustries
} from '../src/growth';
import { renderFrame } from '../src/render';
import { captureIfDue } from '../src/export_gif';

test('stub functions exist', () => {
  expect(typeof generateTerrain).toBe('function');
  expect(typeof buildHydro).toBe('function');
  expect(typeof buildLandMesh).toBe('function');
  expect(typeof initNetwork).toBe('function');
  expect(typeof edgeCost).toBe('function');
  expect(typeof buildOD).toBe('function');
  expect(typeof routeFlowsAndAccumulateUsage).toBe('function');
  expect(typeof applyUpgrades).toBe('function');
  expect(typeof updateLandUse).toBe('function');
  expect(typeof updateSettlements).toBe('function');
  expect(typeof updateIndustries).toBe('function');
  expect(typeof renderFrame).toBe('function');
  expect(typeof captureIfDue).toBe('function');
});
