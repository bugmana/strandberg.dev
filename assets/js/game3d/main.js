import * as THREE from 'three';
import { buildTerrain, buildLighting, buildSky, buildFog } from './world.js';
import {
  buildAbbey,
  buildInn,
  buildBarracks,
  buildVineyards,
  buildRoad,
  loadBuildingModels,
} from './buildings.js';
import { buildForest, buildRiver, loadEnvironmentModels } from './environment.js';
import { createNPCs } from './npcs.js';
import { Player3D, ThirdPersonCamera } from './player.js';
import { HUD3D } from './hud.js';
import { input, initMobileControls } from './input.js';
import { clearColliders } from './physics.js';

// ── Renderer setup ────────────────────────────────────────────────────────────
const container = document.getElementById('renderer-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// PCFShadowMap (4 samples) vs PCFSoftShadowMap (9 samples) — ~50% shadow cost saving
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 1000);

// ── HUD ───────────────────────────────────────────────────────────────────────
const hud = new HUD3D();

let sunLight = null;

// ── Async world build with loading progress ───────────────────────────────────
async function buildWorld() {
  clearColliders();
  hud.setLoadingProgress(5);

  buildFog(scene);
  buildSky(scene);
  hud.setLoadingProgress(10);

  const lighting = buildLighting(scene);
  sunLight = lighting.sun;
  hud.setLoadingProgress(15);

  buildTerrain(scene);
  hud.setLoadingProgress(25);

  // Load 3D models (buildings + environment) in parallel
  await Promise.all([loadBuildingModels(), loadEnvironmentModels()]);
  hud.setLoadingProgress(45);

  await tick();
  buildRoad(scene);
  buildAbbey(scene);
  hud.setLoadingProgress(55);

  await tick();
  buildInn(scene);
  buildBarracks(scene);
  buildVineyards(scene);
  hud.setLoadingProgress(65);

  await tick();
  buildRiver(scene);
  hud.setLoadingProgress(75);

  await tick();
  buildForest(scene);
  hud.setLoadingProgress(85);

  await tick();
}

function tick() {
  return new Promise(r => setTimeout(r, 0));
}

// ── Zone detection ─────────────────────────────────────────────────────────────
const ZONE_DEFS = [
  { name: 'Northshire Valley', xMin: -120, xMax: 120, zMin: -120, zMax: -30 },
  { name: 'Goldshire Crossroads', xMin: -35, xMax: 35, zMin: -30, zMax: 60 },
  { name: 'Crystal Lake', xMin: 35, xMax: 120, zMin: -30, zMax: 60 },
  { name: 'Fargodeep Mine', xMin: -120, xMax: 120, zMin: 60, zMax: 120 },
];

