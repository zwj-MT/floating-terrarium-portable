import * as THREE from '../vendor/three/three.module.js';
import {
  LAKE,
  POOL,
  CLIFF,
  WATERFALL,
  RIVER_SAMPLES,
  lakeShoreline,
} from './geography.js';
import { makeSoftCircleTexture, makeMistTexture } from './utils.js';
import { mulberry32, lerp } from './noise.js';

const GLSL_NOISE = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.54;
    for (int i = 0; i < 4; i++) {
      value += amplitude * vnoise(p);
      p = p * 2.03 + vec2(4.1, -2.7);
      amplitude *= 0.48;
    }
    return value;
  }
`;

const WATER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWaveHeight;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float ripple = sin(position.x * 9.0 + uTime * 1.4) * cos(position.z * 11.0 - uTime * 1.1);
    float ripple2 = sin(position.x * 3.1 - position.z * 4.2 + uTime * 0.7);
    transformed.y += (ripple * 0.004 + ripple2 * 0.006) * uWaveHeight;
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uFlowSpeed;
  uniform float uLake;
  uniform float uNight;
  uniform float uWarmth;
  uniform float uSunStrength;
  uniform float uFoamStrength;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  ${GLSL_NOISE}

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 geometricNormal = normalize(vWorldNormal);

    vec2 flowUv = vUv;
    flowUv.y -= uTime * uFlowSpeed;

    float broadWave = fbm(vec2(flowUv.x * 5.0 + uSeed, flowUv.y * 7.0 + uSeed * 1.7) + uTime * 0.035);
    float crossWave = fbm(vec2(flowUv.x * 13.0 - uSeed, flowUv.y * 3.0 - uTime * 0.08));
    float edge = abs(vUv.x - 0.5) * 2.0;
    float lakeRadius = length(vUv - 0.5) * 2.0;

    vec3 tangentX = normalize(vec3(1.0, 0.0, 0.0));
    vec3 tangentZ = normalize(vec3(0.0, 0.0, 1.0));
    float dX = (broadWave - 0.5) * 0.19 + sin(flowUv.y * 33.0 + uSeed * 4.0) * 0.035;
    float dZ = (crossWave - 0.5) * 0.15 + cos(flowUv.x * 25.0 - uSeed * 2.0) * 0.03;
    vec3 normal = normalize(geometricNormal + tangentX * dX + tangentZ * dZ);

    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 2.6);

    float deepArea = uLake > 0.5 ? smoothstep(1.0, 0.08, lakeRadius) : smoothstep(0.52, 0.12, edge);
    vec3 color = mix(uShallowColor, uDeepColor, 0.38 + deepArea * 0.5);
    color = mix(color, uSkyColor, fresnel * 0.42);

    // Caustic ribbons: slow, translucent strokes rather than busy sparkle.
    float ribbon = fbm(vec2(flowUv.x * 9.0 + uSeed, flowUv.y * 17.0 - uTime * 0.16));
    ribbon = smoothstep(0.58, 0.78, ribbon);
    color += uSkyColor * ribbon * 0.045;

    vec3 halfVector = normalize(uSunDirection + viewDirection);
    float specular = pow(max(dot(normal, halfVector), 0.0), 120.0);
    float broadSpecular = pow(max(dot(normal, halfVector), 0.0), 16.0);
    color += uSunColor * (specular * 1.05 + broadSpecular * 0.12) * uSunStrength;

    // A handful of glints, concentrated on the crests.
    vec2 sparkleUv = vec2(flowUv.x * 14.0, flowUv.y * 18.0 - uTime * 0.4) + uSeed;
    float sparkle = smoothstep(0.8, 0.96, vnoise(sparkleUv))
      * smoothstep(0.0, 0.58, vnoise(sparkleUv * 0.51 + 4.1));
    color += uSunColor * sparkle * 0.05 * uSunStrength;

    // Silky foam along the banks and around the lake rim.
    float bankFoam = 0.0;
    if (uLake > 0.5) {
      bankFoam = smoothstep(0.88, 1.02, lakeRadius) * (0.35 + 0.65 * fbm(vec2(vUv.x * 21.0, vUv.y * 21.0 + uTime * 0.12)));
      bankFoam *= 0.48;
    } else {
      bankFoam = smoothstep(0.72, 1.04, edge) * (0.24 + 0.76 * fbm(vec2(flowUv.x * 16.0, flowUv.y * 26.0)));
      bankFoam *= 0.38;
    }
    color = mix(color, vec3(0.86, 0.93, 0.9), clamp(bankFoam * uFoamStrength, 0.0, 0.62));

    // Dim the water as the interior lighting falls into night.
    color *= mix(1.0, 0.38, uNight);
    color += vec3(0.08, 0.13, 0.18) * uNight * fresnel;

    float alpha = mix(0.9, 0.69, uNight);
    alpha = mix(alpha, 0.98, fresnel * 0.3);
    alpha = max(alpha, bankFoam * uFoamStrength * 0.52);
    gl_FragColor = vec4(color, alpha);
  }
`;

