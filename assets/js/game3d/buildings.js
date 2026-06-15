import * as THREE from 'three';
import { getHeightAt } from './world.js';
import { loadGLTF } from './model-loader.js';
import { addBoxCollider, addCircleCollider } from './physics.js';

// ── Headquarters and surrounding campus buildings ───────────────────────────────
// Uses KayKit Medieval models (CC0) with procedural fallback.

// Model URLs
const MODELS = {
  church: '/assets/models/church.glb',
  tavern: '/assets/models/tavern.glb',
  barracks: '/assets/models/barracks.glb',
  tower_a: '/assets/models/tower_a.glb',
  tower_b: '/assets/models/tower_b.glb',
  well: '/assets/models/well.glb',
  castle: '/assets/models/castle.glb',
  home_a: '/assets/models/home_a.glb',
  home_b: '/assets/models/home_b.glb',
  blacksmith: '/assets/models/blacksmith.glb',
  fence_stone: '/assets/models/fence_stone.glb',
  fence_stone_gate: '/assets/models/fence_stone_gate.glb',
  fence_wood: '/assets/models/fence_wood.glb',
  barrel: '/assets/models/barrel.glb',
};

// Loaded model cache (populated by loadBuildingModels)
const loaded = {};

export async function loadBuildingModels() {
  const entries = Object.entries(MODELS);
  await Promise.all(
    entries.map(async ([key, url]) => {
      try {
        loaded[key] = await loadGLTF(url);
      } catch (e) {
        console.warn(`Building model ${key} failed:`, e);
      }
    })
  );
}

function placeModel(key, scene, x, z, scale = 1, rotY = 0, colliderInset = null, centerXZ = false) {
  const gltf = loaded[key];
  if (!gltf) {
    return null;
  }
  const model = gltf.scene.clone(true);

  model.scale.setScalar(scale);
  model.rotation.y = rotY;

  // Calculate bounding box in default position to find the correct bottom offset and center
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(model);

  const gy = getHeightAt(x, z);

  let posX = x;
  let posZ = z;

  if (centerXZ) {
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    posX = x - center.x;
    posZ = z - center.z;
  }

  // Align the actual bottom of the mesh to the terrain
  model.position.set(posX, gy - bbox.min.y, posZ);

  model.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  scene.add(model);

  // Dynamically register box collider if requested
  if (colliderInset !== null) {
    model.updateMatrixWorld(true);
    const worldBox = new THREE.Box3().setFromObject(model);

    let xMin = worldBox.min.x;
    let xMax = worldBox.max.x;
    let zMin = worldBox.min.z;
    let zMax = worldBox.max.z;

    if (colliderInset > 0) {
      const w = xMax - xMin;
      const d = zMax - zMin;
      xMin += w * colliderInset;
      xMax -= w * colliderInset;
      zMin += d * colliderInset;
      zMax -= d * colliderInset;
    }

    addBoxCollider(xMin, xMax, zMin, zMax);
  }

  return model;
}

// ── Goldshire Abbey (Hybrid small layout) ───────────────────────────────
export function buildAbbey(scene) {
  const AX = 0,
    AZ = -60;
  placeModel('church', scene, AX, AZ, 14, 0, 0.08);

  // Stone wall enclosing the Abbey backyard - register each piece automatically as a collider!
  // Back wall (5 segments centered at z = -80, running along the X-axis)
  const segmentWidth = 6.92;
  const backZ = AZ - 20; // -80
  for (let i = 0; i < 5; i++) {
    const segmentX = AX + (i - 2) * segmentWidth;
    if (i === 2) {
      // Replace middle wall segment with a stone gate!
      placeModel('fence_stone_gate', scene, segmentX, backZ, 6, Math.PI / 2, 0.0, true);
    } else {
      placeModel('fence_stone', scene, segmentX, backZ, 6, Math.PI / 2, 0.0, true);
    }
  }

  // Left side wall (2 segments running along the Z-axis at x = -17.3)
  const leftX = AX - 2.5 * segmentWidth; // -17.3
  placeModel('fence_stone', scene, leftX, backZ + 0.5 * segmentWidth, 6, 0, 0.0, true);
  placeModel('fence_stone', scene, leftX, backZ + 1.5 * segmentWidth, 6, 0, 0.0, true);

  // Right side wall (2 segments running along the Z-axis at x = 17.3)
  const rightX = AX + 2.5 * segmentWidth; // 17.3
  placeModel('fence_stone', scene, rightX, backZ + 0.5 * segmentWidth, 6, 0, 0.0, true);
  placeModel('fence_stone', scene, rightX, backZ + 1.5 * segmentWidth, 6, 0, 0.0, true);
}