function getZone(px, pz) {
  for (const z of ZONE_DEFS) {
    if (px >= z.xMin && px <= z.xMax && pz >= z.zMin && pz <= z.zMax) {
      return z.name;
    }
  }
  return 'Elwynn Forest';
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  await buildWorld();

  // Player & camera
  const player = new Player3D(scene);
  const camCtrl = new ThirdPersonCamera(camera, player);
  const npcs = createNPCs(scene);

  // Initialize mobile controls if on touch device
  initMobileControls();
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Link player reference to HUD for speech bubbles
  hud.player = player;

  // Load saved level & experience progress
  player.loadProgress(hud);

  // Async-load glTF models (graceful fallback to box mesh if files absent) before hiding the loading screen
  const totalModels = 1 + npcs.length;
  let loadedCount = 0;
  const onModelLoaded = () => {
    loadedCount++;
    const progress = 85 + Math.round((loadedCount / totalModels) * 13);
    hud.setLoadingProgress(progress);
  };

  await Promise.all([
    player.initModel().then(onModelLoaded),
    ...npcs.map(npc => npc.initModel().then(onModelLoaded)),
  ]);

  // Initial HUD state
  hud.updatePlayer(100, 100, 100, 100);
  const initialZone = getZone(player.position.x, player.position.z);
  hud.showZone(initialZone, 'Elwynn Forest');
  player.discoverZone(initialZone, hud);
  hud.addChat('Welcome, traveler. Your journey begins.', 'sys');
  hud.addChat('WASD · Move  |  Right-click drag · Look  |  E · Talk  |  Scroll · Zoom', 'sys');
  hud.addChat('1-4 · Action bar  |  Shift · Run', 'sys');

  // Perform initial updates to camera and player to prevent position pop-ins
  player.update(input, 0, hud);
  camCtrl.update(input, 0);

  // Render a single frame so WebGL compiles shaders/materials and displays the completed world
  renderer.render(scene, camera);

  hud.setLoadingProgress(100);
  await tick();
  hud.hideLoading();

  let currentZone = initialZone;
  let targetNPC = null;
  let interactCooldown = 0;
  let _frameTick = 0; // used to throttle infrequent checks

  // Mouse click targeting using Raycaster
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const handleTargeting = (clientX, clientY) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      return;
    }

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const npcObjects = npcs.map(n => n.group);
    const intersects = raycaster.intersectObjects(npcObjects, true);

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      let curr = hitObj;
      while (curr) {
        const found = npcs.find(n => n.group === curr);
        if (found) {
          targetNPC = found;
          hud.setTarget(found);
          return;
        }
        curr = curr.parent;
      }
    }

    // Clear target if clicked/tapped on empty space
    targetNPC = null;
    hud.setTarget(null);
  };

  window.addEventListener('mousedown', e => {
    if (e.button !== 0) {
      return;
    } // Only left click
    handleTargeting(e.clientX, e.clientY);
  });

  // Touch-based targeting for mobile
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  window.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = performance.now();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchend',
    e => {
      if (e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const duration = performance.now() - touchStartTime;

        // Tap if touch moved very little and touch duration was short (< 300ms)
        if (dist < 10 && duration < 300) {
          const target = e.target;
          // Ignore targeting if tapping on joystick, action buttons, dialogues, etc.
          if (
            target.closest('#mobile-controls') ||
            target.closest('#hud') ||
            target.closest('#dialogue-box')
          ) {
            return;
          }
          handleTargeting(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        }
      }
    },
    { passive: true }
  );

  // Tab (cycle target) and Escape (clear target) key handlers
  let tabIndex = 0;
  window.addEventListener('keydown', e => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const aliveNpcs = npcs.filter(n => !n.isDead);
      if (aliveNpcs.length === 0) {
        return;
      }

      // Sort by distance to player
      aliveNpcs.sort((a, b) => a.distanceTo(player.position) - b.distanceTo(player.position));

      tabIndex = (tabIndex + 1) % aliveNpcs.length;
      targetNPC = aliveNpcs[tabIndex];
      hud.setTarget(targetNPC);
    }

    if (e.key === 'Escape') {
      if (hud.isDialogueOpen) {
        hud.closeDialogue();
        return;
      }
      targetNPC = null;
      hud.setTarget(null);
    }
  });

  const clock = new THREE.Clock();

  // ── Game loop ───────────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);

    if (document.hidden) {
      clock.getDelta(); // Drain delta accumulation while tab is in background
      return;
    }

    const delta = Math.min(clock.getDelta(), 0.1);

    input.cameraYaw = camCtrl.getYaw();
    input.isDragging = camCtrl._isDragging || isMobile;

    player.update(input, delta, hud);
    camCtrl.update(input, delta);

    // Update shadow frustum to center on the player
    if (sunLight) {
      sunLight.position.set(player.position.x + 120, 180, player.position.z - 80);
      sunLight.target = player.group;
    }

    for (const npc of npcs) {
      npc.update(delta, player, hud);
    }

    // Zone check — throttled to every 10 frames (zones are large, no need to check every tick)
    if (++_frameTick % 10 === 0) {
      const px = player.position.x,
        pz = player.position.z;
      const zone = getZone(px, pz);
      if (zone !== currentZone) {
        currentZone = zone;
        hud.showZone(zone, 'Elwynn Forest');
        hud.addChat(`You have entered: ${zone}`, 'sys');
        player.discoverZone(zone, hud);
      }
    }

    // Nearest NPC interaction
    const INTERACT_RANGE = 6;
    let nearest = null;
    let nearestDist = Infinity;
    for (const npc of npcs) {
      const d = npc.distanceTo(player.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = npc;
      }
    }

    // Target leash check: clear target if it dies or is too far away (> 35 units)
    if (targetNPC) {
      const dist = targetNPC.distanceTo(player.position);
      if (dist > 35 || targetNPC.isDead) {
        targetNPC = null;
        hud.setTarget(null);
      }
    }

    const canInteract =
      nearestDist < INTERACT_RANGE && !hud.isDialogueOpen && nearest && !nearest.isDead;
    hud.showInteractPrompt(canInteract, nearest && nearest.hostile);

    if (interactCooldown > 0) {
      interactCooldown -= delta;
    }
    if (input.interact && canInteract && interactCooldown <= 0) {
      input.interact = false;
      interactCooldown = 0.4;

      // Auto-target on interact
      if (targetNPC !== nearest) {
        targetNPC = nearest;
        hud.setTarget(nearest);
      }

      const line = nearest.getNextDialogue();

      if (nearest.hostile) {
        // Melee attack trigger on E
        player._playOnce('1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop');
        const dmg = 5 + Math.floor(Math.random() * 5);
        hud.addChat(`You hit ${nearest.name} for ${dmg} damage!`, 'sys');
        nearest.takeDamage(dmg, player, hud);

        // Still trigger dialogue shout
        hud.addChat(`${nearest.name}: "${line}"`);
        hud.spawnSpeechBubble(nearest.def.id, nearest.group, line);
      } else {
        // Friendly merchant dialogue UI
        player.talkToNpc(nearest.def.id, nearest.name, hud);
        hud.showDialogue(nearest.name, line);
        hud.addChat(`${nearest.name}: "${line}"`);
        hud.spawnSpeechBubble(nearest.def.id, nearest.group, line);
      }
    }

    if (input.interact && hud.isDialogueOpen) {
      hud.closeDialogue();
      input.interact = false;
    }

    // Action bar
    if (input.actionSlot > 0) {
      const action = hud.triggerAction(input.actionSlot - 1);
      if (action) {
        player.performAction(action, hud, targetNPC);
      }
      input.actionSlot = 0;
    }
    hud.updateCooldowns(delta);

    hud.drawMinimap(player.position, npcs);
    hud.updateSpeechBubbles(camera);

    renderer.render(scene, camera);
  }

  animate();
})();
