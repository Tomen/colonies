import { Config } from '../types';

export const defaultConfig: Config = {
  seed: 133742,
  map: { size_km: [10, 10], ocean_margin_m: 400, sea_level_m: 0 },
  time: { start_year: 0, tick: 'quarter', gif_every_ticks: 2 },
  worldgen: {
    relief_strength: 0.6,
    ridge_orientation_deg: 290,
    river_density: 1.0,
    harbor: { shelter: 1.0, depth: 0.7, exposure: 0.8 },
  },
  transport: {
    overland: true,
    river_navigation: true,
    coastal_shipping: true,
    trail_to_road: 1200,
    road_to_turnpike: 4000,
    ferry_open: 900,
    bridge_build: 2200,
  },
  landuse: { forest_regrowth_years: 40, field_claim_radius_km: 1.0 },
  industries: {
    mills: true,
    shipyards: true,
    ironworks: true,
    brickworks: true,
    woodworking: true,
    spawn_thresholds: {
      mill: 0.65,
      shipyard: 0.55,
      ironworks: 0.7,
      brickworks: 0.5,
      woodworking: 0.45,
    },
  },
  render: { resolution_px: [1600, 1200], style: 'classical' },
};