// ── The Inn & Blacksmith ────────────────────────────────────────────────────────
export function buildInn(scene) {
  // Tavern / Lion's Pride Inn (West of the road)
  placeModel('tavern', scene, -22, 5, 10, Math.PI / 2, 0.08);

  // Barrels stacked outside the tavern
  placeModel('barrel', scene, -12, -2, 4, 0.2);
  placeModel('barrel', scene, -10, -1, 4, -0.4);
  placeModel('barrel', scene, -11, -4, 4, 1.1);

  // Blacksmith (East of the road)
  if (loaded['blacksmith']) {
    placeModel('blacksmith', scene, 22, 5, 8, -Math.PI / 2, 0.08);
  } else {
    // fallback if no blacksmith
    placeModel('castle', scene, 22, 5, 6, -Math.PI / 2, 0.08);
  }
}

// ── Village Houses & Town Hall ──────────────────────────────────────────────────
export function buildBarracks(scene) {
  // Town Hall / Barracks (South-East corner)
  if (loaded['barracks']) {
    placeModel('barracks', scene, 22, 40, 8, -Math.PI / 2, 0.08);
  } else {
    placeModel('castle', scene, 22, 40, 6, -Math.PI / 2, 0.08);
  }

  // General Store (South-West corner)
  placeModel('home_a', scene, -22, 40, 8, Math.PI / 2, 0.08);

  // Dock House near Crystal Lake
  placeModel('home_b', scene, 50, 45, 8, Math.PI / 2 - 0.5, 0.08);

  // ── Southern Defense Fences (against Kobolds) ──
  // Placed at z = 60, leaving a gap for the North-South road (x = -6 to 6)
  const FENCE_Z = 60;
  const FENCE_SCALE = 5.5;
  const FENCE_STEP = 5.3; // slightly overlapping for continuous look

  // West side fence wall
  for (let fx = -120; fx <= -7; fx += FENCE_STEP) {
    const gy = getHeightAt(fx, FENCE_Z);
    if (gy > 6.0) {
      continue;
    } // Skip if going up the hills!
    placeModel('fence_wood', scene, fx, FENCE_Z, FENCE_SCALE, Math.PI / 2, null, true);
  }
  // East side fence wall
  for (let fx = 7; fx <= 120; fx += FENCE_STEP) {
    const gy = getHeightAt(fx, FENCE_Z);
    if (gy > 6.0) {
      continue;
    } // Skip if going up the hills!
    placeModel('fence_wood', scene, fx, FENCE_Z, FENCE_SCALE, Math.PI / 2, null, true);
  }

  // Register colliders for defense fences
  addBoxCollider(-122.5, -5.5, FENCE_Z - 1.0, FENCE_Z + 1.0);
  addBoxCollider(5.5, 122.5, FENCE_Z - 1.0, FENCE_Z + 1.0);

  // Checkpoint towers flanking the road gap at z = 60
  placeModel('tower_a', scene, -10.5, FENCE_Z, 10, 0, null, true);
  placeModel('tower_b', scene, 10.5, FENCE_Z, 10, 0, null, true);
}

// ── Town Well & Props ──────────────────────────────────────────────────────────
export function buildVineyards(scene) {
  // Goldshire central town well
  placeModel('well', scene, -6, 20, 5, 0);

  // Register central well collider (shrunk bounds)
  addCircleCollider(-6, 20, 1.8);

  // Extra props
  placeModel('barrel', scene, 18, 35, 4, 0);
}

// ── Crossroads (Stone roads through the town) ──────────────────────────────────
export function buildRoad(scene) {
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x7a7060 });
  const roadW = 8;

  // 1. North-South Road (Abbey down to Southern Woods)
  const nsSegments = 26;
  for (let i = 0; i < nsSegments; i++) {
    const x = Math.sin(i * 0.1) * 1.5; // very gentle wave
    const z = -55 + i * 6;
    const gy = getHeightAt(x, z);
    if (gy > 1.0) {
      continue;
    } // Skip if going up the hills!
    const targetGy = gy + 0.05;

    const geo = new THREE.BoxGeometry(roadW, 0.2, 6.2);
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.position.set(x, targetGy, z);
    mesh.rotation.y = Math.cos(i * 0.1) * 0.03;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // 2. East-West Road (Stormwind to Redridge)
  const ewSegments = 30;
  for (let i = 0; i < ewSegments; i++) {
    const x = -90 + i * 6;
    const z = 20 + Math.sin(i * 0.1) * 1.5; // very gentle wave
    const gy = getHeightAt(x, z);
    if (gy > 1.0) {
      continue;
    } // Skip if going up the hills!
    const targetGy = gy + 0.05;

    const geo = new THREE.BoxGeometry(6.2, 0.2, roadW);
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.position.set(x, targetGy, z);
    mesh.rotation.y = Math.PI / 2 + Math.cos(i * 0.1) * 0.03;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}
