import * as THREE from '../vendor/three/three.module.js';
import {
  LAKE,
  LANDMARKS,
  MOUNTAINS,
  CLIFF,
  heightAt,
  isInWater,
  isInLake,
  lakeDistance,
  slopeAt,
  islandPoint,
  lakeShoreline,
  closestRiverSample,
} from './geography.js';
import {
  mergeGeometries,
  transformed,
  makeSoftCircleTexture,
  setShadow,
} from './utils.js';
import { mulberry32, lerp, smoothstep, clamp } from './noise.js';

const windMaterials = [];

function addWind(material, amplitude = 0.018, speed = 0.65) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindAmplitude = { value: amplitude };
    shader.uniforms.uWindSpeed = { value: speed };
    shader.vertexShader = 'uniform float uTime;\nuniform float uWindAmplitude;\nuniform float uWindSpeed;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 1.94;
        #else
          float windPhase = 0.0;
        #endif
        float wind = sin(uTime * uWindSpeed + windPhase) * 0.7
          + sin(uTime * uWindSpeed * 1.83 + windPhase * 1.41) * 0.3;
        transformed.x += wind * uWindAmplitude * max(position.y, 0.0);
        transformed.z += cos(uTime * uWindSpeed * 0.73 + windPhase * 0.82) * uWindAmplitude * 0.55 * max(position.y, 0.0);
      `,
    );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `wind-${amplitude}-${speed}`;
  windMaterials.push(material);
  return material;
}

function updateWind(elapsed) {
  for (const material of windMaterials) {
    const shader = material.userData.shader;
    if (shader) shader.uniforms.uTime.value = elapsed;
  }
}

function matrixAt(position, rotationY, scale, yOffset = 0) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
  matrix.compose(
    new THREE.Vector3(position.x, position.y + yOffset, position.z),
    quaternion,
    new THREE.Vector3(scale.x, scale.y, scale.z),
  );
  return matrix;
}

function makePineFoliage() {
  const geometries = [];
  const layers = [
    { radius: 0.35, height: 0.52, y: 0.43, rotation: 0.3 },
    { radius: 0.27, height: 0.47, y: 0.7, rotation: 1.2 },
    { radius: 0.18, height: 0.4, y: 0.93, rotation: 2.1 },
  ];
  for (const layer of layers) {
    const geo = new THREE.ConeGeometry(layer.radius, layer.height, 8, 2, false);
    const position = geo.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (Math.abs(y) < layer.height * 0.47) {
        const angle = Math.atan2(z, x);
        const wobble = 1 + 0.1 * Math.sin(angle * 5 + layer.rotation) + 0.05 * Math.sin(angle * 9 - 1.2);
        position.setX(i, x * wobble);
        position.setZ(i, z * wobble);
      }
    }
    geo.computeVertexNormals();
    const matrix = new THREE.Matrix4().makeTranslation(0, layer.y, 0);
    geometries.push(transformed(geo, matrix));
  }
  const crown = new THREE.ConeGeometry(0.08, 0.26, 7);
  geometries.push(transformed(crown, new THREE.Matrix4().makeTranslation(0, 1.16, 0)));
  return mergeGeometries(geometries);
}

function makePineTrunk() {
  const geometry = new THREE.CylinderGeometry(0.03, 0.055, 0.8, 6);
  return transformed(geometry, new THREE.Matrix4().makeTranslation(0, 0.4, 0));
}

function makeBroadleafFoliage() {
  const parts = [];
  const blobs = [
    [0, 0.7, 0, 0.28, 2],
    [0.19, 0.62, 0.06, 0.21, 1],
    [-0.18, 0.64, -0.03, 0.2, 1],
    [0.03, 0.9, -0.02, 0.18, 1],
    [-0.03, 0.58, 0.18, 0.17, 1],
    [0.15, 0.8, -0.14, 0.15, 1],
    [-0.16, 0.79, 0.12, 0.15, 1],
    [0.24, 0.51, -0.07, 0.14, 1],
    [-0.23, 0.53, 0.08, 0.13, 1],
    [0.05, 0.5, -0.2, 0.12, 1],
  ];
  for (let i = 0; i < blobs.length; i++) {
    const [x, y, z, radius, detail] = blobs[i];
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const position = geometry.getAttribute('position');
    for (let v = 0; v < position.count; v++) {
      const px = position.getX(v);
      const py = position.getY(v);
      const pz = position.getZ(v);
      const wobble = 1 + 0.07 * Math.sin(px * 19 + i) + 0.055 * Math.sin(pz * 17 - i * 1.4);
      position.setXYZ(v, px * wobble, py * wobble * 0.93, pz * wobble);
    }
    geometry.computeVertexNormals();
    const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
    parts.push(transformed(geometry, matrix));
  }
  return mergeGeometries(parts);
}

function makeBroadleafTrunk() {
  const geometry = new THREE.CylinderGeometry(0.025, 0.05, 0.55, 6);
  return transformed(geometry, new THREE.Matrix4().makeTranslation(0, 0.275, 0));
}

function makeBushGeometry() {
  const parts = [];
  const blobs = [
    [0, 0.1, 0, 1.0],
    [0.14, 0.07, 0.04, 0.72],
    [-0.12, 0.08, -0.02, 0.64],
  ];
  for (const [x, y, z, radius] of blobs) {
    const geo = new THREE.IcosahedronGeometry(radius, 1);
    geo.scale(0.24, 0.16, 0.24);
    parts.push(transformed(geo, new THREE.Matrix4().makeTranslation(x, y, z)));
  }
  return mergeGeometries(parts);
}

function makeGrassGeometry() {
  const positions = [];
  const random = mulberry32(558);
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const angle = random() * Math.PI * 2;
    const height = 0.14 + random() * 0.17;
    const width = 0.011 + random() * 0.009;
    const lean = (random() - 0.5) * 0.11;
    const baseX = (random() - 0.5) * 0.08;
    const baseZ = (random() - 0.5) * 0.08;
    const dx = Math.cos(angle) * width;
    const dz = Math.sin(angle) * width;
    const tipX = baseX + Math.cos(angle + 0.5) * lean;
    const tipZ = baseZ + Math.sin(angle + 0.5) * lean;
    positions.push(
      baseX - dx, 0, baseZ - dz,
      baseX + dx, 0, baseZ + dz,
      tipX, height, tipZ,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeFlowerStemGeometry() {
  const geometry = new THREE.CylinderGeometry(0.0035, 0.005, 0.22, 4);
  return transformed(geometry, new THREE.Matrix4().makeTranslation(0, 0.11, 0));
}

function makeFlowerHeadGeometry() {
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const petal = new THREE.IcosahedronGeometry(0.024, 1);
    petal.scale(1, 0.55, 1.5);
    const matrix = new THREE.Matrix4()
      .makeRotationY(-angle)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.027));
    petal.applyMatrix4(matrix);
    petals.push(petal);
  }
  const center = new THREE.IcosahedronGeometry(0.012, 1);
  center.translate(0, 0.011, 0);
  petals.push(center);
  return mergeGeometries(petals);
}

function makeMushroomCapGeometry() {
  const geometry = new THREE.SphereGeometry(0.052, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
  geometry.scale(1, 0.62, 1);
  geometry.translate(0, 0.095, 0);
  return geometry;
}

function makeMushroomStemGeometry() {
  const geometry = new THREE.CylinderGeometry(0.009, 0.015, 0.1, 5);
  geometry.translate(0, 0.05, 0);
  return geometry;
}

function isMountainInterior(x, z, padding = 0) {
  for (const mountain of MOUNTAINS) {
    const distance = Math.hypot(x - mountain.x, z - mountain.z);
    if (distance < mountain.radius * 0.76 + padding) return true;
  }
  return Math.hypot(x - CLIFF.x, z - CLIFF.z) < CLIFF.radiusX * 1.12 + padding;
}

function isClearing(x, z, radius = 0) {
  const cabin = LANDMARKS.cabin;
  if (Math.hypot(x - cabin.x, z - cabin.z) < cabin.radius + radius) return true;
  const deer = LANDMARKS.deer;
  if (Math.hypot(x - deer.x, z - deer.z) < deer.radius + radius) return true;
  const bridge = LANDMARKS.bridge;
  return Math.hypot(x - bridge.x, z - bridge.z) < bridge.radius + radius;
}

function isPlantable(x, z, extraPadding = 0) {
  const edge = Math.hypot(x / 4.25, z / 3.7);
  if (edge > 0.93) return false;
  if (isInWater(x, z, 0.13 + extraPadding)) return false;
  if (isMountainInterior(x, z, extraPadding)) return false;
  if (isClearing(x, z, extraPadding)) return false;
  if (slopeAt(x, z) > 1.05) return false;
  return true;
}

function sampleWithinCluster(random, cluster) {
  const angle = random() * Math.PI * 2;
  const radial = Math.sqrt(random()) * cluster.r;
  return {
    x: cluster.x + Math.cos(angle) * radial,
    z: cluster.z + Math.sin(angle) * radial,
  };
}

function makeTreeInstances(mesh, data, index, palette, random) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (const tree of data) {
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.set(tree.sx, tree.sy, tree.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.set(palette[Math.floor(random() * palette.length)]);
    color.offsetHSL((random() - 0.5) * 0.025, (random() - 0.5) * 0.08, (random() - 0.5) * 0.08);
    mesh.setColorAt(index, color);
    index++;
  }
  return index;
}

function buildForest() {
  const group = new THREE.Group();
  group.name = 'Forest';
  const random = mulberry32(1947);

  const pineClusters = [
    { x: -3.15, z: -0.5, r: 1.28, count: 52 },
    { x: -2.35, z: 1.65, r: 1.08, count: 36 },
    { x: -3.58, z: 1.55, r: 0.78, count: 22 },
    { x: 0.82, z: -2.62, r: 1.07, count: 34 },
    { x: 2.88, z: -1.92, r: 0.92, count: 28 },
    { x: 3.5, z: 0.4, r: 0.55, count: 12 },
    { x: 0.05, z: -2.78, r: 0.72, count: 18 },
    { x: -3.22, z: 2.55, r: 0.55, count: 10 },
  ];
  const leafClusters = [
    { x: -2.35, z: 0.9, r: 0.95, count: 16 },
    { x: -1.15, z: 1.92, r: 0.72, count: 10 },
    { x: 3.15, z: 1.72, r: 0.72, count: 15 },
    { x: 2.65, z: -0.72, r: 0.64, count: 12 },
    { x: -0.42, z: -1.0, r: 0.65, count: 8 },
    { x: 0.42, z: 2.6, r: 0.52, count: 6 },
  ];

  const pines = [];
  for (const cluster of pineClusters) {
    for (let i = 0; i < cluster.count; i++) {
      for (let attempt = 0; attempt < 18; attempt++) {
        const point = sampleWithinCluster(random, cluster);
        if (!isPlantable(point.x, point.z, 0.05)) continue;
        const y = heightAt(point.x, point.z);
        if (y < LAKE.waterY + 0.12) continue;
        const scale = 0.38 + random() * 0.36;
        pines.push({
          x: point.x,
          z: point.z,
          y: y + 0.005,
          rotation: random() * Math.PI * 2,
          sx: scale * (0.82 + random() * 0.3),
          sy: scale * (0.9 + random() * 0.36),
          sz: scale * (0.82 + random() * 0.3),
        });
        break;
      }
    }
  }

  const broadleaf = [];
  for (const cluster of leafClusters) {
    for (let i = 0; i < cluster.count; i++) {
      for (let attempt = 0; attempt < 18; attempt++) {
        const point = sampleWithinCluster(random, cluster);
        if (!isPlantable(point.x, point.z, 0.02)) continue;
        const y = heightAt(point.x, point.z);
        if (y < LAKE.waterY + 0.1) continue;
        const scale = 0.42 + random() * 0.34;
        broadleaf.push({
          x: point.x,
          z: point.z,
          y: y + 0.005,
          rotation: random() * Math.PI * 2,
          sx: scale * (0.9 + random() * 0.3),
          sy: scale * (0.85 + random() * 0.25),
          sz: scale * (0.9 + random() * 0.3),
        });
        break;
      }
    }
  }

  // A few isolated broadleaf trees give the open meadow scale and shade.
  const isolated = [
    { x: 0.48, z: 2.88, scale: 0.5 },
    { x: 2.84, z: 2.4, scale: 0.44 },
    { x: -2.1, z: 2.46, scale: 0.52 },
  ];
  for (const spot of isolated) {
    if (!isPlantable(spot.x, spot.z, 0)) continue;
    const y = heightAt(spot.x, spot.z);
    broadleaf.push({
      x: spot.x,
      z: spot.z,
      y,
      rotation: random() * Math.PI * 2,
      sx: spot.scale,
      sy: spot.scale * 0.94,
      sz: spot.scale,
    });
  }

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: '#604b3a',
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.2,
  });
  const foliageMaterial = addWind(new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.32,
  }), 0.024, 0.55);

  const pineCount = pines.length;
  const leafCount = broadleaf.length;
  const pineCanopy = new THREE.InstancedMesh(makePineFoliage(), foliageMaterial, pineCount);
  const pineTrunks = new THREE.InstancedMesh(makePineTrunk(), trunkMaterial, pineCount);
  const leafCanopy = new THREE.InstancedMesh(makeBroadleafFoliage(), foliageMaterial, leafCount);
  const leafTrunks = new THREE.InstancedMesh(makeBroadleafTrunk(), trunkMaterial, leafCount);

  for (const mesh of [pineCanopy, pineTrunks, leafCanopy, leafTrunks]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }

  const pinePalette = ['#335b4b', '#3d6551', '#466d54', '#52775a', '#5d805d', '#2d554d'];
  const leafPalette = ['#5d7e58', '#6f8a5d', '#81996a', '#93a073', '#a8a780', '#c09a95', '#72876a', '#b5aa7c'];
  let index = 0;
  for (const tree of pines) {
    const dummy = new THREE.Object3D();
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.set(tree.sx, tree.sy, tree.sz);
    dummy.updateMatrix();
    pineCanopy.setMatrixAt(index, dummy.matrix);
    pineTrunks.setMatrixAt(index, dummy.matrix);
    const color = new THREE.Color(pinePalette[Math.floor(random() * pinePalette.length)]);
    color.offsetHSL((random() - 0.5) * 0.02, (random() - 0.5) * 0.08, (random() - 0.5) * 0.07);
    pineCanopy.setColorAt(index, color);
    index++;
  }
  index = 0;
  for (const tree of broadleaf) {
    const dummy = new THREE.Object3D();
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.set(tree.sx, tree.sy, tree.sz);
    dummy.updateMatrix();
    leafCanopy.setMatrixAt(index, dummy.matrix);
    leafTrunks.setMatrixAt(index, dummy.matrix);
    const color = new THREE.Color(leafPalette[Math.floor(random() * leafPalette.length)]);
    color.offsetHSL((random() - 0.5) * 0.02, (random() - 0.5) * 0.07, (random() - 0.5) * 0.07);
    leafCanopy.setColorAt(index, color);
    index++;
  }

  pineCanopy.instanceMatrix.needsUpdate = true;
  pineTrunks.instanceMatrix.needsUpdate = true;
  leafCanopy.instanceMatrix.needsUpdate = true;
  leafTrunks.instanceMatrix.needsUpdate = true;
  if (pineCanopy.instanceColor) pineCanopy.instanceColor.needsUpdate = true;
  if (leafCanopy.instanceColor) leafCanopy.instanceColor.needsUpdate = true;

  group.add(pineCanopy, pineTrunks, leafCanopy, leafTrunks);

  // Low shrubs and bramble masses soften the feet of the forest.
  const bushItems = [];
  for (let i = 0; i < 95; i++) {
    const angle = random() * Math.PI * 2;
    const radial = 0.38 + Math.sqrt(random()) * 0.52;
    const point = islandPoint(angle, radial);
    if (!isPlantable(point.x, point.z, -0.02)) continue;
    const y = heightAt(point.x, point.z);
    const scale = 0.3 + random() * 0.62;
    bushItems.push({
      position: new THREE.Vector3(point.x, y, point.z),
      matrix: matrixAt({ x: point.x, y: y + 0.015, z: point.z }, random() * Math.PI * 2, {
        x: scale,
        y: scale * (0.8 + random() * 0.6),
        z: scale,
      }),
      color: random() < 0.22 ? '#929069' : '#6b8562',
    });
  }
  const bushMaterial = addWind(new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.25,
  }), 0.012, 0.45);
  const bushMesh = new THREE.InstancedMesh(makeBushGeometry(), bushMaterial, bushItems.length);
  bushMesh.name = 'Bushes';
  bushMesh.castShadow = true;
  bushMesh.receiveShadow = true;
  bushItems.forEach((item, i) => {
    bushMesh.setMatrixAt(i, item.matrix);
    bushMesh.setColorAt(i, new THREE.Color(item.color).offsetHSL(0, 0, (random() - 0.5) * 0.06));
  });
  bushMesh.instanceMatrix.needsUpdate = true;
  if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
  group.add(bushMesh);

  return group;
}

function buildGroundCover() {
  const group = new THREE.Group();
  group.name = 'Meadow ground cover';
  const random = mulberry32(417);

  const grassGeometry = makeGrassGeometry();
  const grassMaterial = addWind(new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.2,
  }), 0.0038, 0.8);
  const grassCount = 1380;
  const grassMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
  grassMesh.name = 'Grass tufts';
  grassMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const colors = ['#617d50', '#718b54', '#526f4b', '#7f8f5d', '#587148', '#6d8453'];
  let planted = 0;
  for (let attempt = 0; attempt < 6000 && planted < grassCount; attempt++) {
    const theta = random() * Math.PI * 2;
    const radial = Math.sqrt(random()) * 0.92;
    const point = islandPoint(theta, radial);
    if (isInWater(point.x, point.z, 0.02)) continue;
    if (isMountainInterior(point.x, point.z, 0)) continue;
    if (slopeAt(point.x, point.z) > 1.3) continue;
    if (Math.hypot(point.x - LANDMARKS.cabin.x, point.z - LANDMARKS.cabin.z) < 0.92) continue;
    if (Math.hypot(point.x - LANDMARKS.bridge.x, point.z - LANDMARKS.bridge.z) < 0.42) continue;
    const x = point.x;
    const z = point.z;
    const y = heightAt(x, z);
    if (y < LAKE.waterY - 0.02) continue;
    const scale = 0.45 + random() * 0.95;
    dummy.position.set(x, y + 0.005, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.8 + random() * 0.6), scale);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(planted, dummy.matrix);
    const color = new THREE.Color(colors[Math.floor(random() * colors.length)]);
    color.offsetHSL(0, (random() - 0.5) * 0.08, (random() - 0.5) * 0.06);
    grassMesh.setColorAt(planted, color);
    planted++;
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  group.add(grassMesh);

  // Tall, soft wildflower stems around the clearing and shoreline.
  const stemGeometry = makeFlowerStemGeometry();
  const headGeometry = makeFlowerHeadGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#6f8154', roughness: 0.95 });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.7,
    metalness: 0,
    envMapIntensity: 0.35,
  });
  const flowerCount = 112;
  const stemMesh = new THREE.InstancedMesh(stemGeometry, stemMaterial, flowerCount);
  const headMesh = new THREE.InstancedMesh(headGeometry, headMaterial, flowerCount);
  stemMesh.receiveShadow = true;
  headMesh.receiveShadow = true;
  const flowerPalette = ['#f1e4c7', '#e8b7bd', '#d8c57b', '#d7e2d0', '#e4ccb3', '#c8abc8', '#dfcfa3', '#b9c9d6'];
  let flowerIndex = 0;
  for (let attempt = 0; attempt < 2400 && flowerIndex < flowerCount; attempt++) {
    const theta = random() * Math.PI * 2;
    const radial = 0.25 + Math.sqrt(random()) * 0.66;
    const point = islandPoint(theta, radial);
    if (isInWater(point.x, point.z, 0.06)) continue;
    if (isMountainInterior(point.x, point.z, 0)) continue;
    if (slopeAt(point.x, point.z) > 0.9) continue;
    if (Math.hypot(point.x - CLIFF.x, point.z - CLIFF.z) < 1.0) continue;
    if (Math.hypot(point.x - LANDMARKS.cabin.x, point.z - LANDMARKS.cabin.z) < 0.98) continue;
    const y = heightAt(point.x, point.z);
    if (y < LAKE.waterY) continue;
    const scale = 0.68 + random() * 0.96;
    const rotation = random() * Math.PI * 2;
    dummy.position.set(point.x, y, point.z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(scale, scale * (0.85 + random() * 0.4), scale);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(flowerIndex, dummy.matrix);
    dummy.position.y = y + 0.22 * scale;
    dummy.updateMatrix();
    headMesh.setMatrixAt(flowerIndex, dummy.matrix);
    headMesh.setColorAt(flowerIndex, new THREE.Color(flowerPalette[Math.floor(random() * flowerPalette.length)]));
    flowerIndex++;
  }
  stemMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
  group.add(stemMesh, headMesh);

  // Thousands of tiny white and gold pinpricks in the grass.
  const pinCount = 330;
  const pinPositions = new Float32Array(pinCount * 3);
  const pinColors = new Float32Array(pinCount * 3);
  const pinPalette = [new THREE.Color('#f1e4bf'), new THREE.Color('#eec3c5'), new THREE.Color('#dce6c5')];
  let pinIndex = 0;
  for (let attempt = 0; attempt < 1400 && pinIndex < pinCount; attempt++) {
    const theta = random() * Math.PI * 2;
    const radial = 0.2 + Math.sqrt(random()) * 0.72;
    const point = islandPoint(theta, radial);
    if (isInWater(point.x, point.z, 0.05)) continue;
    if (isMountainInterior(point.x, point.z, 0.02)) continue;
    if (slopeAt(point.x, point.z) > 0.8) continue;
    if (Math.hypot(point.x - LANDMARKS.cabin.x, point.z - LANDMARKS.cabin.z) < 0.9) continue;
    const y = heightAt(point.x, point.z);
    if (y < LAKE.waterY + 0.02) continue;
    pinPositions[pinIndex * 3] = point.x;
    pinPositions[pinIndex * 3 + 1] = y + 0.09 + random() * 0.12;
    pinPositions[pinIndex * 3 + 2] = point.z;
    const color = pinPalette[Math.floor(random() * pinPalette.length)];
    pinColors[pinIndex * 3] = color.r;
    pinColors[pinIndex * 3 + 1] = color.g;
    pinColors[pinIndex * 3 + 2] = color.b;
    pinIndex++;
  }
  const pinGeometry = new THREE.BufferGeometry();
  pinGeometry.setAttribute('position', new THREE.BufferAttribute(pinPositions, 3));
  pinGeometry.setAttribute('color', new THREE.BufferAttribute(pinColors, 3));
  const pinMaterial = new THREE.PointsMaterial({
    map: makeSoftCircleTexture(64, 0.14),
    size: 0.062,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    alphaTest: 0.02,
    toneMapped: false,
    sizeAttenuation: true,
  });
  const pins = new THREE.Points(pinGeometry, pinMaterial);
  pins.frustumCulled = false;
  group.add(pins);

  return group;
}

function buildShorelife() {
  const group = new THREE.Group();
  group.name = 'Shore reeds and lilies';
  const random = mulberry32(853);
  const shoreline = lakeShoreline(100);
  const dummy = new THREE.Object3D();

  // Reeds: elongated cousins of the meadow grass.
  const reedGeometry = makeGrassGeometry();
  const reedMaterial = addWind(new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.94,
    side: THREE.DoubleSide,
    envMapIntensity: 0.2,
  }), 0.008, 0.55);
  const reeds = [];
  for (let i = 0; i < 72; i++) {
    const shore = shoreline[Math.floor(random() * shoreline.length)];
    const inset = 0.955 + random() * 0.06;
    const theta = shore.theta;
    const x = LAKE.x + (shore.x - LAKE.x) * inset + (random() - 0.5) * 0.08;
    const z = LAKE.z + (shore.z - LAKE.z) * inset + (random() - 0.5) * 0.08;
    if (closestRiverSample(x, z).distance < 0.34) continue;
    const y = Math.max(heightAt(x, z), LAKE.waterY - 0.015);
    if (y > LAKE.waterY + 0.2) continue;
    reeds.push({ x, z, y, scale: 0.7 + random() * 0.85, rotation: theta + Math.PI / 2 + (random() - 0.5) });
  }
  const reedMesh = new THREE.InstancedMesh(reedGeometry, reedMaterial, reeds.length);
  const reedPalette = ['#728b58', '#849263', '#6d8252', '#8e9a6a'];
  reeds.forEach((reed, index) => {
    dummy.position.set(reed.x, reed.y, reed.z);
    dummy.rotation.set(0, reed.rotation, 0);
    dummy.scale.set(reed.scale * 0.9, reed.scale * 1.35, reed.scale * 0.9);
    dummy.updateMatrix();
    reedMesh.setMatrixAt(index, dummy.matrix);
    reedMesh.setColorAt(index, new THREE.Color(reedPalette[Math.floor(random() * reedPalette.length)]));
    void index;
  });
  reedMesh.instanceMatrix.needsUpdate = true;
  if (reedMesh.instanceColor) reedMesh.instanceColor.needsUpdate = true;
  group.add(reedMesh);

  // Lily pads drift on the calm side of the lake.
  const padGeometry = new THREE.CircleGeometry(1, 14, 0.35, Math.PI * 2 - 0.62);
  padGeometry.rotateX(-Math.PI / 2);
  const padMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide,
    envMapIntensity: 0.25,
  });
  const pads = [];
  for (let i = 0; i < 14; i++) {
    const angle = random() * Math.PI * 2;
    const radial = Math.sqrt(random()) * 0.77;
    const x = LAKE.x + Math.cos(angle) * radial * 1.13;
    const z = LAKE.z + Math.sin(angle) * radial * 0.87;
    pads.push({ x, z, scale: 0.055 + random() * 0.07, rotation: random() * Math.PI * 2 });
  }
  const padMesh = new THREE.InstancedMesh(padGeometry, padMaterial, pads.length);
  const padPalette = ['#5c7e52', '#4f734b', '#6f8d59', '#486b48'];
  pads.forEach((pad, i) => {
    dummy.position.set(pad.x, LAKE.waterY + 0.006, pad.z);
    dummy.rotation.set(0, pad.rotation, 0);
    dummy.scale.set(pad.scale * 1.25, 1, pad.scale);
    dummy.updateMatrix();
    padMesh.setMatrixAt(i, dummy.matrix);
    padMesh.setColorAt(i, new THREE.Color(padPalette[Math.floor(random() * padPalette.length)]));
  });
  padMesh.instanceMatrix.needsUpdate = true;
  if (padMesh.instanceColor) padMesh.instanceColor.needsUpdate = true;
  group.add(padMesh);

  // A few fallen petals drift on the lake, catching the light.
  const petalGeometry = new THREE.CircleGeometry(1, 5);
  petalGeometry.rotateX(-Math.PI / 2);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.86,
    envMapIntensity: 0.3,
  });
  const petals = [];
  for (let i = 0; i < 18; i++) {
    const angle = random() * Math.PI * 2;
    const radial = Math.sqrt(random()) * 0.72;
    petals.push({
      x: LAKE.x + Math.cos(angle) * radial * 1.12,
      z: LAKE.z + Math.sin(angle) * radial * 0.86,
      scale: 0.022 + random() * 0.024,
      rotation: random() * Math.PI * 2,
      color: random() < 0.45 ? '#ecc5c4' : '#e8dfc8',
    });
  }
  const petalMesh = new THREE.InstancedMesh(petalGeometry, petalMaterial, petals.length);
  petals.forEach((petal, i) => {
    dummy.position.set(petal.x, LAKE.waterY + 0.009, petal.z);
    dummy.rotation.set(0, petal.rotation, 0.15);
    dummy.scale.set(petal.scale * 1.7, 1, petal.scale);
    dummy.updateMatrix();
    petalMesh.setMatrixAt(i, dummy.matrix);
    petalMesh.setColorAt(i, new THREE.Color(petal.color));
  });
  petalMesh.instanceMatrix.needsUpdate = true;
  if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
  group.add(petalMesh);

  // Three tiny water lilies, a paper-pink punctuation on the dark water.
  const lotusMaterial = new THREE.MeshStandardMaterial({
    color: '#e7c0c2',
    roughness: 0.64,
    emissive: '#d48e9f',
    emissiveIntensity: 0.03,
    envMapIntensity: 0.4,
  });
  for (let i = 0; i < 4; i++) {
    const base = pads[i * 3 % pads.length];
    const lotus = new THREE.Group();
    lotus.position.set(base.x, LAKE.waterY + 0.04, base.z);
    for (let p = 0; p < 6; p++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), lotusMaterial);
      petal.scale.set(0.7, 1.2, 0.45);
      const angle = (p / 6) * Math.PI * 2;
      petal.position.set(Math.cos(angle) * 0.02, 0.012, Math.sin(angle) * 0.02);
      petal.rotation.set(0.4 * Math.cos(angle), -angle, 0.4 * Math.sin(angle));
      lotus.add(petal);
    }
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 6, 4),
      new THREE.MeshStandardMaterial({ color: '#e4cc86', roughness: 0.7, emissive: '#8f7f49', emissiveIntensity: 0.04 }),
    );
    heart.position.y = 0.024;
    lotus.add(heart);
    group.add(lotus);
  }

  return group;
}

function buildMushrooms() {
  const group = new THREE.Group();
  group.name = 'Mushroom rings';
  const random = mulberry32(331);
  const stemGeometry = makeMushroomStemGeometry();
  const capGeometry = makeMushroomCapGeometry();
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#dfd7c2', roughness: 0.88 });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.55,
    metalness: 0.02,
    emissive: '#7addc2',
    emissiveIntensity: 0.12,
    envMapIntensity: 0.4,
  });
  const glowTexture = makeSoftCircleTexture(96, 0.03);
  const glowSprites = [];
  const clusters = [
    [-2.25, 1.15, 3],
    [-2.9, 0.35, 3],
    [2.65, -0.35, 3],
    [1.25, -1.65, 2],
    [-3.25, 1.78, 3],
    [3.45, 1.35, 2],
    [-0.42, 1.92, 2],
    [2.2, 2.3, 2],
  ];
  const instances = [];
  for (let c = 0; c < clusters.length; c++) {
    const [cx, cz, amount] = clusters[c];
    for (let i = 0; i < amount; i++) {
      const angle = random() * Math.PI * 2;
      const radial = random() * 0.17;
      const x = cx + Math.cos(angle) * radial;
      const z = cz + Math.sin(angle) * radial;
      if (isInWater(x, z, 0.06)) continue;
      if (isMountainInterior(x, z, 0.05)) continue;
      const y = heightAt(x, z);
      if (y < 1.6) continue;
      instances.push({
        x,
        z,
        y,
        scale: 0.5 + random() * 1.3,
        rotation: random() * Math.PI * 2,
      });
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: c % 3 === 1 ? '#ffc57c' : '#83e1c7',
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    const y = heightAt(cx, cz);
    glow.position.set(cx, y + 0.16, cz);
    glow.scale.set(0.55, 0.34, 1);
    group.add(glow);
    glowSprites.push({ sprite: glow, phase: random() * Math.PI * 2, base: 0.28 });
  }

  const stemMesh = new THREE.InstancedMesh(stemGeometry, stemMaterial, instances.length);
  const capMesh = new THREE.InstancedMesh(capGeometry, capMaterial, instances.length);
  stemMesh.castShadow = true;
  capMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  const capPalette = ['#a7d7c6', '#d6e5d8', '#e1c89a', '#b7dfd4', '#e0d4b0'];
  instances.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.rotation, 0);
    dummy.scale.set(item.scale, item.scale * (0.8 + random() * 0.4), item.scale);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(i, dummy.matrix);
    capMesh.setMatrixAt(i, dummy.matrix);
    capMesh.setColorAt(i, new THREE.Color(capPalette[Math.floor(random() * capPalette.length)]));
  });
  stemMesh.instanceMatrix.needsUpdate = true;
  capMesh.instanceMatrix.needsUpdate = true;
  if (capMesh.instanceColor) capMesh.instanceColor.needsUpdate = true;
  group.add(stemMesh, capMesh);

  return { group, capMaterial, glowSprites };
}

function buildFallenLogs() {
  const group = new THREE.Group();
  group.name = 'Fallen logs';
  const barkMaterial = new THREE.MeshStandardMaterial({ color: '#5c4a38', roughness: 0.98 });
  const endMaterial = new THREE.MeshStandardMaterial({ color: '#9b8059', roughness: 0.9 });
  const logData = [
    { x: -2.32, z: 0.52, angle: 0.8, length: 0.62, radius: 0.075 },
    { x: 2.46, z: -0.88, angle: 2.4, length: 0.48, radius: 0.06 },
    { x: 1.04, z: 2.92, angle: 1.1, length: 0.34, radius: 0.045 },
  ];
  for (const data of logData) {
    if (isInWater(data.x, data.z, 0.1)) continue;
    const y = heightAt(data.x, data.z);
    const log = new THREE.Group();
    log.position.set(data.x, y + data.radius * 0.7, data.z);
    log.rotation.y = data.angle;
    const bark = new THREE.Mesh(new THREE.CylinderGeometry(data.radius, data.radius * 1.05, data.length, 8), barkMaterial);
    bark.rotation.z = Math.PI / 2;
    bark.castShadow = true;
    bark.receiveShadow = true;
    log.add(bark);
    for (const side of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(data.radius * 0.95, 10), endMaterial);
      end.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      end.position.x = side * data.length * 0.5;
      log.add(end);
    }
    group.add(log);
  }
  return group;
}

export function buildFlora() {
  const group = new THREE.Group();
  group.name = 'Flora';
  group.add(buildForest());
  group.add(buildGroundCover());
  group.add(buildShorelife());
  const mushrooms = buildMushrooms();
  group.add(mushrooms.group);
  group.add(buildFallenLogs());

  return {
    group,
    update(elapsed, lighting) {
      updateWind(elapsed);
      mushrooms.capMaterial.emissiveIntensity = 0.08 + lighting.night * 1.55;
      for (const glow of mushrooms.glowSprites) {
        const pulse = 0.8 + Math.sin(elapsed * 1.25 + glow.phase) * 0.2;
        glow.sprite.material.opacity = glow.base * lighting.night * pulse;
      }
    },
  };
}
