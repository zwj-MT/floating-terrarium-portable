import * as THREE from '../vendor/three/three.module.js';
import { CUBE, heightAt } from './geography.js';
import { buildIsland, buildMountainsAndCliff, buildRocks } from './terrain.js';
import { buildWater } from './water.js';
import { buildFlora } from './flora.js';
import { createDetails } from './details.js';
import {
  makeSoftCircleTexture,
  makeBokehTexture,
  makeCanvas,
  canvasTexture,
} from './utils.js';
import { clamp, smoothstep, lerp } from './noise.js';

const SUN_TARGET = new THREE.Vector3(0, 1.8, 0);
const CAMERA_POSITION_APPROX = new THREE.Vector3(17, 17, 17).normalize();

const DAY_STOPS = [
  {
    t: 0.0,
    sunPos: [-7, 10, -9],
    sunColor: '#91addd',
    sunIntensity: 0.9,
    hemiSky: '#2a4260',
    hemiGround: '#0a0f12',
    hemiIntensity: 0.42,
    ambient: '#0e1926',
    ambientIntensity: 0.26,
    fillColor: '#36536d',
    fillIntensity: 0.34,
    rimColor: '#a4cfee',
    rimIntensity: 1.12,
    skyReflect: '#2d4b5c',
    night: 1.0,
    warmth: 0.08,
    exposure: 1.02,
    skyTop: '#020509',
    skyBottom: '#09141a',
    nebula: '#10283a',
  },
  {
    t: 0.19,
    sunPos: [-10, 7, -2],
    sunColor: '#aaa2c8',
    sunIntensity: 0.78,
    hemiSky: '#3b4360',
    hemiGround: '#16161c',
    hemiIntensity: 0.44,
    ambient: '#121b29',
    ambientIntensity: 0.23,
    fillColor: '#3e4e66',
    fillIntensity: 0.34,
    rimColor: '#aec4dd',
    rimIntensity: 0.95,
    skyReflect: '#354656',
    night: 0.92,
    warmth: 0.18,
    exposure: 1.02,
    skyTop: '#03060b',
    skyBottom: '#0d151d',
    nebula: '#182737',
  },
  {
    t: 0.255,
    sunPos: [-11, 4, 6],
    sunColor: '#ffc39e',
    sunIntensity: 1.7,
    hemiSky: '#697d95',
    hemiGround: '#3b2c25',
    hemiIntensity: 0.52,
    ambient: '#333747',
    ambientIntensity: 0.2,
    fillColor: '#7c91a6',
    fillIntensity: 0.38,
    rimColor: '#e1d3c7',
    rimIntensity: 0.9,
    skyReflect: '#87746d',
    night: 0.42,
    warmth: 0.92,
    exposure: 1.1,
    skyTop: '#060a0e',
    skyBottom: '#1b1820',
    nebula: '#523944',
  },
  {
    t: 0.36,
    sunPos: [-6, 12, 8],
    sunColor: '#ffe5c3',
    sunIntensity: 2.55,
    hemiSky: '#a8c5d2',
    hemiGround: '#4f5241',
    hemiIntensity: 0.64,
    ambient: '#415158',
    ambientIntensity: 0.22,
    fillColor: '#97b0bc',
    fillIntensity: 0.5,
    rimColor: '#d0e3ea',
    rimIntensity: 1.08,
    skyReflect: '#90a8b1',
    night: 0.06,
    warmth: 0.66,
    exposure: 1.09,
    skyTop: '#050b10',
    skyBottom: '#121c22',
    nebula: '#23343d',
  },
  {
    t: 0.51,
    sunPos: [-2, 18, 6],
    sunColor: '#fff6e7',
    sunIntensity: 2.96,
    hemiSky: '#cbe0e8',
    hemiGround: '#62694e',
    hemiIntensity: 0.72,
    ambient: '#4c5f66',
    ambientIntensity: 0.22,
    fillColor: '#a4bac4',
    fillIntensity: 0.54,
    rimColor: '#d6e9ee',
    rimIntensity: 1.18,
    skyReflect: '#9fb8c0',
    night: 0.0,
    warmth: 0.35,
    exposure: 1.07,
    skyTop: '#050b10',
    skyBottom: '#111c22',
    nebula: '#1d3038',
  },
  {
    t: 0.635,
    sunPos: [8, 11, 5],
    sunColor: '#ffe7c8',
    sunIntensity: 2.8,
    hemiSky: '#a9c5cf',
    hemiGround: '#565940',
    hemiIntensity: 0.68,
    ambient: '#465a60',
    ambientIntensity: 0.23,
    fillColor: '#9bb6c1',
    fillIntensity: 0.56,
    rimColor: '#d8ecf2',
    rimIntensity: 1.28,
    skyReflect: '#93aab0',
    night: 0.03,
    warmth: 0.62,
    exposure: 1.1,
    skyTop: '#070b0e',
    skyBottom: '#160f0d',
    nebula: '#2c211c',
  },
  {
    t: 0.685,
    sunPos: [10, 7.5, 3],
    sunColor: '#ffd9ae',
    sunIntensity: 2.62,
    hemiSky: '#91aeb8',
    hemiGround: '#564b36',
    hemiIntensity: 0.6,
    ambient: '#435256',
    ambientIntensity: 0.23,
    fillColor: '#8399a8',
    fillIntensity: 0.5,
    rimColor: '#d7e8ef',
    rimIntensity: 1.2,
    skyReflect: '#978269',
    night: 0.08,
    warmth: 0.9,
    exposure: 1.13,
    skyTop: '#090c0f',
    skyBottom: '#211711',
    nebula: '#3d2a1c',
  },
  {
    t: 0.75,
    sunPos: [12, 3.5, -1],
    sunColor: '#ffa477',
    sunIntensity: 1.38,
    hemiSky: '#6c7892',
    hemiGround: '#382721',
    hemiIntensity: 0.4,
    ambient: '#2a303e',
    ambientIntensity: 0.17,
    fillColor: '#566d83',
    fillIntensity: 0.34,
    rimColor: '#e4d1c4',
    rimIntensity: 0.9,
    skyReflect: '#6f686c',
    night: 0.3,
    warmth: 1.0,
    exposure: 1.05,
    skyTop: '#070a0e',
    skyBottom: '#1c161c',
    nebula: '#3c2c31',
  },
  {
    t: 0.82,
    sunPos: [6, 4, -10],
    sunColor: '#8fa0cd',
    sunIntensity: 0.9,
    hemiSky: '#3a4b68',
    hemiGround: '#151820',
    hemiIntensity: 0.4,
    ambient: '#131f2d',
    ambientIntensity: 0.23,
    fillColor: '#394c63',
    fillIntensity: 0.32,
    rimColor: '#b0c8e1',
    rimIntensity: 1.05,
    skyReflect: '#405264',
    night: 0.7,
    warmth: 0.32,
    exposure: 1.04,
    skyTop: '#04070b',
    skyBottom: '#0f1621',
    nebula: '#1d2a3c',
  },
  {
    t: 0.9,
    sunPos: [-7, 10, -9],
    sunColor: '#91addd',
    sunIntensity: 0.9,
    hemiSky: '#2a4260',
    hemiGround: '#0a0f12',
    hemiIntensity: 0.42,
    ambient: '#0e1926',
    ambientIntensity: 0.26,
    fillColor: '#36536d',
    fillIntensity: 0.34,
    rimColor: '#a4cfee',
    rimIntensity: 1.12,
    skyReflect: '#2d4b5c',
    night: 1.0,
    warmth: 0.08,
    exposure: 1.02,
    skyTop: '#020509',
    skyBottom: '#09141a',
    nebula: '#10283a',
  },
  {
    t: 1.0,
    sunPos: [-7, 10, -9],
    sunColor: '#91addd',
    sunIntensity: 0.9,
    hemiSky: '#2a4260',
    hemiGround: '#0a0f12',
    hemiIntensity: 0.42,
    ambient: '#0e1926',
    ambientIntensity: 0.26,
    fillColor: '#36536d',
    fillIntensity: 0.34,
    rimColor: '#a4cfee',
    rimIntensity: 1.12,
    skyReflect: '#2d4b5c',
    night: 1.0,
    warmth: 0.08,
    exposure: 1.02,
    skyTop: '#020509',
    skyBottom: '#09141a',
    nebula: '#10283a',
  },
].map((stop) => ({
  ...stop,
  sunColor: new THREE.Color(stop.sunColor),
  hemiSky: new THREE.Color(stop.hemiSky),
  hemiGround: new THREE.Color(stop.hemiGround),
  ambient: new THREE.Color(stop.ambient),
  fillColor: new THREE.Color(stop.fillColor),
  rimColor: new THREE.Color(stop.rimColor),
  skyReflect: new THREE.Color(stop.skyReflect),
  skyTop: new THREE.Color(stop.skyTop),
  skyBottom: new THREE.Color(stop.skyBottom),
  nebula: new THREE.Color(stop.nebula),
}));

