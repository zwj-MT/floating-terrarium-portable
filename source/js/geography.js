import * as THREE from '../vendor/three/three.module.js';
import {
  fbm2,
  gaussian2,
  smoothstep,
  clamp,
  lerp,
} from './noise.js';

/**
 * The terrarium is built around one hand-authored miniature geography.
 * All scatter systems and water ribbons read from these same functions, so
 * every stone, root and river bank lands in the right place.
 */

export const CUBE = {
  half: 4.95,
  height: 8.3,
  centerY: 4.15,
  baseY: 0,
};

export const ISLAND = {
  rx: 4.25,
  rz: 3.7,
  base: 1.76,
  undersideTip: 0.72,
};

export const LAKE = {
  x: 1.88,
  z: 1.18,
  waterY: 1.615,
  basinRx: 1.46,
  basinRz: 1.16,
  depth: 0.38,
};

export const POOL = {
  x: -0.68,
  z: 0.58,
  waterY: 1.735,
  radius: 0.48,
};

export const WATERFALL = {
  top: new THREE.Vector3(-1.02, 2.89, 0.1),
  bottom: new THREE.Vector3(-0.7, 1.75, 0.46),
  widthTop: 0.28,
  widthBottom: 0.46,
};

export const MOUNTAINS = [
  {
    x: -1.78,
    z: -2.02,
    baseY: 1.34,
    radius: 2.5,
    radiusZ: 2.12,
    height: 3.82,
    seed: 3.2,
    snowline: 0.63,
    peaks: [
      { x: -0.02, z: 0.06, height: 2.94, sx: 1.02, sz: 1.12 },
      { x: -0.7, z: 0.3, height: 2.28, sx: 0.78, sz: 0.8 },
      { x: 0.64, z: 0.42, height: 1.98, sx: 0.9, sz: 0.76 },
      { x: 0.15, z: -0.79, height: 2.08, sx: 1.06, sz: 0.84 },
      { x: -1.15, z: -0.4, height: 1.4, sx: 0.6, sz: 0.7 },
    ],
  },
  {
    x: 0.62,
    z: -2.16,
    baseY: 1.38,
    radius: 1.9,
    radiusZ: 1.64,
    height: 2.62,
    seed: 8.7,
    snowline: 0.62,
    peaks: [
      { x: 0.06, z: -0.08, height: 2.26, sx: 0.84, sz: 0.9 },
      { x: -0.52, z: 0.35, height: 1.84, sx: 0.72, sz: 0.7 },
      { x: 0.6, z: 0.22, height: 1.58, sx: 0.66, sz: 0.64 },
    ],
  },
  {
    x: -3.36,
    z: -1.02,
    baseY: 1.4,
    radius: 1.34,
    radiusZ: 1.12,
    height: 1.7,
    seed: 14.1,
    snowline: 0.76,
    peaks: [
      { x: -0.06, z: 0.02, height: 1.48, sx: 0.58, sz: 0.58 },
      { x: 0.42, z: 0.3, height: 1.06, sx: 0.48, sz: 0.44 },
    ],
  },
];

export const CLIFF = {
  x: -1.28,
  z: -0.35,
  baseY: 1.45,
  topY: 2.94,
  radiusX: 0.96,
  radiusZ: 0.78,
};

export const LANDMARKS = {
  cabin: { x: 3.18, z: 0.27, radius: 1.08 },
  deer: { x: 2.56, z: 2.38, radius: 1.02 },
  bridge: { x: 0.16, z: 1.31, radius: 0.62 },
};

export const RIVER_CONTROL_POINTS = [
  new THREE.Vector3(-0.62, 1.735, 0.78),
  new THREE.Vector3(-0.48, 1.715, 1.02),
  new THREE.Vector3(-0.22, 1.69, 1.28),
  new THREE.Vector3(0.12, 1.668, 1.35),
  new THREE.Vector3(0.43, 1.646, 1.22),
  new THREE.Vector3(0.68, 1.632, 1.10),
  new THREE.Vector3(0.95, 1.622, 1.15),
  new THREE.Vector3(1.22, 1.615, 1.24),
  new THREE.Vector3(1.55, 1.612, 1.27),
];

