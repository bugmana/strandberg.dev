import * as THREE from 'three';

// ── Three.js night landscape background ──────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'bg-canvas';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050e);
scene.fog = new THREE.FogExp2(0x04060f, 0.006);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 6, 18);
camera.lookAt(0, 5, -80);

// ── Lighting ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x1a1e38, 1.0);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0x8090b8, 0.55);
moonLight.position.set(-40, 90, -80);
scene.add(moonLight);

// ── Sky dome (vertex-colour gradient) ────────────────────────────────────────
{
  const geo = new THREE.SphereGeometry(700, 28, 16);
  geo.scale(-1, 1, 1);
  const posAttr = geo.attributes.position;
  const cols = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i) / 700; // -1 to 1
    // Horizon: deep blue-black 0x060b18, zenith: near-black 0x020408
    const t = Math.max(0, y);
    cols[i * 3] = 0.024 * (1 - t) + 0.008 * t;
    cols[i * 3 + 1] = 0.043 * (1 - t) + 0.016 * t;
    cols[i * 3 + 2] = 0.094 * (1 - t) + 0.031 * t;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
}

// ── Ground plane ─────────────────────────────────────────────────────────────
{
  const geo = new THREE.PlaneGeometry(1000, 800, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x0a1507 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -1.5;
  scene.add(mesh);
}

// ── Moon ─────────────────────────────────────────────────────────────────────
{
  const moonGeo = new THREE.CircleGeometry(14, 36);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xc8d8ec, fog: false });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.position.set(-70, 95, -300);
  moonMesh.lookAt(camera.position);
  scene.add(moonMesh);

  // Inner bright core
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xe8f0f8, fog: false });
  const coreMesh = new THREE.Mesh(new THREE.CircleGeometry(9, 32), coreMat);
  coreMesh.position.copy(moonMesh.position);
  coreMesh.position.z += 0.5;
  coreMesh.lookAt(camera.position);
  scene.add(coreMesh);

  // Soft glow halo
  const glowMat = new THREE.SpriteMaterial({
    color: 0x5060a0,
    transparent: true,
    opacity: 0.08,
    fog: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(110, 110, 1);
  glow.position.copy(moonMesh.position);
  scene.add(glow);
}

// ── Stars ─────────────────────────────────────────────────────────────────────
{
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random());
    const r = 690;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 15;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe0e8ff,
    size: 1.6,
    sizeAttenuation: false,
    fog: false,
    transparent: true,
    opacity: 0.88,
  });
  scene.add(new THREE.Points(geo, mat));
}

// ── Hill silhouettes (sphere-based, layered) ──────────────────────────────────
function seeded(s) {
  const v = Math.sin(s * 9301 + 49297) * 233280;
  return v - Math.floor(v);
}

function makeHillLayer(zDepth, baseY, color, count) {
  const mat = new THREE.MeshBasicMaterial({ color, fog: false });
  for (let i = 0; i < count; i++) {
    const xSpread = 500;
    const x = -xSpread / 2 + (i / (count - 1)) * xSpread;
    const height = 14 + seeded(i * 5 + zDepth * 0.1) * 28;
    const radius = 28 + seeded(i * 5 + zDepth * 0.1 + 1) * 52;
    const xOff = (seeded(i * 5 + 2) - 0.5) * 60;
    const geo = new THREE.SphereGeometry(radius, 14, 10);
    geo.scale(1.0, height / radius, 1.2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + xOff, baseY - radius * 0.68, zDepth);
    scene.add(mesh);
  }
}

makeHillLayer(-400, -1.5, 0x050b06, 14); // far
makeHillLayer(-280, -1.5, 0x040a04, 11); // mid-far
makeHillLayer(-180, -1.5, 0x050e05, 9); // mid
makeHillLayer(-100, -1.5, 0x060f07, 7); // near

// ── Tree silhouettes ──────────────────────────────────────────────────────────
const silMat = new THREE.MeshBasicMaterial({ color: 0x020602, fog: false });
const silMat2 = new THREE.MeshBasicMaterial({ color: 0x040904, fog: false });

function makeTree(x, z, scale) {
  const mat = z < -200 ? silMat : silMat2;
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 3.5 * scale, 5),
    mat
  );
  trunk.position.set(x, 1.75 * scale - 1.5, z);
  scene.add(trunk);
  // Lower canopy
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.2 * scale, 7 * scale, 6), mat);
  c1.position.set(x, 6.5 * scale - 1.5, z);
  scene.add(c1);
  // Upper canopy
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.5 * scale, 5 * scale, 6), mat);
  c2.position.set(x, 10.5 * scale - 1.5, z);
  scene.add(c2);
}

