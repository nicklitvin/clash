'use strict';
/* =====================================================================
   CLASH: a single-player, defense-only village game.
   Day: build and upgrade. Night: a wave attacks. Survive as many nights
   as you can. Everything in the world is drawn on a low-resolution
   canvas with integer rectangles, then scaled up, so it stays 8-bit.
   ===================================================================== */

// ---------- config ----------
const GRID = 30;          // buildable tiles per side
const MARGIN = 4;         // grass ring outside the grid where enemies arrive
const N = GRID + MARGIN * 2;
const SAVE_KEY = 'clash-save-v1';
const BEST_KEY = 'clash-best-v1';

// costs are [gold, elixir, days] to reach each level (index 0 = level 1)
const TYPES = {
  townhall: { name: 'Town Hall', size: 4, cat: 'other', max: 5,
    hp: [2200, 3000, 4000, 5200, 6600],
    cost: [null, [1000, 0, 1], [4000, 0, 2], [12000, 0, 2], [30000, 0, 3]],
    cap: [2000, 4000, 8000, 15000, 25000],
    desc: 'The heart of your village. Upgrade it to unlock more buildings. If it falls, the village is lost.' },
  cannon: { name: 'Cannon', size: 3, cat: 'defense', max: 4,
    hp: [450, 560, 680, 820], dmg: [12, 16, 21, 27], rate: 0.8, range: 8.5, ground: true, air: false,
    cost: [[250, 0, 1], [1000, 0, 1], [3000, 0, 1], [8000, 0, 2]],
    desc: 'Fires heavy shots at ground troops. Cannot hit dragons.' },
  archer: { name: 'Archer Tower', size: 3, cat: 'defense', max: 4,
    hp: [400, 480, 580, 700], dmg: [8, 11, 14, 18], rate: 0.55, range: 10, ground: true, air: true,
    cost: [[0, 1000, 1], [0, 2000, 1], [0, 5000, 2], [0, 10000, 2]],
    desc: 'Long range. Shoots ground troops and dragons.' },
  mortar: { name: 'Mortar', size: 3, cat: 'defense', max: 3,
    hp: [400, 480, 580], dmg: [22, 30, 40], rate: 4.5, range: 11, minRange: 4, splash: 1.6, ground: true, air: false,
    cost: [[4000, 0, 1], [8000, 0, 2], [16000, 0, 3]],
    desc: 'Lobs exploding shells that hit groups. Has a blind spot up close.' },
  airdef: { name: 'Air Defense', size: 3, cat: 'defense', max: 3,
    hp: [600, 700, 820], dmg: [60, 85, 115], rate: 1, range: 10, ground: false, air: true,
    cost: [[0, 6000, 2], [0, 12000, 2], [0, 24000, 3]],
    desc: 'Rockets that shred dragons. Ignores ground troops.' },
  wall: { name: 'Wall', size: 1, cat: 'wall', max: 4,
    hp: [300, 550, 900, 1400],
    cost: [[50, 0, 0], [250, 0, 0], [1000, 0, 0], [2500, 0, 0]],
    desc: 'Slows attackers down. Wall Breakers love them.' },
  goldmine: { name: 'Gold Mine', size: 3, cat: 'resource', res: 'gold', max: 4,
    hp: [400, 480, 560, 640], prod: [450, 750, 1100, 1500],
    cost: [[0, 150, 1], [0, 500, 1], [0, 1500, 1], [0, 4000, 2]],
    desc: 'Digs up gold every night it is working.' },
  elixir: { name: 'Elixir Collector', size: 3, cat: 'resource', res: 'elixir', max: 4,
    hp: [400, 480, 560, 640], prod: [450, 750, 1100, 1500],
    cost: [[150, 0, 1], [500, 0, 1], [1500, 0, 1], [4000, 0, 2]],
    desc: 'Pumps elixir every night it is working.' },
  goldstore: { name: 'Gold Storage', size: 3, cat: 'resource', res: 'gold', max: 4,
    hp: [600, 800, 1000, 1300], store: [1500, 3500, 7000, 15000],
    cost: [[0, 300, 1], [0, 1200, 1], [0, 3500, 1], [0, 8000, 2]],
    desc: 'Holds gold once the Town Hall is full. Goblins go straight for it.' },
  elixstore: { name: 'Elixir Storage', size: 3, cat: 'resource', res: 'elixir', max: 4,
    hp: [600, 800, 1000, 1300], store: [1500, 3500, 7000, 15000],
    cost: [[300, 0, 1], [1200, 0, 1], [3500, 0, 1], [8000, 0, 2]],
    desc: 'Holds elixir once the Town Hall is full. Goblins go straight for it.' },
  builder: { name: "Builder's Hut", size: 2, cat: 'other', max: 1,
    hp: [250], cost: [[1000, 0, 1]],
    desc: 'Each hut gives you one builder. Builders work on one project at a time.' },
  spellfactory: { name: 'Spell Factory', size: 3, cat: 'special', max: 3,
    hp: [900, 1050, 1200], slots: [2, 3, 4],
    cost: [[0, 12000, 2], [0, 24000, 3], [0, 40000, 3]],
    desc: 'Brews spells during the day. Cast them at night to protect your village. Unlocks at Town Hall 4.' },
};
// how many of each a Town Hall level allows (index = TH level - 1)
const LIMITS = {
  cannon: [2, 2, 3, 4, 5], archer: [2, 2, 3, 4, 5], mortar: [0, 1, 1, 2, 3], airdef: [0, 0, 1, 1, 2],
  wall: [25, 50, 75, 100, 125], goldmine: [2, 3, 4, 5, 6], elixir: [2, 3, 4, 5, 6],
  goldstore: [1, 1, 2, 2, 3], elixstore: [1, 1, 2, 2, 3], builder: [3, 3, 4, 4, 5], townhall: [1, 1, 1, 1, 1],
  spellfactory: [0, 0, 0, 1, 1],
};
const BUILDER_COSTS = [0, 0, 1000, 3000, 6000]; // price of hut #1..#5
const SHOP_TABS = [
  ['defense', 'DEFENSE', ['cannon', 'archer', 'mortar', 'airdef', 'wall']],
  ['resource', 'RESOURCES', ['goldmine', 'elixir', 'goldstore', 'elixstore', 'builder']],
  ['special', 'ADVANCED', ['spellfactory']],
];

const UNITS = {
  barbarian: { name: 'Barbarian', hp: 45, dmg: 8, rate: 1, range: 0.6, speed: 1.6, space: 1, sprite: 'barb' },
  archer: { name: 'Archer', hp: 22, dmg: 7, rate: 1, range: 3.4, speed: 1.8, space: 1, sprite: 'arch', ranged: true },
  goblin: { name: 'Goblin', hp: 28, dmg: 11, rate: 1, range: 0.6, speed: 2.6, space: 1, sprite: 'gob', pref: 'resource' },
  giant: { name: 'Giant', hp: 330, dmg: 14, rate: 1.6, range: 0.8, speed: 1.0, space: 5, sprite: 'giant', pref: 'defense' },
  breaker: { name: 'Wall Breaker', hp: 22, dmg: 650, rate: 1, range: 0.5, speed: 2.4, space: 2, sprite: 'wb', pref: 'wall', bomb: true },
  dragon: { name: 'Dragon', hp: 1000, dmg: 55, rate: 1.4, range: 2.4, speed: 1.15, space: 20, sprite: 'drag', air: true, splash: 1.1 },
};

// ---------- version and patch notes (newest first) ----------
const GAME_VERSION = '0.5.0';
const PATCH_NOTES = [
  { v: '0.5.0', date: 'Nov 6, 2026', notes: [
    'A cuter look: bigger tiles, soft colours, grass with flowers, puffy trees and a forest around the map.',
    'Buildings redrawn as little houses with big roofs, and raiders are now cute chibi characters.',
    'Lighter, friendlier menus and panels.',
    'Zoom out much further with the mouse wheel, a pinch or the + and - keys. The zoom buttons are gone.',
    'No more bonus resources after a night. Only your mines and collectors earn.',
    'The Town Hall now stores resources first; anything over its limit is split across your storages.',
    'Tap the Town Hall or a storage to see exactly how much it holds. Storages fill up visibly as they get fuller.',
    'Goblins can only steal what the building they hit is actually holding.',
  ] },
  { v: '0.4.0', date: 'Nov 2, 2026', notes: [
    'Day and night swapped: build by day, fight by night. Night is dark so you always know which is which.',
    'After each night, a summary shows what your Gold Mines and Elixir Collectors earned before the next day starts.',
    'Buildings are now drawn from the side instead of from above.',
    'New font: easier to read, same pixel style.',
    'Everything except walls takes at least a day to build and needs a free builder.',
    'Walls: tap or drag to lay many at once, then confirm to buy them all together.',
    'A tip bar at the bottom shows what you are placing, its price and how to place it.',
    'Zoom in and out with the + and - buttons, the mouse wheel or a pinch.',
    'Spells are now brewed by day at the new Spell Factory (Town Hall 4), then cast at night.',
    'Smaller building panel and corner buttons, so they no longer cover the village.',
    'Version numbers now start at 0.',
  ] },
  { v: '0.3.0', date: 'Nov 2, 2026', notes: [
    'Flat 2D look with no shading, shadows or raised buttons.',
    'Tap any building to see its health, stats and what the next level gives.',
    'New: Repair and Repair All. Damage stays after a raid until you repair it.',
    'Fixed: buttons in the building panel could ignore taps during a raid.',
    'Removed the sound button and the pause menu.',
  ] },
  { v: '0.2.0', date: 'Nov 2, 2026', notes: [
    'The game is now 2D, seen straight from above.',
    'New: Lightning, Freeze and Heal spells during raids.',
    'No more star rating after a raid.',
    'The run ends the moment your Town Hall is destroyed.',
    'Tap the version number to read these notes.',
  ] },
  { v: '0.1.0', date: 'Oct 2026', notes: [
    'First release: build your village and survive a raid every round.',
    'Cannons, Archer Towers, Mortars, Air Defenses and Walls.',
    'Barbarians, Archers, Goblins, Giants, Wall Breakers and Dragons.',
  ] },
];

// ---------- spells: brewed by day at the Spell Factory, cast at night ----------
// cost is elixir to brew one; lvl is the Spell Factory level that unlocks it
const SPELLS = {
  lightning: { name: 'Lightning', icon: 'bolt', cost: 1200, lvl: 1, cd: 1.5, radius: 2, color: '#a8e0ff',
    dmg: () => 90 + (thLevel() - 1) * 45, desc: 'Strikes every raider in the area.' },
  heal: { name: 'Heal', icon: 'heart', cost: 1500, lvl: 1, cd: 1.5, radius: 3, color: '#6fe03a',
    desc: 'Restores 40% health to standing buildings in the area.' },
  freeze: { name: 'Freeze', icon: 'snow', cost: 2000, lvl: 2, cd: 1.5, radius: 2.5, color: '#7cd8f8', dur: 4,
    desc: 'Raiders in the area stop moving and attacking for 4 seconds.' },
};

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const T = 16;              // pixels per tile on the low-res canvas

// ---------- state ----------
let S = null;            // persistent village state
let units = [], shots = [], fx = [], texts = [], spawnQueue = [], flags = [];
let raidTime = 0, raidStats = null, speed = 1;
let buildTimer = 0;
let selectedId = null, placing = null;  // placing: {type, x, y, moveId, ok}
let fieldCache = new Map(), fieldVersion = 0;
let blocked = new Int32Array(N * N);   // 0 free, building id otherwise
let spellArmed = null, hover = null, spellCd = { lightning: 0, freeze: 0, heal: 0 };

function newGame() {
  S = { day: 1, phase: 'build', gold: 1000, elixir: 1000, nextId: 1, buildings: [], over: false, spells: { lightning: 0, heal: 0, freeze: 0 } };
  add('townhall', 13, 13, 1);
  add('cannon', 9, 14, 1);
  add('archer', 18, 11, 1);
  add('goldmine', 13, 8, 1);
  add('elixir', 8, 9, 1);
  add('builder', 19, 18, 1);
  add('builder', 9, 19, 1);
  for (let i = 0; i < 6; i++) add('wall', 12 + i, 18, 1);
  save();
}
function add(type, x, y, lvl, cons) {
  const b = { id: S.nextId++, type, x, y, lvl, hp: 0, destroyed: false, cons: cons || null, angle: 0.6, cd: 0 };
  b.hp = maxHp(b);
  S.buildings.push(b);
  return b;
}
const def = (b) => TYPES[b.type];
function maxHp(b) { const t = def(b); return t.hp[Math.max(0, b.lvl - 1)]; }
const thLevel = () => (S.buildings.find((b) => b.type === 'townhall') || { lvl: 1 }).lvl;
const active = (b) => b.lvl >= 1 && !b.cons && !b.destroyed;
const countOf = (type) => S.buildings.filter((b) => b.type === type).length;
const limitOf = (type) => LIMITS[type][thLevel() - 1];
function levelCap(type) {
  if (type === 'townhall') return TYPES.townhall.max;
  if (type === 'wall') return Math.min(TYPES.wall.max, thLevel());
  return Math.min(TYPES[type].max, thLevel() + 1);
}
function builders() {
  const total = S.buildings.filter((b) => b.type === 'builder' && b.lvl >= 1).length;
  const busy = S.buildings.filter((b) => b.cons).length;
  return { total, busy, free: total - busy };
}
function capOf(res) {
  let cap = TYPES.townhall.cap[thLevel() - 1];
  for (const b of S.buildings) {
    if (b.lvl < 1) continue;
    if ((res === 'gold' && b.type === 'goldstore') || (res === 'elixir' && b.type === 'elixstore')) cap += def(b).store[b.lvl - 1];
  }
  return cap;
}
// Where resources live: the Town Hall fills first, the rest is split evenly across that resource's storages
// (a storage that is full passes its share on to the others).
function storageSplit(res) {
  const total = S[res], thCap = TYPES.townhall.cap[thLevel() - 1];
  const out = new Map([['th', Math.min(total, thCap)]]);
  let rest = total - out.get('th');
  const kind = res === 'gold' ? 'goldstore' : 'elixstore';
  const stores = S.buildings.filter((b) => b.type === kind && b.lvl >= 1).sort((a, b) => def(a).store[a.lvl - 1] - def(b).store[b.lvl - 1]);
  stores.forEach((b, i) => { const give = Math.min(def(b).store[b.lvl - 1], rest / (stores.length - i)); out.set(b.id, give); rest -= give; });
  return out;
}
function storedIn(b, res) {
  if (b.type === 'townhall') return storageSplit(res).get('th');
  if ((b.type === 'goldstore' && res === 'gold') || (b.type === 'elixstore' && res === 'elixir')) return storageSplit(res).get(b.id) || 0;
  return 0;
}
function storedFrac(b) {
  if (!b.id || !S) return 0.6;   // shop pictures
  const res = b.type === 'goldstore' ? 'gold' : 'elixir';
  return b.lvl >= 1 ? clamp(storedIn(b, res) / def(b).store[b.lvl - 1], 0, 1) : 0;
}
function gain(res, amount) { S[res] = clamp(S[res] + amount, 0, capOf(res)); }
function priceOf(type, lvl) {
  if (type === 'builder') return [BUILDER_COSTS[countOf('builder')] ?? 99999, 0, 1];
  return TYPES[type].cost[lvl - 1];
}
function canAfford(p) { return S.gold >= p[0] && S.elixir >= p[1]; }