export const RIVER_CURVE = new THREE.CatmullRomCurve3(
  RIVER_CONTROL_POINTS,
  false,
  'catmullrom',
  0.35,
);

export const RIVER_SAMPLES = Array.from({ length: 180 }, (_, index) => {
  const t = index / 179;
  const point = RIVER_CURVE.getPoint(t);
  const width = lerp(0.115, 0.29, smoothstep(0.04, 0.92, t))
    * (1 + 0.08 * Math.sin(t * 17.0));
  return {
    t,
    x: point.x,
    y: point.y,
    z: point.z,
    width,
    bank: width + 0.3,
  };
});

const scratchColor = new THREE.Color();

export function islandBoundaryNoise(theta) {
  return 1
    + 0.032 * Math.sin(theta * 3.0 + 0.7)
    + 0.018 * Math.sin(theta * 7.0 - 1.1)
    + 0.010 * Math.sin(theta * 13.0 + 2.0);
}

export function islandPoint(theta, radial = 1) {
  const wobble = islandBoundaryNoise(theta);
  return {
    x: Math.cos(theta) * ISLAND.rx * radial * wobble,
    z: Math.sin(theta) * ISLAND.rz * radial * (1 + 0.02 * Math.sin(theta * 5.0 - 0.4)),
  };
}

export function lakeDistance(x, z) {
  const dx = (x - LAKE.x) / LAKE.basinRx;
  const dz = (z - LAKE.z) / LAKE.basinRz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function closestRiverSample(x, z) {
  let closest = RIVER_SAMPLES[0];
  let bestDistanceSq = Infinity;
  for (let i = 0; i < RIVER_SAMPLES.length; i++) {
    const sample = RIVER_SAMPLES[i];
    const dx = x - sample.x;
    const dz = z - sample.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      closest = sample;
    }
  }
  return { sample: closest, distance: Math.sqrt(bestDistanceSq) };
}

export function distanceToRiver(x, z) {
  return closestRiverSample(x, z).distance;
}

export function isInLake(x, z, padding = 0) {
  const dx = (x - LAKE.x) / (LAKE.basinRx * 0.88 + padding);
  const dz = (z - LAKE.z) / (LAKE.basinRz * 0.88 + padding);
  return dx * dx + dz * dz < 1;
}

export function isInPool(x, z, padding = 0) {
  const dx = x - POOL.x;
  const dz = z - POOL.z;
  return Math.hypot(dx, dz) < POOL.radius + padding;
}

export function isInWater(x, z, padding = 0) {
  if (isInLake(x, z, padding)) return true;
  if (isInPool(x, z, padding)) return true;
  const { sample, distance } = closestRiverSample(x, z);
  return distance < sample.width + 0.18 + padding;
}

