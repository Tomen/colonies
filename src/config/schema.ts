import { JSONSchemaType } from 'ajv';
import { Config } from '../types';

export const configSchema: JSONSchemaType<Config> = {
  type: 'object',
  additionalProperties: false,
  required: ['seed', 'map', 'time', 'worldgen', 'transport', 'landuse', 'industries', 'render'],
  properties: {
    seed: { type: 'integer' },
    map: {
      type: 'object',
      additionalProperties: false,
      required: ['size_km', 'ocean_margin_m', 'sea_level_m'],
      properties: {
        size_km: {
          type: 'array',
          items: [{ type: 'number' }, { type: 'number' }],
          minItems: 2,
          maxItems: 2,
        },
        ocean_margin_m: { type: 'number' },
        sea_level_m: { type: 'number' },
      },
    },
    time: {
      type: 'object',
      additionalProperties: false,
      required: ['start_year', 'tick', 'gif_every_ticks'],
      properties: {
        start_year: { type: 'integer' },
        tick: { type: 'string' },
        gif_every_ticks: { type: 'integer' },
      },
    },
    debug: {
      type: 'object',
      additionalProperties: false,
      required: ['export_grids', 'output_dir'],
      properties: {
        export_grids: { type: 'boolean' },
        output_dir: { type: 'string' },
      },
      nullable: true,
    },
    worldgen: {
      type: 'object',
      additionalProperties: false,
      required: ['relief_strength', 'ridge_orientation_deg', 'river_density', 'harbor'],
      properties: {
        relief_strength: { type: 'number' },
        ridge_orientation_deg: { type: 'number' },
        river_density: { type: 'number' },
        harbor: {
          type: 'object',
          additionalProperties: false,
          required: ['shelter', 'depth', 'exposure'],
          properties: {
            shelter: { type: 'number' },
            depth: { type: 'number' },
            exposure: { type: 'number' },
          },
        },
      },
    },
    transport: {
      type: 'object',
      additionalProperties: false,
      required: [
        'overland',
        'river_navigation',
        'coastal_shipping',
        'trail_to_road',
        'road_to_turnpike',
        'ferry_open',
        'bridge_build',
      ],
      properties: {
        overland: { type: 'boolean' },
        river_navigation: { type: 'boolean' },
        coastal_shipping: { type: 'boolean' },
        trail_to_road: { type: 'number' },
        road_to_turnpike: { type: 'number' },
        ferry_open: { type: 'number' },
        bridge_build: { type: 'number' },
      },
    },
    landuse: {
      type: 'object',
      additionalProperties: false,
      required: ['forest_regrowth_years', 'field_claim_radius_km'],
      properties: {
        forest_regrowth_years: { type: 'integer' },
        field_claim_radius_km: { type: 'number' },
      },
    },
    industries: {
      type: 'object',
      additionalProperties: false,
      required: ['mills', 'shipyards', 'ironworks', 'brickworks', 'woodworking', 'spawn_thresholds'],
      properties: {
        mills: { type: 'boolean' },
        shipyards: { type: 'boolean' },
        ironworks: { type: 'boolean' },
        brickworks: { type: 'boolean' },
        woodworking: { type: 'boolean' },
        spawn_thresholds: {
          type: 'object',
          additionalProperties: false,
          required: ['mill', 'shipyard', 'ironworks', 'brickworks', 'woodworking'],
          properties: {
            mill: { type: 'number' },
            shipyard: { type: 'number' },
            ironworks: { type: 'number' },
            brickworks: { type: 'number' },
            woodworking: { type: 'number' },
          },
        },
      },
    },
    render: {
      type: 'object',
      additionalProperties: false,
      required: ['resolution_px', 'style'],
      properties: {
        resolution_px: {
          type: 'array',
          items: [{ type: 'number' }, { type: 'number' }],
          minItems: 2,
          maxItems: 2,
        },
        style: { type: 'string' },
      },
    },
  },
};
