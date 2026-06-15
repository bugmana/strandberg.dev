import * as THREE from 'three';
import { getHeightAt } from './world.js';
import { loadGLTF, findClip, cloneModel } from './model-loader.js';
import { resolveCollisions } from './physics.js';

const PLAYER_HEIGHT = 1.75;
const PLAYER_SPEED = 8.0;
const PLAYER_RUN_MULT = 1.85;
export const MAX_LEVEL = 10;

export class Player3D {
  constructor(scene) {
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 100;
    this.maxMp = 100;
    this.level = 1;
    this.xp = 0;
    this.maxXp = 400;

    // Exploration and interaction tracking
    this.discoveredZones = [];
    this.talkedNpcs = [];
    this._activeEffects = [];

    this._mixer = null;
    this._animations = null;
    this._idleAction = null;
    this._walkAction = null;
    this._runAction = null;
    this._isMoving = false;
    this._isRunning = false;
    this.isDancing = false;
    this.danceTime = 0;
    this.bones = {};
    this._scene = scene;
    this._boxGroup = new THREE.Group(); // holds the fallback box mesh children

    // The player "body" group — camera is attached above this
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -45);
    this.group.position.y = getHeightAt(0, -45);
    scene.add(this.group);

    // Build fallback box mesh inside _boxGroup, add _boxGroup to main group
    this._buildMesh();
    this.group.add(this._boxGroup);

    // Camera pivot
    this.cameraPivot = new THREE.Object3D();
    this.group.add(this.cameraPivot);