function save() {
  if (!S) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.buildings) || s.over) return false;
    s.phase = 'build';   // saves are only made while building (older saves called it 'night')
    s.spells = Object.assign({ lightning: 0, heal: 0, freeze: 0 }, s.spells || {});
    S = s;
    return true;
  } catch (e) { return false; }
}
function bestDay() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
function setBest(d) { try { if (d > bestDay()) localStorage.setItem(BEST_KEY, String(d)); } catch (e) { /* ignore */ } }

// ---------- grid occupancy ----------
const cellIndex = (x, y) => (y + MARGIN) * N + (x + MARGIN);
const inField = (x, y) => x >= -MARGIN && y >= -MARGIN && x < GRID + MARGIN && y < GRID + MARGIN;
function rebuildBlocked() {
  blocked.fill(0);
  for (const b of S.buildings) {
    if (b.destroyed) continue;
    const s = def(b).size;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) blocked[cellIndex(b.x + dx, b.y + dy)] = b.id;
  }
  fieldVersion++;
  fieldCache.clear();
}
const byId = (id) => S.buildings.find((b) => b.id === id);
function fits(type, x, y, ignoreId) {
  const s = TYPES[type].size;
  if (x < 0 || y < 0 || x + s > GRID || y + s > GRID) return false;
  for (const b of S.buildings) {
    if (b.id === ignoreId) continue;
    const t = def(b).size;
    if (x < b.x + t && x + s > b.x && y < b.y + t && y + s > b.y) return false;
  }
  return true;
}

// ---------- pathfinding: one distance field per (target, range) ----------
function distToRect(px, py, b) {
  const s = def(b).size;
  const dx = Math.max(b.x - px, 0, px - (b.x + s));
  const dy = Math.max(b.y - py, 0, py - (b.y + s));
  return Math.hypot(dx, dy);
}
const WALL_COST = 9;
function getField(b, range) {
  const key = b.id + ':' + range;
  const hit = fieldCache.get(key);
  if (hit) return hit;
  const dist = new Float32Array(N * N).fill(Infinity);
  const heap = [];
  const push = (i, d) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  // goals: free cells within attack range of the target's footprint
  for (let y = -MARGIN; y < GRID + MARGIN; y++) for (let x = -MARGIN; x < GRID + MARGIN; x++) {
    const i = cellIndex(x, y);
    if (blocked[i]) continue;
    if (distToRect(x + 0.5, y + 0.5, b) <= range + 0.45) { dist[i] = 0; push(i, 0); }
  }
  const cost = (i) => {
    const id = blocked[i];
    if (!id) return 1;
    const o = byId(id);
    return o && o.type === 'wall' ? WALL_COST : Infinity;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = (i % N) - MARGIN, y = Math.floor(i / N) - MARGIN;
    // cost to step from neighbour n into i is paid by n (we search backwards from the goals)
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (!inField(nx, ny)) continue;
      const n = cellIndex(nx, ny);
      if (blocked[n] && cost(n) === Infinity) continue;
      if (ox && oy && (blocked[cellIndex(x + ox, y)] || blocked[cellIndex(x, y + oy)])) continue;
      const step = (ox && oy ? 1.414 : 1) * cost(i);
      if (step === Infinity) continue;
      const nd = d + step;
      if (nd < dist[n]) { dist[n] = nd; push(n, nd); }
    }
  }
  const f = { dist };
  fieldCache.set(key, f);
  return f;
}

// ---------- waves ----------
function waveFor(day) {
  let budget = Math.round(2 + day * 1.5 + day * day * 0.2);
  const hasWalls = S.buildings.some((b) => b.type === 'wall');
  const pool = [['barbarian', 6]];
  if (day >= 2) pool.push(['archer', 5]);
  if (day >= 3) pool.push(['goblin', 3]);
  if (day >= 5) pool.push(['giant', 3]);
  if (day >= 5 && hasWalls) pool.push(['breaker', 2]);
  const list = [];
  // boss days bring dragons
  if (day >= 8 && day % 3 === 2) {
    const dragons = Math.min(4, 1 + Math.floor((day - 8) / 6));
    for (let i = 0; i < dragons; i++) { list.push('dragon'); budget -= 14; }
  }
  const total = pool.reduce((a, p) => a + p[1], 0);
  let guard = 400;
  while (budget > 0 && guard--) {
    let r = Math.random() * total, type = pool[0][0];
    for (const [t, w] of pool) { if ((r -= w) <= 0) { type = t; break; } }
    const sp = UNITS[type].space;
    if (sp > budget && budget >= 1) { list.push('barbarian'); budget -= 1; continue; }
    list.push(type); budget -= sp;
  }
  return list;
}
function edgePoint() {
  const side = Math.floor(Math.random() * 4), t = rnd(2, GRID - 2), o = -MARGIN + 1.5;
  if (side === 0) return { x: t, y: o };
  if (side === 1) return { x: GRID - o, y: t };
  if (side === 2) return { x: t, y: GRID - o };
  return { x: o, y: t };
}

// ---------- day / night ----------
function startRaid() {
  if (S.phase !== 'build' || placing) return;
  deselect();
  S.phase = 'raid';
  units = []; shots = []; fx = []; texts = []; spawnQueue = []; flags = [];
  raidTime = 0;
  spellArmed = null; for (const k in spellCd) spellCd[k] = 0;
  raidStats = { stolenGold: 0, stolenElixir: 0, kills: 0, total: 0, startCount: S.buildings.filter((b) => b.type !== 'wall').length };
  rebuildBlocked();
  const list = waveFor(S.day);
  raidStats.total = list.length;
  const groups = clamp(1 + Math.floor(S.day / 4), 1, 3);
  const points = Array.from({ length: groups }, edgePoint);
  flags = points.map((p) => ({ ...p }));
  list.forEach((type, i) => {
    const g = i % groups, p = points[g];
    spawnQueue.push({ type, at: 2 + Math.floor(i / groups) * 0.8 + g * 2.5 + rnd(0, 0.3), x: p.x + rnd(-1.2, 1.2), y: p.y + rnd(-1.2, 1.2) });
  });
  spawnQueue.sort((a, b) => a.at - b.at);
  sfx('horn');
  banner(`NIGHT ${S.day}`, 'Defend your village!', 'night');
  refreshUI();
}
function spawnUnit(q) {
  const d = UNITS[q.type];
  const hpMul = 1 + Math.max(0, S.day - 8) * 0.06;
  units.push({ type: q.type, d, x: q.x, y: q.y, hp: d.hp * hpMul, maxhp: d.hp * hpMul, target: null, wall: null,
    next: null, cd: rnd(0, 0.4), dir: 1, walk: Math.random() * 6, flash: 0, ox: rnd(-0.25, 0.25), oy: rnd(-0.25, 0.25), z: d.air ? 10 : 0 });
}
function endRaid(victory) {
  if (S.phase !== 'raid') return;
  spellArmed = null;
  canvas.classList.remove('aiming');
  if (!victory) {
    // the Town Hall fell: the run is over, right now
    S.phase = 'lost';
    S.over = true;
    setBest(S.day - 1);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    sfx('lose');
    showGameOver(S.day - 1);
    refreshUI();
    return;
  }
  // survived: after a short beat, show what the mines and collectors earned, then the player starts the day
  S.phase = 'won';
  setBest(S.day);
  sfx('win');
  buildTimer = 1.2;
  refreshUI();
}
function nightIncome() {
  const r = { mines: 0, mineGold: 0, pumps: 0, pumpElixir: 0, idle: 0 };
  for (const b of S.buildings) {
    if (!def(b).prod) continue;
    if (!active(b)) { r.idle++; continue; }
    const amount = def(b).prod[b.lvl - 1];
    if (def(b).res === 'gold') { r.mines++; r.mineGold += amount; } else { r.pumps++; r.pumpElixir += amount; }
  }
  return r;
}
function showNightSummary() {
  $('banner').hidden = true; clearTimeout(toastTimer); $('toast').classList.remove('show');
  const r = nightIncome();
  const before = { g: S.gold, e: S.elixir };
  gain('gold', r.mineGold); gain('elixir', r.pumpElixir);
  const gotG = S.gold - before.g, gotE = S.elixir - before.e;
  const lostG = r.mineGold - gotG, lostE = r.pumpElixir - gotE;
  const stolen = raidStats.stolenGold + raidStats.stolenElixir;
  const hurt = damaged().length;
  const row = (ico, label, val, cls) => `<div class="sum-row ${cls || ''}"><span data-ico="${ico}" data-px="18"></span><span class="sum-label">${label}</span><b>${val}</b></div>`;
  popup(`NIGHT ${S.day} SURVIVED`, `
    <p>You held off ${raidStats.total} raiders. Here is what your village earned:</p>
    <div class="summary">
      ${row('gold', `Gold Mines (${r.mines})`, '+' + fmt(r.mineGold))}
      ${row('elixir', `Elixir Collectors (${r.pumps})`, '+' + fmt(r.pumpElixir))}
      ${stolen ? row('sword', 'Goblins stole', '-' + fmt(stolen), 'bad') : ''}
      ${lostG + lostE > 0 ? row('clock', 'Storage full, lost', fmt(lostG + lostE), 'bad') : ''}
      ${r.idle ? `<div class="sum-note">${r.idle} mine${r.idle > 1 ? 's or collectors were' : ' or collector was'} broken or upgrading and earned nothing.</div>` : ''}
      ${hurt ? `<div class="sum-note">${hurt} building${hurt > 1 ? 's need' : ' needs'} repair.</div>` : ''}
    </div>`, [[`START DAY ${S.day + 1}`, 'go', () => { closeModal(); startBuild(); }]]);
}
function startBuild() {
  S.day++;
  S.phase = 'build';
  units = []; shots = []; texts = []; spawnQueue = []; flags = [];
  const done = [];
  for (const b of S.buildings) {
    if (b.cons) {
      b.cons.days -= 1;
      // a finished project comes back brand new
      if (b.cons.days <= 0) { b.lvl = b.cons.to; b.cons = null; b.destroyed = false; b.hp = maxHp(b); done.push(b); }
    }
    b.hp = Math.min(b.hp, maxHp(b));
    b.cd = 0; b.flash = 0; b.target = null;
  }
  rebuildBlocked();
  save();
  refreshUI();
  banner(`DAY ${S.day}`, 'Build and upgrade', 'day');
  if (done.length) toast(done.length === 1 ? `${def(done[0]).name} is ready! (level ${done[0].lvl})` : `${done.length} projects finished!`, 3000);
}

// ---------- simulation ----------
function step(dt) {
  if (S.phase === 'won') {
    updateFx(dt);
    if (buildTimer > 0) { buildTimer -= dt; if (buildTimer <= 0) showNightSummary(); }
    return;
  }
  if (S.phase !== 'raid') { updateFx(dt); return; }
  raidTime += dt;
  for (const k in spellCd) spellCd[k] = Math.max(0, spellCd[k] - dt);
  while (spawnQueue.length && spawnQueue[0].at <= raidTime) spawnUnit(spawnQueue.shift());
  for (const b of S.buildings) if (active(b) && def(b).cat === 'defense') updateDefense(b, dt);
  for (const u of units) updateUnit(u, dt);
  if (S.phase !== 'raid') return;   // the Town Hall fell during this step
  units = units.filter((u) => u.hp > 0);
  updateShots(dt);
  updateFx(dt);
  if (S.phase !== 'raid') return;
  if (!spawnQueue.length && !units.length && raidTime > 3) endRaid(true);
}

function hurtBuilding(b, dmg, attacker) {
  if (b.destroyed) return;
  b.hp -= dmg;
  b.flash = 0.12;
  if (attacker && attacker.type === 'goblin') steal(b, dmg);
  if (b.hp <= 0) {
    b.hp = 0; b.destroyed = true;
    const s = def(b).size, c = center(b);
    burst(c.x, c.y, 8 + s * 6, ['#5f5f75', '#8f8fa3', '#3a2a18', '#f8a830']);
    fx.push({ kind: 'boom', x: c.x, y: c.y, r: s * 0.9, t: 0, life: 0.45 });
    sfx(b.type === 'wall' ? 'hit' : 'boom');
    rebuildBlocked();
    if (b.type === 'townhall') endRaid(false);
  }
}
function steal(b, dmg) {
  const t = def(b);
  const take = (res) => {
    const amount = Math.min(Math.floor(storedIn(b, res)), Math.round(dmg * 1.6));   // only what this building holds
    if (amount <= 0) return;
    S[res] -= amount;
    if (res === 'gold') raidStats.stolenGold += amount; else raidStats.stolenElixir += amount;
    const c = center(b);
    floatText(c.x, c.y, '-' + amount, res === 'gold' ? '#f8c830' : '#e04ce8');
  };
  if (b.type === 'townhall') { take('gold'); take('elixir'); }
  else if (t.cat === 'resource') take(t.res);
}
function center(b) { const s = def(b).size; return { x: b.x + s / 2, y: b.y + s / 2 }; }

function chooseTarget(u) {
  const alive = S.buildings.filter((b) => !b.destroyed);
  const nonWall = alive.filter((b) => b.type !== 'wall');
  let pool = nonWall;
  if (u.d.pref === 'resource') {
    const r = nonWall.filter((b) => def(b).cat === 'resource' || b.type === 'townhall');
    if (r.length) pool = r;
  } else if (u.d.pref === 'defense') {
    const r = nonWall.filter((b) => def(b).cat === 'defense');
    if (r.length) pool = r;
  } else if (u.d.pref === 'wall') {
    const r = alive.filter((b) => b.type === 'wall');
    if (r.length) pool = r;
  }
  let best = null, bd = Infinity;
  for (const b of pool) { const d = distToRect(u.x, u.y, b); if (d < bd) { bd = d; best = b; } }
  return best;
}