const lightingState = {
  sunDirection: new THREE.Vector3(),
  sunColor: new THREE.Color(),
  sunStrength: 1,
  skyColor: new THREE.Color(),
  skyTop: new THREE.Color(),
  skyBottom: new THREE.Color(),
  nebula: new THREE.Color(),
  night: 0,
  warmth: 0,
  exposure: 1,
  fillColor: new THREE.Color(),
  rimColor: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  ambientColor: new THREE.Color(),
  sunIntensity: 2,
  hemiIntensity: 0.5,
  fillIntensity: 0.4,
  rimIntensity: 0.7,
  ambientIntensity: 0.15,
};

function sampleDayPalette(dayT) {
  const time = ((dayT % 1) + 1) % 1;
  let index = DAY_STOPS.length - 2;
  for (let i = 0; i < DAY_STOPS.length - 1; i++) {
    if (time >= DAY_STOPS[i].t && time < DAY_STOPS[i + 1].t) {
      index = i;
      break;
    }
  }
  const a = DAY_STOPS[index];
  const b = DAY_STOPS[Math.min(index + 1, DAY_STOPS.length - 1)];
  const span = Math.max(0.00001, b.t - a.t);
  const t = clamp((time - a.t) / span);
  const smooth = t * t * (3 - 2 * t);

  lightingState.sunDirection.set(...a.sunPos).lerp(new THREE.Vector3(...b.sunPos).normalize(), 0);
  const aDir = new THREE.Vector3(...a.sunPos).normalize();
  const bDir = new THREE.Vector3(...b.sunPos).normalize();
  lightingState.sunDirection.copy(aDir).lerp(bDir, smooth).normalize();

  lightingState.sunColor.copy(a.sunColor).lerp(b.sunColor, smooth);
  lightingState.skyColor.copy(a.skyReflect).lerp(b.skyReflect, smooth);
  lightingState.skyTop.copy(a.skyTop).lerp(b.skyTop, smooth);
  lightingState.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, smooth);
  lightingState.nebula.copy(a.nebula).lerp(b.nebula, smooth);
  lightingState.fillColor.copy(a.fillColor).lerp(b.fillColor, smooth);
  lightingState.rimColor.copy(a.rimColor).lerp(b.rimColor, smooth);
  lightingState.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, smooth);
  lightingState.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, smooth);
  lightingState.ambientColor.copy(a.ambient).lerp(b.ambient, smooth);

  lightingState.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, smooth);
  lightingState.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, smooth);
  lightingState.fillIntensity = lerp(a.fillIntensity, b.fillIntensity, smooth);
  lightingState.rimIntensity = lerp(a.rimIntensity, b.rimIntensity, smooth);
  lightingState.ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, smooth);
  lightingState.night = lerp(a.night, b.night, smooth);
  lightingState.warmth = lerp(a.warmth, b.warmth, smooth);
  lightingState.exposure = lerp(a.exposure, b.exposure, smooth);
  lightingState.sunStrength = clamp(lightingState.sunIntensity * 0.52, 0.25, 1.4);

  return lightingState;
}