/** Height of the sculpted island surface before any separate mountain meshes. */
export function heightAt(x, z) {
  let h = ISLAND.base;

  h += 0.095 * fbm2(x * 0.46 + 3.1, z * 0.46 - 1.7, 4);
  h += 0.042 * fbm2(x * 1.35 + 8.2, z * 1.35 + 2.4, 3);
  h += 0.019 * fbm2(x * 3.1 - 1.5, z * 3.1 + 7.2, 2);

  // Broad, soft hills keep the silhouette from reading like a flat plate.
  h += 0.23 * gaussian2(x, z, 3.05, -1.35, 1.45, 1.2);
  h += 0.18 * gaussian2(x, z, -3.15, 1.7, 1.15, 0.85);
  h += 0.36 * gaussian2(x, z, CLIFF.x, CLIFF.z, 1.45, 1.15);
  h += 0.20 * gaussian2(x, z, -3.7, -1.0, 0.85, 0.7);
  h -= 0.07 * gaussian2(x, z, 0.2, 2.65, 2.0, 0.95);

  // The lake bowl.
  const lakeD = lakeDistance(x, z);
  if (lakeD < 1.42) {
    const lakeNoise = 0.03 * Math.sin(Math.atan2(z - LAKE.z, x - LAKE.x) * 5.0 + 1.1);
    const bowl = 1 - smoothstep(0.66, 1.32, lakeD + lakeNoise);
    h -= LAKE.depth * bowl;
    h += 0.025 * bowl * fbm2(x * 2.6, z * 2.6, 2);
  }

  // A cool, quiet plunge basin below the little hanging waterfall.
  const poolD = Math.hypot((x - POOL.x) / 1.06, z - POOL.z);
  if (poolD < 0.86) {
    const bowl = 1 - smoothstep(0.2, 0.83, poolD);
    h = lerp(h, POOL.waterY - 0.16, bowl * 0.9);
  }

  // Carve the meandering stream. The water ribbon uses the exact same samples,
  // so the water never floats above its banks or sinks into the ground.
  const { sample, distance } = closestRiverSample(x, z);
  const influence = 1 - smoothstep(sample.width * 0.78, sample.bank, distance);
  if (influence > 0) {
    const bed = sample.y - 0.145;
    h = lerp(h, Math.min(h, bed), influence);
  }

  // The outer rim dips a touch, revealing the sculpted soil beneath the grass.
  const theta = Math.atan2(z, x);
  const edge = Math.hypot(x / ISLAND.rx, z / ISLAND.rz);
  const rim = smoothstep(0.84, 0.995, edge);
  h -= rim * (0.06 + 0.035 * Math.sin(theta * 4.0 + 1.2));

  return h;
}

/** Height without the water depression, useful for placing shoreline stones. */
export function rawHeightAt(x, z) {
  let h = ISLAND.base;
  h += 0.095 * fbm2(x * 0.46 + 3.1, z * 0.46 - 1.7, 4);
  h += 0.042 * fbm2(x * 1.35 + 8.2, z * 1.35 + 2.4, 3);
  h += 0.019 * fbm2(x * 3.1 - 1.5, z * 3.1 + 7.2, 2);
  h += 0.23 * gaussian2(x, z, 3.05, -1.35, 1.45, 1.2);
  h += 0.18 * gaussian2(x, z, -3.15, 1.7, 1.15, 0.85);
  h += 0.36 * gaussian2(x, z, CLIFF.x, CLIFF.z, 1.45, 1.15);
  return h;
}

export function slopeAt(x, z) {
  const e = 0.045;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

/** Radial shoreline of the lake, found by marching outward from its centre. */
export function lakeShoreline(segments = 120) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    let shore = 0.32;
    for (let step = 0; step < 54; step++) {
      const d = 0.28 + (step / 53) * 1.18;
      const x = LAKE.x + Math.cos(theta) * LAKE.basinRx * d;
      const z = LAKE.z + Math.sin(theta) * LAKE.basinRz * d;
      if (heightAt(x, z) < LAKE.waterY) shore = d;
      else break;
    }
    points.push({
      theta,
      d: shore,
      x: LAKE.x + Math.cos(theta) * LAKE.basinRx * shore * 0.975,
      z: LAKE.z + Math.sin(theta) * LAKE.basinRz * shore * 0.975,
    });
  }
  return points;
}

export function terrainNormal(x, z) {
  const e = 0.05;
  const nx = heightAt(x - e, z) - heightAt(x + e, z);
  const nz = heightAt(x, z - e) - heightAt(x, z + e);
  return new THREE.Vector3(nx, 2 * e, nz).normalize();
}

export function colorLerp(a, b, t) {
  return scratchColor.copy(a).lerp(b, clamp(t)).clone();
}