function updateUnit(u, dt) {
  u.flash = Math.max(0, u.flash - dt);
  if (S.phase !== 'raid') return;
  if (u.frozen > 0) { u.frozen -= dt; return; }
  u.cd -= dt;
  if (!u.target || u.target.destroyed) { u.target = chooseTarget(u); u.next = null; u.wall = null; }
  if (!u.target) return;
  const d = u.d;
  // breaking through a wall that stands in the way
  if (u.wall) {
    if (u.wall.destroyed) { u.wall = null; u.next = null; }
    else { attack(u, u.wall); return; }
  }
  const range = d.range;
  if (distToRect(u.x, u.y, u.target) <= range + 0.15) { attack(u, u.target); return; }
  let tx, ty;
  if (d.air) {
    const c = center(u.target); tx = c.x; ty = c.y;
  } else {
    if (!u.next || Math.hypot(u.next.x - u.x, u.next.y - u.y) < 0.12) {
      const f = getField(u.target, range);
      const cx = Math.floor(u.x), cy = Math.floor(u.y);
      let best = null, bd = inField(cx, cy) ? f.dist[cellIndex(cx, cy)] : Infinity;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (!inField(nx, ny)) continue;
        if (ox && oy && (blocked[cellIndex(cx + ox, cy)] || blocked[cellIndex(cx, cy + oy)])) continue;
        const v = f.dist[cellIndex(nx, ny)];
        if (v < bd - 0.01) { bd = v; best = { x: nx, y: ny }; }
      }
      if (!best) {
        // already on a goal cell (or stuck): walk straight at the target
        const c = center(u.target); u.next = { x: c.x, y: c.y };
      } else {
        const occ = blocked[cellIndex(best.x, best.y)];
        if (occ) {
          const w = byId(occ);
          if (w && w.type === 'wall') { u.wall = w; return; }
        }
        u.next = { x: best.x + 0.5 + u.ox, y: best.y + 0.5 + u.oy };
      }
    }
    tx = u.next.x; ty = u.next.y;
  }
  const dx = tx - u.x, dy = ty - u.y, len = Math.hypot(dx, dy) || 1;
  const v = d.speed * dt;
  u.x += (dx / len) * Math.min(v, len);
  u.y += (dy / len) * Math.min(v, len);
  if (Math.abs(dx) > 0.01) u.dir = dx > 0 ? 1 : -1;
  u.walk += dt * 10;
}

function attack(u, b) {
  const c = center(b);
  const ddx = c.x - u.x;
  if (Math.abs(ddx) > 0.01) u.dir = ddx > 0 ? 1 : -1;
  if (u.cd > 0) return;
  u.cd = u.d.rate;
  u.swing = 0.18;
  const d = u.d;
  if (d.bomb) {
    for (const o of S.buildings) {
      if (o.destroyed) continue;
      if (distToRect(u.x, u.y, o) <= 1.4) hurtBuilding(o, o.type === 'wall' ? d.dmg : 16, u);
    }
    fx.push({ kind: 'boom', x: u.x, y: u.y, r: 1.4, t: 0, life: 0.4 });
    burst(u.x, u.y, 14, ['#f8a830', '#f8e070', '#5f5f75']);
    sfx('boom');
    u.hp = 0;
    return;
  }
  let dmg = d.dmg;
  if (d.ranged || d.air) {
    shots.push({ kind: d.air ? 'fire' : 'enemyArrow', x: u.x, y: u.y, z: u.z + 4, tx: c.x + rnd(-0.4, 0.4), ty: c.y + rnd(-0.4, 0.4), b, dmg, from: u, speed: d.air ? 7 : 11, splash: d.splash || 0 });
  } else {
    if (u.type === 'goblin' && (def(b).cat === 'resource' || b.type === 'townhall')) dmg *= 2;
    hurtBuilding(b, dmg, u);
    sparks(u.x + (c.x - u.x) * 0.3, u.y + (c.y - u.y) * 0.3);
    sfx('hit');
  }
}

function updateDefense(b, dt) {
  const t = def(b), lvl = b.lvl;
  b.cd -= dt;
  const c = center(b);
  const valid = (u) => u && u.hp > 0 && (u.d.air ? t.air : t.ground) && (() => {
    const dd = Math.hypot(u.x - c.x, u.y - c.y);
    return dd <= t.range && (!t.minRange || dd >= t.minRange);
  })();
  if (!valid(b.target)) {
    b.target = null; let bd = Infinity;
    for (const u of units) {
      if (!valid(u)) continue;
      const dd = Math.hypot(u.x - c.x, u.y - c.y);
      if (dd < bd) { bd = dd; b.target = u; }
    }
  }
  const u = b.target;
  if (!u) return;
  const goal = Math.atan2(u.y - c.y, u.x - c.x);
  let da = goal - b.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  b.angle += clamp(da, -dt * 9, dt * 9);
  if (b.cd > 0) return;
  b.cd = t.rate;
  const dmg = t.dmg[lvl - 1];
  if (b.type === 'cannon') {
    shots.push({ kind: 'ball', x: c.x, y: c.y, z: 7, target: u, dmg, speed: 13 });
    b.recoil = 0.12; sfx('cannon');
  } else if (b.type === 'archer') {
    shots.push({ kind: 'arrow', x: c.x, y: c.y, z: 22, target: u, dmg, speed: 17 });
    sfx('arrow');
  } else if (b.type === 'mortar') {
    shots.push({ kind: 'shell', x: c.x, y: c.y, z: 10, sx: c.x, sy: c.y, tx: u.x, ty: u.y, t: 0, life: 1.3, dmg, splash: t.splash });
    b.recoil = 0.2; sfx('mortar');
  } else if (b.type === 'airdef') {
    shots.push({ kind: 'rocket', x: c.x, y: c.y, z: 16, target: u, dmg, speed: 9 });
    sfx('rocket');
  }
}

function hurtUnit(u, dmg) {
  if (u.hp <= 0) return;
  u.hp -= dmg; u.flash = 0.1;
  if (u.hp <= 0) {
    raidStats.kills++;
    burst(u.x, u.y, u.d.space > 4 ? 12 : 6, u.type === 'goblin' ? ['#58b838', '#2f7a1e'] : ['#f2b880', '#c03030', '#e8e8f0']);
    fx.push({ kind: 'ghost', x: u.x, y: u.y, t: 0, life: 0.9, z: u.z });
  }
}

// ---------- spells ----------
function castSpell(type, x, y) {
  const sp = SPELLS[type];
  if (!sp || S.phase !== 'raid') return false;
  if (spellCd[type] > 0) return false;
  if (!(S.spells[type] > 0)) { toast(`No ${sp.name} spells. Brew them by day at the Spell Factory.`); sfx('nope'); return false; }
  S.spells[type]--;
  spellCd[type] = sp.cd;
  const inside = (u) => u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= sp.radius;
  if (type === 'lightning') {
    const dmg = sp.dmg();
    for (const u of units) if (inside(u)) hurtUnit(u, dmg);
    // a jagged bolt from the top of the screen down to the target, in pixel offsets
    const pts = [[0, 0]];
    let px = 0, py = 0;
    while (py > -90) { py -= 8 + Math.random() * 6; px += rnd(-6, 6); pts.unshift([Math.round(px), Math.round(py)]); }
    fx.push({ kind: 'bolt', x, y, pts, t: 0, life: 0.35 });
    fx.push({ kind: 'boom', x, y, r: sp.radius * 0.6, t: 0, life: 0.35 });
    burst(x, y, 12, ['#ffffff', '#a8e0ff', '#f8e070']);
    sfx('zap');
  } else if (type === 'freeze') {
    for (const u of units) if (inside(u)) u.frozen = sp.dur;
    fx.push({ kind: 'pulse', x, y, r: sp.radius, c: sp.color, t: 0, life: 0.6 });
    burst(x, y, 10, ['#ffffff', '#c8f0ff', '#7cd8f8']);
    sfx('freeze');
  } else if (type === 'heal') {
    for (const b of S.buildings) {
      if (b.destroyed || distToRect(x, y, b) > sp.radius) continue;
      const before = b.hp;
      b.hp = Math.min(maxHp(b), b.hp + maxHp(b) * 0.4);
      const healed = Math.round(b.hp - before);
      if (healed > 0) { const c = center(b); floatText(c.x, c.y, '+' + healed, '#6fe03a'); }
    }
    fx.push({ kind: 'pulse', x, y, r: sp.radius, c: sp.color, t: 0, life: 0.7 });
    sfx('heal');
  }
  disarmSpell();
  refreshUI();
  return true;
}
function armSpell(type) {
  if (S.phase !== 'raid') return;
  const sp = SPELLS[type];
  if (spellArmed === type) { disarmSpell(); return; }
  if (!(S.spells[type] > 0)) { toast(`No ${sp.name} spells left`); sfx('nope'); return; }
  spellArmed = type;
  canvas.classList.add('aiming');
  deselect();
  sfx('click');
  toast(`Tap the map to cast ${sp.name}`);
  updateSpells();
}
function disarmSpell() { spellArmed = null; canvas.classList.remove('aiming'); updateSpells(); }

function updateShots(dt) {
  for (const s of shots) {
    if (s.kind === 'shell') {
      s.t += dt;
      const k = Math.min(1, s.t / s.life);
      s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k; s.z = 10 + Math.sin(k * Math.PI) * 46;
      if (k >= 1) {
        s.dead = true;
        for (const u of units) if (!u.d.air && Math.hypot(u.x - s.tx, u.y - s.ty) <= s.splash) hurtUnit(u, s.dmg);
        fx.push({ kind: 'boom', x: s.tx, y: s.ty, r: s.splash, t: 0, life: 0.4 });
        burst(s.tx, s.ty, 10, ['#f8a830', '#f8e070', '#6a4a2a']);
        sfx('boom');
      }
      continue;
    }
    if (s.kind === 'enemyArrow' || s.kind === 'fire') {
      const dx = s.tx - s.x, dy = s.ty - s.y, len = Math.hypot(dx, dy);
      const v = s.speed * dt;
      if (len <= v) {
        s.dead = true;
        if (s.splash) {
          for (const o of S.buildings) if (!o.destroyed && distToRect(s.tx, s.ty, o) <= s.splash) hurtBuilding(o, s.dmg * (o === s.b ? 1 : 0.5), s.from);
          fx.push({ kind: 'boom', x: s.tx, y: s.ty, r: 0.8, t: 0, life: 0.3, fire: true });
        } else hurtBuilding(s.b, s.dmg, s.from);
      } else { s.x += (dx / len) * v; s.y += (dy / len) * v; s.z = Math.max(3, s.z - dt * 6); }
      continue;
    }
    // homing defensive shots
    const u = s.target;
    if (!u || u.hp <= 0) { s.dead = true; continue; }
    const dx = u.x - s.x, dy = u.y - s.y, len = Math.hypot(dx, dy);
    const v = s.speed * dt;
    const tz = u.z + 4;
    if (len <= v) {
      s.dead = true;
      hurtUnit(u, s.dmg);
      if (s.kind === 'rocket') fx.push({ kind: 'boom', x: u.x, y: u.y, r: 0.5, t: 0, life: 0.25, air: u.z });
    } else {
      s.x += (dx / len) * v; s.y += (dy / len) * v;
      s.z += (tz - s.z) * Math.min(1, v / Math.max(len, 0.001));
      if (s.kind === 'rocket') fx.push({ kind: 'smoke', x: s.x, y: s.y, z: s.z, t: 0, life: 0.35 });
    }
  }
  shots = shots.filter((s) => !s.dead);
}

// effects live in tile space too
function burst(x, y, n, colors) {
  for (let i = 0; i < n; i++) fx.push({ kind: 'bit', x, y, z: rnd(2, 8), vx: rnd(-2.5, 2.5), vy: rnd(-2.5, 2.5), vz: rnd(10, 30), t: 0, life: rnd(0.4, 0.8), c: pick(colors) });
}
function sparks(x, y) { for (let i = 0; i < 3; i++) fx.push({ kind: 'bit', x, y, z: 6, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(8, 16), t: 0, life: 0.25, c: '#fff4a0' }); }
function floatText(x, y, text, color) { texts.push({ x, y, text, color, t: 0, life: 1.2 }); }
function updateFx(dt) {
  for (const e of fx) {
    e.t += dt;
    if (e.kind === 'bit') { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.92; e.vy *= 0.92; }
  }
  fx = fx.filter((e) => e.t < e.life);
  for (const t of texts) t.t += dt;
  texts = texts.filter((t) => t.t < t.life);
  for (const b of S.buildings) if (b.flash) b.flash = Math.max(0, b.flash - dt);
  for (const b of S.buildings) if (b.recoil) b.recoil = Math.max(0, b.recoil - dt);
  for (const u of units) if (u.swing) u.swing = Math.max(0, u.swing - dt);
}

/* =====================================================================
   RENDERING (all on a low-res canvas with integer rectangles)
   ===================================================================== */
const canvas = $('game');
let g = canvas.getContext('2d');
let scale = 2, W = 0, H = 0;      // low-res size
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];   // canvas pixel sizes; below 1 shows more of the map than fits 1:1
const cam = { x: 0, y: 0 };       // world pixel at the low-res canvas centre

// soft, bright palette (cute top-down RPG look)
const PAL = {
  k: '#383848', s: '#f8d0a8', S: '#e0a878', y: '#f8d848', Y: '#d8a820', b: '#a86838', B: '#784828',
  w: '#f8f8f8', m: '#b8b8c8', M: '#686880', g: '#78d050', G: '#48a038', p: '#f890c0', P: '#d05890',
  r: '#f05050', R: '#b03030', o: '#f8a048', u: '#5890f0', U: '#3860c0', e: '#c070f0', l: '#98e0f8', n: '#583828',
};
// chibi troop sprites (big heads, small bodies), facing right
const SPRITES = {
  barb: [
    '...yyyyy....',
    '..yyyyyyy...',
    '.yyyyyyyyy..',
    '.yysssssyy..',
    '.ysssksksy..',
    '..ssssssps..',
    '...sssss..m.',
    '..rrrrrrr.m.',
    '.srrrrrrrsm.',
    '..rrrrrrr...',
    '...bb..bb...',
    '...nn..nn...',
  ],
  arch: [
    '...ppppp....',
    '..ppppppp...',
    '.ppppppppp..',
    '.ppsssssp..b',
    '.psssksksp.b',
    '..sssssps..b',
    '...sssss...b',
    '..ggggggg.sb',
    '.sggggggg..b',
    '..GGGGGGG...',
    '...ss..ss...',
    '...nn..nn...',
  ],
  gob: [
    'g.........g.',
    'gg.ggggg.gg.',
    '.ggggggggg..',
    '.ggkggggkg..',
    '.ggggggggg..',
    '..ggwwwgg...',
    '...ggggg....',
    '..bbbbbbb...',
    '.gbbbbbbbg..',
    '..bbbbbbb...',
    '...gg.gg....',
  ],
  giant: [
    '....oooooo....',
    '...oooooooo...',
    '..oossssssoo..',
    '..osssksksso..',
    '..ossssssss...',
    '...ssspPsss...',
    '....ssssss....',
    '..uuuuuuuuuu..',
    '.suuuuuuuuuus.',
    'ssuuuuuuuuuuss',
    'ss.uuuuuuuu.ss',
    '...bbbbbbbb...',
    '...bbb..bbb...',
    '..nnnn..nnnn..',
  ],
  wb: [
    '.......yy...',
    '......y.....',
    '...MMMMM....',
    '..MMMMMMM...',
    '.MMMMMMMMM..',
    '.MMwkMMwkM..',
    '.MMwkMMwkM..',
    '.MMMMMMMMM..',
    '..MMMMMMM...',
    '...MMMMM....',
    '...ss..ss...',
    '...nn..nn...',
  ],
  drag: [
    '..R.........R...',
    '.RrR.......RrR..',
    'RrrrR.....RrrrR.',
    '.RrrrR...RrrrR..',
    '..RRrrrrrrrRR.rr',
    '....rrrrrrrrrrrr',
    '....rryyyyyrrkrw',
    '...rryyyyyyrrrr.',
    '..rr.yyyyyy.....',
    '.rr..r....r.....',
    'r...............',
  ],
};
const spriteCache = {};
function mixHex(a, b, k) {
  const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) * (1 - k) + p(b, i) * k).toString(16).padStart(2, '0')).join('');
}
// tint: null, 'flash' (hit, all white) or 'ice' (frozen, pale blue)
function spriteCanvas(name, flip, tint) {
  const key = name + (flip ? 'f' : '') + (tint || '');
  if (spriteCache[key]) return spriteCache[key];
  const rows = SPRITES[name], h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
  const x = c.getContext('2d');
  // dark outline first, then fill
  const paint = (ox, oy, col) => {
    for (let r = 0; r < h; r++) for (let i = 0; i < rows[r].length; i++) {
      const ch = rows[r][i]; if (!PAL[ch]) continue;
      x.fillStyle = col || (tint === 'flash' ? '#ffffff' : tint === 'ice' ? mixHex(PAL[ch], '#a8e0ff', 0.65) : PAL[ch]);
      const px = flip ? w - 1 - i : i;
      x.fillRect(px + 1 + ox, r + 1 + oy, 1, 1);
    }
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, '#383848');
  paint(0, 0, null);
  spriteCache[key] = c;
  return c;
}

