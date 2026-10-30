import * as THREE from '../vendor/three/three.module.js';
import {
  LAKE,
  LANDMARKS,
  heightAt,
  isInLake,
  closestRiverSample,
} from './geography.js';
import {
  makeCloudTexture,
  makeMistTexture,
  makeSoftCircleTexture,
  makeBokehTexture,
  mergeGeometries,
  setShadow,
} from './utils.js';
import { mulberry32, noise2, clamp, smoothstep } from './noise.js';

function cylinderBetween(start, end, radius, material, segments = 6) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius * 1.05, length, segments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function buildCabin() {
  const group = new THREE.Group();
  group.name = 'Cabin';
  const { x, z } = LANDMARKS.cabin;
  group.position.set(x, heightAt(x, z) + 0.006, z);
  group.rotation.y = -0.35;
  group.scale.setScalar(1.12);

  const wood = new THREE.MeshStandardMaterial({ color: '#70543d', roughness: 0.9, metalness: 0 });
  const woodDark = new THREE.MeshStandardMaterial({ color: '#49392d', roughness: 0.92 });
  const woodLight = new THREE.MeshStandardMaterial({ color: '#8d7052', roughness: 0.86 });
  const stone = new THREE.MeshStandardMaterial({ color: '#777368', roughness: 0.96 });
  const roof = new THREE.MeshStandardMaterial({ color: '#4a4a45', roughness: 0.92 });
  const glass = new THREE.MeshStandardMaterial({
    color: '#5a4434',
    emissive: '#ffab58',
    emissiveIntensity: 0.12,
    roughness: 0.45,
    metalness: 0.05,
  });
  const lanternGlow = new THREE.MeshStandardMaterial({
    color: '#6b553e',
    emissive: '#ffb25f',
    emissiveIntensity: 0.2,
    roughness: 0.5,
  });
  const glowMaterials = [glass, lanternGlow];
  const glowSprites = [];

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.66), stone);
  foundation.position.y = 0.06;
  setShadow(foundation, true, true);
  group.add(foundation);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.44, 0.49), wood);
  walls.position.y = 0.33;
  setShadow(walls, true, true);
  group.add(walls);

  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.67, 0.012, 0.5), i % 2 ? woodDark : woodLight);
    plank.position.y = 0.16 + i * 0.085;
    group.add(plank);
  }

  // Roof panels meeting at a little ridge.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.79, 0.035, 0.39), roof);
    panel.position.set(0, 0.635, side * 0.17);
    panel.rotation.x = side * 0.55;
    setShadow(panel, true, true);
    group.add(panel);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.82, 6), roof);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, 0.732, 0);
  group.add(ridge);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.09), stone);
  chimney.position.set(0.22, 0.5, -0.1);
  setShadow(chimney, true, true);
  group.add(chimney);
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), stone);
  chimneyCap.position.set(0.22, 0.65, -0.1);
  group.add(chimneyCap);

  // Door and gable details on the front (+z) face.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.27, 0.014), woodDark);
  door.position.set(0.08, 0.235, 0.252);
  group.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshStandardMaterial({ color: '#c6ab7e', metalness: 0.6, roughness: 0.35 }));
  knob.position.set(0.135, 0.235, 0.261);
  group.add(knob);

  const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.022), woodDark);
  windowFrame.position.set(-0.17, 0.34, 0.251);
  group.add(windowFrame);
  const windowPane = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.135, 0.012), glass);
  windowPane.position.set(-0.17, 0.34, 0.264);
  group.add(windowPane);
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.138, 0.008), woodDark);
  mullionV.position.set(-0.17, 0.34, 0.272);
  group.add(mullionV);
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.148, 0.011, 0.008), woodDark);
  mullionH.position.set(-0.17, 0.34, 0.273);
  group.add(mullionH);

  const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.17, 0.17), woodDark);
  sideFrame.position.set(0.331, 0.34, 0.02);
  group.add(sideFrame);
  const sidePane = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.13, 0.13), glass);
  sidePane.position.set(0.34, 0.34, 0.02);
  group.add(sidePane);
  const sideMullionA = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.125, 0.012), woodDark);
  sideMullionA.position.set(0.347, 0.34, 0.02);
  group.add(sideMullionA);
  const sideMullionB = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.125), woodDark);
  sideMullionB.position.set(0.347, 0.34, 0.02);
  group.add(sideMullionB);

  // A little covered porch and its two posts.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.2), woodLight);
  deck.position.set(0.02, 0.1, 0.36);
  setShadow(deck, true, true);
  group.add(deck);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.3, 5), woodDark);
    post.position.set(side * 0.23, 0.245, 0.42);
    group.add(post);
  }
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.23), roof);
  porchRoof.position.set(0.02, 0.41, 0.36);
  porchRoof.rotation.x = 0.12;
  group.add(porchRoof);

  // Woodpile and a small bench.
  const logMaterial = new THREE.MeshStandardMaterial({ color: '#7e6144', roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 5), logMaterial);
    log.rotation.z = Math.PI / 2;
    log.position.set(-0.35, 0.17 + Math.floor(i / 2) * 0.035, 0.23 + (i % 2) * 0.045);
    group.add(log);
  }

  // Warm window halo, invisible by day.
  const windowGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSoftCircleTexture(96, 0.02),
    color: '#ffb15d',
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  windowGlow.position.set(-0.17, 0.34, 0.34);
  windowGlow.scale.set(0.55, 0.42, 1);
  group.add(windowGlow);
  glowSprites.push({ sprite: windowGlow, base: 0.42, phase: 1.7 });

  const cabinLight = new THREE.PointLight('#ffb063', 0.0, 2.2, 2.0);
  cabinLight.position.set(0, 0.38, 0.38);
  group.add(cabinLight);

  // Everything outside the cabin lives in unrotated world space so the path
  // and dock can be authored directly against the geography.
  const outdoors = new THREE.Group();
  outdoors.name = 'Cabin path and dock';

  const lanternPositions = [
    [2.9, 0.54],
    [3.28, 1.34],
  ];
  const cageMaterial = new THREE.MeshStandardMaterial({
    color: '#6b5b48',
    roughness: 0.6,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const lanternHaloTexture = makeSoftCircleTexture(96, 0.02);
  for (let i = 0; i < lanternPositions.length; i++) {
    const [wx, wz] = lanternPositions[i];
    const postGroup = new THREE.Group();
    postGroup.position.set(wx, heightAt(wx, wz), wz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.28, 5), woodDark);
    post.position.y = 0.14;
    postGroup.add(post);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.055, 6, 1, true), cageMaterial);
    cage.position.y = 0.29;
    postGroup.add(cage);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 6), lanternGlow);
    orb.position.y = 0.29;
    postGroup.add(orb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: lanternHaloTexture,
      color: '#ffc478',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    halo.position.y = 0.3;
    halo.scale.set(0.34, 0.34, 1);
    postGroup.add(halo);
    glowSprites.push({ sprite: halo, base: 0.5, phase: i * 2.4 + 0.7 });
    outdoors.add(postGroup);
  }

  // Stepping stones toward the dock.
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#7b7668', roughness: 0.97 });
  const pathPoints = [
    [2.95, 0.55],
    [2.91, 0.8],
    [3.0, 1.02],
    [3.14, 1.2],
    [3.28, 1.37],
  ];
  for (let i = 0; i < pathPoints.length; i++) {
    const [sx, sz] = pathPoints[i];
    const ground = Math.max(heightAt(sx, sz), LAKE.waterY + 0.03);
    const stoneStep = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.025, 7), stoneMaterial);
    stoneStep.position.set(sx, ground + 0.01, sz);
    stoneStep.rotation.y = i * 1.3;
    stoneStep.scale.z = 0.8;
    stoneStep.castShadow = true;
    stoneStep.receiveShadow = true;
    outdoors.add(stoneStep);
  }

  // Dock reaching across the eastern shallows of the lake.
  const dockY = LAKE.waterY + 0.115;
  for (let i = 0; i < 8; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.022, 0.25), i % 3 === 2 ? woodDark : woodLight);
    plank.position.set(3.21 - i * 0.081, dockY, 1.23);
    plank.castShadow = true;
    plank.receiveShadow = true;
    outdoors.add(plank);
  }
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.024, 0.032), woodDark);
    beam.position.set(2.92, dockY - 0.026, 1.23 + side * 0.105);
    beam.castShadow = true;
    outdoors.add(beam);
    for (const x of [2.62, 3.18]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.021, 0.34, 5), woodDark);
      post.position.set(x, dockY - 0.08, 1.23 + side * 0.115);
      post.castShadow = true;
      outdoors.add(post);
    }
  }
  const dockTie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 5, 10), new THREE.MeshStandardMaterial({ color: '#8d7a5f', roughness: 0.9 }));
  dockTie.rotation.x = Math.PI / 2;
  dockTie.position.set(3.23, dockY + 0.03, 1.08);
  outdoors.add(dockTie);

  // A small arched footbridge over the stream, made from weathered planks.
  const streamAtBridge = closestRiverSample(0.16, 1.31);
  const bridgeY = streamAtBridge.sample.y + 0.15;
  const bridge = new THREE.Group();
  bridge.position.set(0.16, 0, 1.31);
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.018, 0.074), i % 3 === 1 ? woodDark : woodLight);
    plank.position.set(0, bridgeY + Math.sin(t * Math.PI) * 0.035, (t - 0.5) * 0.55);
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridge.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.58), woodDark);
    rail.position.set(side * 0.145, bridgeY + 0.145, 0);
    bridge.add(rail);
    for (const z of [-0.27, 0.27]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.17, 5), woodDark);
      post.position.set(side * 0.145, bridgeY + 0.07, z);
      bridge.add(post);
    }
  }
  outdoors.add(bridge);

  return {
    group,
    outdoors,
    glowMaterials,
    glowSprites,
    cabinLight,
    smokeOrigin: new THREE.Vector3(0.22, 0.7, -0.1),
  };
}

