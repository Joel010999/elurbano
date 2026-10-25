// Simplified geo utilities for El Urbano
// Based on ColeJUY's geo.ts

export type LngLat = [number, number];

const R = 6371000; // Earth radius in meters
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distance(a: LngLat, b: LngLat): number {
  const φ1 = rad(a[1]);
  const φ2 = rad(b[1]);
  const Δφ = rad(b[1] - a[1]);
  const Δλ = rad(b[0] - a[0]);

  const sinHalf = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(sinHalf), Math.sqrt(1 - sinHalf));

  return R * c;
}

export function pathLength(coords: LngLat[], refLat = 0): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += distance(coords[i - 1], coords[i]);
  }
  return sum;
}

export function pointAlong(coords: LngLat[], meters: number, refLat = 0): LngLat | null {
  if (coords.length === 0) return null;
  if (meters <= 0) return coords[0];

  let traveled = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = distance(coords[i - 1], coords[i]);
    if (traveled + seg >= meters) {
      const t = (meters - traveled) / seg;
      const a = coords[i - 1];
      const b = coords[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    traveled += seg;
  }
  return coords[coords.length - 1];
}

export function bearingAlong(coords: LngLat[], meters: number, refLat = 0): number | null {
  if (coords.length < 2) return null;

  let traveled = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = distance(coords[i - 1], coords[i]);
    if (traveled + seg >= meters) {
      const a = coords[i - 1];
      const b = coords[i];
      const φ1 = rad(a[1]);
      const φ2 = rad(b[1]);
      const Δλ = rad(b[0] - a[0]);

      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x = Math.cos(φ1) * Math.sin(φ2) -
                Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
      const θ = Math.atan2(y, x);

      return (deg(θ) + 360) % 360;
    }
    traveled += seg;
  }

  if (coords.length >= 2) {
    const a = coords[coords.length - 2];
    const b = coords[coords.length - 1];
    const φ1 = rad(a[1]);
    const φ2 = rad(b[1]);
    const Δλ = rad(b[0] - a[0]);

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);

    return (deg(θ) + 360) % 360;
  }

  return null;
}

export function locate(
  path: LngLat[],
  point: LngLat
): { along: number; offset: number; bearing: number } | null {
  if (path.length === 0) return null;

  let bestDist = Infinity;
  let bestAlong = 0;
  let bestBearing = 0;
  let traveled = 0;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segLen = distance(a, b);

    // Find closest point on segment
    const φ1 = rad(a[1]);
    const φ2 = rad(b[1]);
    const Δλ = rad(b[0] - a[0]);

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const bearing = (deg(Math.atan2(y, x)) + 360) % 360;

    for (let t = 0; t <= 1; t += 0.1) {
      const sample: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const d = distance(point, sample);
      if (d < bestDist) {
        bestDist = d;
        bestAlong = traveled + segLen * t;
        bestBearing = bearing;
      }
    }

    traveled += segLen;
  }

  return { along: bestAlong, offset: bestDist, bearing: bestBearing };
}

export function angleBetween(a: number, b: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return Math.abs(d);
}