// --- raster primitives (integer, no anti-aliasing) ---
function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function sq(cx, cy, n, col) {            // flat square, n tiles across, centred on (cx, cy)
  const w = Math.round(n * T);
  rect(Math.round(cx - w / 2), Math.round(cy - w / 2), w, w, col);
}
function circ(cx, cy, r, col) {
  cx = Math.round(cx); cy = Math.round(cy); g.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
}
function oval(cx, cy, rx, ry, col) {
  cx = Math.round(cx); cy = Math.round(cy); g.fillStyle = col;
  for (let dy = -ry; dy <= ry; dy++) { const w = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)) + 0.35); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
}
function ring(cx, cy, rx, ry, col, dash) {
  g.fillStyle = col;
  const steps = Math.max(24, Math.round(rx * 3));
  for (let i = 0; i < steps; i++) {
    if (dash && i % 3 === 0) continue;
    const a = (i / steps) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
  }
}
function line(x0, y0, x1, y1, col, t) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); t = t || 1;
  g.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0, guard = 400;
  const o = Math.floor(t / 2);
  while (guard--) {
    g.fillRect(x - o, y - o, t, t);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
// 3x5 pixel font for numbers drawn in the world
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  d: '001001111101111', '+': '000010111010000', '-': '000000111000000',
};
function ptext(str, x, y, col) {
  const draw = (ox, oy, c) => {
    g.fillStyle = c;
    let cx = Math.round(x) + ox;
    for (const ch of str) {
      const f = FONT[ch];
      if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(cx + (i % 3), Math.round(y) + oy + Math.floor(i / 3), 1, 1);
      cx += 4;
    }
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) draw(ox, oy, '#14101c');
  draw(0, 0, col);
}
const textWidth = (s) => s.length * 4 - 1;

// world (tile) → screen (low-res pixel). Straight top-down: no projection.
const sx = (x) => Math.round(x * T - cam.x + W / 2);
const sy = (x, y) => Math.round(y * T - cam.y + H / 2);

// ---------- building art: cute top-down RPG style (a front wall with a big roof, soft colours, rounded outlines) ----------
const LEVEL_TRIM = ['#c8c8d8', '#f0b860', '#78c8f8', '#f8d848', '#f890e8'];
const INK = '#383848';
function rr(x, y, w, h, fill) {            // rounded, outlined rectangle (corner pixels left off the outline)
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(x - 1, y, w + 2, h, INK);
  rect(x, y - 1, w, h + 2, INK);
  rect(x, y, w, h, fill);
}
function ocirc(cx, cy, r, col) { circ(cx, cy, r + 1, INK); circ(cx, cy, r, col); }
function roof(x, y, w, h, col, dark) {     // a striped roof with a darker eave
  rr(x, y, w, h, col);
  for (let ly = y + 3; ly < y + h - 3; ly += 4) rect(x + 1, ly, w - 2, 1, dark);
  rect(x, y + h - 2, w, 2, dark);
}
// how tall each building's art stands above its front edge, in pixels (for badges and HP bars)
const ART_H = { townhall: 50, cannon: 24, archer: 46, mortar: 26, airdef: 36, wall: 14, goldmine: 26, elixir: 32, goldstore: 28, elixstore: 34, builder: 26, spellfactory: 44 };
const artHeight = (b) => (b.destroyed ? 8 : b.lvl < 1 ? 20 : ART_H[b.type] || 30);

function drawBuilding(b, cx, cy, opts) {
  const t = def(b), s = t.size, lvl = Math.max(1, b.lvl);
  const ghost = opts && opts.ghost;
  const base = Math.round(cy + (s * T) / 2) - 2;   // the front edge the building stands on
  if (!ghost && !(opts && opts.noPad)) sq(cx, cy, s, '#7cc458');
  if (b.destroyed) { drawRubble(cx, base, s); return; }
  if (b.lvl < 1) { drawScaffold(cx, base, s, b); return; }
  const trim = LEVEL_TRIM[clamp(lvl - 1, 0, 4)];
  const F = (c) => (b.flash > 0 ? '#ffffff' : c);
  switch (b.type) {
    case 'townhall': {
      const roofs = [['#f06058', '#c84040'], ['#5890f0', '#3868c8'], ['#68c050', '#48983a'], ['#a070e0', '#7850b8'], ['#f8c840', '#d09820']][lvl - 1];
      rr(cx - 26, base - 22, 52, 21, F('#f8f0d8'));
      rr(cx - 21, base - 17, 8, 7, '#a0d8f8'); rr(cx + 13, base - 17, 8, 7, '#a0d8f8');
      rr(cx - 6, base - 14, 12, 13, '#a0d8f8'); rect(cx, base - 14, 1, 13, '#6098d0');   // glass doors
      rect(cx - 9, base - 1, 18, 2, '#d0d0d8');
      roof(cx - 30, base - 48, 60, 28, F(roofs[0]), F(roofs[1]));
      ocirc(cx, base - 35, 6, '#f8f8f8'); circ(cx, base - 35, 3, trim);                   // crest
      break;
    }
    case 'cannon': {
      rr(cx - 18, base - 8, 36, 7, F('#d8d8e0'));
      rect(cx - 17, base - 6, 34, 1, trim);
      const d = Math.cos(b.angle) >= 0 ? 1 : -1, kick = b.recoil ? 2 : 0;
      const bx = cx - d * 3, by = base - 15, ex = cx + d * (15 - kick), ey = base - 19;
      line(bx, by, ex, ey, INK, 9);
      ocirc(bx, by, 7, F('#686880'));
      line(bx, by, ex, ey, F('#686880'), 7);
      ocirc(Math.round(ex), Math.round(ey), 3, '#282838');
      circ(bx - 2, by - 3, 1, '#9898b0');                                             // shine
      for (const wx of [-7, 7]) { ocirc(cx + wx, base - 6, 4, F('#a86838')); rect(cx + wx, base - 6, 1, 1, '#583828'); }
      break;
    }
    case 'archer': {
      rr(cx - 15, base - 28, 4, 27, F('#a86838')); rr(cx + 11, base - 28, 4, 27, F('#a86838'));
      rect(cx - 11, base - 12, 22, 2, F('#c88850'));
      rr(cx - 18, base - 32, 36, 6, F('#e8c890'));                                    // platform
      rect(cx - 17, base - 28, 34, 1, trim);
      const ac = spriteCanvas('arch', Math.cos(b.angle) < 0, null);
      g.drawImage(ac, Math.round(cx - ac.width / 2), Math.round(base - 32 - ac.height + 2));
      rr(cx - 18, base - 35, 3, 4, F('#c88850')); rr(cx + 15, base - 35, 3, 4, F('#c88850'));
      rr(cx - 18, base - 35, 36, 2, F('#c88850'));                                    // railing
      break;
    }
    case 'mortar': {
      rr(cx - 17, base - 8, 34, 7, F('#d8d8e0'));
      const lift = b.recoil ? 1 : 0;
      rr(cx - 10, base - 21 - lift, 20, 14, F('#686880'));
      rr(cx - 12, base - 25 - lift, 24, 5, F('#7c7c94'));
      rect(cx - 10, base - 24 - lift, 20, 2, '#282838');
      rect(cx - 10, base - 15 - lift, 20, 2, trim);
      break;
    }
    case 'airdef': {
      rr(cx - 16, base - 8, 32, 7, F('#d8d8e0'));
      rr(cx - 9, base - 24, 18, 17, F('#5890f0'));
      rect(cx - 9, base - 17, 18, 2, trim);
      for (const dx of [-6, 0, 6]) { rr(cx + dx - 2, base - 34, 4, 10, F('#f8f8f8')); rect(cx + dx - 2, base - 35, 4, 2, F('#f06058')); }
      break;
    }
    case 'wall': drawWallBlock(cx, base, lvl, F, false, false); break;
    case 'goldmine': {
      oval(cx, base - 11, 21, 12, INK); oval(cx, base - 11, 20, 11, F('#b8a890'));     // rocky hill
      circ(cx - 12, base - 14, 2, '#988870'); circ(cx + 13, base - 10, 2, '#988870');
      rr(cx - 6, base - 14, 12, 13, '#383848');                                         // cave
      rr(cx - 8, base - 16, 3, 15, F('#a86838')); rr(cx + 5, base - 16, 3, 15, F('#a86838'));
      rr(cx - 9, base - 18, 18, 3, F('#c88850')); rect(cx - 8, base - 17, 16, 1, trim);
      rr(cx + 10, base - 7, 10, 6, F('#888898'));                                       // cart of gold
      circ(cx + 13, base - 8, 2, '#f8d848'); circ(cx + 17, base - 8, 2, '#f8e070');
      break;
    }
    case 'elixir': {
      rr(cx - 13, base - 6, 26, 5, F('#d8d8e0'));
      rect(cx - 12, base - 5, 24, 1, trim);
      rr(cx - 1, base - 14, 3, 8, F('#a86838'));
      ocirc(cx, base - 22, 9, F('#f078c8'));
      circ(cx - 3, base - 25, 2, '#ffd0f0');                                            // shine
      rect(cx - 9, base - 21, 18, 1, F('#c050a0'));
      line(cx + 10, base - 6, cx + 16, base - 16, INK, 3); line(cx + 10, base - 6, cx + 16, base - 16, F('#a8a8b8'), 1);
      break;
    }
    case 'goldstore': {
      const k = storedFrac(b);
      for (let i = 0; i < Math.round(k * 7); i++) ocirc(cx - 10 + i * 3.4, base - 24 + (i % 2), 3, F(i % 2 ? '#f8e070' : '#f8c838'));
      rr(cx - 17, base - 18, 34, 17, F('#d08040'));                                    // chest
      rr(cx - 18, base - 23, 36, 6, F('#e89850'));                                     // lid
      rect(cx - 11, base - 17, 3, 16, F('#f8d848')); rect(cx + 8, base - 17, 3, 16, F('#f8d848'));
      rr(cx - 3, base - 16, 6, 5, trim);
      break;
    }
    case 'elixstore': {
      rr(cx - 14, base - 6, 28, 5, F('#d8d8e0'));
      const r = 13, cyT = base - 20, level = cyT + r - Math.round(storedFrac(b) * r * 2);
      circ(cx, cyT, r + 1, INK);
      g.fillStyle = F('#f0f0f8');
      for (let dy = -r; dy <= r; dy++) {
        const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
        g.fillStyle = cyT + dy >= level ? F('#f078c8') : F('#f0f0f8');
        g.fillRect(cx - w, cyT + dy, w * 2 + 1, 1);
      }
      circ(cx - 5, cyT - 6, 2, '#ffffff');
      rr(cx - 3, base - 36, 6, 3, F('#c050a0'));
      rect(cx - 13, base - 5, 26, 1, trim);
      break;
    }
    case 'builder': {
      rr(cx - 11, base - 10, 22, 9, F('#f8f0d8'));
      rr(cx - 2, base - 8, 4, 7, '#a86838');
      rr(cx + 6, base - 25, 3, 6, F('#a8a8b8'));                                       // chimney
      roof(cx - 14, base - 22, 28, 14, F('#f8a048'), F('#d07828'));
      break;
    }
    case 'spellfactory': {
      rr(cx - 18, base - 16, 36, 15, F('#ece4f8'));
      rr(cx - 4, base - 11, 8, 10, '#a86838');
      ocirc(cx - 11, base - 9, 3, '#f078c8'); ocirc(cx + 11, base - 9, 3, '#f078c8');
      roof(cx - 21, base - 37, 42, 23, F('#9068e0'), F('#7050b8'));
      rect(cx - 1, base - 44, 3, 7, '#f8d848'); rect(cx - 3, base - 42, 7, 3, '#f8d848');   // star on top
      rect(cx - 20, base - 16, 40, 1, trim);
      break;
    }
  }
  if (b.cons) drawUpgradeBadge(cx, base, b);
}
// walls: a wooden fence at level 1, then stone, dark stone and gold blocks. They join sideways with neighbours.
const WALL_COLS = [['#d09858', '#a86838'], ['#d8d8e0', '#a8a8b8'], ['#9898b0', '#686880'], ['#f8d860', '#d0a020']];
function drawWallBlock(cx, base, lvl, F, joinL, joinR) {
  const [c0, c1] = WALL_COLS[clamp(lvl - 1, 0, 3)];
  const x0 = cx - (joinL ? 8 : 5), x1 = cx + (joinR ? 8 : 5);
  if (lvl === 1) {
    rr(x0, base - 10, x1 - x0, 3, F(c0)); rr(x0, base - 5, x1 - x0, 3, F(c0));   // rails
    rr(cx - 2, base - 13, 4, 12, F(c1));                                            // post
    rect(cx - 2, base - 13, 4, 1, F(c0));
    return;
  }
  rr(x0, base - 12, x1 - x0, 11, F(c0));
  rect(x0, base - 7, x1 - x0, 1, F(c1));
  rect(cx - 1, base - 12, 1, 5, F(c1)); rect(cx + 3, base - 7, 1, 6, F(c1)); rect(cx - 4, base - 7, 1, 6, F(c1));
}
function drawRubble(cx, base, s) {
  const half = Math.round((s * T) / 2) - 4, seed = Math.round(cx * 7 + base * 13);
  for (let i = 0; i < 4 + s * 3; i++) {
    const ox = ((seed + i * 97) % 100) / 100 * 2 - 1, r = 1 + ((seed + i * 31) % 3);
    ocirc(cx + ox * half, base - r - 1, r, i % 2 ? '#b8b8c8' : '#a89880');
  }
}
function drawScaffold(cx, base, s, b) {
  const w = Math.round((s * T) / 2) - 4, h = Math.min(20, s * 6);
  rr(cx - w, base - 5, w * 2, 5, '#e8d8b0');
  for (const px of [-w, w - 3]) rr(cx + px, base - h, 3, h, '#c88850');
  rr(cx - w, base - h, w * 2, 3, '#c88850');
  rect(cx - 4, base - 9, 8, 4, '#f8d848');      // a little "under construction" sign
  drawUpgradeBadge(cx, base, b);
}
function drawUpgradeBadge(cx, base, b) {
  const label = b.cons.days + 'd';
  const y = base - artHeight(b) - 12;
  const w = textWidth(label) + 14;
  rr(cx - w / 2, y, w, 9, '#f8d848');
  rect(cx - w / 2 + 2, y + 2, 4, 2, '#686880'); rect(cx - w / 2 + 3, y + 4, 1, 3, '#a86838');   // hammer
  ptext(label, cx - w / 2 + 9, y + 2, '#ffffff');
}
function drawHpBar(cx, y, w, frac) {
  rr(cx - w / 2, y, w, 3, '#784848');
  rect(cx - w / 2, y, Math.max(1, Math.round(w * frac)), 3, frac > 0.5 ? '#68d048' : frac > 0.25 ? '#f8c838' : '#f05848');
}