function buildAnimals() {
  const group = new THREE.Group();
  group.name = 'Tiny inhabitants';
  const random = mulberry32(911);
  const updaters = [];

  const fawnMaterial = new THREE.MeshStandardMaterial({ color: '#b9885c', roughness: 0.94, metalness: 0 });
  const fawnLight = new THREE.MeshStandardMaterial({ color: '#dfc6a3', roughness: 0.9 });
  const fawnDark = new THREE.MeshStandardMaterial({ color: '#5d4534', roughness: 0.9 });
  const antlerMaterial = new THREE.MeshStandardMaterial({ color: '#d7c09b', roughness: 0.8 });
  const noseMaterial = new THREE.MeshStandardMaterial({ color: '#372b26', roughness: 0.65 });

  function makeDeer({ scale = 1, fawn = false, withAntlers = false } = {}) {
    const deer = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fawnMaterial);
    body.scale.set(0.13, 0.15, 0.26);
    body.position.y = 0.36;
    setShadow(body, true, false);
    deer.add(body);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), fawnLight);
    chest.scale.set(0.105, 0.12, 0.12);
    chest.position.set(0, 0.33, 0.16);
    deer.add(chest);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fawnLight);
    belly.scale.set(0.085, 0.06, 0.17);
    belly.position.set(0, 0.26, 0);
    deer.add(belly);

    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.43, 0.17);
    neckPivot.rotation.x = 0.22;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.067, 0.23, 7), fawnMaterial);
    neck.position.y = 0.08;
    neckPivot.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), fawnMaterial);
    head.scale.set(0.07, 0.085, 0.13);
    head.position.set(0, 0.2, 0.025);
    neckPivot.add(head);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), fawnLight);
    snout.scale.set(0.05, 0.05, 0.08);
    snout.position.set(0, 0.165, 0.105);
    neckPivot.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.019, 7, 5), noseMaterial);
    nose.position.set(0, 0.16, 0.178);
    neckPivot.add(nose);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), noseMaterial);
      eye.position.set(side * 0.057, 0.215, 0.09);
      neckPivot.add(eye);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 6), fawnMaterial);
      ear.position.set(side * 0.068, 0.29, -0.005);
      ear.rotation.z = side * 0.55;
      ear.rotation.x = -0.2;
      neckPivot.add(ear);
    }
    if (withAntlers) {
      const antlerRoots = [];
      for (const side of [-1, 1]) {
        const base = new THREE.Vector3(side * 0.047, 0.285, 0.02);
        const mid = new THREE.Vector3(side * 0.085, 0.39, -0.005);
        const branch = new THREE.Vector3(side * 0.13, 0.42, 0.01);
        const twig = new THREE.Vector3(side * 0.11, 0.49, 0.05);
        antlerRoots.push(
          cylinderBetween(base, mid, 0.008, antlerMaterial, 5),
          cylinderBetween(mid, branch, 0.006, antlerMaterial, 5),
          cylinderBetween(mid, twig, 0.005, antlerMaterial, 5),
        );
      }
      for (const part of antlerRoots) neckPivot.add(part);
    }
    deer.add(neckPivot);

    const legPositions = [
      [-0.085, 0.18, 0.16],
      [0.085, 0.18, 0.16],
      [-0.085, 0.18, -0.16],
      [0.085, 0.18, -0.16],
    ];
    for (let i = 0; i < legPositions.length; i++) {
      const [lx, ly, lz] = legPositions[i];
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.34, 5), i < 2 ? fawnDark : fawnMaterial);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      deer.add(leg);
      const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 4), noseMaterial);
      hoof.scale.y = 0.55;
      hoof.position.set(lx, 0.02, lz + 0.01);
      deer.add(hoof);
    }

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), fawnLight);
    tail.scale.set(0.7, 0.9, 1.3);
    tail.position.set(0, 0.39, -0.26);
    tail.rotation.x = -0.3;
    deer.add(tail);
    const tailGroup = new THREE.Group();
    tailGroup.position.copy(tail.position);
    deer.remove(tail);
    tail.position.set(0, 0, 0);
    tailGroup.add(tail);
    deer.add(tailGroup);

    if (fawn) {
      const spotMaterial = new THREE.MeshStandardMaterial({ color: '#f3e4c8', roughness: 0.8 });
      for (let i = 0; i < 12; i++) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.01 + random() * 0.008, 5, 3), spotMaterial);
        const a = random() * Math.PI * 2;
        spot.position.set(Math.cos(a) * (0.08 + random() * 0.07), 0.4 + random() * 0.09, (random() - 0.5) * 0.34);
        deer.add(spot);
      }
    }

    deer.scale.setScalar(scale);
    deer.userData.head = neckPivot;
    deer.userData.tail = tailGroup;
    return deer;
  }

  const adult = makeDeer({ scale: 0.86, withAntlers: true });
  const adultGround = heightAt(LANDMARKS.deer.x, LANDMARKS.deer.z);
  adult.position.set(LANDMARKS.deer.x, adultGround, LANDMARKS.deer.z);
  adult.rotation.y = -1.92;
  group.add(adult);

  const fawn = makeDeer({ scale: 0.5, fawn: true });
  const fawnX = LANDMARKS.deer.x + 0.42;
  const fawnZ = LANDMARKS.deer.z - 0.3;
  fawn.position.set(fawnX, heightAt(fawnX, fawnZ), fawnZ);
  fawn.rotation.y = -2.3;
  fawn.userData.head.rotation.x = 0.4;
  group.add(fawn);

  updaters.push((elapsed) => {
    adult.userData.head.rotation.x = 0.22 + Math.sin(elapsed * 0.45) * 0.045;
    adult.userData.head.rotation.z = Math.sin(elapsed * 0.21 + 1.2) * 0.04;
    adult.userData.tail.rotation.y = Math.sin(elapsed * 0.9) * 0.4;
    fawn.userData.head.rotation.x = 0.4 + Math.sin(elapsed * 0.52 + 1.7) * 0.055;
    fawn.userData.tail.rotation.y = Math.sin(elapsed * 0.72 + 0.6) * 0.5;
  });

  // Rabbits: two small cream shapes in the flower meadow.
  const rabbitMaterial = new THREE.MeshStandardMaterial({ color: '#ded3bd', roughness: 0.96 });
  const rabbitInner = new THREE.MeshStandardMaterial({ color: '#d9a8a2', roughness: 0.9 });
  const rabbits = [];
  for (let index = 0; index < 2; index++) {
    const rabbit = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), rabbitMaterial);
    body.scale.set(0.055, 0.065, 0.085);
    body.position.y = 0.065;
    rabbit.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), rabbitMaterial);
    head.scale.set(0.043, 0.046, 0.045);
    head.position.set(0, 0.115, 0.065);
    rabbit.add(head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 5), rabbitMaterial);
      ear.position.set(side * 0.02, 0.175, 0.055);
      ear.rotation.x = 0.22;
      ear.rotation.z = side * 0.2;
      rabbit.add(ear);
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.052, 2, 4), rabbitInner);
      inner.position.set(side * 0.02, 0.175, 0.062);
      inner.rotation.x = 0.22;
      inner.rotation.z = side * 0.2;
      rabbit.add(inner);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), rabbitInner);
    nose.position.set(0, 0.112, 0.11);
    rabbit.add(nose);
    const rx = -0.38 + index * 0.45;
    const rz = 2.26 + index * 0.3;
    rabbit.position.set(rx, heightAt(rx, rz), rz);
    rabbit.rotation.y = 1.9 + index;
    rabbit.scale.setScalar(0.9);
    group.add(rabbit);
    rabbits.push({ rabbit, baseY: heightAt(rx, rz), phase: index * 2.4, x: rx, z: rz });
  }
  updaters.push((elapsed) => {
    for (const data of rabbits) {
      const cycle = (elapsed * 0.42 + data.phase) % (Math.PI * 2);
      const hop = Math.max(0, Math.sin(cycle * 2.0)) ** 3;
      data.rabbit.position.y = data.baseY + hop * 0.06;
      data.rabbit.rotation.z = Math.sin(cycle * 2.0) * 0.06;
    }
  });

  // Two mallards on the lake.
  const ducks = [];
  for (let index = 0; index < 2; index++) {
    const duck = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: index === 0 ? '#ded3ba' : '#c9b997', roughness: 0.82 });
    const headMat = new THREE.MeshStandardMaterial({ color: '#456b53', roughness: 0.65, metalness: 0.08 });
    const beakMat = new THREE.MeshStandardMaterial({ color: '#d3a14b', roughness: 0.72 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bodyMat);
    body.scale.set(0.045, 0.034, 0.075);
    body.position.y = 0.025;
    duck.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 5), bodyMat);
    tail.rotation.x = -Math.PI / 2.1;
    tail.position.set(0, 0.04, -0.08);
    duck.add(tail);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), headMat);
    head.position.set(0, 0.078, 0.055);
    duck.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 5), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.072, 0.09);
    duck.add(beak);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.1, 24),
      new THREE.MeshBasicMaterial({ color: '#c7dfd8', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    duck.add(ring);
    duck.position.set(2.12 + index * 0.3, LAKE.waterY + 0.02, 0.86 + index * 0.22);
    duck.rotation.y = index * 2.1;
    duck.scale.setScalar(1.4);
    group.add(duck);
    ducks.push({ duck, phase: index * 2.7, cx: 2.12 + index * 0.3, cz: 0.9 + index * 0.18, radius: 0.17 + index * 0.06 });
  }
  updaters.push((elapsed) => {
    for (const data of ducks) {
      const angle = elapsed * 0.06 + data.phase;
      data.duck.position.x = data.cx + Math.cos(angle) * data.radius;
      data.duck.position.z = data.cz + Math.sin(angle) * data.radius;
      data.duck.position.y = LAKE.waterY + 0.018 + Math.sin(elapsed * 0.9 + data.phase) * 0.008;
      data.duck.rotation.y = -angle + Math.PI / 2;
    }
  });

  // Birds, kept as near-silhouettes above the trees.
  const birdMaterial = new THREE.MeshStandardMaterial({ color: '#3c4c52', roughness: 0.8 });
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0.13, 0.012, 0.035,
    0.075, -0.008, 0.12,
  ], 3));
  wingGeometry.computeVertexNormals();
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), birdMaterial);
    body.scale.set(0.6, 0.6, 1.7);
    bird.add(body);
    const leftPivot = new THREE.Group();
    const rightPivot = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, birdMaterial);
    const right = new THREE.Mesh(wingGeometry, birdMaterial);
    left.scale.x = -1;
    leftPivot.add(left);
    rightPivot.add(right);
    bird.add(leftPivot, rightPivot);
    bird.scale.setScalar(0.7 + i * 0.06);
    group.add(bird);
    birds.push({
      bird,
      leftPivot,
      rightPivot,
      radius: 1.55 + i * 0.28,
      height: 4.2 + i * 0.22,
      phase: i * 2.1,
      speed: 0.075 + i * 0.012,
    });
  }
  updaters.push((elapsed) => {
    for (const data of birds) {
      const angle = data.phase + elapsed * data.speed;
      data.bird.position.set(
        Math.cos(angle) * data.radius + 0.2,
        data.height + Math.sin(angle * 2.2 + 0.7) * 0.2,
        Math.sin(angle) * data.radius * 0.72,
      );
      data.bird.rotation.y = -angle;
      data.bird.rotation.z = Math.sin(angle) * 0.18;
      const flap = Math.sin(elapsed * 7.5 + data.phase * 2.0);
      data.leftPivot.rotation.z = -0.32 - flap * 0.5;
      data.rightPivot.rotation.z = 0.32 + flap * 0.5;
    }
  });

  return {
    group,
    updaters,
  };
}

