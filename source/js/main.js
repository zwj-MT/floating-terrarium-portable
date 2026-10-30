import * as THREE from '../vendor/three/three.module.js';
import { createTerrarium } from './world.js';
import { PostFX } from './postfx.js';
import { makeEnvironmentTexture, damp } from './utils.js';
import { clamp } from './noise.js';

const canvas = document.getElementById('scene-canvas');
const loading = document.getElementById('loading');
const autoToggle = document.getElementById('auto-toggle');
const autoState = document.getElementById('auto-state');
const timeRange = document.getElementById('time-range');
const clockLabel = document.getElementById('clock-label');
const phaseLabel = document.getElementById('phase-label');
const errorMessage = document.getElementById('error-message');
const errorPanel = document.getElementById('error-panel');

const params = new URLSearchParams(window.location.search);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const narrowScreen = window.matchMedia('(max-width: 720px)').matches;
const mobileDevice = coarsePointer || narrowScreen;

const requestedTime = Number.parseFloat(params.get('time'));
const requestedAuto = params.get('auto');
let dayT = Number.isFinite(requestedTime) ? ((requestedTime % 1) + 1) % 1 : 0.68;
let isAuto = requestedAuto === '1' ? true : requestedAuto === '0' ? false : !reducedMotion;
const DAY_DURATION = 420;

const ORBIT_DEFAULT = { azimuth: 0.72, elevation: 0.49, zoom: 1 };
const orbitCurrent = { ...ORBIT_DEFAULT };
const orbitTarget = { ...ORBIT_DEFAULT };
const azimuthLimits = { min: 0.44, max: 1.2 };
const elevationLimits = { min: 0.31, max: 0.78 };
const zoomLimits = { min: 0.79, max: 1.36 };
const lookTarget = new THREE.Vector3(0, 4.12, 0);
const spherical = new THREE.Spherical();
const cameraTargetPosition = new THREE.Vector3();
const pointer = { x: 0, y: 0, down: false, id: null, lastX: 0, lastY: 0 };
const touchPoints = new Map();
const pinch = { active: false, startDistance: 0, startZoom: 1 };
let wheelZoom = ORBIT_DEFAULT.zoom;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
} catch (error) {
  showError(error);
  throw error;
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor('#03080d', 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.1, 160);
camera.position.set(16.5, 17.4, 17.5);

scene.environment = makeEnvironmentTexture(renderer);
scene.environmentIntensity = 0.7;

const world = createTerrarium({ renderer, scene });
const postFX = new PostFX(renderer);

let baseDistance = 26.4;
let currentFov = 26;
let pixelRatio = 1;
let elapsed = 0;
let lastTimestamp = 0;
let uiAccumulator = 0;
let firstFrame = true;
let active = true;
let hasFailed = false;

function showError(error) {
  if (hasFailed) return;
  hasFailed = true;
  active = false;
  if (errorPanel && errorMessage) {
    errorMessage.textContent = error && error.message
      ? error.message
      : '请使用支持 WebGL 2 的现代浏览器，并确认硬件加速已开启。';
    errorPanel.classList.add('is-visible');
  }
  if (loading) loading.classList.add('is-finished');
  document.documentElement.dataset.sceneError = 'true';
  window.__dshSceneErrors = window.__dshSceneErrors || [];
  window.__dshSceneErrors.push(String(error));
}

function computePixelRatio() {
  const cap = mobileDevice ? 1.3 : 1.52;
  return Math.min(window.devicePixelRatio || 1, cap, 2);
}

function computeBaseDistance(aspect) {
  if (aspect < 0.72) return 29.6;
  if (aspect < 1.05) return 28.0;
  if (aspect < 1.45) return 25.8;
  return 25.0;
}

function updateCameraProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  currentFov = aspect < 0.72 ? 32.5 : aspect < 1.05 ? 29.5 : 26;
  camera.fov = currentFov;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  baseDistance = computeBaseDistance(aspect);
}

function resize() {
  pixelRatio = computePixelRatio();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  updateCameraProjection();
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  postFX.setSize(drawingBuffer.x, drawingBuffer.y);
  world.setPixelRatio(pixelRatio);
  orbitTarget.zoom = clamp(orbitTarget.zoom, zoomLimits.min, zoomLimits.max);
}

