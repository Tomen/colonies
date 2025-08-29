import { Config, RNG, TerrainGrid, HydroNetwork, LandMesh } from '../types';

export function generateTerrain(cfg: Config, rng: RNG): TerrainGrid {
  throw new Error('generateTerrain not implemented');
}

export function buildHydro(terrain: TerrainGrid, cfg: Config): HydroNetwork {
  throw new Error('buildHydro not implemented');
}

export function buildLandMesh(
  terrain: TerrainGrid,
  hydro: HydroNetwork,
  cfg: Config,
  rng: RNG
): LandMesh {
  throw new Error('buildLandMesh not implemented');
}
