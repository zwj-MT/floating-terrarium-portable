import * as THREE from '../vendor/three/three.module.js';
import {
  CUBE,
  ISLAND,
  LAKE,
  POOL,
  CLIFF,
  MOUNTAINS,
  LANDMARKS,
  heightAt,
  lakeDistance,
  closestRiverSample,
  islandPoint,
  islandBoundaryNoise,
} from './geography.js';
import {
  fbm2,
  noise2,
  ridgedFbm2,
  smoothstep,
  clamp,
  lerp,
  mulberry32,
} from './noise.js';

const TERRAIN_SEGMENTS = 200;
const TERRAIN_RINGS = 108;

function addTerrainSurfaceDetail(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vTerrariumWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vTerrariumWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = /* glsl */ `
      varying vec3 vTerrariumWorld;
      float terrHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float terrNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(terrHash(i), terrHash(i + vec2(1.0, 0.0)), f.x),
                   mix(terrHash(i + vec2(0.0, 1.0)), terrHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float terrFbm(vec2 p) {
        float v = 0.0;
        float a = 0.55;
        for (int i = 0; i < 3; i++) {
          v += a * terrNoise(p);
          p = p * 2.03 + vec2(3.1, 1.7);
          a *= 0.5;
        }
        return v;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
        #include <color_fragment>
        float detailA = terrFbm(vTerrariumWorld.xz * 3.2);
        float detailB = terrNoise(vTerrariumWorld.xz * 21.0);
        float detailC = terrNoise(vTerrariumWorld.xz * 63.0);
        diffuseColor.rgb *= 0.87 + detailA * 0.22 + detailB * 0.08;
        diffuseColor.rgb += vec3(0.018, 0.022, 0.008) * smoothstep(0.78, 1.0, detailA);
        diffuseColor.rgb *= 1.0 - smoothstep(0.9, 1.0, detailC) * 0.09;
      `,
    );
  };
  material.customProgramCacheKey = () => 'terrain-surface-detail';
}

function addMountainSurfaceDetail(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vMountainWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vMountainWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = /* glsl */ `
      varying vec3 vMountainWorld;
      float mountainHash(vec2 p) {
        return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
      }
      float mountainNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mountainHash(i), mountainHash(i + vec2(1.0, 0.0)), f.x),
                   mix(mountainHash(i + vec2(0.0, 1.0)), mountainHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
        #include <color_fragment>
        float strata = mountainNoise(vec2(vMountainWorld.y * 14.0, vMountainWorld.x * 1.8 + vMountainWorld.z * 1.4));
        float grain = mountainNoise(vMountainWorld.xz * 11.0 + vMountainWorld.y * 3.0);
        diffuseColor.rgb *= 0.92 + strata * 0.09 + grain * 0.07;
        float snowSpark = smoothstep(0.985, 1.0, mountainNoise(vMountainWorld.xz * 74.0 + vMountainWorld.y * 9.0));
        diffuseColor.rgb += vec3(0.07, 0.08, 0.086) * snowSpark;
      `,
    );
  };
  material.customProgramCacheKey = () => 'mountain-surface-detail';
}

function makeGradientPalette() {
  return {
    grassDark: new THREE.Color('#506f4d'),
    grass: new THREE.Color('#78905c'),
    grassSun: new THREE.Color('#93a46b'),
    moss: new THREE.Color('#5c7752'),
    mossDeep: new THREE.Color('#3f5e48'),
    soil: new THREE.Color('#6a5944'),
    rock: new THREE.Color('#777264'),
    rockCool: new THREE.Color('#666a63'),
    sand: new THREE.Color('#b1a17d'),
    wetSand: new THREE.Color('#736b54'),
    bed: new THREE.Color('#455c50'),
    bedDeep: new THREE.Color('#2e4541'),
    snow: new THREE.Color('#e8edeb'),
    snowShade: new THREE.Color('#bfccd3'),
  };
}

const PALETTE = makeGradientPalette();
const tempColor = new THREE.Color();
const tempColorB = new THREE.Color();

function setVertexColor(colors, index, color) {
  colors[index * 3] = color.r;
  colors[index * 3 + 1] = color.g;
  colors[index * 3 + 2] = color.b;
}

