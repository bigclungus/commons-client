// src/state.ts
var TILE = 20;
var CANVAS_W = 1000;
var CANVAS_H = 700;
var COLS = Math.floor(CANVAS_W / TILE);
var ROWS = Math.floor(CANVAS_H / TILE);
var PLAYER_SPEED = 108;
var NPC_HIT_RADIUS = 14;
var CONGRESS_BUILDING_COL = 5;
var CONGRESS_BUILDING_LABEL_ROW = 2;
var INTERPOLATION_DELAY_MS = 100;
var SNAPSHOT_BUFFER_SIZE = 8;
var PENDING_INPUT_CAP = 120;
var BLOCKING_TILES = new Set([2, 3, 4, 5, 6]);
function randomColor() {
  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#e91e63"];
  return colors[Math.floor(Math.random() * colors.length)];
}
function adjAnimalName() {
  const adjs = ["swift", "bold", "calm", "deft", "keen", "lithe", "nimble", "quick"];
  const animals = ["fox", "owl", "deer", "lynx", "crow", "hare", "hawk", "wolf"];
  return adjs[Math.floor(Math.random() * adjs.length)] + "-" + animals[Math.floor(Math.random() * animals.length)];
}
function createWorldState() {
  return {
    connected: false,
    socketId: null,
    localPlayer: null,
    remotePlayers: new Map,
    npcs: new Map,
    congress: { active: false },
    warthog: null,
    walkers: [],
    seatedInWarthog: false,
    warthogDrive: { left: false, right: false, up: false, down: false, ePressedOnce: false },
    lastTickSeq: 0,
    lastTickTime: 0,
    serverTime: 0,
    map: null,
    mapChunkX: 0,
    mapChunkY: 0,
    frame: 0,
    playerName: adjAnimalName(),
    playerColor: randomColor(),
    mouseX: -1,
    mouseY: -1
  };
}

