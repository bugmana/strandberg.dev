import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getHeightAt } from './world.js';
import { loadGLTF } from './model-loader.js';
import { addCircleCollider } from './physics.js';

// ── Model-based environment ──────────────────────────────────────────────────

const ENV_MODELS = {
  tree_a: '/assets/models/tree_a.glb',
  tree_b: '/assets/models/tree_b.glb',
  trees_large: '/assets/models/trees_large.glb',
  trees_medium: '/assets/models/trees_medium.glb',
  rock_a: '/assets/models/rock_a.glb',
  rock_b: '/assets/models/rock_b.glb',
  rock_c: '/assets/models/rock_c.glb',
};

const envLoaded = {};

export async function loadEnvironmentModels() {
  const entries = Object.entries(ENV_MODELS);
  await Promise.all(
    entries.map(async ([key, url]) => {
      try {
        envLoaded[key] = await loadGLTF(url);
      } catch (e) {
        console.warn(`Env model ${key} failed:`, e);
      }
    })
  );
}

function createInstancedModel(key, scene, instances, castShadow) {
  const gltf = envLoaded[key];
  if (!gltf || instances.length === 0) {
    return;
  }

  const template = gltf.scene;
  template.position.set(0, 0, 0);
  template.rotation.set(0, 0, 0);
  template.scale.set(1, 1, 1);
  template.updateMatrixWorld(true);

  const meshes = [];
  template.traverse(child => {
    if (child.isMesh) {
      meshes.push(child);
    }
  });

  const bbox = new THREE.Box3().setFromObject(template);
  const templateMinY = bbox.min.y;

  const instancedMeshes = meshes.map(mesh => {
    const instMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, instances.length);
    instMesh.castShadow = castShadow;
    instMesh.receiveShadow = castShadow;
    scene.add(instMesh);
    return { mesh, instMesh };
  });

  const dummy = new THREE.Object3D();
  instances.forEach((inst, index) => {
    const gy = getHeightAt(inst.x, inst.z);
    const yOffset = -templateMinY * inst.scale;

    dummy.position.set(inst.x, gy + yOffset, inst.z);
    dummy.rotation.set(0, inst.rotY, 0);
    dummy.scale.setScalar(inst.scale);
    dummy.updateMatrix();

    instancedMeshes.forEach(({ mesh, instMesh }) => {
      const matrix = dummy.matrix.clone().multiply(mesh.matrixWorld);
      instMesh.setMatrixAt(index, matrix);
    });
  });

  instancedMeshes.forEach(({ instMesh }) => {
    instMesh.instanceMatrix.needsUpdate = true;
  });
}

function renderInstancedGroup(key, scene, instances) {
  if (!instances || instances.length === 0) {
    return;
  }

  const shadowCastList = [];
  const noShadowList = [];

  instances.forEach(inst => {
    if (inst.castShadow) {
      shadowCastList.push(inst);
    } else {
      noShadowList.push(inst);
    }
  });

  createInstancedModel(key, scene, shadowCastList, true);
  createInstancedModel(key, scene, noShadowList, false);
}

// ── Campus trees ───────────────────────────────────────────────────────────
// Geometry is collected into arrays and merged via mergeGeometries() in buildForest().
// This reduces ~1100 individual tree draw calls down to just 2.

/**
 * Pushes trunk and canopy geometries (world-space transformed) into the
 * provided collector arrays instead of adding meshes directly to the scene.
 */
function collectTree(trunkGeos, canopyGeos, x, z, scale = 1.0) {
  const gy = getHeightAt(x, z);

  const trunkH = (5 + Math.random() * 3) * scale;
  const trunkGeo = new THREE.CylinderGeometry(0.3 * scale, 0.5 * scale, trunkH, 7);
  // Apply world-space transform directly into the geometry so all trunks can be merged
  const trunkMatrix = new THREE.Matrix4().makeTranslation(x, gy + trunkH / 2, z);
  trunkGeo.applyMatrix4(trunkMatrix);
  trunkGeos.push(trunkGeo);

  const cone1H = (7 + Math.random() * 4) * scale;
  const cone1R = (2.5 + Math.random() * 1) * scale;
  const cone1Geo = new THREE.ConeGeometry(cone1R, cone1H, 7);
  const cone1Matrix = new THREE.Matrix4().makeTranslation(x, gy + trunkH + cone1H * 0.45, z);
  cone1Geo.applyMatrix4(cone1Matrix);
  canopyGeos.push(cone1Geo);

  const cone2H = cone1H * 0.65;
  const cone2Geo = new THREE.ConeGeometry(cone1R * 0.7, cone2H, 7);
  const cone2Matrix = new THREE.Matrix4().makeTranslation(
    x,
    gy + trunkH + cone1H * 0.85 + cone2H * 0.4,
    z
  );
  cone2Geo.applyMatrix4(cone2Matrix);
  canopyGeos.push(cone2Geo);
}