function paintTerrain(geometry) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const ny = clamp(normal.getY(i), -1, 1);
    const slope = 1 - Math.max(0, ny);
    const patch = fbm2(x * 1.15 + 4.8, z * 1.15 - 2.2, 3);
    const fine = noise2(x * 5.8 + 1.2, z * 5.8 + 7.7);
    const lakeD = lakeDistance(x, z);
    const river = closestRiverSample(x, z);
    const nearRiver = river.distance < river.sample.bank + 0.06;
    const nearLake = lakeD < 1.28;
    const poolD = Math.hypot(x - POOL.x, z - POOL.z);
    const nearPool = poolD < 0.84;

    // Grass owns the soft open ground; patches of moss and sunlit blades break
    // up the surface so it reads as a living miniature, not a painted plane.
    tempColor.copy(PALETTE.grassDark).lerp(PALETTE.grass, smoothstep(-0.36, 0.3, patch) * 0.9);
    tempColor.lerp(PALETTE.grassSun, smoothstep(0.32, 0.78, fine) * 0.18);
    tempColor.lerp(PALETTE.moss, smoothstep(0.15, 0.72, patch) * 0.26);
    tempColor.lerp(PALETTE.mossDeep, smoothstep(2.1, 2.9, y) * 0.25);

    const rockAmount = smoothstep(0.16, 0.55, slope);
    tempColor.lerp(PALETTE.rockCool, rockAmount * 0.82);
    tempColor.lerp(PALETTE.rock, smoothstep(2.15, 3.1, y) * 0.34);

    if (y > 2.82) {
      const snowPatch = smoothstep(2.82, 3.3, y) * (0.55 + fine * 0.2) + smoothstep(0.35, 0.7, patch) * 0.08;
      tempColor.lerp(PALETTE.snow, clamp(snowPatch, 0, 0.75));
    }

    if (nearLake && y < LAKE.waterY + 0.12) {
      const wet = smoothstep(LAKE.waterY + 0.12, LAKE.waterY - 0.15, y);
      tempColor.lerp(PALETTE.sand, 0.66 * (1 - wet * 0.7));
      tempColor.lerp(PALETTE.wetSand, wet * 0.65);
      if (y < LAKE.waterY - 0.055) {
        tempColor.lerp(PALETTE.bed, 0.7);
        tempColor.lerp(PALETTE.bedDeep, smoothstep(LAKE.waterY, LAKE.waterY - 0.34, y) * 0.7);
      }
    }

    if (nearRiver) {
      const wetBank = 1 - smoothstep(river.sample.width * 0.7, river.sample.bank + 0.03, river.distance);
      tempColor.lerp(PALETTE.sand, wetBank * 0.36);
      tempColor.lerp(PALETTE.bed, wetBank * 0.55);
      if (river.distance < river.sample.width * 0.86) {
        tempColor.lerp(PALETTE.bedDeep, 0.55);
      }
    }

    if (nearPool) {
      const wet = 1 - smoothstep(0.24, 0.8, poolD);
      tempColor.lerp(PALETTE.sand, wet * 0.3);
      if (y < POOL.waterY - 0.02) tempColor.lerp(PALETTE.bedDeep, wet * 0.8);
    }

    // The carved rim reveals mossy soil; darken it gently for depth.
    const edge = Math.hypot(x / ISLAND.rx, z / ISLAND.rz);
    tempColor.lerp(PALETTE.soil, smoothstep(0.9, 1.02, edge) * 0.5);

    setVertexColor(colors, i, tempColor);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function buildTopSurface() {
  const vertices = [];
  const indices = [];
  const rowStart = [];
  const rings = TERRAIN_RINGS;
  const segments = TERRAIN_SEGMENTS;

  // A single centre vertex avoids degenerate first-row triangles.
  const centerHeight = heightAt(0, 0);
  vertices.push(0, centerHeight, 0);
  rowStart.push(0);

  for (let ring = 1; ring <= rings; ring++) {
    const radial = ring / rings;
    rowStart.push(vertices.length / 3);
    for (let segment = 0; segment < segments; segment++) {
      const theta = (segment / segments) * Math.PI * 2;
      const point = islandPoint(theta, radial);
      vertices.push(point.x, heightAt(point.x, point.z), point.z);
    }
  }

  // First fan from the centre to the innermost ring.
  const first = rowStart[1];
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(0, first + next, first + segment);
  }

  for (let ring = 2; ring <= rings; ring++) {
    const inner = rowStart[ring - 1];
    const outer = rowStart[ring];
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const a = inner + segment;
      const b = inner + next;
      const c = outer + segment;
      const d = outer + next;
      // Winding chosen so the normals face upward (toward the sky).
      indices.push(a, d, c, a, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  paintTerrain(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildUnderside() {
  const vertices = [];
  const indices = [];
  const segments = TERRAIN_SEGMENTS;
  const rings = 16;
  const boundary = [];
  const boundaryY = [];

  for (let segment = 0; segment < segments; segment++) {
    const theta = (segment / segments) * Math.PI * 2;
    const point = islandPoint(theta, 1);
    boundary.push(point);
    boundaryY.push(heightAt(point.x, point.z));
  }

  const rowStarts = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    rowStarts.push(vertices.length / 3);
    const taper = Math.pow(1 - t, 0.72);
    for (let segment = 0; segment < segments; segment++) {
      const theta = (segment / segments) * Math.PI * 2;
      const point = boundary[segment];
      const wobble = 1
        + 0.055 * Math.sin(theta * 4 + t * 5.2 + 1.2)
        + 0.028 * Math.sin(theta * 9 - t * 3.1);
      const radial = Math.max(0.012, taper * wobble);
      const layer = smoothstep(0.0, 0.82, t);
      const y = lerp(boundaryY[segment], ISLAND.undersideTip, Math.pow(t, 0.84))
        + 0.026 * Math.sin(theta * 6 + t * 7.0) * (1 - t);
      vertices.push(point.x * radial, y, point.z * radial);
      void layer;
    }
  }

  for (let ring = 1; ring <= rings; ring++) {
    const lower = rowStarts[ring - 1];
    const upper = rowStarts[ring];
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const a = lower + segment;
      const b = lower + next;
      const c = upper + segment;
      const d = upper + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Close the tip.
  const tip = vertices.length / 3;
  vertices.push(0, ISLAND.undersideTip - 0.05, 0);
  const lastRow = rowStarts[rings];
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(lastRow + segment, tip, lastRow + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const soil = new THREE.Color('#5a4c3d');
  const soilDark = new THREE.Color('#3e3b33');
  const stone = new THREE.Color('#777062');
  const stoneDark = new THREE.Color('#4a4841');
  const moss = new THREE.Color('#607448');
  const deep = new THREE.Color('#282c29');

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const depth = smoothstep(1.7, 0.62, y);
    const strata = noise2(x * 1.3 + 2.0, z * 1.3 + y * 3.8);
    const broad = fbm2(x * 0.5 + 5.0, z * 0.5 - 3.0, 3);
    tempColor.copy(soil).lerp(soilDark, depth * 0.72);
    tempColor.lerp(stone, clamp(smoothstep(-0.1, 0.6, strata) * 0.42 + 0.12, 0, 0.5));
    tempColor.lerp(stoneDark, clamp(smoothstep(0.25, 0.72, broad) * 0.32, 0, 0.35));
    tempColor.lerp(moss, smoothstep(0.14, 0.58, y / 1.8) * 0.3);
    tempColor.lerp(deep, depth * 0.62);

    // Fine ridges catch the last bit of light under the floating island.
    const ridge = clamp(1 - Math.abs(normal.getX(i)) - Math.abs(normal.getZ(i)) * 0.6, 0, 1);
    tempColor.lerp(stone, ridge * 0.08);
    setVertexColor(colors, i, tempColor);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildIsland() {
  const group = new THREE.Group();
  group.name = 'Suspended island';

  const topGeometry = buildTopSurface();
  const topMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.015,
    envMapIntensity: 0.38,
  });
  addTerrainSurfaceDetail(topMaterial);
  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const undersideGeometry = buildUnderside();
  const undersideMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.01,
    side: THREE.DoubleSide,
    envMapIntensity: 0.24,
  });
  const underside = new THREE.Mesh(undersideGeometry, undersideMaterial);
  underside.castShadow = true;
  underside.receiveShadow = true;
  group.add(underside);

  return { group, top, underside };
}

function mountainElevation(x, z, definition) {
  const localX = x - definition.x;
  const localZ = z - definition.z;
  const radial = Math.sqrt(
    (localX / definition.radius) ** 2 + (localZ / definition.radiusZ) ** 2,
  );
  const envelope = 1 - smoothstep(0.74, 1.0, radial);

  // Domain-warped ridges: the massif reads as several connected shoulders
  // rather than a perfect cone.
  const warpX = localX + 0.26 * noise2(localZ * 1.55 + definition.seed, localX * 1.1);
  const warpZ = localZ + 0.26 * noise2(localX * 1.65 - definition.seed * 2.1, localZ * 1.25);

  let massif = 0;
  for (const peak of definition.peaks) {
    const dx = (warpX - peak.x) / peak.sx;
    const dz = (warpZ - peak.z) / peak.sz;
    const value = peak.height * Math.exp(-(dx * dx + dz * dz) * 1.16);
    massif = Math.max(massif, value);
  }

  const broad = 0.96 * Math.exp(-((warpX / definition.radius) ** 2 + (warpZ / definition.radiusZ) ** 2) * 1.18);
  const ridge = ridgedFbm2(warpX * 1.32 + definition.seed, warpZ * 1.32 - definition.seed, 4);
  const fineRidge = ridgedFbm2(warpX * 3.65 - definition.seed * 0.7, warpZ * 3.65 + definition.seed, 3);
  const altitude = clamp(massif / definition.height, 0, 1);
  const crags = (ridge - 0.44) * 0.66 * (0.24 + altitude * 0.85);
  const fineCrags = (fineRidge - 0.52) * 0.46 * altitude * altitude;
  const shoulder = 0.16 * Math.sin(warpX * 1.9 + warpZ * 1.6 + definition.seed) * altitude * (1 - altitude);
  const angle = Math.atan2(warpZ, warpX);
  const radialGullies = Math.pow(Math.abs(Math.sin(angle * 5.0 + definition.seed * 1.7 + fineRidge * 2.6)), 5.0)
    * 0.28 * altitude;
  const elevation = Math.max(
    0,
    (massif * 0.98 + broad + crags + fineCrags + shoulder - radialGullies) * envelope,
  );

  return definition.baseY + elevation;
}

function paintMountain(geometry, definition) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);

  const lowMoss = new THREE.Color('#4c6149');
  const moss = new THREE.Color('#607454');
  const rockWarm = new THREE.Color('#706d60');
  const rockCool = new THREE.Color('#4c585a');
  const rockDark = new THREE.Color('#2e393b');
  const snow = new THREE.Color('#f4f7f3');
  const snowCool = new THREE.Color('#c8d7dd');
  const snowWarm = new THREE.Color('#e5dfd0');

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const ny = clamp(normal.getY(i), -1, 1);
    const slope = 1 - Math.max(0, ny);
    const altitude = clamp((y - definition.baseY) / definition.height, 0, 1.2);
    const angle = Math.atan2(z - definition.z, x - definition.x);
    const grain = noise2(x * 3.15 + definition.seed, z * 3.15 - y * 0.55);
    const broadNoise = fbm2(x * 0.9 - definition.seed, z * 0.9 + 4.2, 4);
    const vein = smoothstep(0.56, 0.87, fbm2(x * 3.8 + y * 1.4, z * 3.8 - definition.seed, 3));

    let snowline = definition.snowline
      + 0.05 * noise2(angle * 2.2 + definition.seed, altitude * 3.0)
      + 0.028 * Math.sin(angle * 6.0 + definition.seed * 2.0 + altitude * 2.0);
    snowline += vein * 0.045;
    let snowMask = smoothstep(snowline - 0.012, snowline + 0.04, altitude);
    snowMask *= 1 - smoothstep(0.55, 0.98, slope) * 0.62;
    snowMask *= 1 - vein * smoothstep(0.28, 0.7, slope) * 0.42;
    const gully = smoothstep(0.48, 0.88, Math.abs(noise2(angle * 5.7 + definition.seed, altitude * 5.4)));
    snowMask *= 1 - gully * 0.42;

    tempColor.copy(lowMoss).lerp(moss, smoothstep(0.0, 0.2, altitude) * 0.48);
    tempColor.lerp(rockWarm, smoothstep(0.1, 0.44, altitude) * 0.82);
    tempColor.lerp(rockCool, smoothstep(0.2, 0.72, altitude) * 0.64);
    tempColor.lerp(rockDark, clamp(slope * 0.78 + smoothstep(0.52, 0.9, broadNoise) * 0.26, 0, 0.78));
    const strata = smoothstep(0.42, 0.76, Math.sin(y * 8.6 + broadNoise * 3.6 + definition.seed * 2.0));
    tempColor.lerp(rockDark, strata * 0.1);
    tempColor.lerp(rockWarm, smoothstep(0.2, 0.75, grain) * 0.07);
    tempColor.lerp(rockDark, gully * (0.28 + slope * 0.22));

    if (snowMask > 0.004) {
      tempColorB.copy(snowCool).lerp(snow, smoothstep(-0.25, 0.72, grain));
      tempColorB.lerp(snowWarm, smoothstep(0.55, 0.95, broadNoise) * 0.26);
      // Wind-scoured ribs of stone remain visible through the snow.
      tempColorB.lerp(rockCool, clamp(vein * smoothstep(0.25, 0.68, slope) * 0.45, 0, 0.4));
      tempColorB.lerp(rockDark, gully * 0.16);
      tempColor.lerp(tempColorB, clamp(snowMask * 1.18, 0, 1));
    }

    setVertexColor(colors, i, tempColor);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function buildMountains() {
  const group = new THREE.Group();
  group.name = 'Snow mountains';
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
    envMapIntensity: 0.3,
  });
  addMountainSurfaceDetail(material);

  for (const definition of MOUNTAINS) {
    const segments = 104;
    const rings = 38;
    const positions = [];
    const indices = [];

    // Centre point + concentric rings.
    const centerY = mountainElevation(definition.x, definition.z, definition);
    positions.push(definition.x, centerY, definition.z);

    for (let ring = 1; ring <= rings; ring++) {
      const rr = ring / rings;
      for (let segment = 0; segment < segments; segment++) {
        const theta = (segment / segments) * Math.PI * 2;
        const boundaryNoise = 1
          + 0.025 * Math.sin(theta * 3.0 + definition.seed)
          + 0.014 * Math.sin(theta * 7.0 - definition.seed * 1.7);
        const x = definition.x
          + Math.cos(theta) * definition.radius * rr * boundaryNoise;
        const z = definition.z
          + Math.sin(theta) * definition.radiusZ * rr * boundaryNoise;
        positions.push(x, mountainElevation(x, z, definition), z);
      }
    }

    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(0, 1 + next, 1 + segment);
    }

    for (let ring = 2; ring <= rings; ring++) {
      const inner = 1 + (ring - 2) * segments;
      const outer = 1 + (ring - 1) * segments;
      for (let segment = 0; segment < segments; segment++) {
        const next = (segment + 1) % segments;
        const a = inner + segment;
        const b = inner + next;
        const c = outer + segment;
        const d = outer + next;
        indices.push(a, d, c, a, b, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    paintMountain(geometry, definition);
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

  }

  return group;
}

export function buildRockPillar() {
  const group = new THREE.Group();
  group.name = 'Waterfall cliff';

  const stoneMaterials = [
    new THREE.MeshStandardMaterial({ color: '#4d544c', roughness: 0.97, metalness: 0.0, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#5d5f53', roughness: 0.96, metalness: 0.0, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#6a6557', roughness: 0.95, metalness: 0.0, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#414a45', roughness: 0.98, metalness: 0.0, flatShading: true }),
  ];
  const mossMaterial = new THREE.MeshStandardMaterial({ color: '#5c7650', roughness: 0.94, flatShading: true });
  const ledgeMossMaterial = new THREE.MeshStandardMaterial({ color: '#5b744e', roughness: 0.94, flatShading: true });

  const rockSpecs = [
    { seed: 21, x: -1.32, y: 1.52, z: -0.34, sx: 1.12, sy: 0.54, sz: 0.88, rot: 0.4, material: 0 },
    { seed: 24, x: -1.44, y: 1.82, z: -0.46, sx: 0.94, sy: 0.52, sz: 0.78, rot: 1.3, material: 1 },
    { seed: 27, x: -1.2, y: 2.06, z: -0.25, sx: 0.85, sy: 0.48, sz: 0.73, rot: 2.2, material: 2 },
    { seed: 31, x: -1.4, y: 2.38, z: -0.43, sx: 0.72, sy: 0.43, sz: 0.62, rot: 0.8, material: 0 },
    { seed: 34, x: -1.18, y: 2.62, z: -0.24, sx: 0.63, sy: 0.34, sz: 0.55, rot: 1.9, material: 1 },
    { seed: 38, x: -2.02, y: 1.82, z: -0.22, sx: 0.56, sy: 0.36, sz: 0.5, rot: 2.8, material: 3 },
    { seed: 41, x: -0.72, y: 1.64, z: 0.13, sx: 0.62, sy: 0.3, sz: 0.52, rot: 0.6, material: 3 },
    { seed: 44, x: -1.95, y: 2.26, z: -0.7, sx: 0.45, sy: 0.35, sz: 0.4, rot: 1.1, material: 0 },
  ];

  for (const rock of rockSpecs) {
    const geometry = makeBoulderGeometry(rock.seed);
    const mesh = new THREE.Mesh(geometry, stoneMaterials[rock.material]);
    mesh.position.set(rock.x, rock.y, rock.z);
    mesh.rotation.set(0.1 * Math.sin(rock.rot), rock.rot, 0.08 * Math.cos(rock.rot * 1.7));
    mesh.scale.set(rock.sx, rock.sy, rock.sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // A flattened crown gives the little tarn a believable stone basin.
  const capGeometry = makeBoulderGeometry(57);
  const cap = new THREE.Mesh(capGeometry, ledgeMossMaterial);
  cap.position.set(CLIFF.x - 0.02, CLIFF.topY - 0.15, CLIFF.z - 0.08);
  cap.scale.set(0.64, 0.27, 0.56);
  cap.rotation.y = 0.7;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const rimRockData = [
    [-1.63, 2.84, -0.12, 0.22],
    [-1.47, 2.97, -0.55, 0.18],
    [-1.06, 2.83, -0.44, 0.2],
    [-0.99, 2.9, 0.02, 0.15],
    [-1.55, 2.99, 0.01, 0.14],
  ];
  for (let i = 0; i < rimRockData.length; i++) {
    const [x, y, z, size] = rimRockData[i];
    const rim = new THREE.Mesh(makeBoulderGeometry(70 + i), stoneMaterials[i % 2]);
    rim.position.set(x, y, z);
    rim.scale.set(size, size * 0.7, size * 0.9);
    rim.rotation.y = i * 1.3;
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);
  }

  // Mossy epaulettes soften the stacked-rock silhouette.
  const mossPatches = [
    [-1.75, 2.26, -0.06, 0.28],
    [-0.98, 2.4, -0.02, 0.22],
    [-1.55, 1.93, 0.08, 0.24],
    [-1.02, 2.77, -0.4, 0.18],
  ];
  for (let i = 0; i < mossPatches.length; i++) {
    const [x, y, z, size] = mossPatches[i];
    const patch = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mossMaterial);
    patch.position.set(x, y, z);
    patch.scale.set(size, size * 0.28, size * 0.78);
    patch.rotation.y = i * 2.1;
    patch.castShadow = false;
    patch.receiveShadow = true;
    group.add(patch);
  }

  // Two miniature pines anchor the cliff top to the surrounding forest.
  const miniPineTrunk = new THREE.MeshStandardMaterial({ color: '#5d4835', roughness: 0.96 });
  const miniPineGreen = new THREE.MeshStandardMaterial({ color: '#3f604d', roughness: 0.9, flatShading: true });
  for (const [x, z, s] of [[-1.62, -0.52, 0.8], [-1.02, -0.62, 0.62]]) {
    const pine = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.16, 5), miniPineTrunk);
    trunk.position.y = 0.08;
    pine.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.105 - i * 0.022, 0.2 - i * 0.025, 6), miniPineGreen);
      cone.position.y = 0.14 + i * 0.075;
      cone.castShadow = true;
      pine.add(cone);
    }
    pine.position.set(x, CLIFF.topY - 0.04, z);
    pine.scale.setScalar(s);
    pine.castShadow = true;
    group.add(pine);
  }

  const topCenter = new THREE.Vector3(CLIFF.x, CLIFF.topY, CLIFF.z);
  return {
    group,
    topRing: [],
    topCenter,
  };
}