function makeCloudGeometry(seed) {
  const random = mulberry32(seed);
  const puffs = [
    [-0.86, 0.02, 0.02, 0.54, 0.46, 0.4],
    [-0.44, 0.12, 0.1, 0.62, 0.56, 0.46],
    [0.0, 0.19, 0.0, 0.7, 0.64, 0.5],
    [0.46, 0.1, -0.04, 0.6, 0.52, 0.44],
    [0.85, 0.01, 0.02, 0.44, 0.36, 0.34],
    [-0.16, 0.45, -0.02, 0.47, 0.48, 0.4],
    [0.28, 0.47, 0.06, 0.42, 0.46, 0.38],
    [-0.58, 0.34, 0.0, 0.34, 0.36, 0.28],
  ];
  const parts = [];
  for (let i = 0; i < puffs.length; i++) {
    const [x, y, z, sx, sy, sz] = puffs[i];
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const position = geometry.getAttribute('position');
    for (let v = 0; v < position.count; v++) {
      const px = position.getX(v);
      const py = position.getY(v);
      const pz = position.getZ(v);
      const wobble = 1
        + 0.085 * noise2(px * 2.4 + i * 1.7, pz * 2.4 - i)
        + 0.045 * noise2(py * 3.8 - i, px * 3.1 + 2.0);
      position.setXYZ(v, px * wobble, py * wobble, pz * wobble);
    }
    geometry.scale(sx, sy, sz);
    geometry.translate(x + (random() - 0.5) * 0.08, y, z + (random() - 0.5) * 0.08);
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  return mergeGeometries(parts);
}

function buildClouds() {
  const group = new THREE.Group();
  group.name = 'Floating clouds';
  const random = mulberry32(601);
  const textures = [
    makeCloudTexture(4, 256),
    makeCloudTexture(11, 256),
    makeCloudTexture(27, 256),
  ];
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.29 },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
      uLitColor: { value: new THREE.Color('#fff1da') },
      uShadowColor: { value: new THREE.Color('#6e818e') },
      uNight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vLocalPosition = position;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uNight;
      uniform vec3 uSunDirection;
      uniform vec3 uLitColor;
      uniform vec3 uShadowColor;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPosition;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float direct = clamp(dot(normal, normalize(uSunDirection)) * 0.5 + 0.5, 0.0, 1.0);
        float softness = pow(facing, 0.52);
        vec3 color = mix(uShadowColor, uLitColor, pow(direct, 1.2));
        color *= 0.78 + softness * 0.32;
        color += vec3(0.04, 0.036, 0.028) * pow(softness, 2.0);
        float grain = hash(floor(vLocalPosition.xz * 30.0 + uTime * 0.1));
        color *= 0.97 + grain * 0.06;
        float alpha = uOpacity * (0.16 + softness * 0.84) * (0.83 + 0.17 * direct);
        alpha *= 1.0 - uNight * 0.28;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  const geometries = [
    makeCloudGeometry(3),
    makeCloudGeometry(9),
    makeCloudGeometry(17),
  ];
  const clusters = [
    { x: -2.55, y: 4.45, z: -1.35, s: 0.7, rot: 0.35, n: 0, phase: 0.4, speed: 0.028 },
    { x: 2.82, y: 5.48, z: 0.3, s: 0.56, rot: -0.5, n: 1, phase: 2.1, speed: 0.035 },
    { x: -3.48, y: 3.15, z: 1.35, s: 0.36, rot: 1.5, n: 2, phase: 3.4, speed: 0.024 },
    { x: 0.25, y: 6.35, z: -1.7, s: 0.52, rot: 2.4, n: 1, phase: 4.8, speed: 0.021 },
  ];
  const cloudGroups = [];
  const haloMaterials = [];
  for (const cluster of clusters) {
    const cloud = new THREE.Group();
    cloud.position.set(cluster.x, cluster.y, cluster.z);
    cloud.rotation.y = cluster.rot;
    const mesh = new THREE.Mesh(geometries[cluster.n], material);
    mesh.scale.set(cluster.s * 1.24, cluster.s * 0.96, cluster.s * 0.88);
    mesh.rotation.y = random() * Math.PI * 2;
    mesh.renderOrder = 4;
    cloud.add(mesh);

    // A soft halo keeps the puff from reading like a solid little island.
    const haloMaterial = new THREE.SpriteMaterial({
      map: textures[(cluster.n + 1) % textures.length],
      color: '#f3ecdf',
      transparent: true,
      opacity: 0.095,
      depthWrite: false,
      toneMapped: false,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.position.set(0, -0.05, 0.18);
    halo.scale.set(cluster.s * 3.7, cluster.s * 1.5, 1);
    halo.renderOrder = 3;
    cloud.add(halo);
    haloMaterials.push({ material: haloMaterial, base: haloMaterial.opacity });

    group.add(cloud);
    cloudGroups.push({
      cloud,
      baseX: cluster.x,
      baseY: cluster.y,
      baseZ: cluster.z,
      phase: cluster.phase,
      speed: cluster.speed,
      baseRot: cluster.rot,
    });
  }

  const tempLit = new THREE.Color();
  const tempShadow = new THREE.Color();
  return {
    group,
    material,
    update(elapsed, lighting) {
      for (const cloud of cloudGroups) {
        cloud.cloud.position.x = cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * 0.26;
        cloud.cloud.position.z = cloud.baseZ + Math.cos(elapsed * cloud.speed * 0.73 + cloud.phase) * 0.12;
        cloud.cloud.position.y = cloud.baseY + Math.sin(elapsed * 0.17 + cloud.phase) * 0.035;
        cloud.cloud.rotation.y = cloud.baseRot + Math.sin(elapsed * 0.035 + cloud.phase) * 0.025;
      }
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uSunDirection.value.copy(lighting.sunDirection);
      material.uniforms.uNight.value = lighting.night;
      material.uniforms.uOpacity.value = 0.29 - lighting.night * 0.05;
      tempLit.copy(lighting.sunColor).lerp(new THREE.Color('#fff7e8'), 0.58);
      tempShadow.copy(lighting.hemiSky).lerp(new THREE.Color('#40515d'), 0.38);
      material.uniforms.uLitColor.value.copy(tempLit);
      material.uniforms.uShadowColor.value.copy(tempShadow);
      for (const halo of haloMaterials) {
        halo.material.opacity = halo.base * (1 - lighting.night * 0.36);
        halo.material.color.copy(tempLit).lerp(new THREE.Color('#d9e8ee'), 0.4);
      }
    },
  };
}

function buildMist() {
  const group = new THREE.Group();
  group.name = 'Low mist';
  const random = mulberry32(741);
  const textures = [makeMistTexture(4, 256), makeMistTexture(9, 256)];
  const sprites = [];
  const bands = [
    { x: -2.4, y: 1.26, z: 2.1, sx: 3.6, sy: 1.0, base: 0.13, speed: 0.08 },
    { x: 1.4, y: 1.32, z: 2.5, sx: 4.2, sy: 1.1, base: 0.1, speed: 0.06 },
    { x: 3.0, y: 1.4, z: 0.4, sx: 2.6, sy: 0.8, base: 0.08, speed: 0.09 },
    { x: -0.85, y: 1.52, z: 0.5, sx: 1.2, sy: 0.5, base: 0.12, speed: 0.12 },
    { x: 1.9, y: 1.57, z: 1.2, sx: 2.4, sy: 0.65, base: 0.08, speed: 0.07 },
    { x: 0, y: 0.75, z: 0, sx: 6.8, sy: 1.6, base: 0.15, speed: 0.04 },
    { x: -1.3, y: 0.6, z: 0.4, sx: 4.4, sy: 1.2, base: 0.1, speed: 0.05 },
    { x: 2.2, y: 0.85, z: -1.1, sx: 3.6, sy: 1.0, base: 0.08, speed: 0.05 },
    { x: 1.25, y: 1.9, z: 1.25, sx: 2.8, sy: 0.55, base: 0.065, speed: 0.06 },
    { x: -0.55, y: 2.02, z: 0.7, sx: 1.6, sy: 0.52, base: 0.085, speed: 0.08 },
    { x: 0.1, y: 2.18, z: 1.65, sx: 5.2, sy: 1.0, base: 0.05, speed: 0.03 },
    { x: 1.8, y: 2.62, z: -0.7, sx: 4.0, sy: 0.9, base: 0.04, speed: 0.025 },
  ];
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const texture = textures[i % textures.length];
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: '#d8e5e2',
      transparent: true,
      opacity: band.base,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(band.x, band.y, band.z);
    sprite.scale.set(band.sx, band.sy, 1);
    sprite.renderOrder = 6;
    group.add(sprite);
    sprites.push({
      sprite,
      baseX: band.x,
      baseY: band.y,
      baseOpacity: band.base,
      phase: random() * Math.PI * 2,
      speed: band.speed,
    });
  }
  return {
    group,
    sprites,
    update(elapsed, lighting) {
      for (const item of sprites) {
        item.sprite.position.x = item.baseX + Math.sin(elapsed * item.speed * 3.2 + item.phase) * 0.22;
        item.sprite.position.y = item.baseY + Math.sin(elapsed * item.speed * 1.6 + item.phase) * 0.035;
        item.sprite.material.opacity = item.baseOpacity * (0.8 + Math.sin(elapsed * 0.18 + item.phase) * 0.2)
          * (0.8 + lighting.night * 0.28);
      }
    },
  };
}

function buildLightShafts() {
  const group = new THREE.Group();
  group.name = 'Volumetric light';
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.06 },
      uColor: { value: new THREE.Color('#ffd6a2') },
      uNight: { value: 0 },
    },
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
      uniform float uOpacity;
      uniform float uNight;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - abs(dot(normalize(vWorldNormal), viewDir));
        float verticalFade = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.68, vUv.y);
        float sideFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float dust = 0.58 + 0.42 * noise(vec2(vUv.x * 11.0 + uTime * 0.06, vUv.y * 8.0 - uTime * 0.07));
        float alpha = uOpacity * verticalFade * sideFade * (0.45 + rim * 0.55) * dust;
        gl_FragColor = vec4(uColor, alpha * (1.0 - uNight * 0.6));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const beams = [
    { start: new THREE.Vector3(-3.7, 8.45, -2.1), end: new THREE.Vector3(0.0, 1.1, 0.3), top: 0.12, bottom: 2.45, opacity: 0.045 },
    { start: new THREE.Vector3(3.8, 8.45, -1.4), end: new THREE.Vector3(1.8, 1.8, 1.1), top: 0.08, bottom: 1.15, opacity: 0.034 },
  ];
  for (let i = 0; i < beams.length; i++) {
    const beam = beams[i];
    const direction = new THREE.Vector3().subVectors(beam.start, beam.end);
    const height = direction.length();
    const geometry = new THREE.CylinderGeometry(beam.top, beam.bottom, height, 32, 10, true);
    const materialClone = material.clone();
    materialClone.uniforms.uTime = { value: 0 };
    materialClone.uniforms.uOpacity = { value: beam.opacity };
    materialClone.uniforms.uColor = { value: material.uniforms.uColor.value.clone() };
    materialClone.uniforms.uNight = { value: 0 };
    const mesh = new THREE.Mesh(geometry, materialClone);
    mesh.position.copy(beam.end).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.renderOrder = 4;
    group.add(mesh);
  }

  return {
    group,
    update(elapsed, lighting) {
      group.children.forEach((mesh, index) => {
        mesh.material.uniforms.uTime.value = elapsed;
        mesh.material.uniforms.uNight.value = lighting.night;
        const base = index === 0 ? 0.045 : 0.034;
        mesh.material.uniforms.uOpacity.value = base * (0.6 + lighting.warmth * 0.6) * (1 - lighting.night * 0.45);
        mesh.material.uniforms.uColor.value.copy(lighting.sunColor).lerp(new THREE.Color('#ffe9c4'), 0.4);
      });
    },
  };
}

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uPointScale;
  attribute float aSize;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.11 + aPhase * 1.7) * 0.18;
    p.y += sin(uTime * 0.15 + aPhase * 2.3) * 0.12;
    p.z += cos(uTime * 0.09 + aPhase * 1.2) * 0.16;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (uPointScale / max(-mvPosition.z, 0.6));
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = uOpacity * (0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * 0.7 + aPhase * 3.1), 2.0));
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float d = length(point);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.02, d) * vAlpha;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeParticleField({ count, seed, sizeMin, sizeMax, color, opacity, area, pixelRatio, groundBias = 0, pointScale = 235 }) {
  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * area.x;
    positions[i * 3 + 1] = area.y + random() * area.h - (random() < groundBias ? 0.4 : 0);
    positions[i * 3 + 2] = (random() - 0.5) * area.z;
    sizes[i] = sizeMin + random() * (sizeMax - sizeMin);
    phases[i] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: opacity },
      uPointScale: { value: pointScale },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function buildParticles(pixelRatio) {
  const group = new THREE.Group();
  group.name = 'Dust and fireflies';
  const dust = makeParticleField({
    count: 170,
    seed: 77,
    sizeMin: 0.55,
    sizeMax: 1.35,
    color: '#ffe7c0',
    opacity: 0.16,
    area: { x: 9.2, y: 1.15, z: 8.4, h: 6.5 },
    pixelRatio,
    pointScale: 160,
    groundBias: 0.55,
  });
  dust.renderOrder = 5;
  group.add(dust);

  const fireflies = makeParticleField({
    count: 58,
    seed: 121,
    sizeMin: 0.34,
    sizeMax: 0.86,
    color: '#b9f6c8',
    opacity: 0.0,
    area: { x: 7.8, y: 1.3, z: 6.8, h: 2.15 },
    pixelRatio,
    pointScale: 118,
    groundBias: 0.35,
  });
  fireflies.renderOrder = 5;
  group.add(fireflies);
  const firefliesWarm = makeParticleField({
    count: 30,
    seed: 142,
    sizeMin: 0.28,
    sizeMax: 0.68,
    color: '#ffd58f',
    opacity: 0.0,
    area: { x: 7.2, y: 1.15, z: 6.4, h: 1.55 },
    pixelRatio,
    pointScale: 110,
    groundBias: 0.25,
  });
  firefliesWarm.renderOrder = 5;
  group.add(firefliesWarm);

  return {
    group,
    dust,
    fireflies,
    update(elapsed, lighting) {
      dust.material.uniforms.uTime.value = elapsed;
      dust.material.uniforms.uOpacity.value = 0.1 + lighting.warmth * 0.045;
      fireflies.material.uniforms.uTime.value = elapsed + 11.0;
      fireflies.material.uniforms.uOpacity.value = lighting.night * 0.78;
      firefliesWarm.material.uniforms.uTime.value = elapsed + 5.7;
      firefliesWarm.material.uniforms.uOpacity.value = lighting.night * 0.66;
    },
  };
}

