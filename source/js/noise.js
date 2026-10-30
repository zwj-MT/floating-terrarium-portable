/* Small deterministic noise helpers shared by geometry and shader setup. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));

function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function gradientDot(ix, iy, fx, fy) {
  const angle = hash2(ix, iy) * Math.PI * 2;
  return Math.cos(angle) * fx + Math.sin(angle) * fy;
}

/** Smooth value-gradient noise, roughly in [-1, 1]. */
export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  const n00 = gradientDot(ix, iy, fx, fy);
  const n10 = gradientDot(ix + 1, iy, fx - 1, fy);
  const n01 = gradientDot(ix, iy + 1, fx, fy - 1);
  const n11 = gradientDot(ix + 1, iy + 1, fx - 1, fy - 1);

  return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy) * 0.72;
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.52) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normal = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * frequency, y * frequency) * amplitude;
    normal += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / normal;
}

export function ridgedFbm2(x, y, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normal = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * frequency, y * frequency));
    sum += n * n * amplitude;
    normal += amplitude;
    amplitude *= 0.48;
    frequency *= 2.11;
  }
  return sum / normal;
}

export function gaussian2(x, z, cx, cz, sx, sz = sx) {
  const dx = (x - cx) / sx;
  const dz = (z - cz) / sz;
  return Math.exp(-(dx * dx + dz * dz) * 0.5);
}

export function hsl(h, s, l) {
  return { h, s, l };
}
