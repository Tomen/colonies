/**
 * Polygon utility functions for cadastral operations.
 */

import type { Point, Rect } from '@colonies/shared';
import { SeededRNG } from './rng.js';

// Type alias for RNG interface
type RNG = SeededRNG;

/**
 * Test if a point is inside a polygon using ray casting algorithm.
 * Works for any simple polygon (convex or concave).
 */
export function pointInPolygon(point: Point, vertices: Point[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;

    // Check if ray from point going right crosses this edge
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculate the area of a polygon using the shoelace formula.
 * Returns absolute value (always positive).
 */
export function polygonArea(vertices: Point[]): number {
  const n = vertices.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += vertices[j].x * vertices[i].y;
    area -= vertices[i].x * vertices[j].y;
  }

  return Math.abs(area / 2);
}

/**
 * Calculate the centroid of a polygon.
 */
export function polygonCentroid(vertices: Point[]): Point {
  const n = vertices.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { ...vertices[0] };
  if (n === 2) {
    return {
      x: (vertices[0].x + vertices[1].x) / 2,
      y: (vertices[0].y + vertices[1].y) / 2,
    };
  }

  let cx = 0;
  let cy = 0;
  let signedArea = 0;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const x0 = vertices[j].x,
      y0 = vertices[j].y;
    const x1 = vertices[i].x,
      y1 = vertices[i].y;
    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  signedArea /= 2;
  if (Math.abs(signedArea) < 1e-10) {
    // Degenerate polygon, return average of vertices
    return {
      x: vertices.reduce((sum, v) => sum + v.x, 0) / n,
      y: vertices.reduce((sum, v) => sum + v.y, 0) / n,
    };
  }

  cx /= 6 * signedArea;
  cy /= 6 * signedArea;

  return { x: cx, y: cy };
}

/**
 * Calculate the bounding box of a polygon.
 */
export function polygonBounds(vertices: Point[]): Rect {
  if (vertices.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = vertices[0].x;
  let minY = vertices[0].y;
  let maxX = vertices[0].x;
  let maxY = vertices[0].y;

  for (let i = 1; i < vertices.length; i++) {
    const v = vertices[i];
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Generate random points inside a polygon using rejection sampling.
 * Uses the provided RNG for deterministic results.
 */
export function generatePointsInPolygon(
  vertices: Point[],
  count: number,
  rng: RNG
): Point[] {
  if (count <= 0 || vertices.length < 3) return [];

  const bounds = polygonBounds(vertices);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const points: Point[] = [];
  let attempts = 0;
  const maxAttempts = count * 100; // Prevent infinite loop

  while (points.length < count && attempts < maxAttempts) {
    const candidate: Point = {
      x: bounds.minX + rng.next() * width,
      y: bounds.minY + rng.next() * height,
    };

    if (pointInPolygon(candidate, vertices)) {
      points.push(candidate);
    }
    attempts++;
  }

  return points;
}

/**
 * Clip a polygon to a convex clipping polygon using Sutherland-Hodgman algorithm.
 * Note: The clipping polygon must be convex for correct results.
 */
export function clipPolygon(
  subject: Point[],
  clipPolygon: Point[]
): Point[] {
  if (subject.length < 3 || clipPolygon.length < 3) return [];

  let output = [...subject];

  for (let i = 0; i < clipPolygon.length; i++) {
    if (output.length === 0) return [];

    const input = output;
    output = [];

    const edgeStart = clipPolygon[i];
    const edgeEnd = clipPolygon[(i + 1) % clipPolygon.length];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];

      const currentInside = isLeft(edgeStart, edgeEnd, current);
      const previousInside = isLeft(edgeStart, edgeEnd, previous);

      if (currentInside) {
        if (!previousInside) {
          // Entering: add intersection
          const intersection = lineIntersection(
            previous,
            current,
            edgeStart,
            edgeEnd
          );
          if (intersection) output.push(intersection);
        }
        output.push(current);
      } else if (previousInside) {
        // Leaving: add intersection
        const intersection = lineIntersection(
          previous,
          current,
          edgeStart,
          edgeEnd
        );
        if (intersection) output.push(intersection);
      }
    }
  }

  return output;
}

/**
 * Check if point C is to the left of line AB.
 */
function isLeft(a: Point, b: Point, c: Point): boolean {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) >= 0;
}

/**
 * Find intersection point of lines AB and CD.
 */
function lineIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): Point | null {
  const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denom) < 1e-10) return null; // Parallel lines

  const t =
    ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;

  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

/**
 * Check if a polygon is convex.
 */
export function isConvex(vertices: Point[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  let sign: number | null = null;

  for (let i = 0; i < n; i++) {
    const p0 = vertices[i];
    const p1 = vertices[(i + 1) % n];
    const p2 = vertices[(i + 2) % n];

    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);

    if (Math.abs(cross) > 1e-10) {
      const currentSign = cross > 0 ? 1 : -1;
      if (sign === null) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false;
      }
    }
  }

  return true;
}