function makeBackground(scene) {
  const geometry = new THREE.SphereGeometry(60, 48, 30);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color('#020509') },
      uBottom: { value: new THREE.Color('#09141a') },
      uNebula: { value: new THREE.Color('#10283a') },
      uNight: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uNebula;
      uniform float uNight;
      varying vec3 vDirection;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.55;
        for (int i = 0; i < 5; i++) {
          value += amplitude * noise(p);
          p = p * 2.02 + vec2(3.7, -1.9);
          amplitude *= 0.49;
        }
        return value;
      }

      void main() {
        vec3 d = normalize(vDirection);
        float horizon = smoothstep(-0.38, 0.62, d.y);
        vec3 color = mix(uBottom, uTop, horizon);
        float cloud = fbm(d.xz * 2.6 + d.y * 0.7 + uTime * 0.002);
        float cloudFine = fbm(d.xz * 6.2 - d.y * 1.3 + 3.2);
        float haze = smoothstep(0.36, 0.82, cloud) * (0.24 + 0.28 * cloudFine);
        color = mix(color, uNebula, haze * (0.10 + uNight * 0.14));
        color += uNebula * 0.035 * pow(max(0.0, 1.0 - abs(d.y + 0.06) * 2.1), 4.0);
        float lowerDepth = smoothstep(-0.9, 0.1, d.y);
        color *= mix(0.55, 1.0, lowerDepth);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const background = new THREE.Mesh(geometry, material);
  background.renderOrder = -1000;
  background.frustumCulled = false;
  scene.add(background);
  return background;
}

