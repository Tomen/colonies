/**
 * Building generation for settlements.
 *
 * Places procedural buildings on parcels based on land use.
 */

import type {
  Point,
  Parcel,
  Building,
  BuildingType,
  BuildingStyle,
  RoofType,
  LandUse,
} from '@colonies/shared';
import { SeededRNG } from './rng.js';
import { polygonBounds } from './polygon-utils.js';

// ============================================================================
// Building Configuration
// ============================================================================

/**
 * Building dimensions by type (in meters).
 */
const BUILDING_DIMENSIONS: Record<
  BuildingType,
  { minWidth: number; maxWidth: number; minDepth: number; maxDepth: number; minHeight: number; maxHeight: number }
> = {
  house: { minWidth: 6, maxWidth: 10, minDepth: 8, maxDepth: 12, minHeight: 4, maxHeight: 6 },
  farmhouse: { minWidth: 8, maxWidth: 14, minDepth: 10, maxDepth: 16, minHeight: 5, maxHeight: 7 },
  barn: { minWidth: 10, maxWidth: 20, minDepth: 12, maxDepth: 24, minHeight: 6, maxHeight: 10 },
  shop: { minWidth: 6, maxWidth: 12, minDepth: 8, maxDepth: 14, minHeight: 5, maxHeight: 8 },
  warehouse: { minWidth: 12, maxWidth: 24, minDepth: 16, maxDepth: 30, minHeight: 6, maxHeight: 10 },
  church: { minWidth: 10, maxWidth: 16, minDepth: 20, maxDepth: 30, minHeight: 10, maxHeight: 16 },
  townhall: { minWidth: 14, maxWidth: 24, minDepth: 16, maxDepth: 28, minHeight: 8, maxHeight: 14 },
};

/**
 * Wall color palettes by building type.
 */
const WALL_COLORS: Record<BuildingType, string[]> = {
  house: ['#F5F5DC', '#FFFAF0', '#FAF0E6', '#D2B48C', '#E8DCC4'],
  farmhouse: ['#D2B48C', '#DEB887', '#BC8F8F', '#F5DEB3', '#E8DCC4'],
  barn: ['#8B0000', '#A52A2A', '#800000', '#B22222', '#CD5C5C'],
  shop: ['#FFFAF0', '#F5F5DC', '#FAEBD7', '#FAF0E6', '#FFF8DC'],
  warehouse: ['#A9A9A9', '#808080', '#D3D3D3', '#C0C0C0', '#DCDCDC'],
  church: ['#FFFAF0', '#FFFFFF', '#F5F5F5', '#FFFFF0', '#FAF0E6'],
  townhall: ['#F5F5DC', '#FFFAF0', '#D2B48C', '#BC8F8F', '#E8DCC4'],
};

/**
 * Roof color palettes by building type.
 */
const ROOF_COLORS: Record<BuildingType, string[]> = {
  house: ['#8B4513', '#A0522D', '#6B4423', '#8B0000', '#696969'],
  farmhouse: ['#8B4513', '#A0522D', '#6B4423', '#556B2F', '#696969'],
  barn: ['#2F4F4F', '#696969', '#708090', '#5F5F5F', '#4A4A4A'],
  shop: ['#8B4513', '#A0522D', '#696969', '#708090', '#4A4A4A'],
  warehouse: ['#2F4F4F', '#696969', '#708090', '#4A4A4A', '#363636'],
  church: ['#2F4F4F', '#4A4A4A', '#363636', '#696969', '#5F5F5F'],
  townhall: ['#8B4513', '#6B4423', '#4A4A4A', '#696969', '#708090'],
};

/**
 * Roof type probabilities by building type.
 */
const ROOF_TYPES: Record<BuildingType, { type: RoofType; weight: number }[]> = {
  house: [
    { type: 'gable', weight: 0.7 },
    { type: 'hip', weight: 0.3 },
  ],
  farmhouse: [
    { type: 'gable', weight: 0.8 },
    { type: 'hip', weight: 0.2 },
  ],
  barn: [
    { type: 'gable', weight: 0.9 },
    { type: 'flat', weight: 0.1 },
  ],
  shop: [
    { type: 'gable', weight: 0.5 },
    { type: 'hip', weight: 0.3 },
    { type: 'flat', weight: 0.2 },
  ],
  warehouse: [
    { type: 'gable', weight: 0.4 },
    { type: 'flat', weight: 0.6 },
  ],
  church: [
    { type: 'gable', weight: 0.9 },
    { type: 'hip', weight: 0.1 },
  ],
  townhall: [
    { type: 'hip', weight: 0.6 },
    { type: 'gable', weight: 0.4 },
  ],
};

/**
 * Stories range by building type.
 */
const STORIES: Record<BuildingType, { min: number; max: number }> = {
  house: { min: 1, max: 2 },
  farmhouse: { min: 1, max: 2 },
  barn: { min: 1, max: 1 },
  shop: { min: 1, max: 2 },
  warehouse: { min: 1, max: 2 },
  church: { min: 1, max: 1 },
  townhall: { min: 2, max: 3 },
};

/**
 * Minimum parcel area to place a building.
 */
const MIN_PARCEL_AREA = 100; // m²

/**
 * Inset from parcel boundary for building footprint.
 */
const PARCEL_INSET = 2; // meters

// ============================================================================
// Building Generation
// ============================================================================

/**
 * Maps land use to building types.
 */