// src/sprites.ts
var NPC_REGISTRY = {
  chairman: { displayName: "Ibrahim the Immovable", sprite: { id: "chairman", pollSlug: "chairman" } },
  critic: { displayName: "Pippi the Pitiless", sprite: { id: "critic", pollSlug: "critic" } },
  architect: { displayName: "Kwame the Constructor", sprite: { id: "architect", pollSlug: "architect" } },
  ux: { displayName: "Yuki the Yielding", sprite: { id: "ux", pollSlug: "ux" } },
  designer: { displayName: "Vesper the Vivid", sprite: { id: "designer", pollSlug: "designer" } },
  galactus: { displayName: "Galactus", sprite: { id: "galactus", pollSlug: "galactus" } },
  hume: { displayName: "David Hume", sprite: { id: "hume", pollSlug: "hume" } },
  otto: { displayName: "Otto Atreides", sprite: { id: "otto", pollSlug: "otto" } },
  pm: { displayName: "Chud O'Bikeshedder", sprite: { id: "pm", pollSlug: "pm" } },
  spengler: { displayName: "Spengler the Doomed", sprite: { id: "spengler", pollSlug: "spengler" } },
  trump: { displayName: "Punished Trump", sprite: { id: "trump", pollSlug: "trump" } },
  "uncle-bob": { displayName: "Uncle Bob", sprite: { id: "unclebob", pollSlug: "uncle-bob" } },
  bloodfeast: { displayName: "Holden Bloodfeast", sprite: { id: "bloodfeast", pollSlug: "bloodfeast" } },
  adelbert: { displayName: "Adelbert Hominem", sprite: { id: "adelbert", pollSlug: "adelbert" } },
  jhaddu: { displayName: "Jhaddu", sprite: { id: "jhaddu", pollSlug: "jhaddu" } },
  morgan: { displayName: "Morgan (they/them)", sprite: { id: "morgan", pollSlug: "morgan" } },
  "the-kid": { displayName: "The Kid", sprite: { id: "the_kid", pollSlug: "the-kid" } },
  "the-correspondent": { displayName: "The Correspondent" },
  chaz: { displayName: "Chaz the Destroyer" }
};
var NPC_DISPLAY_NAMES = Object.fromEntries(Object.entries(NPC_REGISTRY).map(([slug, { displayName }]) => [slug, displayName]));
var SPRITE_SLUG_MAP = Object.fromEntries(Object.entries(NPC_REGISTRY).filter(([, { sprite }]) => sprite !== undefined).map(([slug, { sprite }]) => [slug, sprite]));
var SPRITE_WINNERS = {};
function fetchSpriteWinners() {
  const slugs = Object.keys(SPRITE_SLUG_MAP);
  for (const name of slugs) {
    const info = SPRITE_SLUG_MAP[name];
    fetch("/api/vote/sprite-" + encodeURIComponent(info.pollSlug)).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d && d.winner) {
        SPRITE_WINNERS[name] = d.winner;
      }
    }).catch(() => {});
  }
}
fetchSpriteWinners();
setInterval(fetchSpriteWinners, 30000);
function getWinner(npcName) {
  return SPRITE_WINNERS[npcName] ?? null;
}
function getSpriteId(npcName) {
  return SPRITE_SLUG_MAP[npcName]?.id ?? null;
}
var SPRITE_FUNCTION_NAMES = Object.values(SPRITE_SLUG_MAP).flatMap(({ id }) => [
  `drawSprite_${id}_A`,
  `drawSprite_${id}_B`,
  `drawSprite_${id}_C`
]);
function validateSprites() {
  const missing = [];
  for (const name of SPRITE_FUNCTION_NAMES) {
    if (typeof window[name] !== "function") {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.warn("[sprites] missing sprite functions:", missing);
  } else {
    console.log("[sprites] all", SPRITE_FUNCTION_NAMES.length, "sprite functions validated OK");
  }
}

// src/ui/chat-modal.ts
var NPC_HIT_RADIUS2 = 14;
var overlay = null;
var titleEl = null;
var portraitCanvas = null;
var inputEl = null;
var submitBtnEl = null;
var bubbleEl = null;
var activeNPC = null;
var currentAbortController = null;
var _modalOpen = false;
function isModalOpen() {
  return _modalOpen;
}
var NPC_META = {
  chairman: { displayName: "Ibrahim the Immovable", role: "Chairman" },
  critic: { displayName: "Pippi the Pitiless", role: "Code and Work Reviewer" },
  architect: { displayName: "Kwame the Constructor", role: "Systems Designer and Long-Term Thinker" },
  ux: { displayName: "Yuki the Yielding", role: "User Experience Advocate" },
  designer: { displayName: "Vesper the Vivid", role: "Visual Craft and Aesthetic Systems" },
  galactus: { displayName: "Galactus", role: "PLANET EATER" },
  hume: { displayName: "David Hume", role: "Empiricist" },
  otto: { displayName: "Otto Atreides", role: "Optimist-Nihilist and Limit-Pusher" },
  pm: { displayName: "Chud O'Bikeshedder", role: "Operational Outcomes Wrangler" },
  spengler: { displayName: "Spengler the Doomed", role: "Faustian Pragmatist and Civilizational Decline Analyst" },
  trump: { displayName: "Punished Trump", role: "Deal-Closer" },
  "uncle-bob": { displayName: "Uncle Bob", role: "Clean Code Evangelist and Software Craftsman" },
  bloodfeast: { displayName: "Holden Bloodfeast", role: "Geriatric Hawk" },
  adelbert: { displayName: "Adelbert Hominem", role: "Ad Hominem Specialist" },
  jhaddu: { displayName: "Jhaddu", role: "Senior Enterprise Architect and Design Pattern Authority" },
  morgan: { displayName: "Morgan (they/them)", role: "Community Standards and Harm Reduction" },
  "the-kid": { displayName: "The Kid", role: "Goes Fast" }
};
function drawPortrait(npc) {
  if (!portraitCanvas)
    return;
  const pw = portraitCanvas.width;
  const ph = portraitCanvas.height;
  const pctx = portraitCanvas.getContext("2d");
  if (!pctx)
    return;
  pctx.clearRect(0, 0, pw, ph);
  const spriteId = getSpriteId(npc.name);
  const winner = spriteId ? getWinner(npc.name) : null;
  const spriteFn = winner && spriteId ? window[`drawSprite_${spriteId}_${winner}`] ?? null : null;
  const scale = 4;
  const cx = Math.round(pw / 2);
  const cy_feet = Math.round(ph * 0.78);
  if (typeof spriteFn === "function") {
    pctx.save();
    pctx.scale(scale, scale);
    spriteFn(pctx, cx / scale, cy_feet / scale);
    pctx.restore();
  } else {
    const hash = npc.name.split("").reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 0);
    const hue = Math.abs(hash) % 360;
    pctx.fillStyle = `hsl(${hue},60%,45%)`;
    const bw = 16 * scale;
    const bh = 16 * scale;
    pctx.fillRect(cx - bw / 2, cy_feet - bh, bw, bh);
  }
}
function createModal() {
  overlay = document.createElement("div");
  overlay.id = "cv2-chat-overlay";
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: 1000;
    align-items: center;
    justify-content: center;
  `;
  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 16px;
    max-width: 90vw;
  `;
  const portraitCol = document.createElement("div");
  portraitCol.style.cssText = `
    display: flex;
    align-items: center;
    flex-shrink: 0;
  `;
  portraitCanvas = document.createElement("canvas");
  portraitCanvas.width = 96;
  portraitCanvas.height = 192;
  portraitCanvas.style.cssText = `
    image-rendering: pixelated;
    display: block;
  `;
  portraitCol.appendChild(portraitCanvas);
  const box = document.createElement("div");
  box.style.cssText = `
    background: #0a0f1a;
    border: 2px solid #00ffaa;
    border-radius: 8px;
    padding: 18px 20px 16px;
    width: 420px;
    max-width: calc(90vw - 112px);
    font-family: 'JetBrains Mono', monospace;
    color: #e0e0ff;
    box-shadow: 0 0 24px #00ffaa22;
  `;
  const header = document.createElement("div");
  header.style.cssText = `
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 10px;
    letter-spacing: 0.05em;
  `;
  header.textContent = "speak to ";
  titleEl = document.createElement("span");
  titleEl.style.cssText = "color: #00ffaa;";
  header.appendChild(titleEl);
  inputEl = document.createElement("textarea");
  inputEl.rows = 3;
  inputEl.placeholder = "ask something...";
  inputEl.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    background: #111827;
    border: none;
    border-bottom: 1px solid #2a2a40;
    border-radius: 0;
    color: #e0e0ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    padding: 7px 9px;
    resize: none;
    margin-bottom: 6px;
    outline: none;
  `;
  inputEl.addEventListener("focus", () => {
    if (inputEl)
      inputEl.style.borderBottomColor = "#00ffaa";
  });
  inputEl.addEventListener("blur", () => {
    if (inputEl)
      inputEl.style.borderBottomColor = "#2a2a40";
  });
  const hint = document.createElement("div");
  hint.style.cssText = "font-size: 10px; color: #4a5568; margin-bottom: 10px;";
  hint.textContent = "Enter to send · Shift+Enter for newline · Esc to cancel";
  bubbleEl = document.createElement("div");
  bubbleEl.style.cssText = `
    display: none;
    background: #111827;
    border: 1px solid #1a3a2a;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 12px;
    color: #a0f0c8;
    min-height: 40px;
    margin-top: 8px;
    white-space: pre-wrap;
    font-family: 'JetBrains Mono', monospace;
  `;
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 8px; margin-top: 10px; align-items: center;";
  submitBtnEl = document.createElement("button");
  submitBtnEl.textContent = "send";
  submitBtnEl.style.cssText = `
    background: #00ffaa18;
    border: 1px solid #00ffaa;
    color: #00ffaa;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 5px 16px;
    cursor: pointer;
    border-radius: 3px;
    letter-spacing: 0.05em;
  `;
  submitBtnEl.addEventListener("click", submitChat);
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "cancel";
  cancelBtn.style.cssText = `
    background: none;
    border: none;
    color: #4a5568;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 5px 8px;
    cursor: pointer;
    border-radius: 3px;
  `;
  cancelBtn.addEventListener("click", closeModal);
  btnRow.appendChild(submitBtnEl);
  btnRow.appendChild(cancelBtn);
  box.appendChild(header);
  box.appendChild(inputEl);
  box.appendChild(hint);
  box.appendChild(bubbleEl);
  box.appendChild(btnRow);
  row.appendChild(portraitCol);
  row.appendChild(box);
  overlay.appendChild(row);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay)
      closeModal();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });
}
function openModal(npc) {
  if (!overlay || !titleEl || !inputEl || !bubbleEl)
    return;
  activeNPC = npc;
  const meta = NPC_META[npc.name];
  if (meta) {
    titleEl.textContent = `${meta.displayName}, ${meta.role} (${npc.name})`;
  } else {
    titleEl.textContent = NPC_DISPLAY_NAMES[npc.name] ?? npc.name;
  }
  setTimeout(() => drawPortrait(npc), 10);
  inputEl.value = "";
  bubbleEl.style.display = "none";
  bubbleEl.textContent = "";
  overlay.style.display = "flex";
  _modalOpen = true;
  setTimeout(() => inputEl?.focus(), 50);
}
function closeModal() {
  if (!overlay)
    return;
  overlay.style.display = "none";
  _modalOpen = false;
  activeNPC = null;
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}
function submitChat() {
  if (!inputEl || !bubbleEl || !activeNPC)
    return;
  const text = inputEl.value.trim();
  if (!text)
    return;
  if (currentAbortController)
    currentAbortController.abort();
  currentAbortController = new AbortController;
  const npc = activeNPC;
  const abortController = currentAbortController;
  if (!inputEl || !bubbleEl || !submitBtnEl)
    return;
  inputEl.disabled = true;
  submitBtnEl.disabled = true;
  bubbleEl.style.display = "block";
  bubbleEl.style.color = "#a0f0c8";
  bubbleEl.textContent = "...";
  fetch("/api/invoke-persona", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: npc.name, prompt: text }),
    signal: abortController.signal
  }).then((r) => {
    if (!r.ok)
      throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then((data) => {
    if (!bubbleEl || !inputEl || !submitBtnEl)
      return;
    const raw = (data.response ?? data.error ?? "no response").trim();
    bubbleEl.textContent = raw;
    inputEl.disabled = false;
    submitBtnEl.disabled = false;
    currentAbortController = null;
    setTimeout(() => inputEl?.focus(), 50);
  }).catch((err) => {
    if (err.name === "AbortError")
      return;
    if (!bubbleEl || !inputEl || !submitBtnEl)
      return;
    bubbleEl.textContent = `(error: ${err.message.slice(0, 60)})`;
    bubbleEl.style.color = "#f87171";
    inputEl.disabled = false;
    submitBtnEl.disabled = false;
    currentAbortController = null;
  });
}
function initChatModal() {
  createModal();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.style.display === "flex") {
      e.stopPropagation();
      closeModal();
    }
  });
}
function checkNPCClick(state, mx, my) {
  if (!overlay)
    return;
  if (overlay.style.display === "flex")
    return;
  for (const npc of state.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS2 && Math.abs(dy) < NPC_HIT_RADIUS2 + 4) {
      openModal(npc);
      return;
    }
  }
}

// src/input.ts
var state = {
  left: false,
  right: false,
  up: false,
  down: false,
  hop: false
};
var lastInputAt = Date.now();
function getLastInputAt() {
  return lastInputAt;
}
function touchInput() {
  lastInputAt = Date.now();
}
function keyToField(key) {
  switch (key) {
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case " ":
      return "hop";
    default:
      return null;
  }
}
function isTextInputFocused() {
  const el = document.activeElement;
  if (!el)
    return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
function initInput() {
  window.addEventListener("keydown", (e) => {
    touchInput();
    const field = keyToField(e.key);
    if (!field)
      return;
    if (isTextInputFocused())
      return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
      e.preventDefault();
    }
    if (isModalOpen())
      return;
    state[field] = true;
  });
  window.addEventListener("keyup", (e) => {
    touchInput();
    const field = keyToField(e.key);
    if (!field)
      return;
    if (field !== "hop")
      state[field] = false;
  });
  window.addEventListener("mousemove", touchInput, { passive: true });
  window.addEventListener("touchstart", touchInput, { passive: true });
}
function getInput() {
  return state;
}
function consumeHop() {
  if (state.hop) {
    state.hop = false;
    return true;
  }
  return false;
}

// src/entities/local-player.ts
var HOP_FRAMES = 12;
function initLocalPlayer(state2) {
  state2.localPlayer = {
    socketId: state2.socketId || "",
    name: state2.playerName,
    color: state2.playerColor,
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    facing: "right",
    hopFrame: 0,
    isAway: false,
    chunkX: 0,
    chunkY: 0,
    pendingInputs: [],
    inputSeq: 0,
    chunkTransitionAt: 0
  };
}
function tileAt(map, px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS)
    return 0;
  return map[ty][tx];
}
function isBlocked(map, x, y) {
  const hw = 6, hh = 6;
  const corners = [
    [x - hw, y - hh],
    [x + hw - 1, y - hh],
    [x - hw, y + hh - 1],
    [x + hw - 1, y + hh - 1]
  ];
  return corners.some(([cx, cy]) => BLOCKING_TILES.has(tileAt(map, cx, cy)));
}
function applyMovement(player, dx, dy, map) {
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (!isBlocked(map, nx, ny)) {
    player.x = nx;
    player.y = ny;
    return;
  }
  if (!isBlocked(map, nx, player.y)) {
    player.x = nx;
    return;
  }
  if (!isBlocked(map, player.x, ny)) {
    player.y = ny;
    return;
  }
}
function tickLocalPlayer(state2, input, dt) {
  const player = state2.localPlayer;
  if (!player || !state2.map)
    return { dx: 0, dy: 0, chunkChanged: false, moved: false };
  const dtClamped = Math.min(dt, 0.1);
  const speed = PLAYER_SPEED * dtClamped;
  let dx = 0, dy = 0;
  if (input.left)
    dx -= speed;
  if (input.right)
    dx += speed;
  if (input.up)
    dy -= speed;
  if (input.down)
    dy += speed;
  if (dx !== 0 && dy !== 0) {
    const norm = 1 / Math.sqrt(2);
    dx *= norm;
    dy *= norm;
  }
  const moved = dx !== 0 || dy !== 0;
  if (moved) {
    if (dx > 0)
      player.facing = "right";
    else if (dx < 0)
      player.facing = "left";
    player.inputSeq++;
    const pending = {
      seq: player.inputSeq,
      dx,
      dy,
      timestamp: performance.now()
    };
    player.pendingInputs.push(pending);
    if (player.pendingInputs.length > PENDING_INPUT_CAP) {
      player.pendingInputs.shift();
    }
    applyMovement(player, dx, dy, state2.map);
  }
  if (consumeHop() && player.hopFrame === 0) {
    player.hopFrame = 1;
  }
  if (player.hopFrame > 0) {
    player.hopFrame++;
    if (player.hopFrame > HOP_FRAMES)
      player.hopFrame = 0;
  }
  let chunkChanged = false;
  const EDGE_BUFFER = 2;
  if (player.x < EDGE_BUFFER) {
    player.chunkX--;
    player.x = CANVAS_W - EDGE_BUFFER - 1;
    chunkChanged = true;
  } else if (player.x > CANVAS_W - EDGE_BUFFER) {
    player.chunkX++;
    player.x = EDGE_BUFFER + 1;
    chunkChanged = true;
  }
  if (player.y < EDGE_BUFFER) {
    player.chunkY--;
    player.y = CANVAS_H - EDGE_BUFFER - 1;
    chunkChanged = true;
  } else if (player.y > CANVAS_H - EDGE_BUFFER) {
    player.chunkY++;
    player.y = EDGE_BUFFER + 1;
    chunkChanged = true;
  }
  if (chunkChanged) {
    player.chunkTransitionAt = Date.now();
  }
  return { dx, dy, chunkChanged, moved };
}
function reconcile(player, authX, authY, lastProcessedSeq, map) {
  const predX = player.x;
  const predY = player.y;
  player.x = authX;
  player.y = authY;
  player.pendingInputs = player.pendingInputs.filter((i) => i.seq > lastProcessedSeq);
  for (const input of player.pendingInputs) {
    applyMovement(player, input.dx, input.dy, map);
  }
  const errX = player.x - predX;
  const errY = player.y - predY;
  const errDist = Math.sqrt(errX * errX + errY * errY);
  if (errDist > 0 && errDist < 8) {
    player.x = predX + errX * 0.33;
    player.y = predY + errY * 0.33;
  }
  if (errDist > 2) {
    player.pendingInputs = [];
  }
}

// src/entities/remote-player.ts
function addRemotePlayerSnapshot(player, snap) {
  player.snapshots.push(snap);
  if (player.snapshots.length > SNAPSHOT_BUFFER_SIZE) {
    player.snapshots.shift();
  }
}
function interpolateRemotePlayer(player, now) {
  const renderTime = now - INTERPOLATION_DELAY_MS;
  const buf = player.snapshots;
  if (buf.length === 0)
    return;
  for (let i = buf.length - 1;i > 0; i--) {
    const newer = buf[i];
    const older = buf[i - 1];
    if (older.t <= renderTime && renderTime <= newer.t) {
      const t = (renderTime - older.t) / (newer.t - older.t);
      player.displayX = older.x + (newer.x - older.x) * t;
      player.displayY = older.y + (newer.y - older.y) * t;
      return;
    }
  }
  const latest = buf[buf.length - 1];
  player.displayX = latest.x;
  player.displayY = latest.y;
}
function tickRemotePlayers(players, now) {
  for (const player of players.values()) {
    interpolateRemotePlayer(player, now);
  }
}

// src/entities/npc.ts
function addNPCSnapshot(npc, snap) {
  npc.snapshots.push(snap);
  if (npc.snapshots.length > SNAPSHOT_BUFFER_SIZE) {
    npc.snapshots.shift();
  }
}
function interpolateNPC(npc, now) {
  const renderTime = now - INTERPOLATION_DELAY_MS;
  const buf = npc.snapshots;
  if (buf.length === 0)
    return;
  for (let i = buf.length - 1;i > 0; i--) {
    const newer = buf[i];
    const older = buf[i - 1];
    if (older.t <= renderTime && renderTime <= newer.t) {
      const t = (renderTime - older.t) / (newer.t - older.t);
      npc.displayX = older.x + (newer.x - older.x) * t;
      npc.displayY = older.y + (newer.y - older.y) * t;
      return;
    }
  }
  const latest = buf[buf.length - 1];
  npc.displayX = latest.x;
  npc.displayY = latest.y;
}
function tickNPCs(npcs, now) {
  for (const npc of npcs.values()) {
    interpolateNPC(npc, now);
    if (npc.blurbExpiry !== undefined && performance.now() > npc.blurbExpiry) {
      npc.blurb = undefined;
      npc.blurbExpiry = undefined;
    }
  }
}

// src/map/chunk.ts
var TILE_GRASS = 0;
var TILE_PATH = 1;
var TILE_WATER = 2;
var TILE_BUILDING = 3;
var TILE_TREE = 4;
var TILE_ROCK = 5;
var TILE_FOUNTAIN = 6;
function chunkSeed(cx, cy) {
  let h = cx * 374761393 + cy * 668265263;
  h = (h ^ h >> 13) * 1274126177;
  return h ^ h >> 16;
}
function seededRand(seed) {
  let s = seed;
  return function() {
    s = (s | 0) + (1831565813 | 0) | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function generateChunk00() {
  const m = [];
  for (let r = 0;r < ROWS; r++)
    m.push(new Uint8Array(COLS));
  for (let c = 0;c < COLS; c++) {
    m[17][c] = TILE_PATH;
    m[18][c] = TILE_PATH;
  }
  for (let r = 0;r < ROWS; r++) {
    m[r][24] = TILE_PATH;
    m[r][25] = TILE_PATH;
  }
  for (let r = 22;r <= 27; r++) {
    for (let c = 4;c <= 10; c++) {
      m[r][c] = TILE_WATER;
    }
  }
  for (let r = 2;r <= 6; r++) {
    for (let c = 2;c <= 8; c++) {
      m[r][c] = TILE_BUILDING;
    }
  }
  for (let r = 2;r <= 6; r++) {
    for (let c = 40;c <= 47; c++) {
      if (c < COLS)
        m[r][c] = TILE_BUILDING;
    }
  }
  for (let r = 26;r <= 31; r++) {
    for (let c = 38;c <= 46; c++) {
      if (r < ROWS && c < COLS)
        m[r][c] = TILE_BUILDING;
    }
  }
  const trees = [
    [1, 1],
    [1, 12],
    [1, 35],
    [1, 48],
    [8, 3],
    [8, 14],
    [8, 38],
    [8, 47],
    [10, 10],
    [10, 30],
    [10, 45],
    [14, 2],
    [14, 20],
    [14, 44],
    [20, 5],
    [20, 15],
    [20, 35],
    [20, 48],
    [22, 18],
    [22, 40],
    [28, 3],
    [28, 20],
    [28, 47],
    [32, 8],
    [32, 30],
    [32, 46],
    [33, 1],
    [33, 48],
    [34, 14],
    [34, 35]
  ];
  for (const [tr, tc] of trees) {
    if (tr < ROWS && tc < COLS)
      m[tr][tc] = TILE_TREE;
  }
  const rocks = [
    [9, 22],
    [11, 40],
    [15, 12],
    [16, 32],
    [21, 27],
    [25, 14],
    [29, 35],
    [31, 12],
    [33, 40]
  ];
  for (const [rr, rc] of rocks) {
    if (rr < ROWS && rc < COLS)
      m[rr][rc] = TILE_ROCK;
  }
  for (let r = 13;r <= 15; r++) {
    for (let c = 19;c <= 21; c++) {
      m[r][c] = TILE_FOUNTAIN;
    }
  }
  return m;
}
function generateChunk(cx, cy) {
  if (cx === 0 && cy === 0)
    return generateChunk00();
  const m = [];
  for (let r = 0;r < ROWS; r++)
    m.push(new Uint8Array(COLS));
  const rng = seededRand(chunkSeed(cx, cy));
  for (let r = 2;r < ROWS - 2; r++) {
    for (let c = 2;c < COLS - 2; c++) {
      const inCenter = c >= 15 && c <= 35 && r >= 12 && r <= 23;
      if (inCenter)
        continue;
      if (rng() < 0.1)
        m[r][c] = TILE_TREE;
    }
  }
  const numPonds = 1 + Math.floor(rng() * 3);
  for (let p = 0;p < numPonds; p++) {
    const pr = 5 + Math.floor(rng() * (ROWS - 12));
    const pc = 5 + Math.floor(rng() * (COLS - 12));
    const pw = 3 + Math.floor(rng() * 5);
    const ph = 2 + Math.floor(rng() * 4);
    for (let wr = pr;wr < Math.min(pr + ph, ROWS - 3); wr++) {
      for (let wc = pc;wc < Math.min(pc + pw, COLS - 3); wc++) {
        m[wr][wc] = TILE_WATER;
      }
    }
  }
  const numRocks = 3 + Math.floor(rng() * 6);
  for (let k = 0;k < numRocks; k++) {
    const rr = 2 + Math.floor(rng() * (ROWS - 4));
    const rc = 2 + Math.floor(rng() * (COLS - 4));
    if (m[rr][rc] === 0)
      m[rr][rc] = TILE_ROCK;
  }
  const numPaths = 1 + Math.floor(rng() * 2);
  for (let pp = 0;pp < numPaths; pp++) {
    if (rng() < 0.5) {
      const pathRow = 3 + Math.floor(rng() * (ROWS - 6));
      for (let pc2 = 0;pc2 < COLS; pc2++) {
        if (m[pathRow][pc2] === TILE_TREE || m[pathRow][pc2] === TILE_ROCK)
          m[pathRow][pc2] = TILE_PATH;
      }
    } else {
      const pathCol = 3 + Math.floor(rng() * (COLS - 6));
      for (let pr2 = 0;pr2 < ROWS; pr2++) {
        if (m[pr2][pathCol] === TILE_TREE || m[pr2][pathCol] === TILE_ROCK)
          m[pr2][pathCol] = TILE_PATH;
      }
    }
  }
  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);
  for (let i = -5;i <= 5; i++) {
    if (m[0][midC + i] !== 0)
      m[0][midC + i] = 0;
    if (m[1][midC + i] !== 0)
      m[1][midC + i] = 0;
    if (m[ROWS - 1][midC + i] !== 0)
      m[ROWS - 1][midC + i] = 0;
    if (m[ROWS - 2][midC + i] !== 0)
      m[ROWS - 2][midC + i] = 0;
    if (m[midR + i][0] !== 0)
      m[midR + i][0] = 0;
    if (m[midR + i][1] !== 0)
      m[midR + i][1] = 0;
    if (m[midR + i][COLS - 1] !== 0)
      m[midR + i][COLS - 1] = 0;
    if (m[midR + i][COLS - 2] !== 0)
      m[midR + i][COLS - 2] = 0;
  }
  return m;
}
var MAX_CACHE_SIZE = 16;
var chunkCache = new Map;
var cacheOrder = [];
function getChunk(cx, cy) {
  const key = `${cx},${cy}`;
  let chunk = chunkCache.get(key);
  if (chunk) {
    const idx = cacheOrder.indexOf(key);
    if (idx !== -1)
      cacheOrder.splice(idx, 1);
    cacheOrder.push(key);
    return chunk;
  }
  chunk = generateChunk(cx, cy);
  chunkCache.set(key, chunk);
  cacheOrder.push(key);
  if (cacheOrder.length > MAX_CACHE_SIZE) {
    const oldest = cacheOrder.shift();
    chunkCache.delete(oldest);
  }
  return chunk;
}

// src/map/renderer.ts
function getSeason(serverTime) {
  const ts = serverTime != null && serverTime > 0 ? serverTime : Date.now();
  const week = Math.floor(ts / (1000 * 60 * 60 * 24 * 7));
  const idx = week % 4;
  return ["spring", "summer", "autumn", "winter"][idx];
}
function getTileColors(season) {
  switch (season) {
    case "spring":
      return {
        grass: "#5a8f3c",
        grassAlt: "#4e7d34",
        path: "#c8a96e",
        water: "#4a90d9",
        waterDark: "#3a7bc8",
        building: "#8b7355",
        buildingRoof: "#6b5535",
        tree: "#2d7a2d",
        treeTop: "#1d5a1d",
        rock: "#888",
        rockLight: "#aaa",
        fountain: "#aaa",
        fountainWater: "#5bc"
      };
    case "summer":
      return {
        grass: "#4a8f2c",
        grassAlt: "#3e7d24",
        path: "#d4b47a",
        water: "#3a8fd9",
        waterDark: "#2a7bc8",
        building: "#8b7355",
        buildingRoof: "#6b5535",
        tree: "#1d7a1d",
        treeTop: "#0d5a0d",
        rock: "#888",
        rockLight: "#aaa",
        fountain: "#aaa",
        fountainWater: "#5bc"
      };
    case "autumn":
      return {
        grass: "#8f7a3c",
        grassAlt: "#7d6a34",
        path: "#c8a96e",
        water: "#4a7ac9",
        waterDark: "#3a6ab8",
        building: "#8b7355",
        buildingRoof: "#6b5535",
        tree: "#c45a1d",
        treeTop: "#a34a0d",
        rock: "#888",
        rockLight: "#aaa",
        fountain: "#aaa",
        fountainWater: "#5bc"
      };
    case "winter":
      return {
        grass: "#a0b0b8",
        grassAlt: "#909fa8",
        path: "#d8d8c8",
        water: "#aac0e8",
        waterDark: "#8aa0d8",
        building: "#9a8a75",
        buildingRoof: "#7a6a55",
        tree: "#4a6a4a",
        treeTop: "#3a5a3a",
        rock: "#999",
        rockLight: "#bbb",
        fountain: "#bbb",
        fountainWater: "#8bd"
      };
  }
}
var tileCache = null;
function drawTile(ctx, tile, x, y, tx, ty, colors, frame) {
  switch (tile) {
    case TILE_GRASS: {
      const variant = (tx * 7 + ty * 13) % 5;
      ctx.fillStyle = variant === 0 ? colors.grassAlt : colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      break;
    }
    case TILE_PATH:
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y, 1, TILE);
      break;
    case TILE_WATER: {
      ctx.fillStyle = colors.water;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.waterDark;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x + 4, y + 8, 8, 1);
      ctx.fillRect(x + 8, y + 13, 6, 1);
      break;
    }
    case TILE_BUILDING:
      if (ty >= 2 && ty <= 6 && tx >= 2 && tx <= 8) {
        ctx.fillStyle = "#2a2050";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#3a3068";
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        if (ty === 2) {
          const distFromCenter = Math.abs(tx - 5);
          const peakColor = distFromCenter <= 1 ? "#8a8aaa" : distFromCenter <= 2 ? "#6a6a8a" : "#4a4a6a";
          ctx.fillStyle = peakColor;
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          const triH = Math.max(0, (3 - distFromCenter) * 4);
          if (triH > 0) {
            ctx.fillStyle = "#9a9abb";
            ctx.fillRect(x + 2, y + 1, TILE - 4, triH);
          }
        } else if (ty === 6) {
          ctx.fillStyle = "#4a4080";
          ctx.fillRect(x, y + 10, TILE, 6);
          ctx.fillStyle = "#5a5090";
          ctx.fillRect(x, y + 12, TILE, 4);
          ctx.fillStyle = "#6a60a0";
          ctx.fillRect(x, y + 14, TILE, TILE - 14);
        }
        if (tx === 2 || tx === 4 || tx === 6 || tx === 8) {
          if (ty > 2 && ty < 6) {
            ctx.fillStyle = "#7a7a9a";
            ctx.fillRect(x + 5, y, 5, TILE);
            ctx.fillStyle = "#9a9ab8";
            ctx.fillRect(x + 6, y, 2, TILE);
          } else if (ty === 6) {
            ctx.fillStyle = "#7a7a9a";
            ctx.fillRect(x + 5, y, 5, 10);
          }
        }
        if (tx === 5 && (ty === 5 || ty === 6)) {
          ctx.fillStyle = "#000010";
          ctx.fillRect(x + 3, y + (ty === 5 ? 4 : 0), 9, ty === 5 ? TILE - 4 : 10);
          ctx.fillStyle = "rgba(240,208,96,0.27)";
          ctx.fillRect(x + 2, y + (ty === 5 ? 4 : 0), 1, ty === 5 ? TILE - 4 : 10);
          ctx.fillRect(x + 12, y + (ty === 5 ? 4 : 0), 1, ty === 5 ? TILE - 4 : 10);
          if (ty === 5) {
            ctx.fillStyle = "rgba(240,208,96,0.4)";
            ctx.fillRect(x + 3, y + 3, 9, 2);
          }
        }
      } else {
        ctx.fillStyle = colors.building;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = colors.buildingRoof;
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        if ((tx + ty) % 3 === 0) {
          ctx.fillStyle = "rgba(240,208,96,0.67)";
          ctx.fillRect(x + 4, y + 4, 4, 5);
        }
      }
      break;
    case TILE_TREE: {
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(x + 8, y + 10, 4, TILE - 10);
      ctx.fillStyle = colors.tree;
      ctx.fillRect(x + 2, y + 1, TILE - 4, 12);
      ctx.fillStyle = colors.treeTop;
      ctx.fillRect(x + 4, y + 1, TILE - 8, 8);
      break;
    }
    case TILE_ROCK:
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.rock;
      ctx.fillRect(x + 3, y + 4, TILE - 6, TILE - 8);
      ctx.fillStyle = colors.rockLight;
      ctx.fillRect(x + 5, y + 5, 5, 4);
      break;
    case TILE_FOUNTAIN: {
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.fountain;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = colors.fountainWater;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      break;
    }
    default:
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
  }
}
function renderChunkToCache(map, chunkX, chunkY, season) {
  const offscreen = new OffscreenCanvas(COLS * TILE, ROWS * TILE);
  const ctx = offscreen.getContext("2d");
  const colors = getTileColors(season);
  for (let r = 0;r < ROWS; r++) {
    for (let c = 0;c < COLS; c++) {
      drawTile(ctx, map[r][c], c * TILE, r * TILE, c, r, colors, 0);
    }
  }
  tileCache = { canvas: offscreen, chunkX, chunkY, season };
  return offscreen;
}
function getOrBuildTileCache(map, chunkX, chunkY, season) {
  if (tileCache && tileCache.chunkX === chunkX && tileCache.chunkY === chunkY && tileCache.season === season) {
    return tileCache.canvas;
  }
  return renderChunkToCache(map, chunkX, chunkY, season);
}
function invalidateTileCache() {
  tileCache = null;
}

// src/map/worn-paths.ts
var STORAGE_KEY = "commons_worn_tiles";
var WORN_THRESHOLD = 10;
var DIRT_THRESHOLD = 30;
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw)
      return JSON.parse(raw);
  } catch {}
  return { counts: {} };
}
var store = loadStore();
function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden")
      saveStore();
  });
  window.addEventListener("beforeunload", () => {
    saveStore();
  });
}
function mergeServerWornPaths(tiles) {
  for (const { tileX, tileY, visitCount } of tiles) {
    const key = `${tileX},${tileY}`;
    const local = store.counts[key] ?? 0;
    if (visitCount > local) {
      store.counts[key] = visitCount;
    }
  }
  saveStore();
}
function recordTileVisit(tileX, tileY) {
  const key = `${tileX},${tileY}`;
  store.counts[key] = (store.counts[key] ?? 0) + 1;
  if (store.counts[key] % 30 === 0) {
    saveStore();
  }
}
function getWornLevel(tileX, tileY) {
  const count = store.counts[`${tileX},${tileY}`] ?? 0;
  if (count >= DIRT_THRESHOLD)
    return 2;
  if (count >= WORN_THRESHOLD)
    return 1;
  return 0;
}
function drawWornPaths(ctx, map) {
  if (!map)
    return;
  for (let ty = 0;ty < ROWS; ty++) {
    for (let tx = 0;tx < COLS; tx++) {
      if (map[ty][tx] !== 0)
        continue;
      const level = getWornLevel(tx, ty);
      if (level === 0)
        continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (level === 2) {
        ctx.fillStyle = "rgba(107,76,24,0.53)";
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.16)";
      }
      ctx.fillRect(x, y, TILE, TILE);
    }
  }
}

// src/network.ts
var RECONNECT_DELAY_MS = 3000;
var MOVE_BUFFER_SIZE = 3;
var ws = null;
var reconnectTimer = null;
var state2;
function sendMove(state3, dx, dy) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state3.localPlayer)
    return;
  const player = state3.localPlayer;
  ws.send(JSON.stringify({
    type: "move",
    seq: player.inputSeq,
    x: player.x,
    y: player.y,
    facing: player.facing,
    chunkX: player.chunkX,
    chunkY: player.chunkY
  }));
}
function sendStatus(away) {
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return;
  ws.send(JSON.stringify({ type: "status", away }));
}
function sendChunk(chunkX, chunkY) {
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return;
  ws.send(JSON.stringify({ type: "chunk", chunkX, chunkY }));
}
function sendWarthog(type, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return;
  ws.send(JSON.stringify({ type, ...payload }));
}
function sendWornPath(chunkX, chunkY, tileX, tileY) {
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return;
  ws.send(JSON.stringify({ type: "worn_path", chunkX, chunkY, tileX, tileY }));
}
function handleWelcome(msg) {
  state2.socketId = msg.socket_id ?? msg.socketId ?? null;
  state2.connected = true;
  console.log("[network] welcome, socketId:", state2.socketId);
  if (!state2.localPlayer) {
    initLocalPlayer(state2);
  } else if (state2.socketId) {
    state2.localPlayer.socketId = state2.socketId;
  }
  loadChunk(state2, 0, 0);
}
var EMA_ALPHA = 0.1;
var serverTimeOffsetEMA = null;
var serverTimeOffsetSamples = 0;
function serverTsToClientTs(serverTs) {
  const sample = performance.now() - serverTs;
  if (serverTimeOffsetEMA === null) {
    serverTimeOffsetEMA = sample;
  } else {
    serverTimeOffsetEMA = EMA_ALPHA * sample + (1 - EMA_ALPHA) * serverTimeOffsetEMA;
  }
  serverTimeOffsetSamples++;
  return serverTs + serverTimeOffsetEMA;
}
function handleTick(msg) {
  const now = performance.now();
  state2.lastTickSeq = msg.seq ?? 0;
  state2.lastTickTime = now;
  state2.serverTime = msg.serverTime ?? msg.t ?? Date.now();
  if (msg.players) {
    const seenIds = new Set;
    for (const [socketId, data] of Object.entries(msg.players)) {
      seenIds.add(socketId);
      if (socketId === state2.socketId) {
        const CHUNK_TRANSITION_GRACE_MS = 200;
        const recentTransition = state2.localPlayer && Date.now() - state2.localPlayer.chunkTransitionAt < CHUNK_TRANSITION_GRACE_MS;
        const lastProcessed = msg.lastProcessedInput ?? 0;
        const seqGuardPassed = !state2.localPlayer || lastProcessed >= state2.localPlayer.inputSeq - MOVE_BUFFER_SIZE;
        if (state2.localPlayer && state2.map && !recentTransition && seqGuardPassed) {
          reconcile(state2.localPlayer, data.x, data.y, lastProcessed, state2.map);
        }
        continue;
      }
      let player = state2.remotePlayers.get(socketId);
      if (!player) {
        player = {
          socketId,
          name: data.name ?? "unknown",
          color: data.color ?? "#888",
          x: data.x,
          y: data.y,
          facing: data.facing ?? "right",
          hopFrame: data.hopFrame ?? 0,
          isAway: data.isAway ?? false,
          chunkX: data.chunkX ?? 0,
          chunkY: data.chunkY ?? 0,
          snapshots: [],
          displayX: data.x,
          displayY: data.y
        };
        state2.remotePlayers.set(socketId, player);
      } else {
        player.name = data.name ?? player.name;
        player.color = data.color ?? player.color;
        player.facing = data.facing ?? player.facing;
        player.hopFrame = data.hopFrame ?? player.hopFrame;
        player.isAway = data.isAway ?? player.isAway;
        player.chunkX = data.chunkX ?? player.chunkX;
        player.chunkY = data.chunkY ?? player.chunkY;
      }
      addRemotePlayerSnapshot(player, {
        seq: msg.seq ?? 0,
        t: msg.t != null ? serverTsToClientTs(msg.t) : now,
        x: data.x,
        y: data.y,
        facing: data.facing ?? "right"
      });
    }
    for (const id of state2.remotePlayers.keys()) {
      if (!seenIds.has(id))
        state2.remotePlayers.delete(id);
    }
  }
  if (msg.npcs) {
    const BLURB_DISPLAY_MS = 7500;
    for (const data of msg.npcs) {
      let npc = state2.npcs.get(data.name);
      if (!npc) {
        npc = {
          name: data.name,
          x: data.x,
          y: data.y,
          facing: data.facing ?? "right",
          snapshots: [],
          displayX: data.x,
          displayY: data.y
        };
        state2.npcs.set(data.name, npc);
      } else {
        npc.facing = data.facing ?? npc.facing;
      }
      if ("blurb" in data) {
        if (data.blurb) {
          if (npc.blurb !== data.blurb) {
            npc.blurb = data.blurb;
            npc.blurbExpiry = performance.now() + BLURB_DISPLAY_MS;
          }
        } else {
          npc.blurb = undefined;
          npc.blurbExpiry = undefined;
        }
      }
      addNPCSnapshot(npc, {
        seq: msg.seq ?? 0,
        t: msg.t != null ? serverTsToClientTs(msg.t) : now,
        x: data.x,
        y: data.y
      });
    }
  }
  if (msg.congress) {
    state2.congress = msg.congress;
  }
  if (msg.warthog) {
    state2.warthog = msg.warthog;
  }
  if (msg.wornPaths && Array.isArray(msg.wornPaths)) {
    mergeServerWornPaths(msg.wornPaths);
  }
}
function handleLegacyPlayers(msg) {
  const now = performance.now();
  const snapT = msg.t != null ? serverTsToClientTs(msg.t) : now;
  const seenIds = new Set;
  for (const data of msg.players ?? []) {
    const socketId = data.socket_id ?? data.socketId ?? data.id;
    if (!socketId)
      continue;
    seenIds.add(socketId);
    if (socketId === state2.socketId)
      continue;
    let player = state2.remotePlayers.get(socketId);
    if (!player) {
      player = {
        socketId,
        name: data.name ?? "unknown",
        color: data.color ?? "#888",
        x: data.x,
        y: data.y,
        facing: data.facing ?? "right",
        hopFrame: 0,
        isAway: data.isAway ?? false,
        chunkX: data.chunk_x ?? data.chunkX ?? 0,
        chunkY: data.chunk_y ?? data.chunkY ?? 0,
        snapshots: [],
        displayX: data.x,
        displayY: data.y
      };
      state2.remotePlayers.set(socketId, player);
    } else {
      player.facing = data.facing ?? player.facing;
      player.isAway = data.isAway ?? player.isAway;
      player.chunkX = data.chunk_x ?? data.chunkX ?? player.chunkX;
      player.chunkY = data.chunk_y ?? data.chunkY ?? player.chunkY;
    }
    addRemotePlayerSnapshot(player, {
      seq: 0,
      t: snapT,
      x: data.x,
      y: data.y,
      facing: data.facing ?? "right"
    });
  }
  for (const id of state2.remotePlayers.keys()) {
    if (!seenIds.has(id))
      state2.remotePlayers.delete(id);
  }
}
function handleNPCUpdate(msg) {
  const now = performance.now();
  const snapT = msg.t != null ? serverTsToClientTs(msg.t) : now;
  for (const data of msg.npcs ?? []) {
    let npc = state2.npcs.get(data.name);
    if (!npc) {
      npc = {
        name: data.name,
        x: data.x,
        y: data.y,
        facing: data.facing ?? "right",
        snapshots: [],
        displayX: data.x,
        displayY: data.y
      };
      state2.npcs.set(data.name, npc);
    } else {
      npc.facing = data.facing ?? npc.facing;
    }
    addNPCSnapshot(npc, {
      seq: 0,
      t: snapT,
      x: data.x,
      y: data.y
    });
  }
}
function onMessage(e) {
  let msg;
  try {
    const raw = e.data instanceof ArrayBuffer ? new TextDecoder().decode(e.data) : e.data;
    msg = JSON.parse(raw);
  } catch {
    console.warn("[network] failed to parse message:", e.data);
    return;
  }
  switch (msg.type) {
    case "welcome":
      handleWelcome(msg);
      break;
    case "tick":
      handleTick(msg);
      break;
    case "players":
      handleLegacyPlayers(msg);
      break;
    case "npc_update":
      handleNPCUpdate(msg);
      break;
    case "player_hop": {
      const id = msg.socket_id ?? msg.socketId;
      const p = state2.remotePlayers.get(id);
      if (p)
        p.hopFrame = 1;
      break;
    }
    default:
      break;
  }
}
function connect(worldState) {
  state2 = worldState;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))
    return;
  const params = new URLSearchParams({ name: state2.playerName, color: state2.playerColor });
  const wsBase = window.__COMMONS_WS_BASE ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const url = `${wsBase}/commons-ws?${params}`;
  console.log("[network] connecting to", url);
  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    console.log("[network] connected");
    state2.connected = true;
  };
  ws.onmessage = onMessage;
  ws.onclose = () => {
    console.log("[network] disconnected, reconnecting in", RECONNECT_DELAY_MS, "ms");
    state2.connected = false;
    ws = null;
    reconnectTimer = setTimeout(() => connect(worldState), RECONNECT_DELAY_MS);
  };
  ws.onerror = (err) => {
    console.error("[network] WS error", err);
  };
}
function loadChunk(worldState, cx, cy) {
  worldState.map = getChunk(cx, cy);
  worldState.mapChunkX = cx;
  worldState.mapChunkY = cy;
  invalidateTileCache();
}
function initNetwork(worldState) {
  connect(worldState);
  document.addEventListener("visibilitychange", () => {
    const away = document.visibilityState === "hidden";
    if (worldState.localPlayer)
      worldState.localPlayer.isAway = away;
    sendStatus(away);
  });
}

// src/entities/warthog.ts
var WARTHOG_W = 60;
var BOARD_DISTANCE = 60;
function isTextInputFocused2() {
  const el = document.activeElement;
  if (!el)
    return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
function initWarthogInput(state3) {
  window.addEventListener("keydown", (e) => {
    if (isTextInputFocused2())
      return;
    const d = state3.warthogDrive;
    switch (e.key) {
      case "e":
      case "E":
        d.ePressedOnce = true;
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        d.left = true;
        break;
      case "ArrowRight":
      case "d":
      case "D":
        d.right = true;
        break;
      case "ArrowUp":
      case "w":
      case "W":
        d.up = true;
        break;
      case "ArrowDown":
      case "s":
      case "S":
        d.down = true;
        break;
    }
  });
  window.addEventListener("keyup", (e) => {
    const d = state3.warthogDrive;
    switch (e.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        d.left = false;
        break;
      case "ArrowRight":
      case "d":
      case "D":
        d.right = false;
        break;
      case "ArrowUp":
      case "w":
      case "W":
        d.up = false;
        break;
      case "ArrowDown":
      case "s":
      case "S":
        d.down = false;
        break;
    }
  });
}
function tickWarthog(state3, sendFn) {
  const { warthog, localPlayer, warthogDrive: d } = state3;
  if (!warthog || !localPlayer)
    return;
  if (d.ePressedOnce) {
    d.ePressedOnce = false;
    const myId = localPlayer.socketId;
    const seated = warthog.seats.includes(myId);
    if (seated) {
      sendFn("warthog_leave");
    } else {
      const dx = localPlayer.x - warthog.x;
      const dy = localPlayer.y - warthog.y;
      if (Math.sqrt(dx * dx + dy * dy) < BOARD_DISTANCE) {
        sendFn("warthog_join");
      }
    }
  }
  state3.seatedInWarthog = warthog.seats.includes(localPlayer.socketId);
  if (state3.seatedInWarthog && warthog.seats[0] === localPlayer.socketId) {
    const dx = ((d.right ? 1 : 0) - (d.left ? 1 : 0)) * 10;
    const dy = ((d.down ? 1 : 0) - (d.up ? 1 : 0)) * 10;
    sendFn("warthog_input", { dx, dy });
  }
}
function drawWarthog(ctx, state3) {
  const warthog = state3.warthog;
  if (!warthog)
    return;
  const wx = Math.round(warthog.x);
  const wy = Math.round(warthog.y);
  const facing = warthog.facing;
  ctx.save();
  if (facing === "left") {
    ctx.translate(wx + WARTHOG_W, wy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(wx, wy);
  }
  ctx.fillStyle = "rgba(0,0,0,0.27)";
  ctx.fillRect(4, 28, 52, 4);
  ctx.fillStyle = "#6b7c3a";
  ctx.fillRect(8, 8, 44, 18);
  ctx.fillRect(12, 2, 36, 10);
  ctx.fillStyle = "#5a6830";
  ctx.fillRect(8, 20, 44, 6);
  ctx.fillRect(12, 2, 4, 8);
  ctx.fillRect(44, 2, 4, 8);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(4, 22, 14, 8);
  ctx.fillRect(42, 22, 14, 8);
  ctx.fillStyle = "#555";
  ctx.fillRect(7, 24, 8, 4);
  ctx.fillRect(45, 24, 8, 4);
  ctx.fillStyle = "#888";
  ctx.fillRect(10, 25, 2, 2);
  ctx.fillRect(48, 25, 2, 2);
  ctx.fillStyle = "#4a8fa8";
  ctx.fillRect(14, 4, 14, 7);
  ctx.fillStyle = "#7abfcc";
  ctx.fillRect(15, 5, 4, 2);
  ctx.fillStyle = "#7a8c42";
  ctx.fillRect(8, 10, 8, 4);
  ctx.fillStyle = "#3a3a2a";
  ctx.fillRect(10, 11, 4, 2);
  ctx.fillRect(10, 14, 4, 2);
  ctx.fillStyle = "#3a3a2a";
  ctx.fillRect(44, 4, 4, 8);
  ctx.fillRect(40, 4, 12, 3);
  ctx.fillStyle = "#555";
  ctx.fillRect(40, 5, 2, 1);
  for (let i = 0;i < warthog.seats.length; i++) {
    const seatId = warthog.seats[i];
    if (!seatId)
      continue;
    let seatColor = "#fff";
    if (state3.localPlayer && seatId === state3.localPlayer.socketId) {
      seatColor = state3.localPlayer.color;
    } else {
      const rp = state3.remotePlayers.get(seatId);
      if (rp)
        seatColor = rp.color;
    }
    const headX = 16 + i * 10;
    const headY = 3;
    ctx.fillStyle = seatColor;
    ctx.fillRect(headX, headY, 6, 6);
    ctx.fillStyle = "#000";
    ctx.fillRect(headX + 1, headY + 2, 1, 1);
    ctx.fillRect(headX + 4, headY + 2, 1, 1);
  }
  ctx.restore();
  if (state3.localPlayer && !state3.seatedInWarthog) {
    const dx = state3.localPlayer.x - warthog.x;
    const dy = state3.localPlayer.y - warthog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < BOARD_DISTANCE) {
      ctx.save();
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText("[E] board", wx + WARTHOG_W / 2 + 1, wy - 5);
      ctx.fillStyle = "#ffe97a";
      ctx.fillText("[E] board", wx + WARTHOG_W / 2, wy - 6);
      ctx.restore();
    }
  }
  if (state3.seatedInWarthog) {
    ctx.save();
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText("[E] exit", wx + WARTHOG_W / 2 + 1, wy - 5);
    ctx.fillStyle = "#f87171";
    ctx.fillText("[E] exit", wx + WARTHOG_W / 2, wy - 6);
    ctx.restore();
  }
}

// src/utils/color.ts
function lightenHex(hex, amount) {
  const h = hex.replace("#", "");
  const num = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = Math.min(255, (num >> 16 & 255) + amount);
  const g = Math.min(255, (num >> 8 & 255) + amount);
  const b = Math.min(255, (num & 255) + amount);
  return `rgb(${r},${g},${b})`;
}

// src/entities/walker.ts
var WALKER_Y = 18 * TILE + TILE / 2;
var WALKER_HIT_W = 10;
var WALKER_HIT_H = 18;
var AUDITION_BASE = "";
function pollWalkers(state3) {
  fetch(`${AUDITION_BASE}/api/audition/walkers`).then((r) => {
    if (!r.ok)
      throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then((data) => {
    state3.walkers = data;
  }).catch((err) => {
    console.warn("[walkers] fetch failed:", err.message);
  });
}
var _pollingInterval = null;
function initWalkerPolling(state3) {
  if (_pollingInterval !== null)
    return;
  pollWalkers(state3);
  _pollingInterval = setInterval(() => pollWalkers(state3), 2000);
}
var cardEl = null;
var cardWalkerId = null;
function createCard() {
  const div = document.createElement("div");
  div.id = "cv2-audition-card";
  div.style.cssText = `
    display: none;
    position: fixed;
    background: #0a0f1a;
    border: 1.5px solid #4ecca3;
    border-radius: 8px;
    padding: 12px 14px;
    font-family: 'JetBrains Mono', monospace;
    color: #e0e0ff;
    min-width: 200px;
    max-width: 280px;
    z-index: 900;
    box-shadow: 0 0 18px #4ecca322;
    pointer-events: auto;
  `;
  document.body.appendChild(div);
  return div;
}
function getCard() {
  if (!cardEl)
    cardEl = createCard();
  return cardEl;
}
function showCard(walker, canvasX, canvasY) {
  const card = getCard();
  cardWalkerId = walker.id;
  const traits = walker.traits.map((t) => `<span style="color:#4ecca3">·</span> ${t}`).join("<br>");
  card.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#4ecca3;margin-bottom:4px">${escapeHtml(walker.name)}</div>
    <div style="font-size:10px;color:#a0c8ff;margin-bottom:8px;font-style:italic">${escapeHtml(walker.title)}</div>
    <div style="font-size:10px;line-height:1.5;margin-bottom:8px">${traits}</div>
    <div style="font-size:10px;color:#b0b0cc;margin-bottom:10px;white-space:pre-wrap">${escapeHtml(walker.description)}</div>
    <div style="display:flex;gap:8px">
      <button id="cv2-walker-keep" style="
        background:#4ecca322;border:1px solid #4ecca3;color:#4ecca3;
        font-family:'JetBrains Mono',monospace;font-size:10px;
        padding:4px 12px;cursor:pointer;border-radius:3px;">Keep ✦</button>
      <button id="cv2-walker-dismiss" style="
        background:none;border:1px solid #555;color:#888;
        font-family:'JetBrains Mono',monospace;font-size:10px;
        padding:4px 12px;cursor:pointer;border-radius:3px;">Dismiss</button>
    </div>
  `;
  const margin = 12;
  const cw = 280;
  let left = canvasX + margin;
  let top = canvasY - 60;
  if (left + cw > window.innerWidth - margin)
    left = canvasX - cw - margin;
  if (top < margin)
    top = margin;
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.display = "block";
  document.getElementById("cv2-walker-keep")?.addEventListener("click", () => keepWalker(walker.id));
  document.getElementById("cv2-walker-dismiss")?.addEventListener("click", () => dismissWalker(walker.id));
}
function hideCard() {
  if (cardEl)
    cardEl.style.display = "none";
  cardWalkerId = null;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function keepWalker(id) {
  hideCard();
  fetch(`${AUDITION_BASE}/api/audition/keep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  }).then((r) => {
    if (!r.ok)
      throw new Error(`HTTP ${r.status}`);
  }).catch((err) => console.error("[walkers] keep failed:", err.message));
}
function dismissWalker(id) {
  hideCard();
  fetch(`${AUDITION_BASE}/api/audition/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  }).then((r) => {
    if (!r.ok)
      throw new Error(`HTTP ${r.status}`);
  }).catch((err) => console.error("[walkers] dismiss failed:", err.message));
}
function pauseWalker(id) {
  fetch(`${AUDITION_BASE}/api/audition/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  }).then((r) => {
    if (!r.ok)
      throw new Error(`HTTP ${r.status}`);
  }).catch((err) => console.error("[walkers] pause failed:", err.message));
}
function resumeWalker(id) {
  fetch(`${AUDITION_BASE}/api/audition/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  }).then((r) => {
    if (!r.ok)
      throw new Error(`HTTP ${r.status}`);
  }).catch((err) => console.error("[walkers] resume failed:", err.message));
}
var _hoveredId = null;
var _mouseCanvasX = -1;
var _mouseCanvasY = -1;
function updateWalkerHover(state3, canvasX, canvasY) {
  _mouseCanvasX = canvasX;
  _mouseCanvasY = canvasY;
  const prevHovered = _hoveredId;
  _hoveredId = null;
  for (const w of state3.walkers) {
    if (w.x < 0)
      continue;
    const dy = canvasY - WALKER_Y;
    const dx = canvasX - w.x;
    if (Math.abs(dx) <= WALKER_HIT_W && Math.abs(dy) <= WALKER_HIT_H) {
      _hoveredId = w.id;
      break;
    }
  }
  if (_hoveredId !== prevHovered) {
    if (prevHovered && prevHovered !== cardWalkerId) {
      resumeWalker(prevHovered);
    }
    if (_hoveredId) {
      pauseWalker(_hoveredId);
    }
  }
}
function handleWalkerClick(state3, canvasX, canvasY, clientX, clientY) {
  for (const w of state3.walkers) {
    if (w.x < 0)
      continue;
    const dy = canvasY - WALKER_Y;
    const dx = canvasX - w.x;
    if (Math.abs(dx) <= WALKER_HIT_W && Math.abs(dy) <= WALKER_HIT_H) {
      showCard(w, clientX, clientY);
      return true;
    }
  }
  return false;
}
function closeWalkerCardIfOpen() {
  if (cardWalkerId) {
    const id = cardWalkerId;
    hideCard();
    resumeWalker(id);
  }
}
function drawWalkers(ctx, walkers) {
  for (const w of walkers) {
    if (w.x < 0)
      continue;
    const wx = Math.round(w.x);
    const wy = WALKER_Y;
    const color = w.avatar_color || "#a78bfa";
    const isHovered = w.id === _hoveredId || w.id === cardWalkerId;
    ctx.save();
    if (isHovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = "rgba(0,0,0,0.27)";
    ctx.fillRect(wx - 4 + 2, wy + 12 - 2, 8, 4);
    ctx.fillStyle = color;
    ctx.fillRect(wx - 4, wy, 8, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = lightenHex(color, 30);
    ctx.fillRect(wx - 3, wy - 6, 6, 6);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(wx - 2, wy - 5, 1, 2);
    ctx.fillRect(wx + 1, wy - 5, 1, 2);
    ctx.restore();
    if (isHovered) {
      ctx.save();
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      const lines = [w.name, w.title];
      const lineH = 10;
      const pad = 4;
      const maxW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
      const bw = maxW + pad * 2;
      const bh = lineH * lines.length + pad * 2;
      const bx = wx - bw / 2;
      const by = wy - 8 - bh - 4;
      ctx.fillStyle = "rgba(10,15,26,0.88)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, by, bw, bh);
      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? color : "#c0c0e0";
        ctx.fillText(line, wx, by + pad + lineH * (i + 1) - 2);
      });
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = color + "aa";
      ctx.fillText("?", wx, wy - 10);
      ctx.restore();
    }
  }
}

