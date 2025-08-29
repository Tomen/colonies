import { expect, test } from 'vitest';
// This suite simply verifies that all stubbed modules expose callable functions.
import {
  generateTerrain,
  buildHydro,
  buildLandMesh
} from '../src/physical/generate';
import {
  initNetwork,
  edgeCost
} from '../src/network/graph';
import {
  buildOD,
  routeFlowsAndAccumulateUsage
} from '../src/sim/flows';
import { applyUpgrades } from '../src/sim/upgrades';
import { updateLandUse } from '../src/landuse/update';
import { updateSettlements } from '../src/society/settlements';
import { updateIndustries } from '../src/industries/site_select';
import { renderFrame } from '../src/render';
import { captureIfDue } from '../src/export/gif';

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