function updateCamera(dt, time) {
  orbitTarget.azimuth = clamp(orbitTarget.azimuth, azimuthLimits.min, azimuthLimits.max);
  orbitTarget.elevation = clamp(orbitTarget.elevation, elevationLimits.min, elevationLimits.max);
  orbitTarget.zoom = clamp(orbitTarget.zoom, zoomLimits.min, zoomLimits.max);

  orbitCurrent.azimuth = damp(orbitCurrent.azimuth, orbitTarget.azimuth, 5.5, dt);
  orbitCurrent.elevation = damp(orbitCurrent.elevation, orbitTarget.elevation, 5.5, dt);
  orbitCurrent.zoom = damp(orbitCurrent.zoom, orbitTarget.zoom, 5.5, dt);

  const breathe = reducedMotion ? 0 : Math.sin(time * 0.085) * 0.007;
  const lift = reducedMotion ? 0 : Math.sin(time * 0.23) * 0.012;
  const azimuth = orbitCurrent.azimuth + breathe;
  const elevation = orbitCurrent.elevation;
  const distance = baseDistance * orbitCurrent.zoom;

  spherical.set(distance, Math.PI / 2 - elevation, azimuth);
  cameraTargetPosition.setFromSpherical(spherical).add(lookTarget);
  camera.position.copy(cameraTargetPosition);
  camera.lookAt(lookTarget.x, lookTarget.y + lift, lookTarget.z);
}

function formatClock(time) {
  const minutes = Math.floor(((time % 1) + 1) % 1 * 1440);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function phaseFor(time) {
  if (time < 0.195 || time >= 0.87) return '星夜';
  if (time < 0.26) return '破晓';
  if (time < 0.34) return '晨光';
  if (time < 0.48) return '上午';
  if (time < 0.56) return '正午';
  if (time < 0.66) return '午后';
  if (time < 0.723) return '斜阳';
  if (time < 0.8) return '暮色';
  return '入夜';
}

function updateInterface() {
  const clock = formatClock(dayT);
  const phase = phaseFor(dayT);
  if (clockLabel.textContent !== clock) clockLabel.textContent = clock;
  if (phaseLabel.textContent !== phase) phaseLabel.textContent = phase;
  if (document.activeElement !== timeRange) {
    const value = dayT.toFixed(3);
    if (timeRange.value !== value) timeRange.value = value;
  }
}

function setAuto(next, announce = true) {
  isAuto = next;
  autoToggle.setAttribute('aria-pressed', String(isAuto));
  autoToggle.setAttribute('aria-label', isAuto ? '暂停昼夜流转' : '继续昼夜流转');
  autoState.textContent = isAuto ? '缓慢交替中' : '时间已定格';
  if (announce) {
    autoState.animate?.(
      [
        { opacity: 0.25 },
        { opacity: 1 },
      ],
      { duration: 500, easing: 'ease-out' },
    );
  }
}

function resetView() {
  orbitTarget.azimuth = ORBIT_DEFAULT.azimuth;
  orbitTarget.elevation = ORBIT_DEFAULT.elevation;
  orbitTarget.zoom = ORBIT_DEFAULT.zoom;
  wheelZoom = ORBIT_DEFAULT.zoom;
}

autoToggle.addEventListener('click', () => {
  setAuto(!isAuto);
});

timeRange.addEventListener('input', () => {
  const next = Number.parseFloat(timeRange.value);
  if (Number.isFinite(next)) {
    dayT = clamp(next, 0, 0.999999);
    if (isAuto) setAuto(false, false);
    updateInterface();
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  if (event.pointerType === 'touch') {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size >= 2) {
      const points = [...touchPoints.values()];
      pinch.active = true;
      pinch.startDistance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      pinch.startZoom = orbitTarget.zoom;
      pointer.down = false;
      pointer.id = null;
      document.body.classList.remove('is-dragging');
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
  }
  pointer.down = true;
  pointer.id = event.pointerId;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
  document.body.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pinch.active && touchPoints.size >= 2) {
    const points = [...touchPoints.values()];
    const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
    const nextZoom = pinch.startZoom * (pinch.startDistance / distance);
    orbitTarget.zoom = clamp(nextZoom, zoomLimits.min, zoomLimits.max);
    wheelZoom = orbitTarget.zoom;
    return;
  }
  if (!pointer.down || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.lastX;
  const dy = event.clientY - pointer.lastY;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
  orbitTarget.azimuth -= dx * 0.0032;
  orbitTarget.elevation += dy * 0.0027;
});

function endPointer(event) {
  if (event?.pointerType === 'touch') {
    touchPoints.delete(event.pointerId);
    if (touchPoints.size < 2) pinch.active = false;
  }
  pointer.down = false;
  pointer.id = null;
  document.body.classList.remove('is-dragging');
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (event) => {
  if (pointer.down) endPointer(event);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  wheelZoom = clamp(wheelZoom * Math.exp(delta * 0.00075), zoomLimits.min, zoomLimits.max);
  orbitTarget.zoom = wheelZoom;
}, { passive: false });

canvas.addEventListener('dblclick', () => {
  resetView();
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const interactive = target instanceof Element
    && target.closest('button, input, textarea, select, a, [contenteditable="true"]');
  if (interactive) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setAuto(!isAuto);
  } else if (event.key.toLowerCase() === 'r') {
    resetView();
  }
});

window.addEventListener('resize', resize);

window.addEventListener('blur', () => {
  document.body.classList.remove('is-dragging');
  pointer.down = false;
  pointer.id = null;
  pinch.active = false;
  touchPoints.clear();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastTimestamp = 0;
  }
});