function buildBackdropBokeh() {
  const group = new THREE.Group();
  group.name = 'Distant bokeh';
  const texture = makeBokehTexture(128);
  const spots = [
    { position: [-9.0, 7.2, -8.4], color: '#d8af7d', size: 3.4, opacity: 0.07 },
    { position: [-6.2, 2.9, -10.2], color: '#7fa8b5', size: 1.7, opacity: 0.05 },
    { position: [6.4, 8.8, -11.5], color: '#9b91ad', size: 2.5, opacity: 0.055 },
    { position: [3.4, 1.1, -9.6], color: '#b7ae8f', size: 1.2, opacity: 0.045 },
    { position: [-3.8, 10.8, -12.0], color: '#778a9d', size: 1.5, opacity: 0.025 },
    { position: [-10.2, 0.8, -6.4], color: '#7e978c', size: 2.2, opacity: 0.04 },
  ];
  const sprites = [];
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: spot.color,
      transparent: true,
      opacity: spot.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...spot.position);
    sprite.scale.set(spot.size, spot.size, 1);
    sprite.renderOrder = -890;
    group.add(sprite);
    sprites.push({ sprite, base: spot.opacity, phase: i * 1.8 });
  }
  return {
    group,
    update(elapsed, lighting) {
      for (const item of sprites) {
        item.sprite.material.opacity = item.base
          * (0.8 + Math.sin(elapsed * 0.15 + item.phase) * 0.2)
          * (0.8 + lighting.night * 0.22);
      }
    },
  };
}