    // Jump physics state
    this.velocityY = 0;
    this.isGrounded = true;
  }

  _buildMesh() {
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.36, 1.6, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3860c0 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    this._boxGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 10, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xe8b870 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.88;
    head.castShadow = true;
    this._boxGroup.add(head);

    // Cloak
    const cloakGeo = new THREE.ConeGeometry(0.48, 1.0, 8, 1, true);
    const cloakMat = new THREE.MeshLambertMaterial({ color: 0x1a3880, side: THREE.DoubleSide });
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.position.y = 0.4;
    this._boxGroup.add(cloak);

    // Shadow disc
    const sGeo = new THREE.CircleGeometry(0.45, 10);
    const sMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
    const s = new THREE.Mesh(sGeo, sMat);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.02;
    this._boxGroup.add(s);
  }

  /** Async: try to load a glTF human model. Falls back to box mesh on failure. */
  async initModel() {
    const gltf = await loadGLTF('/assets/models/knight.glb');
    if (!gltf) {
      return;
    }

    this._boxGroup.visible = false;

    const model = cloneModel(gltf);

    const bbox = new THREE.Box3().setFromObject(model);
    const modelH = bbox.max.y - bbox.min.y;
    const scale = PLAYER_HEIGHT / modelH;
    model.scale.setScalar(scale);
    model.position.y = -bbox.min.y * scale;

    this.bones = {};
    model.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
      }
      if (c.name) {
        this.bones[c.name] = c;
      }
    });
    this.group.add(model);

    if (gltf.animations && gltf.animations.length > 0) {
      this._mixer = new THREE.AnimationMixer(model);
      this._animations = gltf.animations;

      const idleClip = findClip(gltf.animations, 'Idle', 'Unarmed_Idle', 'idle', 'TPose');
      const walkClip = findClip(gltf.animations, 'Walking_A', 'Walking_B', 'Walk', 'Running_A');
      const runClip = findClip(gltf.animations, 'Running_A', 'Running_B', 'Run');

      if (idleClip) {
        this._idleAction = this._mixer.clipAction(idleClip);
        this._idleAction.play();
      }
      if (walkClip) {
        this._walkAction = this._mixer.clipAction(walkClip);
        this._walkAction.setEffectiveWeight(0);
        this._walkAction.play();
      }
      if (runClip && runClip !== walkClip) {
        this._runAction = this._mixer.clipAction(runClip);
        this._runAction.setEffectiveWeight(0);
        this._runAction.play();
      }
    }
  }

  get position() {
    return this.group.position;
  }

  // ── Action abilities ────────────────────────────────────────────────────────

  performAction(action, hud, targetNPC) {
    const levelMult = 1 + (this.level - 1) * 0.15; // +15% power per level
    switch (action.id) {
      case 'deploy': {
        this._playOnce('1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop');
        if (targetNPC && targetNPC.hostile && !targetNPC.isDead) {
          const dist = this.group.position.distanceTo(targetNPC.group.position);
          if (dist <= 6.0) {
            // Deduct energy
            this.mp = Math.max(0, this.mp - 25);

            const baseDmg = 8 + Math.floor(Math.random() * 6);
            const dmg = Math.floor(baseDmg * levelMult);
            hud.addChat(`Deploy Code hits ${targetNPC.name} for ${dmg} damage!`, 'sys');
            targetNPC.takeDamage(dmg, this, hud);
          } else {
            hud.addChat('Target is too far away!', 'err');
          }
        } else {
          hud.addChat('You push code, but have no hostile target to deploy to!', 'sys');
        }
        break;
      }
      case 'review': {
        this._playOnce('Blocking', 'Block');
        if (targetNPC && targetNPC.hostile && !targetNPC.isDead) {
          const dist = this.group.position.distanceTo(targetNPC.group.position);
          if (dist <= 6.0) {
            // Deduct energy
            this.mp = Math.max(0, this.mp - 40);

            const baseDmg = 22 + Math.floor(Math.random() * 10);
            const dmg = Math.floor(baseDmg * levelMult);
            hud.addChat(`Code Review hits ${targetNPC.name} for ${dmg} damage!`, 'sys');
            targetNPC.takeDamage(dmg, this, hud);
          } else {
            hud.addChat('Target is too far away!', 'err');
          }
        } else {
          hud.addChat('You review a pull request, but have no hostile target!', 'sys');
        }
        break;
      }
      case 'coffee': {
        // Free: based on cooldown only
        const baseHeal = 15 + Math.floor(Math.random() * 10);
        const heal = Math.floor(baseHeal * levelMult);
        this.hp = Math.min(this.maxHp, this.hp + heal);
        hud.updatePlayer(this.hp, this.maxHp, this.mp, this.maxMp);
        hud.addChat(`Coffee break restores ${heal} energy. (${this.hp}/${this.maxHp})`, 'sys');
        this._playOnce('Spellcast_Shoot', 'Spellcast_Raise', 'Interact');
        break;
      }
    }
  }

  startDancing() {
    this.isDancing = true;
    this.danceTime = 0;
    if (this._idleAction) {
      this._idleAction.setEffectiveWeight(0);
    }
    if (this._walkAction) {
      this._walkAction.setEffectiveWeight(0);
    }
    if (this._runAction) {
      this._runAction.setEffectiveWeight(0);
    }
  }

  takeDamage(amount, attacker, hud) {
    if (this.hp <= 0) {
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    hud.updatePlayer(this.hp, this.maxHp, this.mp, this.maxMp);

    hud.addChat(`${attacker.name} hits you for ${amount} damage!`, 'err');

    if (this.hp <= 0) {
      this.die(hud);
    }
  }

  die(hud) {
    hud.addChat('You have died!', 'err');

    if (this._mixer) {
      if (this._idleAction) {
        this._idleAction.setEffectiveWeight(0);
      }
      if (this._walkAction) {
        this._walkAction.setEffectiveWeight(0);
      }
      if (this._runAction) {
        this._runAction.setEffectiveWeight(0);
      }
    }

    hud.showDeathScreen(() => {
      hud.hideDeathScreen();

      this.group.position.set(0, getHeightAt(0, -45), -45);
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      this.velocityY = 0;
      this.isGrounded = true;
      hud.updatePlayer(this.hp, this.maxHp, this.mp, this.maxMp);

      hud.addChat('You have resurrected at Northshire Abbey.', 'sys');
    });
  }

  gainXp(amount, hud) {
    if (this.hp <= 0) {
      return;
    } // Can't gain XP while dead!
    if (this.level >= MAX_LEVEL) {
      return;
    }
    this.xp += amount;

    // Check level up
    while (this.xp >= this.maxXp) {
      this.xp -= this.maxXp;
      this.level++;

      if (this.level >= MAX_LEVEL) {
        this.level = MAX_LEVEL;
        this.xp = 0;
        this.maxXp = 0;
      } else {
        this.maxXp = this.level * 400; // Level 1 is 400, Level 2 is 800, etc.
      }

      // Flash / heal player on level up!
      this.hp = this.maxHp;
      this.mp = this.maxMp;

      // Update UI elements
      hud.updatePlayer(this.hp, this.maxHp, this.mp, this.maxMp);
      hud.updatePlayerLevel(this.level);

      hud.addChat(`Congratulations! You have reached Level ${this.level}!`, 'sys');
      if (this.level === MAX_LEVEL) {
        hud.addChat('You have reached the maximum level!', 'sys');
      }

      // Flash golden burst on portrait!
      hud.flashLevelUp();

      // Trigger the 3D level-up golden light & synthesized chime sound effect!
      this.triggerLevelUpEffect();

      if (this.level === MAX_LEVEL) {
        break;
      }
    }

    // Update the XP bar in the HUD
    hud.updateXpBar(this.xp, this.maxXp);

    // Save progress to cookie (GDPR/CCPA compliant client-side functional cookie)
    this.saveProgress();
  }

  loadProgress(hud) {
    const name = 'game_progress=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    let cookieVal = '';
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(name) === 0) {
        cookieVal = c.substring(name.length, c.length);
        break;
      }
    }

    if (cookieVal) {
      try {
        const data = JSON.parse(cookieVal);
        if (data.level) {
          this.level = parseInt(data.level) || 1;
        }
        if (this.level >= MAX_LEVEL) {
          this.level = MAX_LEVEL;
          this.xp = 0;
          this.maxXp = 0;
        } else {
          if (data.xp !== undefined) {
            this.xp = parseInt(data.xp) || 0;
          }
          this.maxXp = this.level * 400;
        }
        if (data.zones) {
          this.discoveredZones = data.zones;
        }
        if (data.npcs) {
          this.talkedNpcs = data.npcs;
        }
      } catch (e) {
        console.warn('Failed to parse game progress cookie:', e);
      }
    }

    // Sync HUD displays
    hud.updatePlayerLevel(this.level);
    hud.updateXpBar(this.xp, this.maxXp);
  }

  saveProgress() {
    // Purely client-side functional cookie. Non-identifying, not sent to any tracking servers.
    // GDPR/CCPA compliant as it is strictly necessary to save client-side game state progress.
    document.cookie = `game_progress=${JSON.stringify({
      level: this.level,
      xp: this.xp,
      zones: this.discoveredZones,
      npcs: this.talkedNpcs,
    })}; path=/; max-age=31536000; SameSite=Strict`;
  }

  discoverZone(zone, hud) {
    if (this.discoveredZones.includes(zone)) {
      return;
    }
    this.discoveredZones.push(zone);
    if (this.level < MAX_LEVEL) {
      hud.addChat(`Discovered: ${zone} (+50 XP)`, 'sys');
      this.gainXp(50, hud);
    } else {
      hud.addChat(`Discovered: ${zone}`, 'sys');
    }
  }

  talkToNpc(npcId, npcName, hud) {
    if (this.talkedNpcs.includes(npcId)) {
      return;
    }
    this.talkedNpcs.push(npcId);
    if (this.level < MAX_LEVEL) {
      hud.addChat(`Met ${npcName} (+35 XP)`, 'sys');
      this.gainXp(35, hud);
    } else {
      hud.addChat(`Met ${npcName}`, 'sys');
    }
  }

  triggerLevelUpEffect() {
    // 1. Play the synthesized WoW-style "Ding!" chime sound effect (Web Audio API)
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;

      // Primary Chime component (Bright triangle wave)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5 chime swell
      osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6 octave ring

      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2); // ring out over 1.2s

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 1.3);

      // Major Chord Harmony Swell component (Warm sine wave swell)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(293.66, now); // D4 root chord
      osc2.frequency.setValueAtTime(370.01, now + 0.12); // F#4 major chord
      osc2.frequency.exponentialRampToValueAtTime(440.0, now + 0.5); // A4 fifth

      gain2.gain.setValueAtTime(0.01, now);
      gain2.gain.linearRampToValueAtTime(0.2, now + 0.25); // swell in
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.8); // fade out warm choir

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now);
      osc2.stop(now + 1.9);
    } catch (e) {
      console.warn('Web Audio API Level-Up chime play deferred/failed:', e);
    }

    // 2. 3D Visual Effects Group
    const effectGroup = new THREE.Group();
    this.group.add(effectGroup);

    // Cylinder Beam
    const beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 15, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 7.5, 0);
    effectGroup.add(beam);

    // Expanding Ground Ring
    const ringGeo = new THREE.RingGeometry(0.1, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotateX(-Math.PI / 2);
    ring.position.set(0, 0.05, 0);
    effectGroup.add(ring);

    // Rising Sparks (Particles)
    const sparkGeo = new THREE.SphereGeometry(0.12, 4, 4);
    const sparks = [];
    const numSparks = 25;
    for (let i = 0; i < numSparks; i++) {
      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffe680,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const spark = new THREE.Mesh(sparkGeo, sparkMat);

      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.0;
      spark.position.set(
        Math.cos(angle) * radius,
        0.1 + Math.random() * 0.5,
        Math.sin(angle) * radius
      );

      spark.userData = {
        speedY: 2.5 + Math.random() * 3.5,
        driftX: (Math.random() - 0.5) * 0.6,
        driftZ: (Math.random() - 0.5) * 0.6,
        age: 0,
        life: 0.8 + Math.random() * 0.8,
      };
      effectGroup.add(spark);
      sparks.push(spark);
    }

    this._activeEffects.push({
      group: effectGroup,
      beam,
      ring,
      sparks,
      elapsed: 0,
      duration: 1.5,
    });
  }

  _playOnce(...clipNames) {
    if (!this._mixer || !this._animations) {
      return;
    }
    for (const name of clipNames) {
      const clip = this._animations.find(c => c.name === name);
      if (clip) {
        const action = this._mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset().play();
        // Return to idle after completion
        const dur = clip.duration * 1000;
        setTimeout(() => action.stop(), dur + 50);
        return;
      }
    }
  }

  update(inputState, delta, hud) {
    if (this.hp <= 0) {
      if (this._mixer) {
        this._mixer.update(delta);
      }
      return;
    }

    // Regenerate energy: 20 Energy per second
    if (this.mp < this.maxMp) {
      this.mp = Math.min(this.maxMp, this.mp + 20.0 * delta);
      if (hud) {
        hud.updatePlayer(this.hp, this.maxHp, this.mp, this.maxMp);
      }
    }

    const prevX = this.group.position.x;
    const prevZ = this.group.position.z;
    const { forward, back, left, right, running, isDragging } = inputState;
    const speed = PLAYER_SPEED * (running ? PLAYER_RUN_MULT : 1.0) * delta;

    let mx = 0,
      mz = 0;

    if (isDragging) {
      // Mouse steering mode: W/S move along camera direction, A/D strafe sideways
      const yaw = inputState.cameraYaw;
      if (forward) {
        mx -= Math.sin(yaw);
        mz -= Math.cos(yaw);
      }
      if (back) {
        mx += Math.sin(yaw);
        mz += Math.cos(yaw);
      }
      if (left) {
        mx -= Math.sin(yaw + Math.PI / 2);
        mz -= Math.cos(yaw + Math.PI / 2);
      }
      if (right) {
        mx -= Math.sin(yaw - Math.PI / 2);
        mz -= Math.cos(yaw - Math.PI / 2);
      }
    } else {
      // Keyboard-only mode: A/D rotate character and camera, W/S move relative to character rotation
      const turnSpeed = 2.5 * delta;
      if (left) {
        this.group.rotation.y += turnSpeed;
      }
      if (right) {
        this.group.rotation.y -= turnSpeed;
      }

      if (forward) {
        mx += Math.sin(this.group.rotation.y);
        mz += Math.cos(this.group.rotation.y);
      }
      if (back) {
        mx -= Math.sin(this.group.rotation.y);
        mz -= Math.cos(this.group.rotation.y);
      }
    }

    const wasMoving = this._isMoving;
    const moving = mx !== 0 || mz !== 0;
    this._isMoving = moving;
    this._isMovingForwardOrBack = moving && (forward || back);

    // Cancel dance if player moves or jumps
    if ((moving || inputState.jump) && this.isDancing) {
      this.isDancing = false;
      const hips = this.bones['hips'];
      if (hips && this.initialHipsY !== undefined) {
        hips.position.y = this.initialHipsY;
      }
      if (this._idleAction) {
        this._idleAction.setEffectiveWeight(1);
      }
    }

    if (moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      mx = (mx / len) * speed;
      mz = (mz / len) * speed;

      this.group.position.x += mx;
      this.group.position.z += mz;

      // Clamp to world bounds
      const h = HALF_WORLD;
      this.group.position.x = Math.max(-h, Math.min(h, this.group.position.x));
      this.group.position.z = Math.max(-h, Math.min(h, this.group.position.z));

      // Resolve static building collisions
      resolveCollisions(this.group.position, 0.6);

      // Block player from climbing steep mountain tree walls (height > 4.0)
      if (getHeightAt(this.group.position.x, this.group.position.z) > 4.0) {
        this.group.position.x = prevX;
        this.group.position.z = prevZ;
      }

      // Face direction of travel only when mouse steering (strafing)
      if (isDragging) {
        this.group.rotation.y = Math.atan2(mx, mz);
      }
    }

    // Terrain follow and jump/fall physics
    const terrainY = getHeightAt(this.group.position.x, this.group.position.z);

    // Jump trigger
    if (inputState.jump && this.isGrounded) {
      this.velocityY = 8.5; // WoW-style jump velocity
      this.isGrounded = false;
      this._playOnce('Jump_Start', 'Jump');
    }

    if (!this.isGrounded) {
      // Apply gravity
      this.velocityY -= 22.0 * delta;
      this.group.position.y += this.velocityY * delta;

      // Landing check
      if (this.group.position.y <= terrainY) {
        this.group.position.y = terrainY;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    } else {
      // Enter falling state if walking off a ledge (sudden drop > 1.2 units)
      const drop = this.group.position.y - terrainY;
      if (drop > 1.2) {
        this.isGrounded = false;
        this.velocityY = 0;
      } else {
        // Snap directly to the terrain height
        this.group.position.y = terrainY;
        this.velocityY = 0;
      }
    }

    // Animation blending
    if (this._mixer) {
      const wasRunning = this._isRunning;
      this._isRunning = moving && running;

      if (moving !== wasMoving || (moving && running !== wasRunning)) {
        if (this._idleAction) {
          this._idleAction.setEffectiveWeight(moving ? 0 : 1);
        }
        if (this._walkAction) {
          this._walkAction.setEffectiveWeight(moving && !running ? 1 : 0);
        }
        if (this._runAction) {
          this._runAction.setEffectiveWeight(moving && running ? 1 : 0);
        }
        if (moving && !running && !this._runAction && this._walkAction) {
          this._walkAction.setEffectiveWeight(1);
        }
        if (moving && running && !this._runAction && this._walkAction) {
          this._walkAction.setEffectiveWeight(1);
        }
      }
      this._mixer.update(delta);

      if (this.isDancing) {
        this.danceTime = (this.danceTime || 0) + delta;
        const t = this.danceTime * 4.0; // speed multiplier for dance

        const hips = this.bones['hips'];
        if (hips) {
          if (this.initialHipsY === undefined) {
            this.initialHipsY = hips.position.y;
          }
          hips.position.y = this.initialHipsY + Math.sin(t * 2) * 0.06;
          hips.rotation.z = Math.sin(t) * 0.12;
          hips.rotation.y = Math.cos(t) * 0.08;
        }

        const spine = this.bones['spine'];
        if (spine) {
          spine.rotation.y = Math.sin(t) * 0.15;
          spine.rotation.x = Math.cos(t * 2) * 0.05;
        }

        const head = this.bones['head'];
        if (head) {
          head.rotation.y = -Math.sin(t) * 0.1;
          head.rotation.z = Math.cos(t * 2) * 0.08;
        }

        const upperArmR = this.bones['upperarm.r'];
        if (upperArmR) {
          // Travolta finger-pointing high/low diagonal pattern
          upperArmR.rotation.z = -1.2 + Math.sin(t) * 0.6;
          upperArmR.rotation.x = -0.5 + Math.cos(t) * 0.4;
        }

        const lowerArmR = this.bones['lowerarm.r'];
        if (lowerArmR) {
          lowerArmR.rotation.y = 0.4 + Math.sin(t * 2) * 0.2;
        }

        const upperArmL = this.bones['upperarm.l'];
        if (upperArmL) {
          // Left arm swaying at the hip
          upperArmL.rotation.z = 0.8 + Math.cos(t) * 0.3;
          upperArmL.rotation.x = 0.3 + Math.sin(t) * 0.2;
        }
      }
    }

    // Update active level-up effects
    for (let i = this._activeEffects.length - 1; i >= 0; i--) {
      const fx = this._activeEffects[i];
      fx.elapsed += delta;

      if (fx.elapsed >= fx.duration) {
        this.group.remove(fx.group);
        fx.beam.geometry.dispose();
        fx.beam.material.dispose();
        fx.ring.geometry.dispose();
        fx.ring.material.dispose();
        fx.sparks.forEach(s => {
          s.geometry.dispose();
          s.material.dispose();
        });
        this._activeEffects.splice(i, 1);
        continue;
      }

      const progress = fx.elapsed / fx.duration;

      // Animate the beam: rotate and fade
      fx.beam.rotation.y += delta * 4.0;
      fx.beam.material.opacity = Math.max(0, 0.8 * (1.0 - progress));

      // Animate ground ring: expand and fade
      const ringScale = 1.0 + progress * 4.0;
      fx.ring.scale.set(ringScale, ringScale, 1.0);
      fx.ring.material.opacity = Math.max(0, 0.9 * (1.0 - progress * 1.2));

      // Animate rising sparks
      fx.sparks.forEach(s => {
        s.userData.age += delta;
        const sparkLife = s.userData.age / s.userData.life;
        if (sparkLife < 1.0) {
          s.position.y += s.userData.speedY * delta;
          s.position.x += s.userData.driftX * delta;
          s.position.z += s.userData.driftZ * delta;
          s.material.opacity = Math.max(0, 0.95 * (1.0 - sparkLife));
        } else {
          s.material.opacity = 0;
        }
      });
    }
  }
}