// ---------- trees and rocks on the outer ring ----------
let decor = [];
function makeDecor() {
  decor = [];
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4), t = -MARGIN + r() * (GRID + MARGIN * 2), d = -MARGIN + r() * (MARGIN - 1.5);
    let x, y;
    if (side === 0) { x = t; y = d; } else if (side === 1) { x = GRID - d; y = t; } else if (side === 2) { x = t; y = GRID - d; } else { x = d; y = t; }
    decor.push({ x, y, kind: r() < 0.8 ? 'tree' : 'rock', v: r() });
  }
}
function drawDecor(d) {
  const cx = sx(d.x), cy = sy(0, d.y);
  if (cx < -24 || cx > W + 24 || cy < -10 || cy > H + 40) return;
  if (d.kind === 'tree') {
    // a round, puffy tree: outlines first, then the leaves, so the blobs merge into one shape
    const big = d.v > 0.5 ? 1 : 0, r = 7 + big;
    rr(cx - 2, cy - 4, 4, 6, '#a86838');
    for (const [ox, oy, rad] of [[0, -12, r], [-5, -8, r - 2], [5, -8, r - 2]]) circ(cx + ox, cy + oy - big, rad + 1, INK);
    for (const [ox, oy, rad] of [[0, -12, r], [-5, -8, r - 2], [5, -8, r - 2]]) circ(cx + ox, cy + oy - big, rad, '#58b048');
    circ(cx - 3, cy - 15 - big, 2, '#80d068');
  } else {
    ocirc(cx, cy - 3, 4, '#b8b8c8'); circ(cx - 1, cy - 4, 1, '#e0e0e8');
  }
}

// ---------- ground: grass with little tufts and flowers, drawn once and blitted every frame ----------
const GROUND_O = MARGIN * T;
let groundCanvas = null;
function buildGround() {
  const c = document.createElement('canvas');
  c.width = N * T; c.height = N * T;
  const prev = g;
  g = c.getContext('2d');
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  for (let y = -MARGIN; y < GRID + MARGIN; y++) for (let x = -MARGIN; x < GRID + MARGIN; x++) {
    const inside = x >= 0 && y >= 0 && x < GRID && y < GRID;
    const px = (x + MARGIN) * T, py = (y + MARGIN) * T, v = hash(x, y);
    rect(px, py, T, T, inside ? '#90d870' : '#70c058');
    if (!inside) {
      // tall grass outside the village
      for (const [ox, oy] of [[2, 4], [9, 3], [5, 10], [12, 11]]) { rect(px + ox, py + oy, 1, 3, '#58a048'); rect(px + ox + 2, py + oy, 1, 3, '#58a048'); rect(px + ox + 1, py + oy + 1, 1, 2, '#58a048'); }
    } else if (v < 0.22) {
      const ox = 3 + Math.floor(hash(y, x) * 8), oy = 3 + Math.floor(v * 40);
      rect(px + ox, py + oy, 1, 2, '#70b850'); rect(px + ox + 2, py + oy, 1, 2, '#70b850'); rect(px + ox + 1, py + oy + 1, 1, 1, '#70b850');
    } else if (v > 0.965) {
      const col = v > 0.983 ? '#f87878' : '#f8e060', ox = 4 + Math.floor(hash(y, x) * 7), oy = 4 + Math.floor((v - 0.965) * 300);
      rect(px + ox, py + oy - 1, 1, 1, col); rect(px + ox - 1, py + oy, 3, 1, col); rect(px + ox, py + oy + 1, 1, 1, col); rect(px + ox, py + oy, 1, 1, '#ffffff');
    }
  }
  // soft edge around the village
  g.fillStyle = '#78c058';
  g.fillRect(GROUND_O - 1, GROUND_O - 1, GRID * T + 2, 1);
  g.fillRect(GROUND_O - 1, GROUND_O + GRID * T, GRID * T + 2, 1);
  g.fillRect(GROUND_O - 1, GROUND_O - 1, 1, GRID * T + 2);
  g.fillRect(GROUND_O + GRID * T, GROUND_O - 1, 1, GRID * T + 2);
  g = prev;
  groundCanvas = c;
}
// beyond the map edge: a dense forest, tiled from a small pattern that scrolls with the camera
let forestPattern = null;
function drawForest() {
  if (!forestPattern) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const prev = g; g = c.getContext('2d');
    rect(0, 0, 32, 32, '#3c8a3c');
    for (const [x, y] of [[8, 10], [24, 26], [24, 10], [8, 26]]) { circ(x, y, 9, '#2e6e34'); circ(x, y, 8, '#4a9a48'); circ(x - 3, y - 3, 2, '#68b858'); }
    g = prev;
    forestPattern = g.createPattern(c, 'repeat');
  }
  g.save();
  g.translate(Math.round(W / 2 - cam.x) % 32 - 32, Math.round(H / 2 - cam.y) % 32 - 32);
  g.fillStyle = forestPattern; g.fillRect(0, 0, W + 64, H + 64);
  g.restore();
}
function drawGround() {
  if (!groundCanvas) buildGround();
  g.drawImage(groundCanvas, Math.round(W / 2 - cam.x) - GROUND_O, Math.round(H / 2 - cam.y) - GROUND_O);
}

// ---------- the frame ----------
function render(now) {
  const night = S.phase === 'raid' || S.phase === 'won' || S.phase === 'lost';
  drawForest();
  drawGround();
  // flat ground layer: building pads, selection, placement squares
  const sel = selectedId && byId(selectedId);
  if (sel && !placing) { const s = def(sel).size, c = center(sel); drawSelect(sx(c.x), sy(0, c.y), s); }
  for (const p of placingSpots()) {
    const s = TYPES[p.type].size;
    sq(sx(p.x + s / 2), sy(0, p.y + s / 2), s, p.ok ? 'rgba(120,255,120,0.5)' : 'rgba(255,80,60,0.55)');
  }
  // everything that stands up is drawn back to front
  const items = [];
  for (const b of S.buildings) {
    if (placing && placing.moveId === b.id) continue;
    items.push({ depth: b.y + def(b).size - 0.01, draw: () => drawBuildingAt(b) });
  }
  for (const p of placingSpots()) {
    const s = TYPES[p.type].size;
    items.push({ depth: p.y + s - 0.005, draw: () => {
      g.globalAlpha = 0.8;
      drawBuilding({ type: p.type, lvl: placing.lvl || 1, x: p.x, y: p.y, angle: 0.6, cons: null }, sx(p.x + s / 2), sy(0, p.y + s / 2), { ghost: true });
      g.globalAlpha = 1;
    } });
  }
  for (const d of decor) items.push({ depth: d.y, draw: () => drawDecor(d) });
  for (const u of units) items.push({ depth: u.y + (u.d.air ? 60 : 0), draw: () => drawUnit(u, now) });
  for (const f of flags) items.push({ depth: f.y, draw: () => drawFlag(f, now) });
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
  // HP bars over everything
  for (const b of S.buildings) {
    if (b.destroyed || b.hp >= maxHp(b) || S.phase !== 'raid') continue;
    const s = def(b).size, c = center(b);
    drawHpBar(sx(c.x), sy(0, c.y) + (s * T) / 2 - artHeight(b) - 5, Math.max(8, s * T - 6), b.hp / maxHp(b));
  }
  // ranges
  if (sel && def(sel).range && !placing) {
    const c = center(sel), t = def(sel);
    ring(sx(c.x), sy(0, c.y), t.range * T, t.range * T, 'rgba(255,255,255,0.8)', true);
    if (t.minRange) ring(sx(c.x), sy(0, c.y), t.minRange * T, t.minRange * T, 'rgba(255,120,100,0.8)', true);
  }
  if (placing && !placing.multi && TYPES[placing.type].range) {
    const t = TYPES[placing.type], s = t.size;
    ring(sx(placing.x + s / 2), sy(0, placing.y + s / 2), t.range * T, t.range * T, 'rgba(255,255,255,0.7)', true);
  }
  for (const s of shots) drawShot(s);
  for (const e of fx) drawFx(e);
  for (const t of texts) {
    const k = t.t / t.life;
    const x = sx(t.x), y = sy(0, t.y) - 14 - k * 14;
    ptext(t.text, x - textWidth(t.text) / 2, y, t.color);
  }
  if (spellArmed && hover && S.phase === 'raid') {
    const sp = SPELLS[spellArmed], x = sx(hover.x), y = sy(0, hover.y), r = Math.round(sp.radius * T);
    g.globalAlpha = 0.18; circ(x, y, r, sp.color); g.globalAlpha = 1;
    ring(x, y, r, r, sp.color, true);
  }
  // night: dark blue, with torch light around defenses and the Town Hall
  if (night) {
    g.fillStyle = 'rgba(8, 12, 48, 0.5)';
    g.fillRect(0, 0, W, H);
    for (const b of S.buildings) {
      if (b.destroyed || !(def(b).cat === 'defense' || b.type === 'townhall')) continue;
      const c = center(b);
      circ(sx(c.x), sy(0, c.y), b.type === 'townhall' ? 30 : 20, 'rgba(255, 200, 90, 0.10)');
    }
  }
}
function drawBuildingAt(b) {
  const s = def(b).size, c = center(b);
  const cx = sx(c.x), cy = sy(0, c.y);
  if (cx < -50 || cx > W + 50 || cy < -30 || cy > H + 80) return;
  if (b.type === 'wall' && !b.destroyed && b.lvl >= 1) {
    const nbr = (dx) => {
      if (!inField(b.x + dx, b.y)) return false;
      const id = blocked[cellIndex(b.x + dx, b.y)]; const o = id && byId(id);
      return o && o.type === 'wall' && !o.destroyed && o.lvl >= 1;
    };
    drawWallBlock(cx, Math.round(cy + T / 2) - 2, b.lvl, (col) => (b.flash > 0 ? '#ffffff' : col), nbr(-1), nbr(1));
    return;
  }
  drawBuilding(b, cx, cy, { noPad: true });
}
function drawSelect(cx, cy, s) {
  const blink = Math.floor(performance.now() / 300) % 2;
  const h = Math.round((s * T) / 2) + 1;
  const c = blink ? '#ffffff' : '#f8e070';
  rect(cx - h, cy - h, h * 2, 1, c); rect(cx - h, cy + h - 1, h * 2, 1, c);
  rect(cx - h, cy - h, 1, h * 2, c); rect(cx + h - 1, cy - h, 1, h * 2, c);
}
function drawUnit(u, now) {
  const cx = sx(u.x), cy = sy(0, u.y);
  if (cx < -30 || cx > W + 30 || cy < -40 || cy > H + 30) return;
  const tint = u.flash > 0 ? 'flash' : u.frozen > 0 ? 'ice' : null;
  const img = spriteCanvas(u.d.sprite, u.dir < 0, tint);
  const bob = u.frozen > 0 ? 0 : u.d.air ? Math.round(Math.sin(now / 160 + u.walk)) : (Math.floor(u.walk) % 2);
  const lunge = u.swing ? u.dir * 2 : 0;
  const top = Math.round(cy + 3 - img.height - bob - (u.d.air ? 6 : 0));   // feet on the ground (dragons fly a little higher)
  g.drawImage(img, Math.round(cx - img.width / 2 + lunge), top);
  if (u.frozen > 0) { rect(cx - 1, top - 3, 3, 1, '#c8f0ff'); rect(cx, top - 4, 1, 3, '#c8f0ff'); }
  if (u.hp < u.maxhp) drawHpBar(cx, top - 4, Math.max(8, img.width - 2), u.hp / u.maxhp);
}
function drawFlag(f, now) {
  const cx = sx(f.x), cy = sy(0, f.y);
  if (raidTime > 8) return;
  line(cx, cy, cx, cy - 14, '#3a2a18');
  const wave = Math.floor(now / 200) % 2;
  rect(cx + 1, cy - 14 + wave, 8, 5, '#e03a30'); rect(cx + 1, cy - 14 + wave, 8, 1, '#ff8a70');
}
function drawShot(s) {
  const x = sx(s.x), y = sy(0, s.y);
  if (s.kind === 'ball') { circ(x, y, 1, '#16161e'); }
  else if (s.kind === 'arrow' || s.kind === 'enemyArrow') {
    const tx = s.target ? s.target.x : s.tx, ty = s.target ? s.target.y : s.ty;
    const a = Math.atan2(ty - s.y, tx - s.x);
    line(x - Math.cos(a) * 4, y - Math.sin(a) * 4, x, y, s.kind === 'arrow' ? '#f4f4f4' : '#f8d090', 1);
  }
  else if (s.kind === 'shell') {
    circ(x, y, 2, '#1a1a24');
  }
  else if (s.kind === 'rocket') { rect(x - 1, y - 1, 3, 3, '#e03a30'); rect(x, y, 1, 1, '#ffe070'); }
  else if (s.kind === 'fire') { circ(x, y, 3, '#f8a830'); circ(x, y, 1, '#fff070'); }
}
function drawFx(e) {
  const k = e.t / e.life;
  const x = sx(e.x), y = sy(0, e.y);
  if (e.kind === 'bit') rect(x - 1, y - 1, 2, 2, e.c);
  else if (e.kind === 'boom') {
    const r = Math.max(1, Math.round((2 + e.r * T * 0.6) * (0.4 + k)));
    circ(x, y, r, k < 0.5 ? (e.fire ? '#f8a830' : '#fff0a0') : '#f8a830');
    if (r > 3) circ(x, y, Math.round(r * 0.55), k < 0.5 ? '#ffffff' : '#f86030');
  } else if (e.kind === 'smoke') rect(x - 1, y - 1, 2, 2, 'rgba(200,200,210,' + (0.7 - k * 0.7).toFixed(2) + ')');
  else if (e.kind === 'ghost') {
    const gy = y - 6 - k * 14;
    g.globalAlpha = 1 - k;
    rect(x - 2, gy - 3, 5, 5, '#e8e8f0'); rect(x - 1, gy - 2, 1, 1, '#14101c'); rect(x + 1, gy - 2, 1, 1, '#14101c');
    g.globalAlpha = 1;
  } else if (e.kind === 'bolt') {
    if (k < 0.15) { g.globalAlpha = 0.35; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    g.globalAlpha = 1 - k;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i];
      line(x + a[0], y + a[1], x + b[0], y + b[1], '#a8e0ff', 3);
      line(x + a[0], y + a[1], x + b[0], y + b[1], '#ffffff', 1);
    }
    g.globalAlpha = 1;
  } else if (e.kind === 'pulse') {
    const r = Math.round(e.r * T * Math.min(1, k * 1.6));
    g.globalAlpha = 0.25 * (1 - k); circ(x, y, r, e.c); g.globalAlpha = 1;
    ring(x, y, r, r, e.c);
    if (r > 2) ring(x, y, r - 1, r - 1, e.c);
  }
}