// Deterministic pseudo-random from seed
function seededRand(seed) {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}

export function buildForest(scene) {
  const treeKeys = ['tree_a', 'tree_b'];
  const clusterKeys = ['trees_large', 'trees_medium'];
  const rockKeys = ['rock_a', 'rock_b', 'rock_c'];
  const hasModels = treeKeys.some(k => envLoaded[k]);

  let seed = 0;
  const treeInstances = [];

  // 1. Boundary Forest (The mountain ring)
  // Trees are densely packed only on the elevated hills to form an impenetrable wall.
  for (let i = 0; i < 2500; i++) {
    const rx = -135 + seededRand(seed++) * 270;
    const rz = -135 + seededRand(seed++) * 270;
    const gy = getHeightAt(rx, rz);

    // Avoid spawning mountain trees inside or near Crystal Lake (70, 20)
    const ldx = rx - 70;
    const ldz = rz - 20;
    const ldist = Math.sqrt(ldx * ldx + ldz * ldz);

    if (gy > 3.5 && ldist > 30) {
      treeInstances.push({ x: rx, z: rz, scale: 1.1 });
    }
  }

  // 2. Specific clusters inside the valley
  // Abbey courtyard trees (aligned around AX = 0, AZ = -60)
  const abbeyTrees = [
    [-15, -45],
    [15, -45], // front left/right
    [-18, -60],
    [18, -60], // side left/right
    [-12, -75],
    [12, -75], // backyard left/right
    [-10, -35],
    [10, -35], // further front flanking the path
  ];
  for (const [tx, tz] of abbeyTrees) {
    treeInstances.push({ x: tx, z: tz, scale: 0.9 });
  }

  // North-west wolf woods (behind the Abbey)
  for (let i = 0; i < 20; i++) {
    const rx = -80 + seededRand(seed++) * 50;
    const rz = -110 + seededRand(seed++) * 40;
    if (getHeightAt(rx, rz) < 15) {
      treeInstances.push({ x: rx, z: rz, scale: 1.0 });
    }
  }

  // Crystal Lake shore trees (just outside the water edge, avoiding roads)
  for (let i = 0; i < 25; i++) {
    const angle = seededRand(seed++) * Math.PI * 2;
    const radius = 27 + seededRand(seed++) * 8; // 27 to 35 units from center
    const tx = 70 + Math.cos(angle) * radius;
    const tz = 20 + Math.sin(angle) * radius;

    // Avoid placing trees directly on the East-West road (z = 20) and outer map boundaries
    if (Math.abs(tz - 20) > 6 && tx < 115) {
      treeInstances.push({ x: tx, z: tz, scale: 1.0 });
    }
  }

  const placements = {
    tree_a: [],
    tree_b: [],
    trees_large: [],
    trees_medium: [],
    rock_a: [],
    rock_b: [],
    rock_c: [],
  };

  // Render Trees
  if (hasModels) {
    for (const t of treeInstances) {
      const rs = (0.75 + seededRand(seed++) * 0.6) * t.scale;
      const key = treeKeys[Math.floor(seededRand(seed++) * treeKeys.length)];
      const rotY = seededRand(seed++) * Math.PI * 2;
      const isBoundary = getHeightAt(t.x, t.z) > 4.0;

      placements[key].push({
        x: t.x,
        z: t.z,
        scale: rs * 6,
        rotY: rotY,
        castShadow: !isBoundary,
      });

      // Register collider for valley trees (where height <= 4.0)
      if (getHeightAt(t.x, t.z) <= 4.0) {
        addCircleCollider(t.x, t.z, 0.8 * rs);
      }
    }
  } else {
    // Procedural fallback
    const trunkGeos = [];
    const canopyGeos = [];
    for (const t of treeInstances) {
      const rs = (0.75 + seededRand(seed++) * 0.6) * t.scale;
      collectTree(trunkGeos, canopyGeos, t.x, t.z, rs);

      // Register collider for valley trees (where height <= 4.0)
      if (getHeightAt(t.x, t.z) <= 4.0) {
        addCircleCollider(t.x, t.z, 0.6 * rs);
      }
    }
    if (trunkGeos.length > 0) {
      const mergedTrunks = mergeGeometries(trunkGeos, false);
      const trunkMesh = new THREE.Mesh(
        mergedTrunks,
        new THREE.MeshLambertMaterial({ color: 0x4a2e12 })
      );
      trunkMesh.castShadow = true;
      scene.add(trunkMesh);
      trunkGeos.forEach(g => g.dispose());
    }
    if (canopyGeos.length > 0) {
      const mergedCanopy = mergeGeometries(canopyGeos, false);
      const canopyMesh = new THREE.Mesh(
        mergedCanopy,
        new THREE.MeshLambertMaterial({ color: 0x2a5820 })
      );
      canopyMesh.castShadow = true;
      scene.add(canopyMesh);
      canopyGeos.forEach(g => g.dispose());
    }
  }

  // Render Tree Clusters at the very edges (scaled down by 2 for WORLD_SIZE = 256)
  if (envLoaded['trees_large']) {
    const clusterPositions = [
      [-90, -90],
      [-60, -100],
      [90, -80],
      [100, 70],
      [-80, 80],
      [50, 90],
      [-100, -20],
      [110, 0],
    ];
    for (const [cx, cz] of clusterPositions) {
      const key = clusterKeys[Math.abs(cx + cz) % clusterKeys.length];
      placements[key].push({
        x: cx,
        z: cz,
        scale: 8,
        rotY: seededRand(cx * 7 + cz) * Math.PI * 2,
        castShadow: false,
      });
    }
  }

  // Render Rocks
  if (envLoaded['rock_a']) {
    let rseed = 1000;
    const rockInstances = [];

    // Foothill slopes (within map boundaries)
    for (let i = 0; i < 50; i++) {
      const rx = -120 + seededRand(rseed++) * 240;
      const rz = -120 + seededRand(rseed++) * 240;
      const gy = getHeightAt(rx, rz);
      // Place rocks on slopes
      if (gy > 5 && gy < 16) {
        rockInstances.push([rx, rz]);
      }
    }

    // Crystal Lake shore rocks
    for (let i = 0; i < 15; i++) {
      const angle = seededRand(rseed++) * Math.PI * 2;
      const radius = 25 + seededRand(rseed++) * 4; // 25 to 29 units from center
      const rx = 70 + Math.cos(angle) * radius;
      const rz = 20 + Math.sin(angle) * radius;
      if (Math.abs(rz - 20) > 6 && rx < 115) {
        // Avoid road and map edge
        rockInstances.push([rx, rz]);
      }
    }

    for (const [rx, rz] of rockInstances) {
      const key = rockKeys[Math.floor(seededRand(rseed++) * rockKeys.length)];
      const rs = 3 + seededRand(rseed++) * 5;
      const gy = getHeightAt(rx, rz);
      const isBoundaryRock = gy > 5.0;

      placements[key].push({
        x: rx,
        z: rz,
        scale: rs,
        rotY: seededRand(rseed++) * Math.PI * 2,
        castShadow: !isBoundaryRock,
      });
    }
  }

  // Render instanced models in bulk
  if (hasModels) {
    Object.keys(placements).forEach(key => {
      renderInstancedGroup(key, scene, placements[key]);
    });
  }
}

// ── Crystal-clear Crystal Lake ──────────────────────────────────────────────────
export function buildRiver(scene) {
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x1a5080,
    transparent: true,
    opacity: 0.78,
  });

  // Flat oval/circular-like lake plane
  const lakeGeo = new THREE.PlaneGeometry(55, 40);
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, waterMat);
  // Centered at (70, 20), floating slightly below the basin depth floor (-4.5) but below the valley floor (0.0)
  lake.position.set(70, -0.2, 20);
  lake.receiveShadow = true;
  scene.add(lake);

  // Small wooden dock structure extending into the lake
  const dockWoodMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const dockGeo = new THREE.BoxGeometry(8, 0.3, 3);
  const dock = new THREE.Mesh(dockGeo, dockWoodMat);
  dock.position.set(46, 0.1, 20); // Extends from land (x <= 42) into the lake
  dock.receiveShadow = true;
  scene.add(dock);

  // Supporting posts for the dock
  const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5);
  const post1 = new THREE.Mesh(postGeo, dockWoodMat);
  post1.position.set(49, -1.0, 18.6);
  const post2 = new THREE.Mesh(postGeo, dockWoodMat);
  post2.position.set(49, -1.0, 21.4);
  scene.add(post1);
  scene.add(post2);
}
