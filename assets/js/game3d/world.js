import * as THREE from 'three';

export const WORLD_SIZE = 256;
const TERRAIN_SEGS = 64;

/** Smaller, flat center town heightmap */
function terrainHeight(u, v) {
  const cx = 0.5,
    cz = 0.5;
  const dx = u - cx,
    dz = v - cz;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Flat center for the town
  let base = 0;
  if (dist > 0.3) {
    // Gentle hills at the edge of the small map
    base = Math.pow((dist - 0.3) * 8, 2) * 15;
  }

  // Carve out Crystal Lake basin centered at (70, 20)
  // Normalized: u_lake = (70 + 128) / 256 = 0.773, v_lake = (20 + 128) / 256 = 0.578
  const ldx = u - 0.773;
  const ldz = v - 0.578;
  const ldist = Math.sqrt(ldx * ldx + ldz * ldz);
  if (ldist < 0.15) {
    const depth = (1.0 - ldist / 0.15) * 4.5;
    base -= depth;
  }

  // Very gentle noise
  const bump = Math.sin(u * 20) * Math.cos(v * 20) * 0.5;

  return Math.max(-5.0, base + bump);
}

export function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = (x + WORLD_SIZE / 2) / WORLD_SIZE;
    const v = (z + WORLD_SIZE / 2) / WORLD_SIZE;
    pos.setY(i, terrainHeight(u, v));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Vertex colours for natural variation
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const x = (pos.getX(i) + WORLD_SIZE / 2) / WORLD_SIZE;
    const z = (pos.getZ(i) + WORLD_SIZE / 2) / WORLD_SIZE;

    let r, g, b;
    if (y < 0.5) {
      // River/low wetland: dark green
      r = 0.18;
      g = 0.32;
      b = 0.1;
    } else if (y < 6) {
      // Valley floor: rich Elwynn green
      r = 0.2 + Math.sin(x * 18) * 0.03;
      g = 0.42 + Math.cos(z * 14) * 0.04;
      b = 0.12;
    } else if (y < 16) {
      // Slope: medium green
      r = 0.22;
      g = 0.37;
      b = 0.13;
    } else if (y < 26) {
      // Upper slope: darker green/brown mix
      r = 0.28;
      g = 0.33;
      b = 0.14;
    } else {
      // Ridge: earthy brown
      r = 0.35;
      g = 0.28;
      b = 0.16;
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  return { mesh, geo };
}

/** Sample the terrain height at a world-space (x, z) position.
 *  Results are cached in a quantised LRU map (0.5-unit grid, max 512 entries)
 *  to avoid repeated trig evaluation for slow-moving entities.
 */
const _heightCache = new Map();
const _HEIGHT_CACHE_MAX = 512;
const _HEIGHT_CACHE_STEP = 0.5; // grid resolution in world units

export function getHeightAt(x, z) {
  // Quantise to nearest grid cell
  const qx = Math.round(x / _HEIGHT_CACHE_STEP);
  const qz = Math.round(z / _HEIGHT_CACHE_STEP);
  const key = (qx << 16) ^ (qz & 0xffff); // fast integer key

  const cached = _heightCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const u = (x + WORLD_SIZE / 2) / WORLD_SIZE;
  const v = (z + WORLD_SIZE / 2) / WORLD_SIZE;
  const h = u < 0 || u > 1 || v < 0 || v > 1 ? 0 : terrainHeight(u, v);

  // Simple LRU eviction: clear oldest half when limit is reached
  if (_heightCache.size >= _HEIGHT_CACHE_MAX) {
    let evicted = 0;
    for (const k of _heightCache.keys()) {
      _heightCache.delete(k);
      if (++evicted >= _HEIGHT_CACHE_MAX / 2) {
        break;
      }
    }
  }
  _heightCache.set(key, h);
  return h;
}

export function buildLighting(scene) {
  // Ambient — warm Elwynn daytime
  const ambient = new THREE.AmbientLight(0xb8c8e8, 0.7);
  scene.add(ambient);

  // Sun — slightly south-west, mid-day angle
  const sun = new THREE.DirectionalLight(0xfff4d8, 1.2);
  sun.position.set(120, 180, -80);
  sun.castShadow = true;
  // 1024² is sufficient for the visible play area and uses ¼ the GPU memory of 2048²
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  // Frustum covers ~160×160 units — enough for the immediate play area
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  // Hemisphere — sky blue top, warm ground bounce
  const hemi = new THREE.HemisphereLight(0x8ab4f8, 0x6a8840, 0.45);
  scene.add(hemi);

  return { sun, ambient, hemi };
}

export function buildSky(scene) {
  // Large sphere inverted as a sky dome
  // 8×6 segments are visually identical to 32×16 for a smooth vertex-colour gradient
  const geo = new THREE.SphereGeometry(900, 8, 6);
  geo.scale(-1, 1, 1); // invert normals

  // Vertical gradient via vertex colours
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + 900) / 1800; // 0=bottom, 1=top
    // Bottom: horizon haze (warm light blue), Top: deep sky blue
    const r = 0.6 + t * -0.15;
    const g = 0.75 + t * -0.1;
    const b = 0.92 + t * -0.08;
    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'sky';
  scene.add(dome);

  // Sun disc
  const sunGeo = new THREE.CircleGeometry(22, 24);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffae0, fog: false });
  const sunDisc = new THREE.Mesh(sunGeo, sunMat);
  sunDisc.position.set(200, 350, -350);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  return { dome };
}

export function buildFog(scene) {
  scene.fog = new THREE.Fog(0xb8d8e8, 40, 180);
}