let splashTimer = null;

function finishBoot() {
  if (firstFrame) return;
  document.body.classList.add('is-ready');
  document.documentElement.dataset.ready = 'true';
  if (splashTimer) return;
  splashTimer = window.setTimeout(() => {
    loading.classList.add('is-finished');
    window.setTimeout(() => {
      loading.setAttribute('aria-hidden', 'true');
      loading.style.display = 'none';
    }, 1900);
  }, 420);
}

function animate(timestamp) {
  if (!active) return;
  requestAnimationFrame(animate);

  if (!lastTimestamp) lastTimestamp = timestamp;
  const rawDelta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  const dt = clamp(rawDelta, 0, 0.05);
  elapsed += dt;

  if (isAuto && !document.hidden) {
    dayT = (dayT + dt / DAY_DURATION) % 1;
  }

  try {
    const atmosphere = world.update(elapsed, dt, dayT);
    updateCamera(dt, elapsed);
    postFX.render(scene, camera, elapsed, {
      night: atmosphere.night,
      warmth: atmosphere.warmth,
      exposure: atmosphere.exposure,
      focus: 0.5,
    });

    if (firstFrame) {
      firstFrame = false;
      window.requestAnimationFrame(finishBoot);
    }

    uiAccumulator += dt;
    if (uiAccumulator > 0.08) {
      uiAccumulator = 0;
      updateInterface();
    }
  } catch (error) {
    console.error(error);
    showError(error);
  }
}

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showError(new Error('WebGL 上下文已丢失，请刷新页面重新唤醒微境。'));
});

function boot() {
  resize();
  updateInterface();
  setAuto(isAuto, false);
  world.update(0, 0, dayT);
  updateCamera(0.016, 0);

  // One synchronous render means the loading veil only lifts once there is
  // actually something behind it.
  try {
    const atmosphere = world.update(0, 0, dayT);
    postFX.render(scene, camera, 0, {
      night: atmosphere.night,
      warmth: atmosphere.warmth,
      exposure: atmosphere.exposure,
      focus: 0.5,
    });
    firstFrame = false;
    window.requestAnimationFrame(animate);
    window.requestAnimationFrame(finishBoot);
  } catch (error) {
    console.error(error);
    showError(error);
  }

  window.__terrarium = {
    renderer,
    scene,
    camera,
    world,
    postFX,
    getDayT: () => dayT,
    setDayT: (value) => {
      dayT = clamp(value, 0, 0.999999);
      updateInterface();
    },
    setAuto,
  };
}

boot();