function makeStars() {
  const random = (() => {
    let seed = 1234567;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();
  const count = 460;
  const positions = [];
  const sizes = [];
  const phases = [];
  const colors = [];
  const palette = [new THREE.Color('#c5d8ed'), new THREE.Color('#f0ddbd'), new THREE.Color('#a9c9d9')];
  while (positions.length < count * 3) {
    const theta = random() * Math.PI * 2;
    const y = random() * 2 - 1;
    const radius = 34 + random() * 6;
    const r = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
    if (dir.dot(CAMERA_POSITION_APPROX) > 0.15) continue;
    positions.push(dir.x * radius, dir.y * radius + 5, dir.z * radius);
    sizes.push(0.5 + random() * 1.45 + (random() > 0.965 ? 1.4 : 0));
    phases.push(random() * Math.PI * 2);
    const color = palette[Math.floor(random() * palette.length)];
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.4 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSize;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        vTwinkle = 0.55 + 0.45 * sin(uTime * (0.14 + aPhase * 0.002) + aPhase);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (280.0 / max(-mvPosition.z, 1.0));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.02, d) * uOpacity * vTwinkle;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -900;
  return points;
}

function makeGlassCube() {
  const half = CUBE.half;
  const height = CUBE.height;
  const centerY = CUBE.centerY;
  const group = new THREE.Group();
  group.name = 'Glass cube';

  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uWarmth: { value: 0.6 },
    uSunColor: { value: new THREE.Color('#ffe0b8') },
    uTint: { value: new THREE.Color('#b5d8df') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNight;
      uniform float uWarmth;
      uniform vec3 uSunColor;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 normal = normalize(vWorldNormal);
        float facing = abs(dot(normal, viewDirection));
        float fresnel = pow(1.0 - facing, 2.8);

        vec2 centeredUv = abs(vUv - 0.5);
        float edgeMask = smoothstep(0.455, 0.5, max(centeredUv.x, centeredUv.y));
        float border = smoothstep(0.485, 0.5, max(centeredUv.x, centeredUv.y));

        float sheen = smoothstep(0.76, 0.96, sin((vUv.x * 1.0 + vUv.y * 0.72) * 8.0 + uTime * 0.05) * 0.5 + 0.5);
        sheen *= smoothstep(0.12, 0.82, vUv.y) * (0.35 + fresnel * 0.8);

        vec3 iridescence = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fresnel * 1.2 + vUv.y * 0.26));
        vec3 warmTint = mix(vec3(0.55, 0.76, 0.8), vec3(0.92, 0.78, 0.58), uWarmth * 0.52);
        vec3 color = warmTint * (0.1 + fresnel * 0.85);
        color += iridescence * fresnel * 0.12;
        color += vec3(0.85, 0.93, 0.92) * sheen * 0.12;
        color += uSunColor * fresnel * (0.12 + uWarmth * 0.1);
        color += vec3(0.6, 0.9, 1.0) * border * 0.48;

        float alpha = 0.014 + fresnel * 0.062 + edgeMask * 0.046 + sheen * 0.034;
        alpha += border * 0.10;
        alpha *= mix(1.0, 0.8, uNight);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });

  const sideMaterial = material;
  const faceSpecs = [
    { position: [0, centerY, half], rotation: [0, 0, 0], size: [half * 2, height] },
    { position: [0, centerY, -half], rotation: [0, Math.PI, 0], size: [half * 2, height] },
    { position: [half, centerY, 0], rotation: [0, Math.PI / 2, 0], size: [half * 2, height] },
    { position: [-half, centerY, 0], rotation: [0, -Math.PI / 2, 0], size: [half * 2, height] },
  ];
  for (const spec of faceSpecs) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(spec.size[0], spec.size[1]), sideMaterial);
    face.position.set(...spec.position);
    face.rotation.set(...spec.rotation);
    face.renderOrder = 20;
    group.add(face);
  }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), sideMaterial);
  top.position.y = centerY + height * 0.5;
  top.rotation.x = -Math.PI / 2;
  top.renderOrder = 20;
  group.add(top);
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), sideMaterial);
  bottom.position.y = centerY - height * 0.5;
  bottom.rotation.x = Math.PI / 2;
  bottom.renderOrder = 20;
  group.add(bottom);

  const edges = [];
  const edgeCoreMaterial = new THREE.MeshBasicMaterial({
    color: '#d9f6ff',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    toneMapped: false,
  });
  const edgeGlowMaterial = new THREE.MeshBasicMaterial({
    color: '#9bd9e8',
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const edgeGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const corners = [];
  const yLow = centerY - height * 0.5;
  const yHigh = centerY + height * 0.5;
  for (const y of [yLow, yHigh]) {
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * 0.5;
      corners.push(new THREE.Vector3(Math.cos(angle) * half, y, Math.sin(angle) * half));
    }
  }
  const edgePairs = [];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    edgePairs.push([corners[i], corners[next]]);
    edgePairs.push([corners[i + 4], corners[next + 4]]);
    edgePairs.push([corners[i], corners[i + 4]]);
  }

  const makeEdge = (start, end, radius, edgeMaterial) => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.position.copy(start).addScaledVector(direction, 0.5);
    edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    edge.scale.set(radius, length, radius);
    edge.renderOrder = 24;
    group.add(edge);
    edges.push(edge);
    return edge;
  };
  for (const [start, end] of edgePairs) {
    makeEdge(start, end, 0.010, edgeCoreMaterial);
    makeEdge(start, end, 0.048, edgeGlowMaterial);
  }

  const cornerMaterial = new THREE.MeshBasicMaterial({
    color: '#e7fbff',
    transparent: true,
    opacity: 0.7,
    toneMapped: false,
    depthWrite: false,
  });
  const cornerGeometry = new THREE.SphereGeometry(0.04, 8, 6);
  const cornerSprites = [];
  const glintTexture = makeSoftCircleTexture(96, 0.04);
  for (const corner of corners) {
    const node = new THREE.Mesh(cornerGeometry, cornerMaterial);
    node.position.copy(corner);
    node.renderOrder = 25;
    group.add(node);

    const glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glintTexture,
      color: '#d9f8ff',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    glint.position.copy(corner);
    glint.scale.set(0.25, 0.25, 1);
    glint.renderOrder = 26;
    group.add(glint);
    cornerSprites.push({ sprite: glint, phase: cornerSprites.length * 1.7 });
  }

  return {
    group,
    material,
    edgeCoreMaterial,
    edgeGlowMaterial,
    cornerMaterial,
    cornerSprites,
    uniforms,
  };
}