const HALF_WORLD = 245;

// ── Third-person camera controller ───────────────────────────────────────────

export class ThirdPersonCamera {
  constructor(camera, player) {
    this.camera = camera;
    this.player = player;
    this.yaw = 0;
    this.pitch = 0.35;
    this.dist = 14;
    this.minDist = 1.5;
    this.maxDist = 45;
    this.minPitch = 0.05;
    this.maxPitch = 1.35;

    this._isDragging = false;
    this._lastMX = 0;
    this._lastMY = 0;

    // Reusable vector — avoids a heap allocation every frame
    this._lookAt = new THREE.Vector3();

    this._bindEvents();
  }

  _bindEvents() {
    const canvas = document.getElementById('renderer-container');

    canvas.addEventListener('mousedown', e => {
      if (e.button === 1 || e.button === 2) {
        this._isDragging = true;
        this._lastMX = e.clientX;
        this._lastMY = e.clientY;
        e.preventDefault();
      }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 1 || e.button === 2) {
        this._isDragging = false;
      }
    });

    window.addEventListener('mousemove', e => {
      if (!this._isDragging) {
        return;
      }
      const dx = e.clientX - this._lastMX;
      const dy = e.clientY - this._lastMY;
      this._lastMX = e.clientX;
      this._lastMY = e.clientY;
      this.yaw -= dx * 0.006;
      this.pitch += dy * 0.005;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    });

