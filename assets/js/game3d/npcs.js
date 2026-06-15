import * as THREE from 'three';
import { getHeightAt } from './world.js';
import { loadGLTF, findClip, cloneModel } from './model-loader.js';
import { MAX_LEVEL } from './player.js';

// ── Campus NPC definitions ───────────────────────────────────────────────────

const NPC_DEFS = [
  {
    id: 'head_of_engineering',
    name: 'Smith Argus',
    title: 'Town Blacksmith',
    portrait: '🛡',
    level: 6,
    pos: [13, 6],
    color: 0x6080a0,
    patrol: [
      [13, 6],
      [14, 11],
      [14, 2],
    ],
    dialogue: [
      "Welcome to Goldshire, traveler! If your armor needs mending or your sword needs honing, you've come to the right place.",
      'Stormwind keeps us busy with orders for the guard, but I always have time for a paying customer.',
      "Watch out for the Kobolds in the mines to the south. They've been getting bolder lately.",
    ],
  },
  {
    id: 'the_barista',
    name: 'Innkeeper Farley',
    title: "Lion's Pride Inn",
    portrait: '☕',
    level: 40,
    pos: [-13, 5],
    color: 0xb08040,
    dialogue: [
      "Welcome to the Lion's Pride Inn! Grab a seat by the hearth — our dwarven ale is cold and the mutton is fresh.",
      'Travelers from all over Azeroth rest their heads here. Just keep the brawling to a minimum.',
      "If you're looking for work, Marshal Dughan out in the crossroads is looking for help dealing with the local pests.",
    ],
  },
  {
    id: 'the_scrum_master',
    name: 'Agile Coach',
    title: 'Town Hall',
    portrait: '📋',
    level: 20,
    pos: [13, 40],
    color: 0xd0d0ff,
    patrol: [
      [13, 40],
      [13, 35],
      [13, 45],
    ],
    dialogue: [
      'The Sprint watches over all who dwell in Elwynn. May it guide your velocity, developer.',
      'These are troubled times. Technical debt grows bolder, and kobolds push ever further into the server farm.',
      'I facilitate the standup for those lost to merge conflicts. The standup bell rings for them at nine.',
    ],
  },
  {
    id: 'legacy_bug',
    name: 'Fargodeep Kobold',
    title: 'Hostile',
    portrait: '🐛',
    level: 1,
    pos: [0, 85],
    color: 0xa06040,
    hostile: true,
    patrol: [
      [0, 85],
      [-5, 90],
      [5, 80],
    ],
    dialogue: [
      'You no take my stack trace!!',
      'Bug no want fix! Bug just want to live in production!',
      '*segfaults and scurries back into the legacy codebase*',
    ],
  },
  {
    id: 'legacy_bug_1',
    name: 'Fargodeep Kobold',
    title: 'Hostile',
    portrait: '🐛',
    level: 1,
    pos: [-25, 80],
    color: 0xa06040,
    hostile: true,
    patrol: [
      [-25, 80],
      [-30, 85],
      [-20, 75],
    ],
    dialogue: ['You no take my stack trace!!', 'Bug no want fix!'],
  },
  {
    id: 'legacy_bug_2',
    name: 'Fargodeep Kobold',
    title: 'Hostile',
    portrait: '🐛',
    level: 2,
    pos: [25, 80],
    color: 0xa06040,
    hostile: true,
    patrol: [
      [25, 80],
      [20, 85],
      [30, 75],
    ],
    dialogue: ['You no take my stack trace!!', 'Bug no want fix!'],
  },
  {
    id: 'legacy_bug_3',
    name: 'Fargodeep Kobold',
    title: 'Hostile',
    portrait: '🐛',
    level: 2,
    pos: [-50, 75],
    color: 0xa06040,
    hostile: true,
    patrol: [
      [-50, 75],
      [-55, 80],
      [-45, 70],
    ],
    dialogue: ['You no take my stack trace!!', 'Bug no want fix!'],
  },
  {
    id: 'legacy_bug_4',
    name: 'Fargodeep Kobold',
    title: 'Hostile',
    portrait: '🐛',
    level: 3,
    pos: [50, 75],
    color: 0xa06040,
    hostile: true,
    patrol: [
      [50, 75],
      [45, 80],
      [55, 70],
    ],
    dialogue: ['You no take my stack trace!!', 'Bug no want fix!'],
  },
  {
    id: 'legacy_bug_5',
    name: 'Fargodeep Kobold',
    title: 'Hostile',
    portrait: '🐛',
    level: 3,
    pos: [0, 90],
    color: 0xa06040,
    hostile: true,
    patrol: [
      [0, 90],
      [-5, 95],
      [5, 85],
    ],
    dialogue: ['You no take my stack trace!!', 'Bug no want fix!'],
  },
  {
    id: 'devops_lead',
    name: 'Marshal Dughan',
    title: 'Goldshire Marshal',
    portrait: '⚙',
    level: 5,
    pos: [0, 20],
    color: 0x7090b0,
    patrol: [
      [0, 20],
      [0, 12],
      [0, 28],
    ],
    dialogue: [
      'Keep your pipelines green out there, traveler. Flaky bugs have been spotted near the southern woods.',
      "The King has us running double patrols. Can't be too careful with compliance in Elwynn.",
      'I heard the audit team to the east might make a push this quarter. Keep your Terraform state clean.',
    ],
  },
  {
    id: 'data_analyst',
    name: 'William Pestle',
    title: 'Alchemist',
    portrait: '📊',
    level: 10,
    pos: [-13, 40],
    color: 0x60a060,
    dialogue: [
      "Pssst. You there — I'm not just an alchemist. I have access to every KPI in the Kingdom.",
      'The quarterly performance numbers are more volatile than the engineers give them credit for.',
      'If you come across any anomalous transaction patterns in the database, report it to me immediately.',
    ],
  },
];