// src/map/fountain-anim.ts
var ANIM_PERIOD = 40;
function drawFountainAnimation(ctx, map, frame, fountainWaterColor) {
  if (!map)
    return;
  for (let ty = 0;ty < ROWS; ty++) {
    for (let tx = 0;tx < COLS; tx++) {
      if (map[ty][tx] !== TILE_FOUNTAIN)
        continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const phase = ((tx + ty) * 7 + frame) % ANIM_PERIOD;
      const t = phase / ANIM_PERIOD;
      const rippleAlpha = 0.15 + Math.sin(t * Math.PI * 2) * 0.12;
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, rippleAlpha)})`;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      const sparkX = x + 5 + Math.round(Math.sin(t * Math.PI * 2 + tx) * 3);
      const sparkY = y + 5 + Math.round(Math.cos(t * Math.PI * 2 + ty) * 3);
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * Math.PI * 4) * 0.3})`;
      ctx.fillRect(sparkX, sparkY, 2, 2);
      ctx.restore();
    }
  }
}

// src/renderer.ts
var HOP_FRAMES2 = 12;
var PLAYER_SIZE = 12;
function getNightTint(serverTime) {
  const hour = new Date(serverTime).getUTCHours();
  if (hour >= 6 && hour < 18)
    return null;
  if (hour >= 18 && hour < 21)
    return "rgba(180,120,0,0.12)";
  if (hour >= 21 || hour < 0)
    return "rgba(0,0,60,0.20)";
  return "rgba(0,0,30,0.35)";
}
function hopOffset(hopFrame) {
  if (hopFrame <= 0)
    return 0;
  const t = hopFrame / HOP_FRAMES2;
  return Math.sin(t * Math.PI) * 14;
}
function drawPlayerBody(ctx, x, y, color, facing, hopFrame, isAway, isLocal) {
  const yOff = -hopOffset(hopFrame);
  const alpha = isAway ? 0.4 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (isAway) {
    ctx.filter = "grayscale(100%)";
  }
  ctx.fillStyle = color;
  ctx.fillRect(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2 + yOff, PLAYER_SIZE, PLAYER_SIZE);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  const eyeX = facing === "right" ? x + 3 : x - 3;
  ctx.fillRect(eyeX - 1, y - 2 + yOff, 2, 2);
  if (isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - PLAYER_SIZE / 2 - 1, y - PLAYER_SIZE / 2 - 1 + yOff, PLAYER_SIZE + 2, PLAYER_SIZE + 2);
  }
  ctx.restore();
}
function drawPlayerLabel(ctx, x, y, name, hopFrame) {
  const yOff = -hopOffset(hopFrame);
  ctx.save();
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(name, x + 1, y - PLAYER_SIZE - 2 + yOff);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, x, y - PLAYER_SIZE - 3 + yOff);
  ctx.restore();
}
function drawSpeechBubble(ctx, cx, topY, text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  const padding = 4;
  const textW = ctx.measureText(text).width;
  const bw = textW + padding * 2;
  const bh = 12;
  const bx = cx - bw / 2;
  const by = topY - bh - 6;
  ctx.fillStyle = "rgba(255,255,255,0.93)";
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  const r = 3;
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(cx + 3, by + bh);
  ctx.lineTo(cx, by + bh + 5);
  ctx.lineTo(cx - 3, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(20,20,20,0.9)";
  ctx.fillText(text, cx, by + bh - 3);
  ctx.restore();
}
function drawNPC(ctx, npc, frame, now, mouseX, mouseY) {
  const x = npc.displayX;
  const y = npc.displayY;
  const hopOff = -hopOffset(npc.hopFrame ?? 0);
  const cy_feet = y + 8 + hopOff;
  const mdx = mouseX - x;
  const mdy = mouseY - (y - 8);
  const hovered = Math.abs(mdx) < NPC_HIT_RADIUS && Math.abs(mdy) < NPC_HIT_RADIUS + 4;
  const spriteId = getSpriteId(npc.name);
  const winner = spriteId ? getWinner(npc.name) : null;
  const spriteFn = winner && spriteId ? window[`drawSprite_${spriteId}_${winner}`] ?? null : null;
  ctx.save();
  if (hovered) {
    ctx.save();
    ctx.shadowColor = "rgba(200,200,255,0.9)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(200,200,255,0.18)";
    ctx.fillRect(x - 10, y - 10 + hopOff, 20, 20);
    ctx.restore();
  }
  if (typeof spriteFn === "function") {
    if (hovered)
      ctx.filter = "brightness(1.3)";
    if (npc.facing === "left") {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    spriteFn(ctx, x, cy_feet);
  } else {
    const hash = npc.name.split("").reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 0);
    const hue = Math.abs(hash) % 360;
    const lightness = hovered ? 58 : 45;
    const color = `hsl(${hue},60%,${lightness}%)`;
    ctx.fillStyle = color;
    ctx.fillRect(x - 8, y - 8 + hopOff, 16, 16);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const eyeX = npc.facing === "right" ? x + 3 : x - 3;
    ctx.fillRect(eyeX - 1, y - 2 + hopOff, 2, 3);
  }
  ctx.restore();
  if (hovered) {
    const displayName = NPC_DISPLAY_NAMES[npc.name] ?? npc.name;
    ctx.save();
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    const tw = ctx.measureText(displayName).width;
    const lx = x;
    const ly = y - 14 + hopOff;
    ctx.fillStyle = "rgba(20,20,40,0.82)";
    ctx.beginPath();
    ctx.roundRect(lx - tw / 2 - 4, ly - 10, tw + 8, 13, 3);
    ctx.fill();
    ctx.fillStyle = "#e8e8ff";
    ctx.fillText(displayName, lx, ly);
    ctx.restore();
  }
  if (npc.blurb && npc.blurbExpiry !== undefined && npc.blurbExpiry > now) {
    const remaining = npc.blurbExpiry - now;
    const fadeMs = 1200;
    const alpha = remaining < fadeMs ? remaining / fadeMs : 1;
    const bubbleY = y - 14 + hopOff - (hovered ? 12 : 0);
    drawSpeechBubble(ctx, x, bubbleY, npc.blurb, alpha);
  }
}
function drawConnectingOverlay(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#7eb8f7";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillText("CommonsV2 — connecting...", CANVAS_W / 2, CANVAS_H / 2);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#999";
  ctx.fillText("waiting for server", CANVAS_W / 2, CANVAS_H / 2 + 24);
  ctx.restore();
}
var debugVisible = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "`" || e.key === "F3") {
      e.preventDefault();
      debugVisible = !debugVisible;
    }
  });
}
function drawHUD(ctx, state3) {
  if (!debugVisible)
    return;
  const player = state3.localPlayer;
  const totalPlayers = state3.remotePlayers.size + (state3.localPlayer ? 1 : 0);
  ctx.save();
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(4, 4, 200, 56);
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "left";
  const lines = [
    `CommonsV2 [${player ? `(${Math.round(player.x)},${Math.round(player.y)})` : "no player"}]`,
    `chunk: (${player?.chunkX ?? 0}, ${player?.chunkY ?? 0})`,
    `players: ${totalPlayers}  npcs: ${state3.npcs.size}`,
    `frame: ${state3.frame}  ${state3.connected ? "● connected" : "○ offline"}`
  ];
  lines.forEach((line, i) => ctx.fillText(line, 8, 17 + i * 12));
  ctx.restore();
}
function render(state3, ctx, frame) {
  ctx.fillStyle = "#3a5a2a";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const refTime = state3.serverTime > 0 ? state3.serverTime : Date.now();
  const season = getSeason(refTime);
  if (state3.map) {
    const tileCanvas = getOrBuildTileCache(state3.map, state3.mapChunkX, state3.mapChunkY, season);
    ctx.drawImage(tileCanvas, 0, 0);
  }
  drawWornPaths(ctx, state3.map);
  if (state3.map) {
    const tileColors = getTileColors(season);
    drawFountainAnimation(ctx, state3.map, frame, tileColors.fountainWater);
  }
  const tint = getNightTint(refTime);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  const localChunkX = state3.localPlayer?.chunkX ?? 0;
  const localChunkY = state3.localPlayer?.chunkY ?? 0;
  const warthogSeatedIds = new Set(state3.warthog?.seats.filter(Boolean) ?? []);
  for (const player of state3.remotePlayers.values()) {
    if (player.chunkX !== localChunkX || player.chunkY !== localChunkY)
      continue;
    if (warthogSeatedIds.has(player.socketId))
      continue;
    drawPlayerBody(ctx, player.displayX, player.displayY, player.color, player.facing, player.hopFrame, player.isAway, false);
    drawPlayerLabel(ctx, player.displayX, player.displayY, player.name, player.hopFrame);
  }
  const renderNow = performance.now();
  for (const npc of state3.npcs.values()) {
    drawNPC(ctx, npc, frame, renderNow, state3.mouseX, state3.mouseY);
  }
  drawWalkers(ctx, state3.walkers);
  drawWarthog(ctx, state3);
  if (state3.localPlayer && !state3.seatedInWarthog) {
    const p = state3.localPlayer;
    drawPlayerBody(ctx, p.x, p.y, p.color, p.facing, p.hopFrame, p.isAway, true);
    drawPlayerLabel(ctx, p.x, p.y, p.name, p.hopFrame);
  }
  if (localChunkX === 0 && localChunkY === 0) {
    ctx.save();
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText("CONGRESS", CONGRESS_BUILDING_COL * TILE + TILE / 2 + 1, CONGRESS_BUILDING_LABEL_ROW * TILE - 2);
    ctx.fillStyle = "#c8c8e8";
    ctx.fillText("CONGRESS", CONGRESS_BUILDING_COL * TILE + TILE / 2, CONGRESS_BUILDING_LABEL_ROW * TILE - 3);
    ctx.restore();
    if (state3.congress.active) {
      ctx.save();
      const fx = CONGRESS_BUILDING_COL * TILE;
      const fy = TILE;
      ctx.fillStyle = "#222";
      ctx.fillRect(fx, fy, 2, TILE);
      ctx.fillStyle = "#f87171";
      ctx.fillRect(fx + 2, fy, 12, 8);
      ctx.fillStyle = "#fff";
      ctx.fillRect(fx + 4, fy + 2, 2, 4);
      ctx.fillRect(fx + 8, fy + 2, 2, 4);
      ctx.fillRect(fx + 6, fy + 1, 2, 2);
      ctx.restore();
    }
  }
  drawHUD(ctx, state3);
  if (!state3.connected) {
    drawConnectingOverlay(ctx);
  }
}