    canvas.addEventListener(
      'wheel',
      e => {
        this.dist += e.deltaY * 0.02;
        this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
        e.preventDefault();
      },
      { passive: false }
    );

    // Touch support for camera rotation and pinch-to-zoom
    let lastTouchDist = 0;

    canvas.addEventListener(
      'touchstart',
      e => {
        if (e.touches.length === 1) {
          this._isDragging = true;
          this._lastMX = e.touches[0].clientX;
          this._lastMY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDist = Math.sqrt(dx * dx + dy * dy);
          e.preventDefault();
        }
      },
      { passive: false }
    );

    window.addEventListener('touchend', e => {
      if (e.touches.length === 0) {
        this._isDragging = false;
      }
    });

    window.addEventListener(
      'touchmove',
      e => {
        if (e.touches.length === 1 && this._isDragging) {
          const dx = e.touches[0].clientX - this._lastMX;
          const dy = e.touches[0].clientY - this._lastMY;
          this._lastMX = e.touches[0].clientX;
          this._lastMY = e.touches[0].clientY;
          this.yaw -= dx * 0.006;
          this.pitch += dy * 0.005;
          this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
          e.preventDefault();
        } else if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (lastTouchDist > 0) {
            const diff = lastTouchDist - dist;
            this.dist += diff * 0.05;
            this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
          }
          lastTouchDist = dist;
        }
      },
      { passive: false }
    );

    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  getYaw() {
    return this.yaw;
  }

  update(inputState, delta) {
    const p = this.player.position;

    // Keyboard turning: rotate camera yaw in sync with player body when not dragging
    if (inputState && !this._isDragging) {
      const turnSpeed = 2.5 * delta;
      if (inputState.left) {
        this.yaw += turnSpeed;
      }
      if (inputState.right) {
        this.yaw -= turnSpeed;
      }
    }

    // Auto-follow: slowly rotate camera behind player when moving forward/back and not dragging
    if (this.player._isMovingForwardOrBack && !this._isDragging) {
      const targetYaw = this.player.group.rotation.y + Math.PI;
      let diff = targetYaw - this.yaw;
      // Normalize difference to [-PI, PI] to find the shortest rotation direction
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));

      const lerpSpeed = 0.035; // Adjust this value to make the follow slower or faster
      this.yaw += diff * lerpSpeed;
    }

    // Camera orbit around player
    const camX = p.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
    const camZ = p.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;
    const camY = p.y + PLAYER_HEIGHT + Math.sin(this.pitch) * this.dist;

    // Don't go below terrain
    const terrainAtCam = getHeightAt(camX, camZ) + 0.5;
    this.camera.position.set(camX, Math.max(terrainAtCam, camY), camZ);

    // Look at the player's shoulders (reuse vector to avoid per-frame allocation)
    this._lookAt.set(p.x, p.y + PLAYER_HEIGHT * 1.1, p.z);
    this.camera.lookAt(this._lookAt);
  }
}