// Model assignments per NPC
const NPC_MODELS = {
  head_of_engineering: '/assets/models/knight.glb',
  the_barista: '/assets/models/barbarian.glb',
  the_scrum_master: '/assets/models/mage.glb',
  legacy_bug: '/assets/models/rogue_hooded.glb',
  devops_lead: '/assets/models/knight.glb',
  data_analyst: '/assets/models/rogue.glb',
};

// ── NPC 3D class ─────────────────────────────────────────────────────────────

export class NPC3D {
  constructor(def, scene) {
    this.def = def;
    this.name = def.name;
    this.hostile = def.hostile || false;
    this.dialogueIndex = 0;
    this.patrolIndex = 0;
    this.patrolWait = 0;
    this.patrolSpeed = 0.04;

    this._mixer = null;
    this._idleAction = null;
    this._walkAction = null;
    this._isMoving = false;
    this._boxGroup = new THREE.Group();

    this.group = new THREE.Group();
    scene.add(this.group);

    this._buildMesh();
    this.group.add(this._boxGroup);

    this._buildLabel();

    // Combat state
    this.maxHp = (def.level || 1) * 25;
    this.hp = this.maxHp;
    this.isDead = false;
    this.combatTarget = null;
    this.attackCooldown = 0;
    this.spawnPos = [def.pos[0], def.pos[1]];
    this.respawnTimer = 0;
    this._animations = null;

    const [wx, wz] = def.pos;
    const gy = getHeightAt(wx, wz);
    this.group.position.set(wx, gy, wz);

    this._patrolPoints = (def.patrol || [def.pos]).map(([px, pz]) => {
      const py = getHeightAt(px, pz);
      return new THREE.Vector3(px, py, pz);
    });
  }