// src/ui/congress-modal.ts
var CONGRESS_BUILDING_ROW_MIN = 5;
var CONGRESS_BUILDING_ROW_MAX = 7;
var _open = false;
var _lastTriggerTile = "";
var overlay2 = null;
function buildModal() {
  overlay2 = document.createElement("div");
  overlay2.id = "cv2-congress-overlay";
  overlay2.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.70);
    z-index: 1100;
    align-items: center;
    justify-content: center;
  `;
  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #0a0f1a;
    border: 2px solid #7a7aaa;
    border-radius: 10px;
    padding: 28px 32px 24px;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    color: #c8c8e8;
    max-width: 380px;
    box-shadow: 0 0 32px #7a7aaa22;
  `;
  const icon = document.createElement("div");
  icon.style.cssText = "font-size: 28px; margin-bottom: 12px;";
  icon.textContent = "⚖️";
  const title = document.createElement("div");
  title.style.cssText = "font-size: 16px; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 10px; color: #9a9abf;";
  title.textContent = "CONGRESS";
  const body = document.createElement("div");
  body.style.cssText = "font-size: 12px; color: #8888aa; line-height: 1.6; margin-bottom: 18px;";
  body.innerHTML = "The congress chamber awaits.<br>Sessions are broadcast live when in progress.";
  const link = document.createElement("a");
  link.href = "/congress";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open Congress →";
  link.style.cssText = `
    display: inline-block;
    background: #2a2050;
    border: 1px solid #7a7aaa;
    color: #9a9abf;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    padding: 7px 20px;
    border-radius: 4px;
    text-decoration: none;
    margin-bottom: 14px;
    transition: background 0.15s;
  `;
  link.addEventListener("mouseover", () => {
    link.style.background = "#4ecca322";
  });
  link.addEventListener("mouseout", () => {
    link.style.background = "#2a2050";
  });
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "Close (Esc)";
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    color: #6666aa;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  `;
  closeBtn.addEventListener("click", closeModal2);
  modal.style.position = "relative";
  modal.appendChild(closeBtn);
  modal.appendChild(icon);
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(link);
  const dismissNote = document.createElement("div");
  dismissNote.style.cssText = "font-size: 10px; color: #44445a; margin-top: 4px;";
  dismissNote.textContent = "Press Esc or click outside to dismiss";
  modal.appendChild(dismissNote);
  overlay2.appendChild(modal);
  document.body.appendChild(overlay2);
  overlay2.addEventListener("click", (e) => {
    if (e.target === overlay2)
      closeModal2();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _open) {
      e.stopPropagation();
      closeModal2();
    }
  });
}
function openModal2() {
  if (!overlay2)
    return;
  _open = true;
  overlay2.style.display = "flex";
}
function closeModal2() {
  if (!overlay2)
    return;
  _open = false;
  overlay2.style.display = "none";
  _lastTriggerTile = "";
}
function initCongressModal() {
  buildModal();
}
function tickCongressModal(state3) {
  const player = state3.localPlayer;
  if (!player)
    return;
  if (state3.localPlayer.chunkX !== 0 || state3.localPlayer.chunkY !== 0)
    return;
  const tileX = Math.floor(player.x / TILE);
  const tileY = Math.floor(player.y / TILE);
  const inDoorway = tileX === CONGRESS_BUILDING_COL && tileY >= CONGRESS_BUILDING_ROW_MIN && tileY <= CONGRESS_BUILDING_ROW_MAX;
  if (inDoorway) {
    const key = `${tileX},${tileY}`;
    if (!_open && key !== _lastTriggerTile) {
      _lastTriggerTile = key;
      openModal2();
    }
  }
}