/* =====================================================================
   INPUT
   ===================================================================== */
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  W = Math.ceil(vw / scale); H = Math.ceil(vh / scale);
  canvas.width = W; canvas.height = H;
  canvas.style.width = W * scale + 'px'; canvas.style.height = H * scale + 'px';
  g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
}
function autoScale() {
  const vw = window.innerWidth, vh = window.innerHeight;
  return nearestZoom(Math.min(vw / 480, vh / 360));
}
// the furthest zoom still keeps the map filling a good part of the screen (phones can go further out than desktops)
function zoomLevels() {
  const minZ = (0.6 * Math.min(window.innerWidth, window.innerHeight)) / (N * T);
  const ok = ZOOMS.filter((z) => z >= minZ);
  return ok.length ? ok : [ZOOMS[ZOOMS.length - 1]];
}
function nearestZoom(z) { return zoomLevels().reduce((a, b) => (Math.abs(Math.log(b / z)) < Math.abs(Math.log(a / z)) ? b : a)); }
function screenToTile(clientX, clientY) {
  return { x: (clientX / scale - W / 2 + cam.x) / T, y: (clientY / scale - H / 2 + cam.y) / T };
}
function buildingAt(tx, ty) {
  for (const b of S.buildings) {
    const s = def(b).size;
    if (tx >= b.x && tx < b.x + s && ty >= b.y && ty < b.y + s) return b;
  }
  return null;
}
function clampCam() {
  // keep the village on screen; when zoomed far out, the whole map just sits in the middle
  const mid = (GRID * T) / 2;
  const slackX = Math.max(0, (N * T - W) / 2 + T), slackY = Math.max(0, (N * T - H) / 2 + T * 2);
  cam.x = clamp(cam.x, mid - slackX, mid + slackX);
  cam.y = clamp(cam.y, mid - slackY, mid + slackY);
}
function centerOn(x, y) { cam.x = x * T; cam.y = y * T; clampCam(); }

const pointers = new Map();
let drag = null, pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale };
    drag = null; return;
  }
  const t = screenToTile(e.clientX, e.clientY);
  let mode = 'pan';
  if (placing && placing.multi) {
    if (pendingAt(Math.floor(t.x), Math.floor(t.y)) >= 0) { mode = 'paint'; placing.paintFrom = [Math.floor(t.x), Math.floor(t.y)]; placing.warned = false; }
  } else if (placing) {
    const s = TYPES[placing.type].size;
    if (t.x >= placing.x - 0.5 && t.x < placing.x + s + 0.5 && t.y >= placing.y - 0.5 && t.y < placing.y + s + 0.5) mode = 'ghost';
  }
  drag = { mode, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, gx: placing ? placing.x : 0, gy: placing ? placing.y : 0, tx: t.x, ty: t.y };
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  hover = screenToTile(e.clientX, e.clientY);
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const want = nearestZoom(pinch.scale * d / pinch.d);
    if (want !== scale) setScale(want);
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (Math.hypot(dx, dy) > 6) drag.moved = true;
  if (drag.mode === 'paint') {
    const t = screenToTile(e.clientX, e.clientY);
    paintWallsTo(clamp(Math.floor(t.x), 0, GRID - 1), clamp(Math.floor(t.y), 0, GRID - 1));
  } else if (drag.mode === 'ghost') {
    const t = screenToTile(e.clientX, e.clientY);
    placing.x = clamp(Math.round(drag.gx + (t.x - drag.tx)), 0, GRID - TYPES[placing.type].size);
    placing.y = clamp(Math.round(drag.gy + (t.y - drag.ty)), 0, GRID - TYPES[placing.type].size);
    placing.ok = fits(placing.type, placing.x, placing.y, placing.moveId);
    updatePlaceTip();
  } else {
    cam.x = drag.cx - dx / scale; cam.y = drag.cy - dy / scale; clampCam();
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!drag) return;
  const d = drag; drag = null;
  canvas.classList.remove('dragging');
  if (d.moved || e.type === 'pointercancel') return;
  // a tap
  const t = screenToTile(e.clientX, e.clientY);
  if (spellArmed && S.phase === 'raid') { castSpell(spellArmed, t.x, t.y); return; }
  if (placing && placing.multi) {
    const x = Math.floor(t.x), y = Math.floor(t.y), i = pendingAt(x, y);
    if (i >= 0) placing.walls.splice(i, 1); else addPendingWall(x, y);
    sfx('click'); updatePlaceTip();
    return;
  }
  if (placing) {
    const s = TYPES[placing.type].size;
    placing.x = clamp(Math.floor(t.x - s / 2 + 0.5), 0, GRID - s);
    placing.y = clamp(Math.floor(t.y - s / 2 + 0.5), 0, GRID - s);
    placing.ok = fits(placing.type, placing.x, placing.y, placing.moveId);
    updatePlaceTip();
    return;
  }
  const b = buildingAt(t.x, t.y);
  if (b) { select(b.id); sfx('click'); } else deselect();
};
canvas.addEventListener('pointerleave', () => { hover = null; });
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); }, { passive: false });
window.addEventListener('resize', () => { resize(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => resize());
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
// save whenever the app goes to the background (phones may kill it there)
document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.phase === 'build') save(); });
window.addEventListener('pagehide', () => { if (S && S.phase === 'build') save(); });
// no long-press menus or pinch-zooming the page itself
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else if (spellArmed) disarmSpell(); else if (placing) cancelPlace(); else deselect(); }
  if ((e.key === '+' || e.key === '=') && $('modal').hidden) zoomBy(1);
  if ((e.key === '-' || e.key === '_') && $('modal').hidden) zoomBy(-1);
  if (S && S.phase === 'raid' && !e.repeat && $('modal').hidden) { const k = ['1', '2', '3'].indexOf(e.key); if (k >= 0) armSpell(Object.keys(SPELLS)[k]); }
});
function setScale(s) { scale = s; resize(); clampCam(); }
function zoomBy(d) { const z = zoomLevels(); setScale(z[clamp(z.indexOf(nearestZoom(scale)) + d, 0, z.length - 1)]); }

/* =====================================================================
   UI
   ===================================================================== */
const ICONS = {
  gold: ['....yyyy....', '..yyYYYYyy..', '.yYYyyyyYYy.', '.yYyYYYYyYy.', 'yYyYyyyyYyYy', 'yYyYyyyyYyYy', 'yYyYyyyyYyYy', 'yYyYyyyyYyYy', '.yYyYYYYyYy.', '.yYYyyyyYYy.', '..yyYYYYyy..', '....yyyy....'],
  elixir: ['.....kk.....', '.....ee.....', '....eppe....', '....eppe....', '...eeppee...', '..eeewpeee..', '.eeewwpeeee.', '.eeewpeeeee.', '.eeeeeeePee.', '..eePPPPee..', '...eeeeee...', '............'],
  sword: ['..........ww', '.........wmw', '........wmw.', '.......wmw..', '..b...wmw...', '...b.wmw....', '....bmw.....', '....yb......', '...yby......', '..yy..b.....', '.yy.........', 'yy..........'],
  plus: ['............', '....wwww....', '....wwww....', '....wwww....', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '....wwww....', '....wwww....', '....wwww....', '............'],
  minus: ['............', '............', '............', '............', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '............', '............', '............', '............'],
  shop: ['............', '..rwrwrwrw..', '.rwrwrwrwrw.', 'rwrwrwrwrwrw', 'rrrrrrrrrrrr', '.bbbbbbbbbb.', '.bllbbbbllb.', '.bllbbbbllb.', '.bbbbnnbbbb.', '.bbbbnnbbbb.', '.bbbbnnbbbb.', 'kkkkkkkkkkkk'],
  sun: ['.....y......', '..y..y..y...', '...yyyyy....', '..yyyyyyy...', 'yyyyyyyyyyy.', '..yyyyyyy...', '..yyyyyyy...', '...yyyyy....', '..y..y..y...', '.....y......', '............', '............'],
  moon: ['............', '....wwww....', '...www......', '..www.......', '..ww........', '..ww........', '..www.......', '...wwww..w..', '....wwwwww..', '......ww....', '............', '............'],
  hammer: ['............', '.mmmmmm.....', '.mMMMMm.....', '.mmmmmm.....', '...bb.......', '...bb.......', '...bb.......', '...bb.......', '...bb.......', '...bb.......', '...nn.......', '............'],
  clock: ['....kkkk....', '..kkwwwwkk..', '.kwwwwkwwwk.', '.kwwwwkwwwk.', 'kwwwwwkwwwwk', 'kwwwwwkkkkwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '..kkwwwwkk..', '....kkkk....'],
  bolt: ['.......yyyy.', '......yyyy..', '.....yyyy...', '....yyyy....', '...yyyyyyyy.', '..yyyyyyyy..', '......yyy...', '.....yyy....', '....yyy.....', '...yy.......', '..yy........', '.y..........'],
  snow: ['.....l......', '.l...l...l..', '..l..l..l...', '...l.l.l....', '....lll.....', 'lllllwlllll.', '....lll.....', '...l.l.l....', '..l..l..l...', '.l...l...l..', '.....l......', '............'],
  heart: ['............', '..rr....rr..', '.rppr..rrrr.', 'rpprrrrrrrrr', 'rprrrrrrrrrr', 'rrrrrrrrrrrr', '.rrrrrrrrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '............'],
  shield: ['.kkkkkkkkkk.', '.kuuuuuuuuk.', '.kuuuwwuuuk.', '.kuuuwwuuuk.', '.kuwwwwwwuk.', '.kuwwwwwwuk.', '.kuuuwwuuuk.', '..kuuwwuuk..', '..kuuuuuuk..', '...kuuuuk...', '....kuuk....', '.....kk.....'],
};
function drawIcon(c, name) {
  const rows = ICONS[name]; if (!rows) return;
  const x = c.getContext('2d');
  c.width = 12; c.height = 12;
  x.clearRect(0, 0, 12, 12);
  for (let r = 0; r < 12; r++) for (let i = 0; i < 12; i++) {
    const ch = rows[r][i]; if (!PAL[ch]) continue;
    x.fillStyle = PAL[ch]; x.fillRect(i, r, 1, 1);
  }
}
function icon(name, px) {
  const c = document.createElement('canvas'); c.className = 'ico';
  drawIcon(c, name);
  if (px) { c.style.width = px + 'px'; c.style.height = px + 'px'; }
  return c;
}
function costHTML(p) {
  const parts = [];
  if (p[0]) parts.push(`<span class="cost" data-cost="gold">${fmt(p[0])}</span>`);
  if (p[1]) parts.push(`<span class="cost" data-cost="elixir">${fmt(p[1])}</span>`);
  if (!p[0] && !p[1]) parts.push('<span class="cost">Free</span>');
  return parts.join(' ');
}
function hydrateCosts(root) {
  root.querySelectorAll('[data-cost]').forEach((el) => { el.prepend(icon(el.dataset.cost, 14)); delete el.dataset.cost; });
  root.querySelectorAll('[data-ico]').forEach((el) => { el.prepend(icon(el.dataset.ico, +el.dataset.px || 14)); delete el.dataset.ico; });
}
const daysLabel = (d) => (d === 0 ? 'Instant' : d === 1 ? '1 day' : d + ' days');

let bannerTimer = 0;
function banner(title, sub, kind) {
  const el = $('banner');
  el.className = 'banner ' + kind;
  el.innerHTML = `<div class="banner-title ol">${title}</div><div class="banner-sub ol">${sub}</div>`;
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.hidden = true; }, 1900);
}
let toastTimer = 0;
function toast(msg, ms) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1800);
}

function refreshUI() {
  if (!S) return;
  if (selectedId) renderSel();
  const building = S.phase === 'build';   // day = build, night = fight
  const ph = $('phase');
  ph.classList.toggle('is-day', building);
  document.body.classList.toggle('night', !building);
  drawIcon($('phaseIcon'), building ? 'sun' : 'moon');
  $('phaseTitle').textContent = (building ? 'DAY ' : 'NIGHT ') + S.day;
  const bl = builders();
  $('phaseSub').innerHTML = building ? `<span data-ico="hammer" data-px="14"></span>Builders ${bl.free}/${bl.total}` : `<span data-ico="shield" data-px="14"></span>Defend!`;
  hydrateCosts($('phaseSub'));
  for (const res of ['gold', 'elixir']) {
    const cap = capOf(res);
    $(res + 'Amt').textContent = fmt(S[res]);
    $(res + 'Cap').textContent = 'Max ' + fmt(cap);
    $(res + 'Fill').style.width = clamp((S[res] / cap) * 100, 0, 100) + '%';
  }
  $('shopBtn').hidden = !building || !!placing;
  $('defendBtn').hidden = !building || !!placing;
  $('defendBtn').title = `Start night ${S.day}: the raid begins`;
  $('wave').hidden = S.phase !== 'raid';
  $('speedBtn').hidden = S.phase !== 'raid';
  $('speedBtn').textContent = 'x' + speed;
  $('placeBar').hidden = !placing;
  updatePlaceTip();
  updateRepairAll();
  updateWave();
  updateSpells();
}
// ----- spells: stock, brewing and the night-time spell bar -----
const spellFactory = () => S.buildings.find((b) => b.type === 'spellfactory');
const factoryLevel = () => { const f = spellFactory(); return f ? Math.max(0, f.lvl) : 0; };
const spellSlots = () => { const f = spellFactory(); return f && f.lvl >= 1 ? def(f).slots[f.lvl - 1] : 0; };
const spellsStored = () => Object.values(S.spells).reduce((a, n) => a + n, 0);
function brew(type) {
  const sp = SPELLS[type], f = spellFactory();
  if (S.phase !== 'build') { toast('Spells are brewed during the day'); sfx('nope'); return; }
  if (!f || !active(f)) { toast('The Spell Factory must be built and working'); sfx('nope'); return; }
  if (f.lvl < sp.lvl) { toast(`Needs Spell Factory level ${sp.lvl}`); sfx('nope'); return; }
  if (spellsStored() >= spellSlots()) { toast('The Spell Factory is full'); sfx('nope'); return; }
  if (S.elixir < sp.cost) { toast('Not enough elixir'); sfx('nope'); return; }
  S.elixir -= sp.cost;
  S.spells[type]++;
  sfx('build'); save(); refreshUI(); renderSel(true);
}
function buildSpellBar() {
  const bar = $('spellBar');
  bar.innerHTML = '';
  Object.entries(SPELLS).forEach(([type, sp], i) => {
    const btn = document.createElement('button');
    btn.className = 'btn spell-btn';
    btn.dataset.spell = type;
    btn.title = `${sp.name} (${i + 1}): ${sp.desc}`;
    btn.innerHTML = `<span class="spell-cd"></span><span class="spell-count ol">0</span>`;
    btn.prepend(icon(sp.icon, 24));
    btn.onclick = () => { unlockAudio(); armSpell(type); };
    bar.appendChild(btn);
  });
}
function updateSpells() {
  if (!S) return;
  $('spellBar').hidden = S.phase !== 'raid' || (!spellsStored() && !spellArmed);
  for (const btn of $('spellBar').children) {
    const type = btn.dataset.spell, sp = SPELLS[type], n = S.spells[type] || 0;
    const cd = spellCd[type];
    btn.hidden = n <= 0 && spellArmed !== type;
    btn.querySelector('.spell-count').textContent = 'x' + n;
    btn.setAttribute('aria-label', `${sp.name}, ${n} left. ${sp.desc}`);
    btn.classList.toggle('armed', spellArmed === type);
    btn.classList.toggle('off', cd > 0 || n <= 0);
    btn.querySelector('.spell-cd').style.height = (cd > 0 ? (cd / sp.cd) * 100 : 0) + '%';
  }
}