for (let i = 0; i < 70; i++) {
  const x = -150 + seeded(i * 3 + 200) * 300;
  const z = -250 + seeded(i * 3 + 201) * 175;
  const s = 0.45 + seeded(i * 3 + 202) * 1.1;
  makeTree(x, z, s);
}

// ── Fireflies ─────────────────────────────────────────────────────────────────
const FF_COUNT = 90;
const ffPosArr = new Float32Array(FF_COUNT * 3);
const ffState = [];
for (let i = 0; i < FF_COUNT; i++) {
  ffPosArr[i * 3] = (seeded(i * 3 + 400) - 0.5) * 110;
  ffPosArr[i * 3 + 1] = seeded(i * 3 + 401) * 22 - 1.5;
  ffPosArr[i * 3 + 2] = -18 - seeded(i * 3 + 402) * 90;
  ffState.push({
    vy: 0.008 + seeded(i * 3 + 400) * 0.018,
    phase: seeded(i + 500) * Math.PI * 2,
  });
}
const ffGeo = new THREE.BufferGeometry();
ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPosArr, 3));
const ffMat = new THREE.PointsMaterial({
  color: 0xffcc40,
  size: 3.2,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0.55,
  fog: false,
});
const ffPoints = new THREE.Points(ffGeo, ffMat);
scene.add(ffPoints);

// ── Camera slow pan ──────────────────────────────────────────────────────────
let panAngle = 0;

function animate() {
  requestAnimationFrame(animate);

  // Slow rightward pan — classic WoW login feel
  panAngle += 0.00006;
  camera.position.x = Math.sin(panAngle) * 28;
  camera.position.y = 6 + Math.sin(panAngle * 0.4) * 0.8;
  camera.lookAt(Math.sin(panAngle * 0.6) * 10, 5, -80);

  // Animate fireflies
  const pa = ffGeo.attributes.position;
  for (let i = 0; i < FF_COUNT; i++) {
    const st = ffState[i];
    st.phase += 0.012;
    pa.array[i * 3] += Math.sin(st.phase) * 0.018;
    pa.array[i * 3 + 1] += st.vy;
    pa.array[i * 3 + 2] += Math.cos(st.phase * 0.8) * 0.008;
    if (pa.array[i * 3 + 1] > 24) {
      pa.array[i * 3] = (Math.random() - 0.5) * 110;
      pa.array[i * 3 + 1] = -1.5;
      pa.array[i * 3 + 2] = -18 - Math.random() * 90;
    }
  }
  pa.needsUpdate = true;

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

animate();

// ── Play button ───────────────────────────────────────────────────────────────
const playBtn = document.getElementById('play-btn');
const loadingWrap = document.getElementById('loading-bar-container');
const loadingFill = document.getElementById('loading-bar-fill');
const loadingText = document.getElementById('loading-text');
const fadeOverlay = document.getElementById('fade-overlay');

const LOADING_MESSAGES = [
  'Connecting to trading servers\u2026',
  'Loading portfolio data\u2026',
  'Authenticating engineer credentials\u2026',
  'Syncing cloud infrastructure\u2026',
  'Entering the campus\u2026',
];

function randf(a, b) {
  return a + Math.random() * (b - a);
}

playBtn.addEventListener('click', () => {
  playBtn.disabled = true;
  loadingWrap.classList.add('visible');

  let progress = 0;
  let msgIdx = 0;

  const tick = setInterval(() => {
    progress += randf(1.8, 5.5);
    if (progress > 100) {
      progress = 100;
    }

    loadingFill.style.width = progress + '%';

    const nextMsg = Math.min(
      LOADING_MESSAGES.length - 1,
      Math.floor((progress / 100) * LOADING_MESSAGES.length)
    );
    if (nextMsg > msgIdx) {
      msgIdx = nextMsg;
      loadingText.textContent = LOADING_MESSAGES[msgIdx];
    }

    if (progress >= 100) {
      clearInterval(tick);
      loadingFill.classList.add('complete');
      loadingText.textContent = 'Loading complete.';
      setTimeout(() => {
        fadeOverlay.classList.add('fading');
        setTimeout(() => {
          window.location.href = '/world/';
        }, 880);
      }, 380);
    }
  }, 80);
});