function makeCrystalGlow() {
  const group = new THREE.Group();
  group.name = 'Under-island crystals';
  const material = new THREE.MeshStandardMaterial({
    color: '#8edbd0',
    emissive: '#63c7c1',
    emissiveIntensity: 0.15,
    roughness: 0.28,
    metalness: 0.12,
    transparent: true,
    opacity: 0.48,
    envMapIntensity: 0.8,
  });
  const shards = [
    [-0.82, 1.02, 0.42, 0.42, -0.15],
    [0.62, 1.08, 0.58, 0.3, 0.25],
    [-0.16, 1.22, -0.62, 0.34, 0.12],
    [0.98, 1.18, -0.35, 0.25, -0.32],
    [-1.18, 1.2, -0.35, 0.2, 0.38],
  ];
  for (const [x, y, z, scale, tilt] of shards) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.07, scale, 5), material);
    shard.position.set(x, y, z);
    shard.rotation.z = tilt;
    shard.rotation.x = tilt * 0.5;
    shard.castShadow = false;
    group.add(shard);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSoftCircleTexture(96, 0.02),
    color: '#78d8d0',
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  glow.position.set(0, 1.05, 0);
  glow.scale.set(2.8, 1.0, 1);
  group.add(glow);
  return { group, material, glow };
}