const WATERFALL_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    transformed.z += sin(uv.y * 18.0 - uTime * 2.4) * 0.018 * (0.3 + uv.y);
    transformed.x += sin(uv.y * 12.0 + uTime * 1.2) * 0.012;
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const WATERFALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  uniform vec3 uSunColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  ${GLSL_NOISE}

  void main() {
    vec2 uv = vUv;

    // Two scrolling striation layers make the sheet feel as if it is falling.
    float warpedY = uv.y * 5.0 + uTime * 1.25 + fbm(vec2(uv.x * 7.0, uv.y * 2.4)) * 0.3;
    float streakA = smoothstep(0.42, 0.81, fbm(vec2(uv.x * 17.0, warpedY * 2.6)));
    float streakB = smoothstep(0.55, 0.91, vnoise(vec2(uv.x * 41.0 + 2.0, warpedY * 5.0 + 1.0)));
    float foam = clamp(streakA * 0.63 + streakB * 0.5, 0.0, 0.9);

    vec3 deep = vec3(0.055, 0.19, 0.2);
    vec3 pale = vec3(0.7, 0.88, 0.86);
    vec3 color = mix(deep, pale, foam * 0.78 + 0.1);
    color += uSunColor * foam * 0.18;
    color *= mix(1.0, 0.48, uNight);

    float edgeFade = smoothstep(0.0, 0.17, uv.x) * smoothstep(1.0, 0.83, uv.x);
    float bottomFoam = smoothstep(0.88, 1.0, uv.y) * 0.55;
    float topFade = smoothstep(0.0, 0.06, uv.y);
    float alpha = (0.37 + foam * 0.38 + bottomFoam) * edgeFade * topFade;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createWaterMaterial({
  seed = 1,
  lake = false,
  flowSpeed = 0.1,
  deep = '#23555a',
  shallow = '#6f9c94',
  sky = '#9cb8be',
  foamStrength = 1,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uFlowSpeed: { value: flowSpeed },
      uLake: { value: lake ? 1 : 0 },
      uNight: { value: 0 },
      uWarmth: { value: 0.4 },
      uWaveHeight: { value: lake ? 0.6 : 1.0 },
      uSunStrength: { value: 1 },
      uFoamStrength: { value: foamStrength },
      uDeepColor: { value: new THREE.Color(deep) },
      uShallowColor: { value: new THREE.Color(shallow) },
      uSkyColor: { value: new THREE.Color(sky) },
      uSunColor: { value: new THREE.Color('#ffe3b6') },
      uSunDirection: { value: new THREE.Vector3(-0.3, 0.8, 0.4).normalize() },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function buildLakeGeometry(shoreline, waterY, inset = 0.988) {
  const rings = 7;
  const segments = shoreline.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  positions.push(LAKE.x, waterY, LAKE.z);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= rings; ring++) {
    const radial = (ring / rings) * inset;
    for (let i = 0; i < segments; i++) {
      const shore = shoreline[i];
      const theta = shore.theta;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const x = LAKE.x + (shore.x - LAKE.x) * radial;
      const z = LAKE.z + (shore.z - LAKE.z) * radial;
      positions.push(x, waterY, z);
      uvs.push(0.5 + cos * 0.5 * radial, 0.5 + sin * 0.5 * radial);
    }
  }

  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(0, 1 + next, 1 + segment);
  }

  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segments;
    const outer = 1 + ring * segments;
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
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRoundWaterGeometry(cx, cz, waterY, radiusX, radiusZ, segments = 72) {
  const positions = [cx, waterY, cz];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const wobble = 1 + 0.035 * Math.sin(theta * 5 + 1.1) + 0.02 * Math.sin(theta * 9 - 0.4);
    positions.push(
      cx + Math.cos(theta) * radiusX * wobble,
      waterY,
      cz + Math.sin(theta) * radiusZ * wobble,
    );
    uvs.push(0.5 + Math.cos(theta) * 0.5 * wobble, 0.5 + Math.sin(theta) * 0.5 * wobble);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + next, 1 + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRiverGeometry() {
  const columns = 4;
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = RIVER_SAMPLES.length;

  for (let i = 0; i < count; i++) {
    const sample = RIVER_SAMPLES[i];
    const prev = RIVER_SAMPLES[Math.max(0, i - 1)];
    const next = RIVER_SAMPLES[Math.min(count - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const length = Math.hypot(tx, tz) || 1;
    tx /= length;
    tz /= length;
    const nx = -tz;
    const nz = tx;
    for (let column = 0; column < columns; column++) {
      const v = column / (columns - 1);
      const offset = (v - 0.5) * 2 * sample.width;
      positions.push(
        sample.x + nx * offset,
        sample.y + Math.sin(v * Math.PI) * 0.004,
        sample.z + nz * offset,
      );
      uvs.push(v, i / (count - 1));
    }
  }

  for (let row = 0; row < count - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildWaterfallGeometry() {
  const rows = 28;
  const columns = 7;
  const positions = [];
  const uvs = [];
  const indices = [];
  const top = WATERFALL.top;
  const bottom = WATERFALL.bottom;
  const forward = new THREE.Vector3(0.28, 0, 1).normalize();
  const widthDir = new THREE.Vector3(1, 0, -0.14).normalize();

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const center = new THREE.Vector3().lerpVectors(top, bottom, t);
    const width = lerp(WATERFALL.widthTop, WATERFALL.widthBottom, t);
    const bulge = Math.sin(t * Math.PI) * 0.075;
    center.addScaledVector(forward, bulge);
    for (let column = 0; column < columns; column++) {
      const u = column / (columns - 1);
      const sway = Math.sin(t * Math.PI * 1.2 + u * 1.6) * 0.018 * t;
      const x = center.x + widthDir.x * (u - 0.5) * width + sway;
      const z = center.z + widthDir.z * (u - 0.5) * width + Math.sin(u * Math.PI) * 0.022;
      const y = center.y + Math.sin(u * Math.PI) * 0.008;
      positions.push(x, y, z);
      uvs.push(u, t);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCurvedRibbonGeometry(curve, segments, widthStart, widthEnd) {
  const columns = 4;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const nx = -tangent.z;
    const nz = tangent.x;
    const length = Math.hypot(nx, nz) || 1;
    const width = lerp(widthStart, widthEnd, t);
    for (let column = 0; column < columns; column++) {
      const u = column / (columns - 1);
      const offset = (u - 0.5) * width;
      positions.push(point.x + (nx / length) * offset, point.y, point.z + (nz / length) * offset);
      uvs.push(u, t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = i * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildWater() {
  const group = new THREE.Group();
  group.name = 'Living water';
  const materials = [];
  const shoreline = lakeShoreline(140);

  const lakeMaterial = createWaterMaterial({
    seed: 4.6,
    lake: true,
    flowSpeed: 0.025,
    deep: '#183e46',
    shallow: '#5f857f',
    sky: '#aac4c8',
    foamStrength: 0.42,
  });
  materials.push(lakeMaterial);
  const lakeMesh = new THREE.Mesh(buildLakeGeometry(shoreline, LAKE.waterY), lakeMaterial);
  lakeMesh.renderOrder = 2;
  group.add(lakeMesh);

  const riverMaterial = createWaterMaterial({
    seed: 8.2,
    lake: false,
    flowSpeed: 0.62,
    deep: '#275757',
    shallow: '#7ba496',
    sky: '#b4cbcb',
    foamStrength: 0.5,
  });
  materials.push(riverMaterial);
  const riverMesh = new THREE.Mesh(buildRiverGeometry(), riverMaterial);
  riverMesh.renderOrder = 2;
  group.add(riverMesh);

  const poolMaterial = createWaterMaterial({
    seed: 12.0,
    lake: true,
    flowSpeed: 0.07,
    deep: '#245254',
    shallow: '#729b8e',
    sky: '#aac4c8',
    foamStrength: 0.32,
  });
  materials.push(poolMaterial);
  const poolMesh = new THREE.Mesh(
    buildRoundWaterGeometry(POOL.x, POOL.z, POOL.waterY, POOL.radius * 0.96, POOL.radius * 0.88, 64),
    poolMaterial,
  );
  poolMesh.renderOrder = 2;
  group.add(poolMesh);

  const tarnMaterial = createWaterMaterial({
    seed: 18.0,
    lake: true,
    flowSpeed: 0.03,
    deep: '#1f454f',
    shallow: '#6f908f',
    sky: '#b8cdd0',
    foamStrength: 0.0,
  });
  materials.push(tarnMaterial);
  const tarnMesh = new THREE.Mesh(
    buildRoundWaterGeometry(CLIFF.x - 0.02, CLIFF.z - 0.08, CLIFF.topY - 0.025, 0.3, 0.23, 56),
    tarnMaterial,
  );
  tarnMesh.renderOrder = 2;
  group.add(tarnMesh);

  const outflowMaterial = createWaterMaterial({
    seed: 26.0,
    lake: false,
    flowSpeed: 0.4,
    deep: '#2a5354',
    shallow: '#7da092',
    sky: '#becdd0',
    foamStrength: 0.12,
  });
  materials.push(outflowMaterial);
  const outflowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CLIFF.x - 0.02, CLIFF.topY - 0.022, CLIFF.z - 0.06),
    new THREE.Vector3(-1.19, CLIFF.topY - 0.024, -0.22),
    new THREE.Vector3(-1.1, WATERFALL.top.y + 0.005, -0.02),
    new THREE.Vector3(WATERFALL.top.x, WATERFALL.top.y, WATERFALL.top.z),
  ]);
  const outflowMesh = new THREE.Mesh(buildCurvedRibbonGeometry(outflowCurve, 28, 0.055, 0.1), outflowMaterial);
  outflowMesh.renderOrder = 2;
  group.add(outflowMesh);

  const waterfallMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uSunColor: { value: new THREE.Color('#fff0d2') },
    },
    vertexShader: WATERFALL_VERTEX,
    fragmentShader: WATERFALL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const waterfallMesh = new THREE.Mesh(buildWaterfallGeometry(), waterfallMaterial);
  waterfallMesh.renderOrder = 3;
  group.add(waterfallMesh);

  // Soft foam at the foot of the fall.
  const foamTexture = makeSoftCircleTexture(128, 0.02);
  const foamSprites = [];
  for (let i = 0; i < 4; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: foamTexture,
      color: '#d8ebe5',
      transparent: true,
      opacity: 0.26 - i * 0.035,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    const angle = i * 2.1;
    sprite.position.set(
      WATERFALL.bottom.x + Math.cos(angle) * 0.16,
      POOL.waterY + 0.03,
      WATERFALL.bottom.z + Math.sin(angle) * 0.12,
    );
    const scale = 0.45 + i * 0.12;
    sprite.scale.set(scale, scale * 0.48, 1);
    sprite.renderOrder = 6;
    group.add(sprite);
    foamSprites.push({ sprite, phase: i * 1.7, base: sprite.material.opacity });
  }

  const mistTexture = makeMistTexture(5, 256);
  const mistSprites = [];
  for (let i = 0; i < 4; i++) {
    const material = new THREE.SpriteMaterial({
      map: mistTexture,
      color: '#c9e2dd',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(
      WATERFALL.bottom.x + (i - 1.5) * 0.19,
      POOL.waterY + 0.08 + i * 0.06,
      WATERFALL.bottom.z + 0.07 + i * 0.04,
    );
    sprite.scale.set(1.25 + i * 0.3, 0.7 + i * 0.08, 1);
    sprite.renderOrder = 6;
    group.add(sprite);
    mistSprites.push({ sprite, phase: i * 1.3, base: 0.14 + i * 0.025 });
  }

  // A small host of water droplets travelling down the fall.
  const dropletCount = 110;
  const dropletPositions = new Float32Array(dropletCount * 3);
  const droplets = [];
  const random = mulberry32(112);
  const top = WATERFALL.top;
  const bottom = WATERFALL.bottom;
  for (let i = 0; i < dropletCount; i++) {
    droplets.push({
      u: random(),
      v: random(),
      speed: 0.32 + random() * 0.38,
      spread: (random() - 0.5) * 0.32,
      phase: random() * Math.PI * 2,
    });
  }
  const dropletGeometry = new THREE.BufferGeometry();
  dropletGeometry.setAttribute('position', new THREE.BufferAttribute(dropletPositions, 3));
  const dropletMaterial = new THREE.PointsMaterial({
    map: makeSoftCircleTexture(64, 0.1),
    color: '#d9efeb',
    size: 0.032,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    sizeAttenuation: true,
  });
  const dropletPoints = new THREE.Points(dropletGeometry, dropletMaterial);
  dropletPoints.frustumCulled = false;
  group.add(dropletPoints);

  const dropletPosition = new THREE.Vector3();
  const water = {
    group,
    materials,
    waterfallMaterial,
    update(elapsed, dt, lighting) {
      for (const material of materials) {
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uNight.value = lighting.night;
        material.uniforms.uWarmth.value = lighting.warmth;
        material.uniforms.uSunDirection.value.copy(lighting.sunDirection);
        material.uniforms.uSunColor.value.copy(lighting.sunColor);
        material.uniforms.uSunStrength.value = lighting.sunStrength;
        material.uniforms.uSkyColor.value.copy(lighting.skyColor);
      }
      waterfallMaterial.uniforms.uTime.value = elapsed;
      waterfallMaterial.uniforms.uNight.value = lighting.night;
      waterfallMaterial.uniforms.uSunColor.value.copy(lighting.sunColor);

      for (const foam of foamSprites) {
        const pulse = 0.62 + Math.sin(elapsed * 1.1 + foam.phase) * 0.18 + Math.sin(elapsed * 2.3 + foam.phase) * 0.07;
        foam.sprite.material.opacity = foam.base * pulse * (1 - lighting.night * 0.35);
        foam.sprite.position.y = POOL.waterY + 0.024 + Math.sin(elapsed * 0.8 + foam.phase) * 0.012;
      }

      for (const mist of mistSprites) {
        mist.sprite.material.opacity = mist.base * (0.8 + Math.sin(elapsed * 0.55 + mist.phase) * 0.2) * (1 - lighting.night * 0.25);
        mist.sprite.position.x = WATERFALL.bottom.x + Math.sin(elapsed * 0.16 + mist.phase) * 0.16;
      }

      for (let i = 0; i < dropletCount; i++) {
        const droplet = droplets[i];
        droplet.v += droplet.speed * dt;
        if (droplet.v > 1) {
          droplet.v -= 1;
          droplet.u = Math.random();
        }
        const t = droplet.v;
        dropletPosition.lerpVectors(top, bottom, t);
        dropletPosition.x += (droplet.u - 0.5) * lerp(WATERFALL.widthTop, WATERFALL.widthBottom, t)
          + Math.sin(elapsed * 2.1 + droplet.phase) * 0.025 * t;
        dropletPosition.z += 0.1 * Math.sin(t * Math.PI) + Math.cos(droplet.phase) * droplet.spread * t;
        dropletPosition.y += 0.01 * Math.sin(elapsed * 3.0 + droplet.phase);
        dropletPositions[i * 3] = dropletPosition.x;
        dropletPositions[i * 3 + 1] = dropletPosition.y;
        dropletPositions[i * 3 + 2] = dropletPosition.z;
      }
      dropletGeometry.getAttribute('position').needsUpdate = true;

      // The hanging tarn overflows in step with the sheet.
      tarnMaterial.uniforms.uTime.value = elapsed + 0.4;
    },
  };

  return water;
}