function buildSmoke(origin, container) {
  const texture = makeMistTexture(15, 128);
  const sprites = [];
  const random = mulberry32(183);
  for (let i = 0; i < 7; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: '#ddd3c2',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(origin);
    sprite.scale.set(0.24, 0.2, 1);
    container.add(sprite);
    sprites.push({
      sprite,
      phase: random(),
      drift: (random() - 0.5) * 0.15,
      baseX: origin.x,
      baseY: origin.y,
      baseZ: origin.z,
      size: 0.18 + random() * 0.16,
    });
  }
  return sprites;
}

function buildButterflies() {
  const group = new THREE.Group();
  group.name = 'Butterflies';
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.02,
    0.075, 0.012, 0.035,
    0.045, -0.002, -0.045,
  ], 3));
  wingGeometry.computeVertexNormals();
  const colors = ['#f4e3b0', '#dfb9be', '#d5e4cf'];
  const butterflies = [];
  const anchors = [
    { x: 0.4, z: 2.2, y: 0.34 },
    { x: 2.0, z: 2.0, y: 0.48 },
    { x: -1.7, z: 1.9, y: 0.3 },
    { x: 1.3, z: 2.7, y: 0.32 },
  ];
  for (let i = 0; i < anchors.length; i++) {
    const butterfly = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
    });
    const leftPivot = new THREE.Group();
    const rightPivot = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, material);
    const right = new THREE.Mesh(wingGeometry, material);
    left.scale.x = -1;
    leftPivot.add(left);
    rightPivot.add(right);
    butterfly.add(leftPivot, rightPivot);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.009, 5, 4), new THREE.MeshBasicMaterial({ color: '#554a3c' }));
    body.scale.z = 2.4;
    butterfly.add(body);
    butterfly.scale.setScalar(0.9 + i * 0.12);
    group.add(butterfly);
    butterflies.push({ butterfly, leftPivot, rightPivot, anchor: anchors[i], phase: i * 1.7 });
  }
  return {
    group,
    update(elapsed) {
      for (const item of butterflies) {
        const t = elapsed * 0.6 + item.phase;
        const a = item.anchor;
        item.butterfly.position.set(
          a.x + Math.sin(t * 0.7) * 0.33,
          heightAt(a.x, a.z) + a.y + Math.sin(t * 1.7) * 0.07,
          a.z + Math.cos(t * 0.53) * 0.25,
        );
        item.butterfly.rotation.y = t * 0.65;
        const flap = Math.sin(elapsed * 14 + item.phase * 2.0) * 0.65;
        item.leftPivot.rotation.z = flap;
        item.rightPivot.rotation.z = -flap;
      }
    },
  };
}

