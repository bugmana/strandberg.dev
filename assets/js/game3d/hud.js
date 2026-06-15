import * as THREE from 'three';
import { input } from './input.js';

const LOADING_TIPS = [
  'Tip: The Agile Coach in the Town Hall facilitates standups at 9:00 AM sharp.',
  'Tip: Running away from legacy code bugs is a valid refactoring strategy.',
  'Tip: Press Shift to sprint. Coffee breaks also restore your movement energy.',
  "Tip: If the world isn't rendering, check that your graphics drivers are up to date.",
  "Tip: Don't stand in the red/error stack traces during production outages.",
  'Tip: Kobolds in the Fargodeep Mine are extremely protective of their stack traces.',
  'Tip: Speak to Smith Argus if you need help refactoring your weapons and armor.',
  'Tip: Press Enter to open the chat log, or tap the chat frame on mobile.',
  'Tip: You can execute abilities in slots 1-4 by pressing the numeric keys.',
  'Tip: Commit early and push often to avoid massive merge conflicts.',
  'Tip: If you segfault, you will resurrect at the nearest graveyard (Northshire Abbey).',
];

// ── WoW-style HUD manager ─────────────────────────────────────────────────────
// All manipulation is via the DOM elements defined in world/index.html.

export class HUD3D {
  constructor() {
    this._bubblesContainer = document.getElementById('speech-bubbles-container');
    this._activeBubbles = [];

    // Zone
    this._zoneEl = document.getElementById('zone-name');
    this._zoneText = document.getElementById('zone-text');
    this._zoneSub = document.getElementById('zone-sub');
    this._zoneTimer = 0;

    // HP / MP bars
    this._hpFill = document.getElementById('player-hp-fill');
    this._hpText = document.getElementById('player-hp-text');
    this._mpFill = document.getElementById('player-mp-fill');
    this._mpText = document.getElementById('player-mp-text');

    // Player portrait and level
    this._playerPortrait = document.getElementById('player-portrait');
    this._playerLevel = document.getElementById('player-level');

    // XP bar
    this._xpFill = document.getElementById('xp-bar-fill');
    this._xpText = document.getElementById('xp-bar-text');

    // Target frame
    this._targetFrame = document.getElementById('target-frame');
    this._targetName = document.getElementById('target-name');
    this._targetLevel = document.getElementById('target-level');
    this._targetPortrait = document.getElementById('target-portrait');
    this._targetHpFill = document.getElementById('target-hp-fill');
    this._targetHpText = document.getElementById('target-hp-text');

    // Chat
    this._chatEl = document.getElementById('chat-messages');
    this._chatInput = document.getElementById('chat-input');

    // Interact prompt
    this._interactEl = document.getElementById('interact-prompt');

    // Dialogue
    this._dialogueBox = document.getElementById('dialogue-box');
    this._dialogueName = document.getElementById('dialogue-npc-name');
    this._dialogueText = document.getElementById('dialogue-text');
    document.getElementById('dialogue-close').addEventListener('click', () => this.closeDialogue());

    // Loading
    this._loadingScreen = document.getElementById('loading-screen');
    this._loadingFill = document.getElementById('loading-bar-fill');
    this._loadingStatus = document.getElementById('loading-status');
    this._loadingTip = document.getElementById('loading-tip');

    if (this._loadingTip) {
      const idx = Math.floor(Math.random() * LOADING_TIPS.length);
      this._loadingTip.textContent = `"${LOADING_TIPS[idx]}"`;
    }

    // Minimap
    this._miniCanvas = document.getElementById('minimap-canvas');
    this._miniCtx = this._miniCanvas.getContext('2d');
    // Offscreen canvas holds the static minimap background (road, river, abbey)
    // so drawMinimap() only needs to re-draw the dynamic player/NPC dots each frame
    this._minimapBg = null;

    this._buildActionBar();
    this._zoneTimer = 0;

    // Death screen
    this._deathOverlay = document.getElementById('death-overlay');
    this._btnRelease = document.getElementById('btn-release');
    this._onReleaseCallback = null;
    this._btnRelease.addEventListener('click', () => {
      if (this._onReleaseCallback) {
        this._onReleaseCallback();
      }
    });

    this._buildMinimapBackground();

    // Set up Enter key listener to toggle chat input
    window.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (this.isChatInputActive) {
          const text = this._chatInput.value.trim();
          if (text) {
            this.addChat(`You: ${text}`);
            if (this.player && this.player.group) {
              this.spawnSpeechBubble('player', this.player.group, text);
            }
            this._processChatCommand(text);
          }
          this.hideChatInput();
        } else {
          this.showChatInput();
          e.preventDefault();
        }
      }
    });

    // Tap chat messages container on mobile to open chat input
    this._chatEl.addEventListener('click', () => {
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isMobile && !this.isChatInputActive) {
        this.showChatInput();
      }
    });
  }

  // ── Loading bar ────────────────────────────────────────────────────────────
  setLoadingProgress(pct) {
    this._loadingFill.style.width = pct + '%';
    if (this._loadingStatus) {
      let status = 'Loading CITADEL...';
      if (pct < 10) {
        status = 'Initializing engine...';
      } else if (pct < 15) {
        status = 'Configuring global lighting...';
      } else if (pct < 25) {
        status = 'Compiling terrain mesh...';
      } else if (pct < 45) {
        status = 'Downloading campus assets...';
      } else if (pct < 55) {
        status = 'Laying down streets and roads...';
      } else if (pct < 65) {
        status = 'Constructing buildings and offices...';
      } else if (pct < 75) {
        status = 'Filling Crystal Lake...';
      } else if (pct < 85) {
        status = 'Instancing forest boundary...';
      } else if (pct < 90) {
        status = 'Importing employee assets...';
      } else if (pct < 95) {
        status = 'Spawning QA test bugs...';
      } else if (pct < 98) {
        status = 'Pre-rendering 3D campus...';
      } else {
        status = 'Deploying to production!';
      }
      this._loadingStatus.textContent = status;
    }
  }

  hideLoading() {
    this._loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      this._loadingScreen.style.display = 'none';
    }, 1100);
  }

  // ── Zone popup ─────────────────────────────────────────────────────────────
  showZone(name, subName = 'Solna Business Park') {
    this._zoneText.textContent = name;
    this._zoneSub.textContent = subName;
    this._zoneEl.classList.add('visible');
    clearTimeout(this._zoneTimeout);
    this._zoneTimeout = setTimeout(() => this._zoneEl.classList.remove('visible'), 4200);
  }

  // ── Player bars ───────────────────────────────────────────────────────────
  updatePlayer(hp, maxHp, mp, maxMp) {
    const hpPct = (hp / maxHp) * 100;
    const mpPct = (mp / maxMp) * 100;
    this._hpFill.style.width = hpPct + '%';
    this._mpFill.style.width = mpPct + '%';
    this._hpText.textContent = `${hp} / ${maxHp}`;
    this._mpText.textContent = `${mp} / ${maxMp}`;
  }

  // ── Target frame ──────────────────────────────────────────────────────────
  setTarget(npcDef) {
    if (!npcDef) {
      this._targetFrame.classList.add('hidden');
      return;
    }
    this._targetFrame.classList.remove('hidden');
    this._targetName.textContent = npcDef.def.name;
    this._targetLevel.textContent = `Lv ${npcDef.def.level}`;

    // Dynamically assign target class color and avatar icon
    const classMap = {
      head_of_engineering: { icon: '⚔️', bg: 'class-warrior' }, // Smith Argus
      the_barista: { icon: '🍻', bg: 'class-barbarian' }, // Innkeeper Farley
      the_scrum_master: { icon: '🔮', bg: 'class-mage' }, // Agile Coach
      legacy_bug: { icon: '🐛', bg: 'class-hostile' }, // Kobold
      devops_lead: { icon: '🛡️', bg: 'class-warrior' }, // Marshal Dughan
      data_analyst: { icon: '🧪', bg: 'class-rogue' }, // William Pestle
    };
    const lookupId = npcDef.def.id.startsWith('legacy_bug') ? 'legacy_bug' : npcDef.def.id;
    const cfg = classMap[lookupId] || { icon: '?', bg: 'class-generic' };
    this._targetPortrait.textContent = cfg.icon;
    this._targetPortrait.className = `unit-portrait ${cfg.bg}`;

    this.updateTargetHp(npcDef.hp, npcDef.maxHp);
  }

  updateTargetHp(hp, maxHp) {
    const pct = Math.max(0, hp / maxHp) * 100;
    this._targetHpFill.style.width = pct + '%';
    this._targetHpText.textContent = `${Math.max(0, hp)} / ${maxHp}`;
  }

  // ── Interact prompt ───────────────────────────────────────────────────────
  showInteractPrompt(show, isHostile = false) {
    if (show) {
      this._interactEl.innerHTML = isHostile
        ? 'Press <kbd>E</kbd> to attack'
        : 'Press <kbd>E</kbd> to speak';
      this._interactEl.classList.remove('hidden');
    } else {
      this._interactEl.classList.add('hidden');
    }
  }

  // ── Death Screen ──────────────────────────────────────────────────────────
  showDeathScreen(onRelease) {
    this._deathOverlay.classList.remove('hidden');
    document.body.classList.add('dead');
    this._onReleaseCallback = onRelease;
  }

  hideDeathScreen() {
    this._deathOverlay.classList.add('hidden');
    document.body.classList.remove('dead');
    this._onReleaseCallback = null;
  }

  // ── Experience and Level updates ───────────────────────────────────────────
  updatePlayerLevel(level) {
    if (this._playerLevel) {
      const pFrame = document.getElementById('player-frame');
      if (level >= 10) {
        this._playerLevel.textContent = `Lv ${level} (Elite)`;
        if (pFrame) {
          pFrame.classList.add('elite-frame');
        }
      } else {
        this._playerLevel.textContent = `Lv ${level}`;
        if (pFrame) {
          pFrame.classList.remove('elite-frame');
        }
      }
    }
  }

  updateXpBar(xp, maxXp) {
    if (this._xpFill && this._xpText) {
      if (maxXp === 0) {
        this._xpFill.style.width = '100%';
        this._xpText.textContent = 'Level Cap Reached';
      } else {
        const pct = Math.min(100, Math.max(0, (xp / maxXp) * 100));
        this._xpFill.style.width = pct + '%';
        this._xpText.textContent = `XP: ${xp} / ${maxXp}`;
      }
    }
  }

  flashLevelUp() {
    if (this._playerPortrait) {
      this._playerPortrait.classList.add('level-up-flash');
      setTimeout(() => {
        this._playerPortrait.classList.remove('level-up-flash');
      }, 1500);
    }
  }

  // ── Dialogue popup ─────────────────────────────────────────────────────────
  showDialogue(npcName, text) {
    this._dialogueName.textContent = npcName;
    this._dialogueText.textContent = text;
    this._dialogueBox.classList.remove('hidden');
  }

  closeDialogue() {
    this._dialogueBox.classList.add('hidden');
  }

  get isDialogueOpen() {
    return !this._dialogueBox.classList.contains('hidden');
  }

  addChat(text, type = 'normal') {
    // Cap chat history at 30 messages to prevent unbounded DOM growth
    const existing = this._chatEl.querySelectorAll('.chat-line');
    if (existing.length >= 30) {
      existing[0].remove();
    }

    const el = document.createElement('div');
    el.className = 'chat-line ' + type;
    el.textContent = text;
    this._chatEl.appendChild(el);
    this._chatEl.scrollTop = this._chatEl.scrollHeight;
    // Auto-remove after 12s
    setTimeout(() => el.remove(), 12000);
  }

  showChatInput() {
    this._chatInput.classList.remove('hidden');
    this._chatInput.focus();
  }

  hideChatInput() {
    this._chatInput.value = '';
    this._chatInput.classList.add('hidden');
    this._chatInput.blur();
  }

  get isChatInputActive() {
    return this._chatInput && !this._chatInput.classList.contains('hidden');
  }

  _processChatCommand(text) {
    const lower = text.toLowerCase();
    if (lower.startsWith('/help')) {
      this.addChat('Commands: /help, /roll, /dance, /who, /levelup, /maxlevel', 'sys');
    } else if (lower.startsWith('/roll')) {
      const roll = Math.floor(Math.random() * 100) + 1;
      this.addChat(`You roll ${roll} (1-100).`, 'sys');
    } else if (lower.startsWith('/dance')) {
      this.addChat('You bust out some moves in the middle of Goldshire!', 'sys');
    } else if (lower.startsWith('/who')) {
      this.addChat(
        'Zone: Elwynn Forest (6 players online: Farley, Argus, Dughan, Pestle, Kobold, You)',
        'sys'
      );
    } else if (lower.startsWith('/levelup')) {
      if (this.player) {
        if (this.player.level < 10) {
          const needed = this.player.maxXp - this.player.xp;
          this.player.gainXp(needed, this);
        } else {
          this.addChat('You are already at the maximum level!', 'err');
        }
      }
    } else if (lower.startsWith('/poweroverwhelming') || lower.startsWith('/maxlevel')) {
      if (this.player) {
        if (this.player.level < 10) {
          this.addChat('Cheat enabled: Power Overwhelming!', 'sys');
          while (this.player.level < 10) {
            const needed = this.player.maxXp - this.player.xp;
            this.player.gainXp(needed, this);
          }
        } else {
          this.addChat('You are already at the maximum level!', 'err');
        }
      }
    }
  }

  spawnSpeechBubble(entityId, entityGroup, text) {
    // 1. Remove existing bubble for this entity
    const existingIndex = this._activeBubbles.findIndex(b => b.id === entityId);
    if (existingIndex !== -1) {
      this._activeBubbles[existingIndex].el.remove();
      clearTimeout(this._activeBubbles[existingIndex].timeoutId);
      this._activeBubbles.splice(existingIndex, 1);
    }

    // 2. Create bubble DOM element
    const el = document.createElement('div');
    el.className = 'speech-bubble';
    el.textContent = text;
    this._bubblesContainer.appendChild(el);

    // 3. Trigger fade-in
    setTimeout(() => el.classList.add('visible'), 20);

    // 4. Set fade-out and destruction timer
    const timeoutId = setTimeout(() => {
      el.classList.remove('visible');
      // wait for CSS transition before removing from DOM
      setTimeout(() => {
        el.remove();
        const idx = this._activeBubbles.findIndex(b => b.el === el);
        if (idx !== -1) {
          this._activeBubbles.splice(idx, 1);
        }
      }, 250);
    }, 4000);

    // 5. Save reference
    this._activeBubbles.push({ id: entityId, el, group: entityGroup, timeoutId });
  }

  updateSpeechBubbles(camera) {
    if (this._activeBubbles.length === 0) {
      return;
    }
    const tempV = new THREE.Vector3();

    this._activeBubbles.forEach(b => {
      // Get world position of the entity
      b.group.getWorldPosition(tempV);
      tempV.y += 2.4; // Offset to sit above the head

      // Project onto normalized device coordinates
      tempV.project(camera);

      // Hide if behind the camera
      if (tempV.z > 1) {
        b.el.style.display = 'none';
      } else {
        // Map to screen pixel coordinates
        const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
        const y = (tempV.y * -0.5 + 0.5) * window.innerHeight;

        b.el.style.display = 'block';
        b.el.style.left = `${x}px`;
        b.el.style.top = `${y}px`;
      }
    });
  }

  // ── Minimap ───────────────────────────────────────────────────────────────

  /** Renders the static minimap background once to an offscreen canvas.
   *  Called once at construction — roads, river, and landmark markers never move.
   */
  _buildMinimapBackground() {
    const W = this._miniCanvas.width;
    const H = this._miniCanvas.height;
    const HALF = 245;

    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const ctx = bg.getContext('2d');

    const toMM = (wx, wz) => ({
      x: ((wx / HALF) * 0.5 + 0.5) * W,
      y: ((wz / HALF) * 0.5 + 0.5) * H,
    });

    // Background circle
    ctx.fillStyle = '#1a2810';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    // Clip to circle for all subsequent static content
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    // 1. Roads (tan lines)
    ctx.strokeStyle = '#7a6a48';
    ctx.lineWidth = 4;

    // North-South road
    ctx.beginPath();
    const nsStart = toMM(0, -55);
    const nsEnd = toMM(0, 95);
    ctx.moveTo(nsStart.x, nsStart.y);
    ctx.lineTo(nsEnd.x, nsEnd.y);
    ctx.stroke();

    // East-West road
    ctx.beginPath();
    const ewStart = toMM(-90, 20);
    const ewEnd = toMM(90, 20);
    ctx.moveTo(ewStart.x, ewStart.y);
    ctx.lineTo(ewEnd.x, ewEnd.y);
    ctx.stroke();

    // 2. Crystal Lake (blue circle)
    const lakeCenter = toMM(70, 20);
    const lakeEdge = toMM(70 + 25, 20);
    const lakeRadius = Math.abs(lakeEdge.x - lakeCenter.x);
    ctx.fillStyle = '#225280';
    ctx.beginPath();
    ctx.arc(lakeCenter.x, lakeCenter.y, lakeRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Buildings & Landmark squares
    const drawMarker = (wx, wz, size, color) => {
      const mm = toMM(wx, wz);
      ctx.fillStyle = color;
      ctx.fillRect(mm.x - size / 2, mm.y - size / 2, size, size);
    };

    // Northshire Abbey (Gold square, larger)
    drawMarker(0, -60, 7, '#c8a020');

    // Lion's Pride Inn (Tavern - brown square)
    drawMarker(-22, 5, 5, '#8c5832');

    // Blacksmith (Grey square)
    drawMarker(22, 5, 4, '#737373');

    // Town Hall / Barracks (Grey square)
    drawMarker(22, 40, 4, '#595959');

    // General Store (Brown square)
    drawMarker(-22, 40, 4, '#8c5832');

    // Dock House (Brown square)
    drawMarker(50, 45, 4, '#8c5832');

    // Town Well (Tiny light-blue circle)
    const wellMM = toMM(-6, 20);
    ctx.fillStyle = '#4ba3c3';
    ctx.beginPath();
    ctx.arc(wellMM.x, wellMM.y, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Border ring
    ctx.strokeStyle = '#7a6020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();

    this._minimapBg = bg;
  }

  /** Called every frame — blits the cached static background then draws only
   *  the dynamic player and NPC dots on top. Far cheaper than a full redraw.
   */
  drawMinimap(playerPos, npcs) {
    const ctx = this._miniCtx;
    const W = this._miniCanvas.width;
    const H = this._miniCanvas.height;
    const HALF = 245;

    // Blit the pre-rendered static background
    ctx.drawImage(this._minimapBg, 0, 0);

    // Clip to circle for dots
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    // World → minimap coords
    const toMM = (wx, wz) => ({
      x: ((wx / HALF) * 0.5 + 0.5) * W,
      y: ((wz / HALF) * 0.5 + 0.5) * H,
    });

    // NPC dots
    for (const npc of npcs) {
      const nm = toMM(npc.position.x, npc.position.z);
      ctx.fillStyle = npc.hostile ? '#e04040' : '#f0e060';
      ctx.beginPath();
      ctx.arc(nm.x, nm.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player dot (white, larger)
    const pm = toMM(playerPos.x, playerPos.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pm.x, pm.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Action bar ────────────────────────────────────────────────────────────

  static ACTIONS = [
    { id: 'deploy', icon: '⚡', name: 'Deploy Code', cd: 1.5, type: 'combat', energy: 25 },
    { id: 'review', icon: '🔍', name: 'Code Review', cd: 8, type: 'combat', energy: 40 },
    { id: 'coffee', icon: '☕', name: 'Coffee Break', cd: 6, type: 'spell', energy: 0 },
    { id: 'monitor', icon: '🖥', name: 'Toggle Monitor', cd: 0.5, type: 'utility', energy: 0 },
  ];

  _buildActionBar() {
    const slotsEl = document.getElementById('action-slots');
    slotsEl.innerHTML = '';
    this._slotEls = [];
    this._cooldowns = new Array(HUD3D.ACTIONS.length).fill(0);

    HUD3D.ACTIONS.forEach((action, i) => {
      const slot = document.createElement('div');
      slot.className = 'action-slot';
      slot.title = `${action.name} (Key: ${i + 1})${action.energy > 0 ? ` - Cost: ${action.energy} Energy` : ''}`;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'slot-icon';
      iconSpan.textContent = action.icon;

      const cdOverlay = document.createElement('div');
      cdOverlay.className = 'slot-cooldown';

      const cdText = document.createElement('span');
      cdText.className = 'slot-cd-text';

      const keySpan = document.createElement('span');
      keySpan.className = 'slot-key';
      keySpan.textContent = i + 1;

      slot.appendChild(iconSpan);
      slot.appendChild(cdOverlay);
      slot.appendChild(cdText);
      slot.appendChild(keySpan);

      slot.addEventListener('click', () => {
        input.actionSlot = i + 1;
      });
      slotsEl.appendChild(slot);
      this._slotEls.push({ slot, cdOverlay, cdText });
    });
  }

  triggerAction(slotIndex) {
    if (slotIndex < 0 || slotIndex >= HUD3D.ACTIONS.length) {
      return null;
    }
    if (this._cooldowns[slotIndex] > 0) {
      return null;
    }
    const action = HUD3D.ACTIONS[slotIndex];
    if (this.player && action.energy > 0 && this.player.mp < action.energy) {
      this.addChat('Not enough energy!', 'err');
      return null;
    }
    this._cooldowns[slotIndex] = action.cd;
    this._slotEls[slotIndex].slot.classList.add('action-active');
    setTimeout(() => this._slotEls[slotIndex].slot.classList.remove('action-active'), 150);
    return action;
  }

  updateCooldowns(delta) {
    for (let i = 0; i < HUD3D.ACTIONS.length; i++) {
      const el = this._slotEls[i];
      if (this._cooldowns[i] > 0) {
        this._cooldowns[i] = Math.max(0, this._cooldowns[i] - delta);
        const action = HUD3D.ACTIONS[i];
        const pct = this._cooldowns[i] / action.cd;
        el.cdOverlay.style.height = pct * 100 + '%';
        el.cdText.textContent = this._cooldowns[i] > 0 ? this._cooldowns[i].toFixed(1) : '';
        el.slot.classList.toggle('on-cooldown', this._cooldowns[i] > 0);
      } else {
        el.cdOverlay.style.height = '0%';
        el.cdText.textContent = '';
        el.slot.classList.remove('on-cooldown');
      }
    }
  }
}
