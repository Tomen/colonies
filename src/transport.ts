import { LandMesh, HydroNetwork, Config, NetState, Sim, ODBundle } from './types';

export function initNetwork(land: LandMesh, hydro: HydroNetwork, cfg: Config): NetState {
  throw new Error('initNetwork not implemented');
}

export function edgeCost(heId: number, sim: Sim): number {
  throw new Error('edgeCost not implemented');
}

export function buildOD(sim: Sim): ODBundle[] {
  throw new Error('buildOD not implemented');
}

export function routeFlowsAndAccumulateUsage(sim: Sim): void {
  throw new Error('routeFlowsAndAccumulateUsage not implemented');
}

export function applyUpgrades(sim: Sim): void {
  throw new Error('applyUpgrades not implemented');
}