  takeDamage(amount, player, hud) {
    if (this.isDead) {
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    hud.updateTargetHp(this.hp, this.maxHp);

    if (this.hp <= 0) {
      this.die(player, hud);
    } else {
      if (!this.combatTarget) {
        this.combatTarget = player;
        hud.addChat(`${this.name} enters combat with you!`, 'err');
      }
    }
  }

  die(player, hud) {
    this.isDead = true;
    this.hp = 0;
    this.combatTarget = null;
    this.respawnTimer = 8.0; // Respawns in 8s

    // Rotate model to fall over on its side
    this.group.rotation.z = Math.PI / 2;
    this.group.position.y = getHeightAt(this.group.position.x, this.group.position.z) + 0.2;

    if (player && player.level < MAX_LEVEL) {
      hud.addChat(`${this.name} dies! You earn 100 XP.`, 'sys');
      if (player.gainXp) {
        player.gainXp(100, hud);
      }
    } else {
      hud.addChat(`${this.name} dies!`, 'sys');
    }
    hud.setTarget(null);
  }

  respawn() {
    this.isDead = false;
    this.hp = this.maxHp;
    this.group.rotation.z = 0;
    const [sx, sz] = this.spawnPos;
    const sy = getHeightAt(sx, sz);
    this.group.position.set(sx, sy, sz);
    this.patrolIndex = 0;
    this.patrolWait = 0;
    this.combatTarget = null;
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
        const dur = clip.duration * 1000;
        setTimeout(() => action.stop(), dur + 50);
        return;
      }
    }
  }

  _playAttackAnim() {
    this._playOnce(
      '1H_Melee_Attack_Slice_Diagonal',
      '1H_Melee_Attack_Chop',
      '1H_Melee_Attack_Slice_Horizontal'
    );
  }

  _buildMesh() {
    const color = this.def.color;

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.6, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    this._boxGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.38, 10, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: this.hostile ? 0x806040 : 0xe0b880 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.9;
    head.castShadow = true;
    this._boxGroup.add(head);

    // Cloak / tabard
    const cloakGeo = new THREE.ConeGeometry(0.5, 1.0, 8, 1, true);
    const cloakMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.position.y = 0.45;
    this._boxGroup.add(cloak);

    // Shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.5, 10);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this._boxGroup.add(shadow);
  }

  _buildLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx2d = canvas.getContext('2d');

    const color = this.hostile ? '#ff6060' : '#ffe890';
    ctx2d.font = 'bold 22px Georgia, serif';
    ctx2d.shadowColor = 'rgba(0,0,0,0.9)';
    ctx2d.shadowBlur = 6;
    ctx2d.fillStyle = color;
    ctx2d.textAlign = 'center';
    ctx2d.fillText(this.name, 128, 28);

    if (this.def.title) {
      ctx2d.font = '16px Georgia, serif';
      ctx2d.fillStyle = this.hostile ? '#c04040' : '#90a870';
      ctx2d.fillText(this.def.title, 128, 46);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    this._label = new THREE.Sprite(mat);
    this._label.scale.set(3.0, 0.6, 1);
    this._label.position.y = 2.8;
    this.group.add(this._label);
  }

  /** Async: try to load a glTF model. Falls back to box mesh on failure. */
  async initModel() {
    const lookupId = this.def.id.startsWith('legacy_bug') ? 'legacy_bug' : this.def.id;
    const url = NPC_MODELS[lookupId];
    if (!url) {
      return;
    }
    const gltf = await loadGLTF(url);
    if (!gltf) {
      return;
    }

    this._boxGroup.visible = false;

    const model = cloneModel(gltf);
    const bbox = new THREE.Box3().setFromObject(model);
    const modelH = bbox.max.y - bbox.min.y;
    const scale = 1.72 / modelH;
    model.scale.setScalar(scale);
    model.position.y = -bbox.min.y * scale;
    model.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
      }
    });
    this.group.add(model);

    // Update label height to sit above glTF head
    this._label.position.y = 1.72 + 0.4;

    if (gltf.animations && gltf.animations.length > 0) {
      this._mixer = new THREE.AnimationMixer(model);
      this._animations = gltf.animations;

      const idleClip = findClip(gltf.animations, 'Idle', 'Unarmed_Idle', 'idle', 'Stand', 'TPose');
      const walkClip = findClip(gltf.animations, 'Walking_A', 'Walking_B', 'Walk', 'Running_A');

      if (idleClip) {
        this._idleAction = this._mixer.clipAction(idleClip);
        this._idleAction.play();
      }
      if (walkClip) {
        this._walkAction = this._mixer.clipAction(walkClip);
        this._walkAction.setEffectiveWeight(0);
        this._walkAction.play();
      }
    }
  }

  update(delta, player, hud) {
    this._frameTick = (this._frameTick || 0) + 1;
    this._throttledFactor = 1;

    // Fast distance check
    const distPlayerX = this.group.position.x - player.position.x;
    const distPlayerZ = this.group.position.z - player.position.z;
    const distSq = distPlayerX * distPlayerX + distPlayerZ * distPlayerZ;

    // Throttle updates for distant NPCs if not in combat and not dead
    if (distSq > 100 * 100 && !this.combatTarget && !this.isDead) {
      if (this._frameTick % 15 !== 0) {
        return;
      }
      delta *= 15;
      this._throttledFactor = 15;
    }

    if (this._mixer) {
      this._mixer.update(delta);
    }

    if (this.isDead) {
      this.respawnTimer -= delta;
      if (this.respawnTimer <= 0) {
        this.respawn();
      }
      return;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    // Combat logic
    if (this.combatTarget && !this.isDead && player && hud) {
      const current = this.group.position;
      const pPos = this.combatTarget.position;
      const dx = pPos.x - current.x;
      const dz = pPos.z - current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // If player is dead or too far, drop combat
      if (this.combatTarget.hp <= 0 || dist > 35) {
        this.combatTarget = null;
        hud.addChat(`${this.name} drops combat.`, 'sys');
        return;
      }

      if (dist > 2.0) {
        // Run towards player
        const step = this.patrolSpeed * 1.5;
        current.x += (dx / dist) * step;
        current.z += (dz / dist) * step;
        current.y = getHeightAt(current.x, current.z);
        this.group.rotation.y = Math.atan2(dx, dz);

        // Walking animation
        if (this._mixer && !this._isMoving) {
          this._isMoving = true;
          if (this._idleAction && this._walkAction) {
            this._idleAction.setEffectiveWeight(0);
            this._walkAction.setEffectiveWeight(1);
          }
        }
      } else {
        // Attack range
        if (this._mixer && this._isMoving) {
          this._isMoving = false;
          if (this._idleAction && this._walkAction) {
            this._idleAction.setEffectiveWeight(1);
            this._walkAction.setEffectiveWeight(0);
          }
        }

        // Face player
        this.group.rotation.y = Math.atan2(dx, dz);

        if (this.attackCooldown <= 0) {
          const dmg = (this.def.level || 1) * 3 + Math.floor(Math.random() * 3);
          this.combatTarget.takeDamage(dmg, this, hud);
          this.attackCooldown = 1.6; // Attack speed
          this._playAttackAnim();
        }
      }
      return;
    }

    // Normal patrol logic
    if (this._patrolPoints.length < 2) {
      return;
    }
    if (this.patrolWait > 0) {
      this.patrolWait -= delta;
      // Standing still — switch to idle
      if (this._mixer) {
        if (this._isMoving) {
          this._isMoving = false;
          if (this._idleAction && this._walkAction) {
            this._idleAction.setEffectiveWeight(1);
            this._walkAction.setEffectiveWeight(0);
          }
        }
      }
      return;
    }

    const target = this._patrolPoints[this.patrolIndex];
    const current = this.group.position;
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.25) {
      this.patrolIndex = (this.patrolIndex + 1) % this._patrolPoints.length;
      this.patrolWait = 1.5 + Math.random() * 2;
      return;
    }

    // Walking — switch to walk animation
    if (this._mixer && !this._isMoving) {
      this._isMoving = true;
      if (this._idleAction && this._walkAction) {
        this._idleAction.setEffectiveWeight(0);
        this._walkAction.setEffectiveWeight(1);
      }
    }

    const step = this.patrolSpeed * (this._throttledFactor || 1);
    current.x += (dx / dist) * step;
    current.z += (dz / dist) * step;
    current.y = getHeightAt(current.x, current.z);
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  getNextDialogue() {
    const line = this.def.dialogue[this.dialogueIndex];
    this.dialogueIndex = (this.dialogueIndex + 1) % this.def.dialogue.length;
    return line;
  }

  distanceTo(pos) {
    return this.group.position.distanceTo(pos);
  }

  get position() {
    return this.group.position;
  }
}

export function createNPCs(scene) {
  return NPC_DEFS.map(def => new NPC3D(def, scene));
}