function updateWave() {
  if (S.phase !== 'raid') return;
  const left = units.length + spawnQueue.length;
  $('waveText').textContent = 'ENEMIES ' + left;
}

// ----- repairs -----
// Damage now stays after a raid. Repairs cost gold: 40% of what the building is worth, scaled by the damage.
function worth(b) {
  const t = def(b);
  let v = 0;
  for (let l = 1; l <= Math.max(1, b.lvl); l++) { const c = t.cost[l - 1]; v += c ? c[0] + c[1] : (b.type === 'townhall' ? 1000 : 0); }
  return Math.max(v, 50);
}
function missingHp(b) { return b.destroyed ? maxHp(b) : Math.max(0, maxHp(b) - b.hp); }
function repairCost(b) {
  const miss = missingHp(b);
  if (miss <= 0) return 0;
  return Math.max(1, Math.ceil((miss / maxHp(b)) * worth(b) * 0.4));
}
function damaged() { return S.buildings.filter((b) => missingHp(b) > 0); }
function fixBuilding(b) {
  const wasDown = b.destroyed;
  b.destroyed = false; b.hp = maxHp(b); b.flash = 0;
  if (wasDown) rebuildBlocked();
  const c = center(b); floatText(c.x, c.y, '+', '#6fe03a');
}
function repair(b) {
  const cost = repairCost(b);
  if (!cost) return;
  if (S.gold < cost) { toast('Not enough gold'); sfx('nope'); return; }
  S.gold -= cost;
  fixBuilding(b);
  toast(`${def(b).name} repaired`);
  sfx('build'); if (S.phase === 'build') save(); refreshUI(); renderSel(true);
}
function repairAll() {
  const list = damaged().sort((a, b) => (b.type === 'townhall') - (a.type === 'townhall') || repairCost(a) - repairCost(b));
  if (!list.length) return;
  let spent = 0, fixed = 0;
  for (const b of list) {
    const c = repairCost(b);
    if (S.gold < c) continue;
    S.gold -= c; spent += c; fixed++;
    fixBuilding(b);
  }
  if (!fixed) { toast('Not enough gold'); sfx('nope'); return; }
  toast(fixed === list.length ? `Repaired ${fixed} building${fixed > 1 ? 's' : ''} for ${fmt(spent)} gold` : `Repaired ${fixed} of ${list.length}. Not enough gold for the rest.`);
  sfx('build'); if (S.phase === 'build') save(); refreshUI(); if (selectedId) renderSel(true);
}
function updateRepairAll() {
  const btn = $('repairAllBtn');
  const list = S.phase === 'build' || S.phase === 'raid' ? damaged() : [];
  btn.hidden = !list.length || !!placing;
  if (btn.hidden) return;
  const cost = list.reduce((a, b) => a + repairCost(b), 0);
  $('repairAllText').textContent = fmt(cost);
  btn.title = `Repair all ${list.length} damaged building${list.length > 1 ? 's' : ''} for ${fmt(cost)} gold`;
  btn.classList.toggle('off', S.gold < Math.min(...list.map(repairCost)));
}

