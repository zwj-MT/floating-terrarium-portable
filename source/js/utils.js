import * as THREE from '../vendor/three/three.module.js';
import { mulberry32 } from './noise.js';

/**
 * Merge simple geometries (position + normal) after baking their transforms.
 * The project intentionally ships without addon modules, so this covers the
 * handful of low-poly shapes used by the miniature trees and rocks.
 */
export function mergeGeometries(geometries) {
  const positions = [];
  const normals = [];

  for (const source of geometries) {
    const geometry = source.index ? source.toNonIndexed() : source;
    const pos = geometry.getAttribute('position');
    const nor = geometry.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      else normals.push(0, 1, 0);
    }
    if (geometry !== source) geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return merged;
}

export function transformed(geometry, matrix) {
  geometry.applyMatrix4(matrix);
  return geometry;
}

export function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function canvasTexture(canvas, { srgb = true, wrap = THREE.ClampToEdgeWrapping } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function makeSoftCircleTexture(size = 128, hardness = 0.06) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * hardness, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,.92)');
  g.addColorStop(0.52, 'rgba(255,255,255,.32)');
  g.addColorStop(0.78, 'rgba(255,255,255,.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(canvas);
}

export function makeBokehTexture(size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,.4)');
  g.addColorStop(0.5, 'rgba(255,255,255,.3)');
  g.addColorStop(0.78, 'rgba(255,255,255,.16)');
  g.addColorStop(0.94, 'rgba(255,255,255,.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return canvasTexture(canvas);
}

export function makeCloudTexture(seed = 3, size = 256) {
  const random = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // A dome of soft, overlapping puffs. The texture keeps enough vertical body
  // to read as a billowing cloud when scaled into the cube.
  const puffs = [];
  for (let i = 0; i < 22; i++) {
    const u = random();
    const x = size * (0.2 + u * 0.6);
    const arch = Math.sin(u * Math.PI) * 0.1;
    const y = size * (0.54 - arch + (random() - 0.5) * 0.17);
    const r = size * (0.075 + random() * 0.13) * (0.7 + Math.sin(u * Math.PI) * 0.45);
    puffs.push({ x, y, r });
  }
  for (const puff of puffs) {
    const g = ctx.createRadialGradient(puff.x, puff.y, puff.r * 0.06, puff.x, puff.y, puff.r);
    g.addColorStop(0, 'rgba(255,255,255,.32)');
    g.addColorStop(0.4, 'rgba(255,255,255,.24)');
    g.addColorStop(0.72, 'rgba(255,255,255,.09)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const core = ctx.createRadialGradient(size * 0.5, size * 0.54, 0, size * 0.5, size * 0.54, size * 0.4);
  core.addColorStop(0, 'rgba(255,255,255,.14)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  // Fade the sprite out before its rectangular canvas edge.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(size * 0.5, size * 0.54, size * 0.05, size * 0.5, size * 0.54, size * 0.54);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.62, 'rgba(255,255,255,1)');
  mask.addColorStop(0.86, 'rgba(255,255,255,.62)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  return canvasTexture(canvas);
}

export function makeMistTexture(seed = 12, size = 256) {
  const random = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 24; i++) {
    const x = size * (0.12 + random() * 0.76);
    const y = size * (0.4 + random() * 0.22);
    const rx = size * (0.08 + random() * 0.2);
    const ry = size * (0.035 + random() * 0.09);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(255,255,255,.18)');
    g.addColorStop(0.5, 'rgba(255,255,255,.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return canvasTexture(canvas);
}

export function makeEnvironmentTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const random = mulberry32(37);

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#0b1720');
  bg.addColorStop(0.42, '#25312f');
  bg.addColorStop(0.55, '#6b5a40');
  bg.addColorStop(0.7, '#192527');
  bg.addColorStop(1, '#03070a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Broad studio softboxes: these give glass and water believable highlights.
  const boxes = [
    { x: 190, y: 170, w: 250, h: 120, color: 'rgba(255,236,202,.92)' },
    { x: 690, y: 120, w: 150, h: 210, color: 'rgba(167,219,232,.62)' },
    { x: 860, y: 270, w: 120, h: 52, color: 'rgba(255,214,170,.5)' },
  ];
  ctx.save();
  ctx.filter = 'blur(34px)';
  for (const b of boxes) {
    const g = ctx.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, 4, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.75);
    g.addColorStop(0, b.color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.w, b.y - b.h, b.w * 3, b.h * 3);
  }
  ctx.restore();

  // Faint window slivers and distant pin lights.
  ctx.save();
  ctx.filter = 'blur(1.2px)';
  for (let i = 0; i < 22; i++) {
    const x = random() * canvas.width;
    const y = 80 + random() * 260;
    ctx.fillStyle = `rgba(255,${210 + random() * 40},${160 + random() * 70},${0.08 + random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return envMap;
}

export function makeRadialGradientMaterial(color, opacity = 1) {
  return new THREE.SpriteMaterial({
    map: makeSoftCircleTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function randRange(random, min, max) {
  return min + (max - min) * random();
}

export function setShadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}