function getBuildingTypesForLandUse(landUse: LandUse): BuildingType[] {
  switch (landUse) {
    case 'residential':
      return ['house'];
    case 'commercial':
      return ['shop', 'warehouse'];
    case 'civic':
      return ['church', 'townhall'];
    case 'field':
      return ['barn', 'farmhouse'];
    case 'pasture':
      return ['barn'];
    default:
      return [];
  }
}

/**
 * Calculate a bounding box that fits inside the parcel with an inset.
 */
function calculateBuildableArea(parcel: Parcel): { width: number; height: number; center: Point } {
  const bounds = polygonBounds(parcel.vertices);
  const width = Math.max(0, bounds.maxX - bounds.minX - PARCEL_INSET * 2);
  const height = Math.max(0, bounds.maxY - bounds.minY - PARCEL_INSET * 2);
  return {
    width,
    height,
    center: parcel.centroid,
  };
}

/**
 * Pick a random item from an array.
 */
function pickRandom<T>(arr: T[], rng: SeededRNG): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

/**
 * Pick a weighted random roof type.
 */
function pickRoofType(options: { type: RoofType; weight: number }[], rng: SeededRNG): RoofType {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let r = rng.next() * total;
  for (const option of options) {
    r -= option.weight;
    if (r <= 0) return option.type;
  }
  return options[0].type;
}

/**
 * Generate a random number in a range.
 */
function randomInRange(min: number, max: number, rng: SeededRNG): number {
  return min + rng.next() * (max - min);
}

/**
 * Generate a building style for a building type.
 */
function generateBuildingStyle(buildingType: BuildingType, rng: SeededRNG): BuildingStyle {
  const wallColor = pickRandom(WALL_COLORS[buildingType], rng);
  const roofColor = pickRandom(ROOF_COLORS[buildingType], rng);
  const roofType = pickRoofType(ROOF_TYPES[buildingType], rng);
  const storiesRange = STORIES[buildingType];
  const stories = Math.floor(randomInRange(storiesRange.min, storiesRange.max + 1, rng));

  return {
    roofType,
    stories,
    wallColor,
    roofColor,
  };
}

/**
 * Create a rectangular footprint centered at a position.
 */
function createFootprint(
  center: Point,
  width: number,
  depth: number,
  rotation: number
): Point[] {
  const halfW = width / 2;
  const halfD = depth / 2;

  // Rectangle corners before rotation
  const corners = [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ];

  // Rotate and translate
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return corners.map((c) => ({
    x: center.x + c.x * cos - c.y * sin,
    y: center.y + c.x * sin + c.y * cos,
  }));
}

/**
 * Generate a building for a parcel.
 *
 * @param parcel - The parcel to build on
 * @param rng - Seeded RNG for determinism
 * @param nextId - Function to get next building ID
 * @returns A Building or null if parcel is unsuitable
 */
export function generateBuildingForParcel(
  parcel: Parcel,
  rng: SeededRNG,
  nextId: () => string
): Building | null {
  // Check if parcel has a buildable land use
  const buildingTypes = getBuildingTypesForLandUse(parcel.landUse);
  if (buildingTypes.length === 0) {
    return null;
  }

  // Check minimum parcel size
  if (parcel.area < MIN_PARCEL_AREA) {
    return null;
  }

  // Calculate buildable area
  const buildableArea = calculateBuildableArea(parcel);
  if (buildableArea.width < 5 || buildableArea.height < 5) {
    return null;
  }

  // Pick building type
  const buildingType = pickRandom(buildingTypes, rng);
  const dims = BUILDING_DIMENSIONS[buildingType];

  // Calculate building size that fits in parcel
  const maxWidth = Math.min(buildableArea.width, dims.maxWidth);
  const maxDepth = Math.min(buildableArea.height, dims.maxDepth);

  if (maxWidth < dims.minWidth || maxDepth < dims.minDepth) {
    return null; // Parcel too small for this building type
  }

  const width = randomInRange(dims.minWidth, maxWidth, rng);
  const depth = randomInRange(dims.minDepth, maxDepth, rng);
  const height = randomInRange(dims.minHeight, dims.maxHeight, rng);

  // Random rotation (aligned to cardinal directions with slight variation)
  const baseRotation = Math.floor(rng.next() * 4) * (Math.PI / 2);
  const rotationVariation = (rng.next() - 0.5) * 0.1; // +/- 0.05 radians
  const rotation = baseRotation + rotationVariation;

  // Generate style
  const style = generateBuildingStyle(buildingType, rng);

  // Create footprint
  const footprint = createFootprint(buildableArea.center, width, depth, rotation);

  return {
    id: nextId(),
    parcelId: parcel.id,
    type: buildingType,
    position: buildableArea.center,
    footprint,
    width,
    depth,
    height,
    rotation,
    style,
  };
}

/**
 * Generate buildings for all suitable parcels.
 *
 * @param parcels - All parcels to consider
 * @param rng - Seeded RNG for determinism
 * @returns Array of generated buildings
 */
export function generateBuildings(parcels: Parcel[], rng: SeededRNG): Building[] {
  const buildings: Building[] = [];
  let nextBuildingId = 1;

  const getNextId = (): string => `b${nextBuildingId++}`;

  for (const parcel of parcels) {
    const building = generateBuildingForParcel(parcel, rng, getNextId);
    if (building) {
      buildings.push(building);
    }
  }

  return buildings;
}