// ----- selection panel -----
// The panel is only rebuilt when its layout changes. Live numbers (HP, repair price) update in place,
// so buttons stay clickable during a raid.
let selKey = '';
function select(id) { selectedId = id; renderSel(true); }
function deselect() { selectedId = null; selKey = ''; $('sel').hidden = true; }
function renderSel(force) {
  const b = byId(selectedId);
  const el = $('sel');
  if (!b) { deselect(); return; }
  const isFactory = b.type === 'spellfactory';
  const key = [b.id, b.lvl, b.cons ? b.cons.days : '-', b.destroyed, S.phase, missingHp(b) > 0, isFactory ? JSON.stringify(S.spells) : ''].join('|');
  if (!force && key === selKey && !el.hidden) { updateSelLive(b); return; }
  selKey = key;
  const t = def(b), lvl = b.lvl;
  const building = S.phase === 'build';
  const shownLvl = Math.max(1, lvl);
  const chips = [];
  if (t.dmg) chips.push(`Damage <b>${t.dmg[shownLvl - 1]}</b>`, `Range <b>${t.range}</b>`, `<b>${t.air && t.ground ? 'Ground + air' : t.air ? 'Air only' : 'Ground only'}</b>`);
  if (t.prod) chips.push(`Makes <b>${fmt(t.prod[shownLvl - 1])}</b>/night`);
  if (t.store && lvl >= 1) chips.push(`<span data-ico="${t.res}" data-px="14"></span><b data-stored="${t.res}"></b> / ${fmt(t.store[lvl - 1])}`);
  if (t.cap) chips.push(`<span data-ico="gold" data-px="14"></span><b data-stored="gold"></b> / ${fmt(t.cap[shownLvl - 1])}`, `<span data-ico="elixir" data-px="14"></span><b data-stored="elixir"></b> / ${fmt(t.cap[shownLvl - 1])}`);
  if (t.cap) chips.push('Fills first');
  if (t.slots) chips.push(`Spells <b>${spellsStored()}/${spellSlots() || t.slots[0]}</b>`);
  let status = '';
  if (b.cons) status = lvl < 1 ? `Being built: ready in ${daysLabel(b.cons.days)}.` : `Upgrading to level ${b.cons.to}: ready in ${daysLabel(b.cons.days)}. It won't work until then.`;
  else if (b.destroyed) status = 'Destroyed. It does nothing until you repair it.';
  else if (missingHp(b) > 0) status = 'Damaged. Repair it with gold.';
  const next = lvl + 1;
  let nextInfo = '';
  if (lvl >= 1 && !b.cons && next <= t.max && t.cost[next - 1]) {
    const bits = [`HP ${fmt(t.hp[next - 1])}`];
    if (t.dmg) bits.push(`Damage ${t.dmg[next - 1]}`);
    if (t.prod) bits.push(`Makes ${fmt(t.prod[next - 1])}`);
    if (t.store) bits.push(`Holds ${fmt(t.store[next - 1])}`);
    if (t.cap) bits.push(`Holds ${fmt(t.cap[next - 1])} each`);
    if (t.slots) bits.push(`${t.slots[next - 1]} spells`);
    nextInfo = `<div class="next-lvl">Next level: ${bits.join(' · ')}</div>`;
  }
  // Spell Factory: brew by day
  let brewHTML = '';
  if (isFactory && lvl >= 1) {
    const rows = Object.entries(SPELLS).map(([type, sp]) => {
      const locked = b.lvl < sp.lvl;
      const btn = !building ? '' : locked ? `<button class="btn mini" disabled>Level ${sp.lvl}</button>`
        : `<button class="btn mini go" data-brew="${type}">Brew <span class="cost" data-cost="elixir">${fmt(sp.cost)}</span></button>`;
      return `<div class="brew-row" title="${sp.desc}"><span data-ico="${sp.icon}" data-px="16"></span><span class="brew-name">${sp.name}</span><b>x${S.spells[type] || 0}</b>${btn}</div>`;
    }).join('');
    brewHTML = `<div class="brew">${rows}${building ? '' : '<div class="tiny">Spells are brewed during the day.</div>'}</div>`;
  }
  const actions = [];
  if (missingHp(b) > 0) actions.push(`<button class="btn mini go" id="repairBtn">Repair <span class="cost" data-cost="gold" id="repairCost">${fmt(repairCost(b))}</span></button>`);
  if (!b.cons && lvl >= 1) {
    if (next <= t.max && t.cost[next - 1]) {
      const p = t.cost[next - 1];
      if (next > levelCap(b.type)) actions.push(`<button class="btn mini" disabled>Upgrade: Town Hall ${b.type === 'wall' ? next : next - 1}</button>`);
      else if (!building) actions.push(`<button class="btn mini" disabled>Upgrade by day · ${costHTML(p)}</button>`);
      else if (b.destroyed) actions.push(`<button class="btn mini" disabled>Repair first</button>`);
      else actions.push(`<button class="btn mini go" id="upBtn">Upgrade ${costHTML(p)} · ${daysLabel(p[2])}</button>`);
    } else if (t.max > 1) actions.push('<button class="btn mini" disabled>Max level</button>');
  }
  if (building && b.type !== 'townhall') actions.push('<button class="btn mini wood" id="moveBtn">Move</button>');
  if (building && b.type === 'wall' && !b.cons) actions.push('<button class="btn mini no" id="sellBtn">Remove</button>');
  el.innerHTML = `
    <div class="sel-head">
      <div class="sel-name ol" title="${t.desc}">${t.name}${lvl >= 1 ? ` <span class="lvl">Lv ${lvl}</span>` : ''}</div>
      <div class="hpbar"><i id="selBar"></i><span id="selHp"></span></div>
      <button class="btn no close-x" id="selClose" aria-label="Close">&#x2716;</button>
    </div>
    <div class="sel-body">
      ${chips.length ? `<div class="chips">${chips.map((c) => `<span>${c}</span>`).join('')}</div>` : ''}
      ${status ? `<div class="note">${status}</div>` : ''}
      ${nextInfo}
      ${brewHTML}
      ${actions.length ? `<div class="sel-actions">${actions.join('')}</div>` : ''}
    </div>`;
  hydrateCosts(el);
  el.hidden = false;
  updateSelLive(b);
  $('selClose').onclick = deselect;
  el.querySelectorAll('[data-brew]').forEach((bt) => { bt.onclick = () => brew(bt.dataset.brew); });
  const rp = $('repairBtn'); if (rp) rp.onclick = () => repair(b);
  const up = $('upBtn'); if (up) up.onclick = () => upgrade(b);
  const mv = $('moveBtn'); if (mv) mv.onclick = () => beginMove(b);
  const sl = $('sellBtn'); if (sl) sl.onclick = () => { S.buildings = S.buildings.filter((o) => o !== b); rebuildBlocked(); deselect(); save(); refreshUI(); sfx('click'); };
}
function updateSelLive(b) {
  $('sel').querySelectorAll('[data-stored]').forEach((el) => { el.textContent = fmt(storedIn(b, el.dataset.stored)); });
  const hp = b.destroyed ? 0 : b.hp;
  const h = $('selHp'); if (h) h.textContent = `${fmt(hp)}/${fmt(maxHp(b))}`;
  const bar = $('selBar'); if (bar) bar.style.width = (hp / maxHp(b)) * 100 + '%';
  const rc = $('repairCost');
  if (rc) { const c = rc.lastChild; if (c && c.nodeType === 3) c.textContent = fmt(repairCost(b)); }
  const rb = $('repairBtn'); if (rb) rb.classList.toggle('off', S.gold < repairCost(b));
}
function upgrade(b) {
  const t = def(b), next = b.lvl + 1, p = t.cost[next - 1];
  if (!canAfford(p)) { toast(`Not enough ${S.gold < p[0] ? 'gold' : 'elixir'}`); sfx('nope'); return; }
  if (p[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
  S.gold -= p[0]; S.elixir -= p[1];
  if (p[2] === 0) { b.lvl = next; b.hp = maxHp(b); toast(`${t.name} upgraded to level ${next}!`); }
  else { b.cons = { to: next, days: p[2] }; toast(`Upgrade started: ${daysLabel(p[2])}`); }
  sfx('build'); save(); refreshUI(); renderSel(true);
}

// ----- placing / moving -----
function freeSpotFor(type, near) {
  const s = TYPES[type].size;
  const cx = near ? near.x : Math.round(screenToTile(window.innerWidth / 2, window.innerHeight / 2).x - s / 2);
  const cy = near ? near.y : Math.round(screenToTile(window.innerWidth / 2, window.innerHeight / 2).y - s / 2);
  for (let r = 0; r < GRID; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = clamp(cx + dx, 0, GRID - s), y = clamp(cy + dy, 0, GRID - s);
    if (fits(type, x, y)) return { x, y };
  }
  return null;
}
function beginPlace(type, near) {
  const spot = freeSpotFor(type, near);
  if (!spot) { toast('No room left. Move something first.'); return; }
  closeModal(); deselect();
  placing = type === 'wall'
    ? { type, multi: true, walls: [{ x: spot.x, y: spot.y }], moveId: null }
    : { type, x: spot.x, y: spot.y, ok: true, moveId: null };
  refreshUI();
}
function beginMove(b) {
  deselect();
  placing = { type: b.type, x: b.x, y: b.y, ok: true, moveId: b.id, lvl: b.lvl };
  refreshUI();
}
// every square being placed right now, for drawing
function placingSpots() {
  if (!placing) return [];
  if (placing.multi) return placing.walls.map((w) => ({ type: 'wall', x: w.x, y: w.y, ok: true }));
  return [{ type: placing.type, x: placing.x, y: placing.y, ok: placing.ok }];
}
// ----- laying many walls at once -----
const pendingAt = (x, y) => placing.walls.findIndex((w) => w.x === x && w.y === y);
function addPendingWall(x, y, quiet) {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID || pendingAt(x, y) >= 0 || !fits('wall', x, y)) return false;
  const n = placing.walls.length + 1, price = priceOf('wall', 1);
  if (countOf('wall') + n > limitOf('wall')) { if (!quiet) toast(`Wall limit reached (${limitOf('wall')}). Upgrade the Town Hall for more.`); return false; }
  if (S.gold < price[0] * n) { if (!quiet) toast('Not enough gold for more walls'); return false; }
  placing.walls.push({ x, y });
  return true;
}
function paintWallsTo(x, y) {
  // fill every tile between the last painted tile and this one, so fast drags leave no gaps
  let [cx, cy] = placing.paintFrom;
  let guard = 80;
  while ((cx !== x || cy !== y) && guard--) {
    if (cx !== x) cx += Math.sign(x - cx); else cy += Math.sign(y - cy);
    if (!addPendingWall(cx, cy, placing.warned) && pendingAt(cx, cy) < 0) placing.warned = true;
  }
  placing.paintFrom = [x, y];
  updatePlaceTip();
}
function cancelPlace() { placing = null; refreshUI(); }
function confirmPlace() {
  if (!placing) return;
  const p = placing;
  if (p.multi) {
    const n = p.walls.length, price = priceOf('wall', 1);
    if (!n) { toast('Tap the ground to add walls'); sfx('nope'); return; }
    if (S.gold < price[0] * n) { toast('Not enough gold'); sfx('nope'); return; }
    S.gold -= price[0] * n;
    for (const w of p.walls) add('wall', w.x, w.y, 1);
    placing = null; rebuildBlocked(); sfx('build'); save(); refreshUI();
    toast(`Built ${n} wall${n > 1 ? 's' : ''}`);
    return;
  }
  if (!p.ok) { toast("Can't build there"); sfx('nope'); return; }
  if (p.moveId) {
    const b = byId(p.moveId); b.x = p.x; b.y = p.y;
    placing = null; rebuildBlocked(); save(); refreshUI(); sfx('build'); return;
  }
  const t = TYPES[p.type], price = priceOf(p.type, 1);
  if (!canAfford(price)) { toast(`Not enough ${S.gold < price[0] ? 'gold' : 'elixir'}`); sfx('nope'); return; }
  if (price[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
  if (countOf(p.type) >= limitOf(p.type)) { toast('Upgrade the Town Hall to build more'); return; }
  S.gold -= price[0]; S.elixir -= price[1];
  if (price[2] === 0) add(p.type, p.x, p.y, 1);
  else add(p.type, p.x, p.y, 0, { to: 1, days: price[2] });
  rebuildBlocked();
  sfx('build');
  save();
  placing = null;
  refreshUI();
  if (price[2] > 0) toast(`${t.name} will be ready in ${daysLabel(price[2])}`);
}
// the tip bar shown at the bottom while placing
function updatePlaceTip() {
  const tip = $('placeTip');
  if (!placing) { tip.hidden = true; return; }
  const t = TYPES[placing.type];
  let html;
  if (placing.multi) {
    const n = placing.walls.length, price = priceOf('wall', 1);
    html = `<div class="tip-title">${n} wall${n === 1 ? '' : 's'} · ${costHTML([price[0] * n, 0])}</div>
      <div class="tip-help">Tap ground to add, tap a wall to remove. Drag from a wall to draw a line. Walls left: ${Math.max(0, limitOf('wall') - countOf('wall') - n)}</div>`;
  } else if (placing.moveId) {
    html = `<div class="tip-title">Moving ${t.name}</div><div class="tip-help">${placing.ok ? 'Drag it or tap a spot, then tap ✔' : "<span class='bad'>Can't go here: it overlaps something</span>"}</div>`;
  } else {
    const price = priceOf(placing.type, 1);
    html = `<div class="tip-title">${t.name} · ${costHTML(price)} · ${daysLabel(price[2])}</div>
      <div class="tip-help">${placing.ok ? 'Drag it or tap a spot, then tap ✔ to build' : "<span class='bad'>Can't build here: it overlaps something</span>"}</div>`;
  }
  tip.innerHTML = html;
  hydrateCosts(tip);
  tip.hidden = false;
}
$('placeOk').onclick = confirmPlace;
$('placeNo').onclick = cancelPlace;

// ----- shop -----
let shopTab = 'defense';
function openShop() {
  if (S.phase !== 'build') return;
  deselect();
  const m = $('modal');
  const tabs = SHOP_TABS.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${id === shopTab}" data-tab="${id}">${label}</button>`).join('');
  m.innerHTML = `<div class="window" role="dialog" aria-label="Shop">
    <div class="window-head"><div class="window-title ol">SHOP</div><button class="btn no close-x" id="shopClose" aria-label="Close">&#x2716;</button></div>
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="cards" id="cards"></div></div>`;
  m.hidden = false;
  $('shopClose').onclick = closeModal;
  m.querySelectorAll('.tab').forEach((t) => t.onclick = () => { shopTab = t.dataset.tab; openShop(); });
  const cards = $('cards');
  const list = SHOP_TABS.find((t) => t[0] === shopTab)[2];
  for (const type of list) {
    const t = TYPES[type];
    const have = countOf(type), lim = limitOf(type);
    const price = priceOf(type, 1);
    const maxed = have >= lim;
    const nextTh = LIMITS[type].findIndex((v) => v > have) + 1;
    const card = document.createElement('button');
    card.className = 'card' + (maxed ? ' locked' : '');
    card.innerHTML = `<div class="art"></div>
      <div class="name">${t.name}</div>
      <div class="meta">${maxed ? '' : costHTML(price)}<span class="count">${have}/${lim}</span></div>
      <div class="meta"><span class="count">${maxed ? '' : daysLabel(price[2])}</span></div>
      ${maxed ? `<div class="lock ol">${nextTh > 0 ? 'TOWN HALL ' + nextTh : 'MAXED'}</div>` : ''}`;
    card.querySelector('.art').appendChild(previewCanvas(type));
    hydrateCosts(card);
    card.onclick = () => {
      if (maxed) { toast(nextTh > 0 ? `Upgrade the Town Hall to level ${nextTh}` : 'You have built all of these'); sfx('nope'); return; }
      if (!canAfford(price)) { toast(`Not enough ${S.gold < price[0] ? 'gold' : 'elixir'}`); sfx('nope'); return; }
      if (price[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
      sfx('click');
      beginPlace(type);
    };
    cards.appendChild(card);
  }
  const first = m.querySelector('.tab[aria-selected="true"]'); if (first) first.focus();
}
function previewCanvas(type, height) {
  const c = document.createElement('canvas');
  c.width = 72; c.height = height || 60;
  const prev = g; g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const s = TYPES[type].size;   // side view: the building stands on a strip of ground near the bottom
  rect(0, c.height - 5, c.width, 5, '#90d870');
  drawBuilding({ type, lvl: 1, x: 0, y: 0, angle: 0.5, cons: null, hp: 1 }, 36, Math.round(c.height - 3 - (s * T) / 2), { noPad: true });
  g = prev;
  c.style.width = '144px'; c.style.height = '120px';
  return c;
}
function closeModal() { $('modal').hidden = true; $('modal').innerHTML = ''; }

// ----- popups -----
function popup(title, bodyHTML, buttons, cls) {
  const m = $('modal');
  m.innerHTML = `<div class="window popup ${cls || ''}" role="dialog" aria-label="${title.replace(/<[^>]+>/g, '')}">
    <div class="window-head"><div class="window-title ol">${title}</div></div>
    <div class="popup-body">${bodyHTML}<div class="sel-actions" id="popBtns"></div></div></div>`;
  const box = $('popBtns');
  for (const [label, cls2, fn] of buttons) {
    const b = document.createElement('button'); b.className = 'btn ' + cls2; b.innerHTML = label; b.onclick = fn; box.appendChild(b);
  }
  hydrateCosts(m);
  m.hidden = false;
  const first = box.querySelector('button'); if (first) first.focus();
}
function showGameOver(days) {
  clearTimeout(toastTimer); $('toast').classList.remove('show');
  popup('GAME OVER', `<p>Your Town Hall was destroyed on night ${days + 1}. The village has fallen.</p>
    <div class="loot"><div>NIGHTS SURVIVED: ${days}</div><div>BEST: ${Math.max(days, bestDay())}</div></div>`,
  [['NEW VILLAGE', 'war', () => { closeModal(); newGame(); rebuildBlocked(); centerOn(15, 15); refreshUI(); }]]);
}
function showTitle() {
  const hasSave = load();
  if (!hasSave) newGame();
  rebuildBlocked();
  centerOn(15, 15);
  refreshUI();
  const best = bestDay();
  popup('<span class="logo">CLASH</span>', `
    <div class="how">
      <div><span data-ico="sun" data-px="18"></span><span><b>Day:</b> build and upgrade. Everything but walls takes your builders at least a day.</span></div>
      <div><span data-ico="moon" data-px="18"></span><span><b>Night:</b> raiders attack. Your defenses fight on their own. From Town Hall 4, cast spells you brewed by day.</span></div>
      <div><span data-ico="hammer" data-px="18"></span><span>Tap a building to see it, repair it or upgrade it. Damage stays until you repair it.</span></div>
      <div><span data-ico="shield" data-px="18"></span><span>If your Town Hall falls, the game is over. How many nights can you last?</span></div>
    </div>
    ${best ? `<div class="loot"><div>BEST: ${best} NIGHTS</div></div>` : ''}
    <div class="ver-note">v${GAME_VERSION}</div>`,
  hasSave ? [['NEW', 'no', () => { closeModal(); newGame(); rebuildBlocked(); refreshUI(); }], [`CONTINUE · DAY ${S.day}`, 'go', () => { closeModal(); }]]
    : [['PLAY', 'go', () => { closeModal(); }]], 'title-screen');
}
function showPatchNotes() {
  const body = PATCH_NOTES.map((p) => `<section class="patch">
      <h3 class="ol">v${p.v}${p.v === GAME_VERSION ? ' <span class="now">CURRENT</span>' : ''}</h3>
      <div class="patch-date">${p.date}</div>
      <ul>${p.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    </section>`).join('');
  popup('PATCH NOTES', `<div class="patch-list">${body}</div>`, [['CLOSE', 'go', closeModal]], 'notes');
}
$('versionBtn').textContent = 'v' + GAME_VERSION;
$('versionBtn').onclick = () => { unlockAudio(); sfx('click'); showPatchNotes(); };
buildSpellBar();
$('shopBtn').onclick = () => { unlockAudio(); sfx('click'); openShop(); };
$('repairAllBtn').onclick = () => { unlockAudio(); repairAll(); };
$('defendBtn').onclick = () => { unlockAudio(); startRaid(); };
$('speedBtn').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; refreshUI(); };
document.querySelectorAll('canvas[data-icon]').forEach((c) => drawIcon(c, c.dataset.icon));

/* =====================================================================
   SOUND: tiny square-wave effects, made on the fly
   ===================================================================== */
let actx = null, lastSfx = {};
function unlockAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function tone(freq, dur, type, vol, slide, delay) {
  const t0 = actx.currentTime + (delay || 0);
  const o = actx.createOscillator(), gn = actx.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  gn.gain.setValueAtTime(vol || 0.05, t0); gn.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(gn).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, vol, delay) {
  const t0 = actx.currentTime + (delay || 0);
  const len = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = actx.createBufferSource(), gn = actx.createGain();
  src.buffer = buf; gn.gain.value = vol || 0.08; src.connect(gn).connect(actx.destination); src.start(t0);
}
// short vibrations on phones that support it (Android, and app wrappers)
function buzz(pattern) {
  if (!navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* not allowed here */ }
}
function sfx(name) {
  const now = performance.now();
  if (now - (lastSfx[name] || 0) < 70) return;
  lastSfx[name] = now;
  if (name === 'boom') buzz(18);
  else if (name === 'build') buzz(10);
  else if (name === 'nope') buzz([20, 40, 20]);
  else if (name === 'lose') buzz([60, 60, 160]);
  else if (name === 'win') buzz([30, 50, 30]);
  if (!actx || actx.state !== 'running') return;
  switch (name) {
    case 'cannon': tone(140, 0.12, 'square', 0.05, 0.4); noise(0.08, 0.04); break;
    case 'arrow': tone(900, 0.05, 'triangle', 0.025, 0.6); break;
    case 'mortar': tone(90, 0.2, 'square', 0.05, 0.5); break;
    case 'rocket': tone(500, 0.15, 'sawtooth', 0.025, 2); break;
    case 'boom': noise(0.3, 0.09); tone(70, 0.25, 'square', 0.04, 0.5); break;
    case 'hit': tone(220, 0.04, 'square', 0.02, 0.7); break;
    case 'click': tone(660, 0.04, 'square', 0.03); break;
    case 'nope': tone(160, 0.12, 'square', 0.04, 0.8); break;
    case 'build': tone(520, 0.06, 'square', 0.04); tone(780, 0.08, 'square', 0.04, 1, 0.07); break;
    case 'horn': tone(196, 0.35, 'sawtooth', 0.04); tone(262, 0.5, 'sawtooth', 0.04, 1, 0.3); break;
    case 'zap': noise(0.25, 0.09); tone(1400, 0.18, 'sawtooth', 0.04, 0.15); break;
    case 'freeze': tone(1600, 0.3, 'triangle', 0.04, 0.5); tone(2100, 0.25, 'triangle', 0.03, 0.6, 0.08); break;
    case 'heal': [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.04, 1, i * 0.07)); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.04, 1, i * 0.12)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'square', 0.04, 1, i * 0.18)); break;
  }
}

/* =====================================================================
   LOOP
   ===================================================================== */
let last = performance.now(), acc = 0, uiTick = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S) {
    acc += dt * (S.phase === 'raid' ? speed : 1);
    const STEP = 1 / 60;
    let n = 0;
    while (acc >= STEP && n++ < 12) { step(STEP); acc -= STEP; }
    render(now);
    uiTick += dt;
    if (uiTick > 0.25) { uiTick = 0; if (S.phase === 'raid') { updateWave(); for (const r of ['gold', 'elixir']) { $(r + 'Amt').textContent = fmt(S[r]); $(r + 'Fill').style.width = clamp(S[r] / capOf(r) * 100, 0, 100) + '%'; } updateSpells(); updateRepairAll(); if (selectedId) renderSel(); } }
  }
  requestAnimationFrame(frame);
}

// boot
scale = autoScale();
resize();
makeDecor();
showTitle();
requestAnimationFrame(frame);

// hooks for automated tests
window.ClashDebug = { get S() { return S; }, get units() { return units; }, step, startRaid, startBuild, waveFor, fits, getField, rebuildBlocked, endRaid, priceOf, newGame, add, builders, limitOf, countOf, levelCap, canAfford, freeSpotFor, thLevel, closeModal, TYPES, previewCanvas, refreshUI, get placing() { return placing; }, tileToScreen: (x, y) => ({ x: (x * T - cam.x + W / 2) * scale, y: (y * T - cam.y + H / 2) * scale }), maxHpOf: maxHp, repairCost, castSpell, armSpell, get spellCd() { return spellCd; }, SPELLS, GAME_VERSION, showPatchNotes };