export function createDetails(renderer) {
  const group = new THREE.Group();
  group.name = 'Life and weather';
  const updates = [];

  const cabin = buildCabin();
  group.add(cabin.group);
  group.add(cabin.outdoors);
  cabin.group.updateMatrixWorld(true);
  const cabinWorld = new THREE.Vector3();
  cabin.group.localToWorld(cabinWorld.copy(cabin.smokeOrigin));
  const cabinSmoke = buildSmoke(cabinWorld, group);
  const random = mulberry32(55);
  for (const item of cabinSmoke) item.speed = 0.04 + random() * 0.035;

  const animals = buildAnimals();
  group.add(animals.group);
  updates.push((elapsed) => {
    for (const update of animals.updaters) update(elapsed);
  });

  const butterflies = buildButterflies();
  group.add(butterflies.group);
  updates.push((elapsed) => butterflies.update(elapsed));

  const clouds = buildClouds();
  group.add(clouds.group);
  updates.push((elapsed, lighting) => clouds.update(elapsed, lighting));

  const mist = buildMist();
  group.add(mist.group);
  updates.push((elapsed, lighting) => mist.update(elapsed, lighting));

  // Soft volumetric sunlight is added in the screen-space final pass. Solid
  // cone meshes read like glass wedges at this miniature scale.
  const particles = buildParticles(renderer.getPixelRatio());
  group.add(particles.group);
  updates.push((elapsed, lighting) => particles.update(elapsed, lighting));

  const bokeh = buildBackdropBokeh();
  updates.push((elapsed, lighting) => bokeh.update(elapsed, lighting));

  return {
    group,
    backdrop: bokeh.group,
    update(elapsed, lighting) {
      for (const update of updates) update(elapsed, lighting);

      for (const material of cabin.glowMaterials) {
        material.emissiveIntensity = (material === cabin.glowMaterials[0] ? 0.06 : 0.1) + lighting.night * (material === cabin.glowMaterials[0] ? 2.9 : 1.65);
      }
      for (const glow of cabin.glowSprites) {
        const flicker = 0.88 + Math.sin(elapsed * 2.1 + glow.phase) * 0.07 + Math.sin(elapsed * 5.7 + glow.phase * 2.0) * 0.035;
        glow.sprite.material.opacity = lighting.night * glow.base * flicker;
      }
      cabin.cabinLight.intensity = lighting.night * 1.5;

      for (const smoke of cabinSmoke) {
        smoke.phase += 0.0016;
        if (smoke.phase > 1) smoke.phase -= 1;
        const t = smoke.phase;
        smoke.sprite.position.x = smoke.baseX + smoke.drift * t + Math.sin(elapsed * 0.3 + smoke.phase * 6) * 0.03;
        smoke.sprite.position.y = smoke.baseY + t * 0.65;
        smoke.sprite.position.z = smoke.baseZ + t * 0.08;
        smoke.sprite.material.opacity = Math.sin(t * Math.PI) * 0.16 * (1 - t * 0.2);
        const scale = smoke.size * (0.6 + t * 2.2);
        smoke.sprite.scale.set(scale, scale * 0.8, 1);
      }
    },
  };
}
