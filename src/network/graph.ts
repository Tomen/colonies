import { LandMesh, HydroNetwork, Config, NetState, Sim } from '../types';

export function initNetwork(land: LandMesh, hydro: HydroNetwork, cfg: Config): NetState {
  throw new Error('initNetwork not implemented');
}

export function edgeCost(heId: number, sim: Sim): number {
  throw new Error('edgeCost not implemented');
}