function makeBoulderGeometry(seed = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute('position');
  const random = mulberry32(seed * 113 + 5);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wobble = 0.84
      + 0.16 * noise2(x * 2.0 + seed, z * 2.0 - seed)
      + 0.08 * noise2(y * 3.7 + 1.4, x * 3.1);
    position.setXYZ(
      i,
      x * wobble * (0.92 + random() * 0.12),
      y * wobble * (0.74 + random() * 0.1),
      z * wobble * (0.9 + random() * 0.16),
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildRocks() {
  const group = new THREE.Group();
  group.name = 'Scattered stones';
  const random = mulberry32(7321);
  const geometry = makeBoulderGeometry(9);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.93,
    metalness: 0.01,
    flatShading: true,
    envMapIntensity: 0.25,
  });
  const count = 25;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'Boulders';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const fixed = [
    [-1.85, 0.0, 0.6, 0.42],
    [-0.32, 0.24, 0.46, 0.31],
    [-0.98, 0.47, 0.3, 0.24],
    [-0.35, 0.52, 0.18, 0.16],
    [0.22, 2.85, 0.26, 0.2],
    [2.85, 2.15, 0.2, 0.24],
    [3.6, -0.2, 0.28, 0.28],
  ];

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const stoneColors = ['#858a80', '#96958a', '#a49d8c', '#777d77', '#908d80', '#838a7e'];
  const mossMatrices = [];

  for (let i = 0; i < count; i++) {
    let x;
    let z;
    let scale;
    if (i < fixed.length) {
      [x, z, scale] = fixed[i];
    } else {
      let attempts = 0;
      do {
        const theta = random() * Math.PI * 2;
        const radial = 0.25 + random() * 0.68;
        const p = islandPoint(theta, radial);
        x = p.x;
        z = p.z;
        scale = 0.08 + random() * 0.22;
        attempts++;
      } while (attempts < 40 && (
        lakeDistance(x, z) < 1.15
        || closestRiverSample(x, z).distance < 0.4
        || Math.hypot(x - LANDMARKS.cabin.x, z - LANDMARKS.cabin.z) < 1.05
      ));
    }

    const y = heightAt(x, z);
    dummy.position.set(x, y + scale * 0.14, z);
    dummy.rotation.set(random() * 0.3 - 0.15, random() * Math.PI * 2, random() * 0.2 - 0.1);
    dummy.scale.set(scale * (0.8 + random() * 0.6), scale * (0.42 + random() * 0.3), scale * (0.85 + random() * 0.5));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(stoneColors[Math.floor(random() * stoneColors.length)]);
    mesh.setColorAt(i, color);

    if (i < 8 || random() < 0.35) {
      const cap = new THREE.Object3D();
      cap.position.set(x, y + scale * 0.31, z);
      cap.rotation.set(0, random() * Math.PI * 2, 0);
      cap.scale.set(scale * 0.7, scale * 0.09, scale * 0.6);
      cap.updateMatrix();
      mossMatrices.push(cap.matrix.clone());
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  const mossGeometry = new THREE.IcosahedronGeometry(1, 1);
  const mossMaterial = new THREE.MeshStandardMaterial({
    color: '#697d58',
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  const mossCaps = new THREE.InstancedMesh(mossGeometry, mossMaterial, mossMatrices.length);
  mossMatrices.forEach((matrix, i) => mossCaps.setMatrixAt(i, matrix));
  mossCaps.instanceMatrix.needsUpdate = true;
  mossCaps.receiveShadow = true;
  group.add(mossCaps);
  return group;
}

export function buildMountainsAndCliff() {
  const group = new THREE.Group();
  group.add(buildMountains());
  const cliff = buildRockPillar();
  group.add(cliff.group);
  return { group, cliff };
}