// src/main.ts
var canvas = document.getElementById("game-canvas");
var ctx = canvas.getContext("2d");
var state3 = createWorldState();
initInput();
initChatModal();
initCongressModal();
initWarthogInput(state3);
initWalkerPolling(state3);
var DRAG_THRESHOLD_MS = 250;
var mousedownAt = 0;
var mousedownNPC = null;
var draggingNPC = null;
var dragOffsetX = 0;
var dragOffsetY = 0;
function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * scaleX,
    my: (e.clientY - rect.top) * scaleY
  };
}
function npcAtPoint(mx, my) {
  for (const npc of state3.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      return npc.name;
    }
  }
  return null;
}
canvas.addEventListener("mousedown", (e) => {
  const { mx, my } = canvasCoords(e);
  const hit = npcAtPoint(mx, my);
  if (hit) {
    mousedownAt = performance.now();
    mousedownNPC = hit;
    e.preventDefault();
  }
});
canvas.addEventListener("mousemove", (e) => {
  const { mx, my } = canvasCoords(e);
  state3.mouseX = mx;
  state3.mouseY = my;
  if (mousedownNPC && !draggingNPC && performance.now() - mousedownAt > DRAG_THRESHOLD_MS) {
    const npc = state3.npcs.get(mousedownNPC);
    if (npc) {
      draggingNPC = mousedownNPC;
      dragOffsetX = npc.displayX - mx;
      dragOffsetY = npc.displayY - my;
    }
    mousedownNPC = null;
  }
  if (draggingNPC) {
    const npc = state3.npcs.get(draggingNPC);
    if (npc) {
      npc.displayX = mx + dragOffsetX;
      npc.displayY = my + dragOffsetY;
    }
    canvas.style.cursor = "grabbing";
    return;
  }
  updateWalkerHover(state3, mx, my);
  let overNPC = false;
  for (const npc of state3.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      overNPC = true;
      break;
    }
  }
  canvas.style.cursor = overNPC ? "pointer" : "default";
});
canvas.addEventListener("mouseup", (e) => {
  const { mx, my } = canvasCoords(e);
  if (draggingNPC) {
    draggingNPC = null;
    canvas.style.cursor = "default";
    return;
  }
  if (mousedownNPC) {
    checkNPCClick(state3, mx, my);
    mousedownNPC = null;
  }
});
canvas.addEventListener("click", (e) => {
  if (draggingNPC)
    return;
  const { mx, my } = canvasCoords(e);
  handleWalkerClick(state3, mx, my, e.clientX, e.clientY);
});
canvas.addEventListener("mouseleave", () => {
  state3.mouseX = -1;
  state3.mouseY = -1;
  if (!draggingNPC)
    canvas.style.cursor = "default";
  closeWalkerCardIfOpen();
});
var lastFrameTime = performance.now();
var lastMoveSeq = -1;
var lastMoveSent = 0;
var MOVE_SEND_INTERVAL_MS = 50;
var lastWornTileX = -1;
var lastWornTileY = -1;
function loop(now) {
  const dtMs = now - lastFrameTime;
  lastFrameTime = now;
  const dt = dtMs / 1000;
  state3.frame++;
  const input = getInput();
  const { dx, dy, chunkChanged, moved } = state3.seatedInWarthog ? { dx: 0, dy: 0, chunkChanged: false, moved: false } : tickLocalPlayer(state3, input, dt);
  if (moved && state3.localPlayer && state3.localPlayer.inputSeq !== lastMoveSeq) {
    if (now - lastMoveSent >= MOVE_SEND_INTERVAL_MS) {
      lastMoveSeq = state3.localPlayer.inputSeq;
      lastMoveSent = now;
      sendMove(state3, dx, dy);
    }
  }
  if (state3.localPlayer && state3.map) {
    const tileX = Math.floor(state3.localPlayer.x / TILE);
    const tileY = Math.floor(state3.localPlayer.y / TILE);
    if (tileX !== lastWornTileX || tileY !== lastWornTileY) {
      lastWornTileX = tileX;
      lastWornTileY = tileY;
      recordTileVisit(tileX, tileY);
      sendWornPath(state3.localPlayer.chunkX, state3.localPlayer.chunkY, tileX, tileY);
    }
  }
  if (chunkChanged && state3.localPlayer) {
    const { chunkX, chunkY } = state3.localPlayer;
    sendChunk(chunkX, chunkY);
    state3.map = getChunk(chunkX, chunkY);
    state3.mapChunkX = chunkX;
    state3.mapChunkY = chunkY;
    invalidateTileCache();
    lastWornTileX = -1;
    lastWornTileY = -1;
  }
  tickRemotePlayers(state3.remotePlayers, now);
  tickNPCs(state3.npcs, now);
  tickWarthog(state3, (type, payload) => sendWarthog(type, payload));
  tickCongressModal(state3);
  render(state3, ctx, state3.frame);
  requestAnimationFrame(loop);
}
async function fetchAndConnect() {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const data = await res.json();
      const name = data?.username ?? data?.login ?? data?.name ?? null;
      if (name) {
        state3.playerName = name;
      }
      if (data?.color) {
        state3.playerColor = data.color;
      }
    }
  } catch {}
  initNetwork(state3);
  requestAnimationFrame(loop);
}
fetchAndConnect();
var IDLE_THRESHOLD_MS = 60000;
setInterval(() => {
  if (!state3.localPlayer)
    return;
  const idle = Date.now() - getLastInputAt() > IDLE_THRESHOLD_MS;
  if (idle !== state3.localPlayer.isAway) {
    state3.localPlayer.isAway = idle;
    sendStatus(idle);
  }
}, 5000);
setTimeout(() => {
  validateSprites();
}, 2000);