function makeCelestialGlow() {
  const group = new THREE.Group();
  group.name = 'Distant light';
  const haloTexture = makeSoftCircleTexture(128, 0.01);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture,
    color: '#ffe2b1',
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  core.position.set(-8.5, 9.2, -8.5);
  core.scale.set(5.5, 5.5, 1);
  group.add(core);

  const outer = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture,
    color: '#a9cbd3',
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  outer.position.set(8.5, 4.8, -10.5);
  outer.scale.set(8.5, 9.5, 1);
  group.add(outer);
  return { group, core, outer };
}

function makeBackdropGlow() {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeBokehTexture(128),
    color: '#9ab5b5',
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  sprite.position.set(-6.5, 4.0, -8.0);
  sprite.scale.set(13, 9, 1);
  return sprite;
}

export function createTerrarium({ renderer, scene }) {
  const diorama = new THREE.Group();
  diorama.name = 'Floating terrarium';
  scene.add(diorama);
  const interior = new THREE.Group();
  interior.name = 'Interior world';
  interior.position.y = 0.28;
  diorama.add(interior);

  const background = makeBackground(scene);
  const stars = makeStars();
  stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  scene.add(stars);
  const backdropGlow = makeBackdropGlow();
  scene.add(backdropGlow);
  const celestial = makeCelestialGlow();
  scene.add(celestial.group);

  const island = buildIsland();
  interior.add(island.group);

  const mountains = buildMountainsAndCliff();
  interior.add(mountains.group);
  interior.add(buildRocks());

  const water = buildWater();
  interior.add(water.group);

  const flora = buildFlora();
  interior.add(flora.group);

  const details = createDetails(renderer);
  interior.add(details.group);
  scene.add(details.backdrop);

  const glass = makeGlassCube();
  diorama.add(glass.group);

  const crystals = makeCrystalGlow();
  interior.add(crystals.group);

  // Lights: one sculpting key, one cool rim, and a broad camera-side fill.
  const sun = new THREE.DirectionalLight('#ffe4c4', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 45;
  sun.shadow.camera.left = -7.2;
  sun.shadow.camera.right = 7.2;
  sun.shadow.camera.top = 7.2;
  sun.shadow.camera.bottom = -7.2;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.035;
  sun.target.position.copy(SUN_TARGET);
  scene.add(sun, sun.target);

  const rim = new THREE.DirectionalLight('#c6e4ef', 0.7);
  rim.position.set(-9, 6, -8);
  rim.target.position.set(0, 2.4, 0);
  scene.add(rim, rim.target);

  const fill = new THREE.DirectionalLight('#879aa9', 0.4);
  fill.position.set(-9, 4.5, 10);
  fill.target.position.set(0, 2.0, 0);
  scene.add(fill, fill.target);

  const hemi = new THREE.HemisphereLight('#99b7c3', '#31382b', 0.5);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight('#384852', 0.15);
  scene.add(ambient);

  const tempColor = new THREE.Color();
  const sunVector = new THREE.Vector3();
  let lastLighting = sampleDayPalette(0.685);

  function update(elapsed, dt, dayT) {
    const lighting = sampleDayPalette(dayT);
    lastLighting = lighting;

    sunVector.copy(lighting.sunDirection).multiplyScalar(24).add(SUN_TARGET);
    sun.position.copy(sunVector);
    sun.color.copy(lighting.sunColor);
    sun.intensity = lighting.sunIntensity;
    sun.target.position.copy(SUN_TARGET);
    sun.target.updateMatrixWorld();

    rim.color.copy(lighting.rimColor);
    rim.intensity = lighting.rimIntensity;
    fill.color.copy(lighting.fillColor);
    fill.intensity = lighting.fillIntensity;
    hemi.color.copy(lighting.hemiSky);
    hemi.groundColor.copy(lighting.hemiGround);
    hemi.intensity = lighting.hemiIntensity;
    ambient.color.copy(lighting.ambientColor);
    ambient.intensity = lighting.ambientIntensity;

    background.material.uniforms.uTime.value = elapsed;
    background.material.uniforms.uTop.value.copy(lighting.skyTop);
    background.material.uniforms.uBottom.value.copy(lighting.skyBottom);
    background.material.uniforms.uNebula.value.copy(lighting.nebula);
    background.material.uniforms.uNight.value = lighting.night;

    stars.material.uniforms.uTime.value = elapsed;
    stars.material.uniforms.uOpacity.value = 0.1 + lighting.night * 0.66;
    stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();

    backdropGlow.material.opacity = 0.025 + lighting.warmth * 0.025 + lighting.night * 0.018;
    backdropGlow.material.color.copy(lighting.skyColor);
    celestial.core.material.opacity = (0.05 + lighting.warmth * 0.17) * (1 - lighting.night * 0.5);
    celestial.core.material.color.copy(lighting.sunColor).lerp(new THREE.Color('#ffefd0'), 0.4);
    celestial.outer.material.opacity = 0.03 + lighting.night * 0.07;
    celestial.outer.material.color.copy(lighting.rimColor);

    glass.uniforms.uTime.value = elapsed;
    glass.uniforms.uNight.value = lighting.night;
    glass.uniforms.uWarmth.value = lighting.warmth;
    glass.uniforms.uSunColor.value.copy(lighting.sunColor);
    glass.uniforms.uTint.value.copy(lighting.skyColor).lerp(new THREE.Color('#cef4f5'), 0.35);
    glass.edgeCoreMaterial.color.copy(lighting.sunColor).lerp(new THREE.Color('#d7f7ff'), 0.65);
    glass.edgeCoreMaterial.opacity = 0.29 + lighting.warmth * 0.07;
    glass.edgeGlowMaterial.opacity = 0.03 + lighting.night * 0.015;
    glass.cornerMaterial.opacity = 0.46 + lighting.night * 0.16;
    for (const glint of glass.cornerSprites) {
      const pulse = 0.6 + Math.sin(elapsed * 0.55 + glint.phase) * 0.25 + Math.sin(elapsed * 1.7 + glint.phase * 0.7) * 0.08;
      glint.sprite.material.opacity = (0.05 + lighting.warmth * 0.04 + lighting.night * 0.08) * pulse;
      const scale = 0.11 + pulse * 0.11;
      glint.sprite.scale.set(scale, scale, 1);
    }

    crystals.material.emissiveIntensity = 0.15 + lighting.night * 1.1;
    crystals.glow.material.opacity = 0.035 + lighting.night * 0.22;

    water.update(elapsed, dt, lighting);
    flora.update(elapsed, lighting);
    details.update(elapsed, lighting);

    // A breath of floating, never enough to break the quiet composition.
    diorama.position.y = Math.sin(elapsed * 0.34) * 0.025;
    diorama.rotation.z = Math.sin(elapsed * 0.21) * 0.0015;

    return {
      night: lighting.night,
      warmth: lighting.warmth,
      exposure: lighting.exposure,
      sunIntensity: lighting.sunIntensity,
    };
  }

  function setPixelRatio(pixelRatio) {
    stars.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  return {
    group: diorama,
    background,
    stars,
    backdrop: details.backdrop,
    update,
    setPixelRatio,
    getLighting: () => lastLighting,
    built: {
      island,
      mountains,
      water,
      flora,
      details,
      glass,
    },
  };
}
