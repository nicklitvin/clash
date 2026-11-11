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
    hp: [450, 560, 680, 820], dmg: [12, 16, 21, 27], rate: 0.8, range: 8.5,
    cost: [[250, 0, 1], [1000, 0, 1], [3000, 0, 1], [8000, 0, 2]],
    desc: 'Fires heavy shots at raiders.' },
  archer: { name: 'Archer Tower', size: 3, cat: 'defense', max: 4,
    hp: [400, 480, 580, 700], dmg: [8, 11, 14, 18], rate: 0.55, range: 10,
    cost: [[0, 1000, 1], [0, 2000, 1], [0, 5000, 2], [0, 10000, 2]],
    desc: 'Long range, quick shots.' },
  mortar: { name: 'Mortar', size: 3, cat: 'defense', max: 3,
    hp: [400, 480, 580], dmg: [22, 30, 40], rate: 4.5, range: 11, minRange: 4, splash: 1.6,
    cost: [[4000, 0, 1], [8000, 0, 2], [16000, 0, 3]],
    desc: 'Lobs exploding shells that hit groups. Has a blind spot up close.' },
  airdef: { name: 'Rocket Tower', size: 3, cat: 'defense', max: 3,
    hp: [600, 700, 820], dmg: [60, 85, 115], rate: 2.2, range: 10,
    cost: [[0, 6000, 2], [0, 12000, 2], [0, 24000, 3]],
    desc: 'Slow, heavy rockets. Great against giants and dragons.' },
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
const BUILDER_COSTS = [0, 750, 1500, 3000, 6000]; // price of hut #1..#5 (you start with one)
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
  dragon: { name: 'Dragon', hp: 1000, dmg: 55, rate: 1.4, range: 2.4, speed: 1.15, space: 20, sprite: 'drag', ranged: true, fire: true, splash: 1.1 },
};

// ---------- version and patch notes (newest first) ----------
const GAME_VERSION = '0.8.0';
const PATCH_NOTES = [
  { v: '0.8.0', date: 'Nov 11, 2026', notes: [
    'Building info now uses round gauges for health, level, damage, range, output and storage, with the next-level value underneath.',
    'New Move button: drag any building to a new spot, then confirm. The Move button on each building is gone.',
    'Buildings under construction or upgrading show their progress as a ring in the middle of the icon.',
    'You now start with one builder. Extra Builder\'s Huts cost 750, 1,500, 3,000 and 6,000.',
    'Fight sits alone on the left; Repair, Walls, Move and Shop are together on the right.',
    'The end-of-night window just shows resources earned and what finished building or upgrading.',
    'No more big DAY / NIGHT banners.',
    'Raiders now respect walls: they walk around them, or stop and break through when going around is too far. Anything else in the way gets smashed too.',
    'No more flying units. Dragons walk, and the Air Defense is now a Rocket Tower that hits every raider.',
    'Less text in the building panel. Buttons you cannot use yet look disabled; tap one to see why.',
    'The confirm and cancel buttons are bright and solid.',
  ] },
  { v: '0.7.0', date: 'Nov 10, 2026', notes: [
    'Neon is now the only look: glowing outlines on a dark grid. The other themes and the Theme button are gone.',
    'New fonts: Inter for everything you read, Exo 2 for headings. Much easier to read.',
    'Clearer building icons: a castle, a bow and arrow, a rocket, a pickaxe, a pump, vaults that fill up, a hammer and a potion flask.',
    'The dots under each building are now a health bar that turns yellow and red as it takes damage.',
    'Raiders turn to face the way they are walking.',
    'A selected building glows brighter instead of flashing a border.',
    'Fight, Repair and Walls now sit side by side along the bottom.',
    'Repair opens a list of every damaged building, with a button for each one and one for all of them.',
    'The building panel and every window got the neon treatment.',
    'Tap the Day/Night box for your village stats. The version number lives at the bottom of that window now.',
    'Resources: tap a resource bar to cycle through four styles (Gold & Energy, Gold & Plasma, Gold & Crystal, Credits & Fuel).',
  ] },
  { v: '0.6.0', date: 'Nov 10, 2026', notes: [
    'New: themes! Tap Theme in the top left to switch between Toy, Emoji, Blueprint, Neon and the old Pixel look.',
    'Toy (the new default): soft flat shapes and round little critters with googly eyes.',
    'Emoji: every building and raider is an emoji. Blueprint: white line drawings on grid paper. Neon: glowing outlines in the dark.',
    'Easier-to-read text: new clean fonts and no more heavy outlines. Fixed letters like "fi" turning into odd shapes.',
    'New: Rearrange walls. Tap the Walls button (or Rearrange in a wall\'s panel) to pick up every wall and lay them out again.',
    'Walls you do not place are stored, and you can put them down later from the shop for free.',
  ] },
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
  S = { day: 1, phase: 'build', gold: 1000, elixir: 1000, nextId: 1, buildings: [], over: false, spells: { lightning: 0, heal: 0, freeze: 0 }, wallStash: [] };
  add('townhall', 13, 13, 1);
  add('cannon', 9, 14, 1);
  add('archer', 18, 11, 1);
  add('goldmine', 13, 8, 1);
  add('elixir', 8, 9, 1);
  add('builder', 19, 18, 1);
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
  if (placing && (placing.rearrange || placing.arrange)) return;   // mid-rearrange layouts are only saved once confirmed
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
    s.wallStash = Array.isArray(s.wallStash) ? s.wallStash : [];   // walls picked up but not placed yet
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
const WALL_COST = 9;       // raiders walk around walls unless that is much longer; then they break through
const BUILDING_COST = 40;  // other buildings in the way are broken only when there is no other route
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
    if (!o) return 1;
    return o.type === 'wall' ? WALL_COST : o === b ? Infinity : BUILDING_COST;
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
  refreshUI();
}
function spawnUnit(q) {
  const d = UNITS[q.type];
  const hpMul = 1 + Math.max(0, S.day - 8) * 0.06;
  units.push({ type: q.type, d, x: q.x, y: q.y, hp: d.hp * hpMul, maxhp: d.hp * hpMul, target: null, wall: null,
    next: null, cd: rnd(0, 0.4), dir: 1, walk: Math.random() * 6, flash: 0, ox: rnd(-0.15, 0.15), oy: rnd(-0.15, 0.15), z: 0 });
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
// end of night: the builders finish their work and the mines pay out; show just that
function showNightSummary() {
  clearTimeout(toastTimer); $('toast').classList.remove('show');
  const r = nightIncome();
  const before = { g: S.gold, e: S.elixir };
  gain('gold', r.mineGold); gain('elixir', r.pumpElixir);
  const done = [];
  for (const b of S.buildings) {
    if (!b.cons) continue;
    b.cons.days -= 1;
    if (b.cons.days <= 0) {   // a finished project comes back brand new
      const isNew = b.lvl < 1;
      b.lvl = b.cons.to; b.cons = null; b.destroyed = false; b.hp = maxHp(b);
      done.push({ b, isNew });
    }
  }
  if (done.length) rebuildBlocked();
  const row = (ico, label, val) => `<div class="sum-row"><span data-ico="${ico}" data-px="18"></span><span class="sum-label">${label}</span><b>${val}</b></div>`;
  const merged = new Map();   // "Wall built x3" instead of three rows
  for (const { b, isNew } of done) {
    const key = def(b).name + (isNew ? ' built' : ` → Lv ${b.lvl}`);
    merged.set(key, (merged.get(key) || 0) + 1);
  }
  const doneRows = [...merged].map(([k, n]) => `<div class="sum-row"><span data-ico="hammer" data-px="18"></span><span class="sum-label">${k}</span><b>${n > 1 ? '×' + n : '✔'}</b></div>`).join('');
  popup(`NIGHT ${S.day} SURVIVED`, `
    <div class="summary">
      ${row('gold', resName('gold'), '+' + fmt(S.gold - before.g))}
      ${row('elixir', resName('elixir'), '+' + fmt(S.elixir - before.e))}
      ${doneRows}
    </div>`, [[`Start day ${S.day + 1}`, 'go', () => { closeModal(); startBuild(); }]]);
}
function startBuild() {
  S.day++;
  S.phase = 'build';
  units = []; shots = []; texts = []; spawnQueue = []; flags = [];
  for (const b of S.buildings) {
    b.hp = Math.min(b.hp, maxHp(b));
    b.cd = 0; b.flash = 0; b.target = null;
  }
  rebuildBlocked();
  save();
  refreshUI();
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
  // close enough to hit (matches the goal cells of the path field, so no one walks over anything)
  if (distToRect(u.x, u.y, u.target) <= range + 0.45) { attack(u, u.target); return; }
  if (!u.next || Math.hypot(u.next.x - u.x, u.next.y - u.y) < 0.12) {
    const f = getField(u.target, range);
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    let best = null, bd = inField(cx, cy) ? f.dist[cellIndex(cx, cy)] : Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = cx + ox, ny = cy + oy;
      if (!inField(nx, ny)) continue;
      if (ox && oy && (blocked[cellIndex(cx + ox, cy)] || blocked[cellIndex(cx, cy + oy)])) continue;   // no squeezing past corners
      const v = f.dist[cellIndex(nx, ny)];
      if (v < bd - 0.01) { bd = v; best = { x: nx, y: ny }; }
    }
    if (!best) {
      // nowhere better to step: break the nearest building touching us, if any; otherwise step to the cell centre
      let nb = null, nd = Infinity;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = inField(cx + ox, cy + oy) && blocked[cellIndex(cx + ox, cy + oy)];
        const o = id && byId(id);
        if (o && !o.destroyed) { const dd = distToRect(u.x, u.y, o); if (dd < nd) { nd = dd; nb = o; } }
      }
      if (nb) { u.wall = nb; return; }
      u.next = { x: cx + 0.5, y: cy + 0.5 };
    } else {
      const occ = blocked[cellIndex(best.x, best.y)];
      if (occ) { const o = byId(occ); if (o && !o.destroyed) { u.wall = o; return; } }   // a wall (or building) is in the way: break it
      u.next = { x: best.x + 0.5 + u.ox, y: best.y + 0.5 + u.oy };
    }
  }
  const tx = u.next.x, ty = u.next.y;
  const dx = tx - u.x, dy = ty - u.y, len = Math.hypot(dx, dy) || 1;
  const v = d.speed * dt;
  u.x += (dx / len) * Math.min(v, len);
  u.y += (dy / len) * Math.min(v, len);
  if (Math.abs(dx) > 0.01) u.dir = dx > 0 ? 1 : -1;
  if (Math.hypot(dx, dy) > 0.01) u.heading = Math.atan2(dy, dx);
  u.walk += dt * 10;
}

function attack(u, b) {
  const c = center(b);
  const ddx = c.x - u.x;
  if (Math.abs(ddx) > 0.01) u.dir = ddx > 0 ? 1 : -1;
  u.heading = Math.atan2(c.y - u.y, c.x - u.x);
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
  if (d.ranged) {
    shots.push({ kind: d.fire ? 'fire' : 'enemyArrow', x: u.x, y: u.y, z: 4, tx: c.x + rnd(-0.4, 0.4), ty: c.y + rnd(-0.4, 0.4), b, dmg, from: u, speed: d.fire ? 7 : 11, splash: d.splash || 0 });
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
  const valid = (u) => u && u.hp > 0 && (() => {
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
   RENDERING: neon line art on a dark grid, drawn at full screen resolution
   (world units are scaled up with a transform, so every line stays sharp)
   ===================================================================== */
const canvas = $('game');
let g = canvas.getContext('2d');
let scale = 2, W = 0, H = 0;                  // W, H: visible size in world units
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const cam = { x: 0, y: 0 };                   // world point at the centre of the screen
const TAU = Math.PI * 2;
const FONT_STACK = '"Exo 2", system-ui, sans-serif';

function mixHex(a, b, k) {
  const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) * (1 - k) + p(b, i) * k).toString(16).padStart(2, '0')).join('');
}

// --- drawing primitives ---
function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function sq(cx, cy, n, col) { const w = n * T; rect(cx - w / 2, cy - w / 2, w, w, col); }
function circ(cx, cy, r, col) { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, Math.max(0, r), 0, TAU); g.fill(); }
function ring(cx, cy, rx, ry, col, dash) {
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(dash ? [3, 3] : []); g.stroke(); g.setLineDash([]);
}
function line(x0, y0, x1, y1, col, t) {
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
  g.strokeStyle = col; g.lineWidth = t || 1; g.lineCap = 'round'; g.stroke();
}
function rrect(x, y, w, h, r, fill, stroke, lw) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
}
function disc(cx, cy, r, fill, stroke, lw) {
  g.beginPath(); g.arc(cx, cy, Math.max(0, r), 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
}
function poly(pts, fill, stroke, lw, open) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (!open) g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
function turned(cx, cy, a, fn) { g.save(); g.translate(cx, cy); g.rotate(a); fn(); g.restore(); }
function glow(col, blur, fn) { g.save(); g.shadowColor = col; g.shadowBlur = blur; fn(); g.restore(); }
// text in the world (floating numbers, badges)
function worldText(str, cx, y, col, size) {
  g.font = `700 ${size || 8}px ${FONT_STACK}`;
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.lineJoin = 'round'; g.lineWidth = 2.4; g.strokeStyle = '#000000';
  g.strokeText(str, cx, y); g.fillStyle = col; g.fillText(str, cx, y);
}
// world (tile) → screen (world units on the scaled canvas)
const sx = (x) => x * T - cam.x + W / 2;
const sy = (x, y) => y * T - cam.y + H / 2;

// ---------- resource styles: tap a resource bar to cycle through them ----------
// Internally the two resources are still 'gold' and 'elixir'; these only change names, colours and icons.
const RES_STYLES = [
  { id: 'energy', gold: { name: 'Gold', icon: 'coin', col: '#ffd23f' }, elixir: { name: 'Energy', icon: 'bolt', col: '#3dffa8' },
    names: { goldmine: 'Gold Mine', goldstore: 'Gold Vault', elixir: 'Energy Pump', elixstore: 'Battery' } },
  { id: 'plasma', gold: { name: 'Gold', icon: 'coin', col: '#ffd23f' }, elixir: { name: 'Plasma', icon: 'orb', col: '#ff4fd8' },
    names: { goldmine: 'Gold Mine', goldstore: 'Gold Vault', elixir: 'Plasma Pump', elixstore: 'Plasma Tank' } },
  { id: 'crystal', gold: { name: 'Gold', icon: 'coin', col: '#ffd23f' }, elixir: { name: 'Crystal', icon: 'gem', col: '#b48cff' },
    names: { goldmine: 'Gold Mine', goldstore: 'Gold Vault', elixir: 'Crystal Drill', elixstore: 'Crystal Vault' } },
  { id: 'fuel', gold: { name: 'Credits', icon: 'hexcoin', col: '#ffb13d' }, elixir: { name: 'Fuel', icon: 'drop', col: '#a6ff3d' },
    names: { goldmine: 'Credit Mint', goldstore: 'Credit Vault', elixir: 'Fuel Pump', elixstore: 'Fuel Tank' } },
];
const RES_KEY = 'clash-resources';
let resStyle = 0;
try { resStyle = clamp(+localStorage.getItem(RES_KEY) || 0, 0, RES_STYLES.length - 1); } catch (e) { /* ignore */ }
const RS = () => RES_STYLES[resStyle];
const resName = (key) => RS()[key].name;
const resCol = (key) => RS()[key].col;
function applyResStyle() {
  const st = RS();
  for (const [type, name] of Object.entries(st.names)) TYPES[type].name = name;
  TYPES.goldmine.desc = `Produces ${st.gold.name.toLowerCase()} every night it is working.`;
  TYPES.elixir.desc = `Produces ${st.elixir.name.toLowerCase()} every night it is working.`;
  TYPES.goldstore.desc = `Holds ${st.gold.name.toLowerCase()} once the Town Hall is full. Goblins go straight for it.`;
  TYPES.elixstore.desc = `Holds ${st.elixir.name.toLowerCase()} once the Town Hall is full. Goblins go straight for it.`;
  document.documentElement.style.setProperty('--res1', st.gold.col);
  document.documentElement.style.setProperty('--res2', st.elixir.col);
  for (const k in SPELLS) SPELLS[k].res = st.elixir.name;
}
// the icon for a resource, centred at (x, y) with radius r
function resIcon(key, x, y, r, col, lw) {
  const kind = RS()[key].icon;
  col = col || resCol(key); lw = lw || 1.2;
  switch (kind) {
    case 'coin': disc(x, y, r, null, col, lw); disc(x, y, r * 0.55, null, col, lw * 0.8); break;
    case 'hexcoin': {
      const p = Array.from({ length: 6 }, (_, i) => [x + Math.cos(i * Math.PI / 3 + Math.PI / 6) * r, y + Math.sin(i * Math.PI / 3 + Math.PI / 6) * r]);
      poly(p, null, col, lw);
      g.beginPath(); g.arc(x, y, r * 0.45, 0.8, TAU - 0.8); g.strokeStyle = col; g.lineWidth = lw * 0.8; g.stroke();
      break;
    }
    case 'bolt': poly([[x + r * 0.25, y - r], [x - r * 0.55, y + r * 0.15], [x, y + r * 0.15], [x - r * 0.25, y + r], [x + r * 0.55, y - r * 0.15], [x, y - r * 0.15]], null, col, lw); break;
    case 'orb':
      disc(x, y, r * 0.5, col);
      g.beginPath(); g.ellipse(x, y, r, r * 0.42, -0.5, 0, TAU); g.strokeStyle = col; g.lineWidth = lw * 0.8; g.stroke();
      break;
    case 'gem': poly([[x - r, y - r * 0.3], [x - r * 0.5, y - r * 0.85], [x + r * 0.5, y - r * 0.85], [x + r, y - r * 0.3], [x, y + r]], null, col, lw);
      line(x - r, y - r * 0.3, x + r, y - r * 0.3, col, lw * 0.7); break;
    case 'drop':
      g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 1.05, y + r * 0.2, x, y + r); g.quadraticCurveTo(x - r * 1.05, y + r * 0.2, x, y - r);
      g.strokeStyle = col; g.lineWidth = lw; g.stroke(); break;
  }
}

// ---------- palette ----------
const NEON = { bg: '#07070f', grid: 'rgba(80,80,200,0.12)', major: 'rgba(80,80,220,0.24)', edge: 'rgba(53,240,255,0.55)',
  th: '#ffffff', defense: '#35f0ff', wall: '#7d7dff', builder: '#c8c8e8', special: '#ff8a3d', enemy: '#ff3b5c', dim: 'rgba(130,130,190,0.55)' };
function buildingColor(b) {
  if (b.type === 'townhall') return NEON.th;
  if (b.type === 'wall') return NEON.wall;
  if (b.type === 'builder') return NEON.builder;
  if (b.type === 'spellfactory') return NEON.special;
  const t = TYPES[b.type];
  if (t.cat === 'resource') return resCol(t.res);
  return NEON.defense;
}
const hpColor = (f) => (f > 0.6 ? '#3dffa8' : f > 0.3 ? '#ffd23f' : '#ff3b5c');

// ---------- buildings: an outlined pad with a clear symbol, and a health bar along the bottom ----------
function drawBuilding(b, cx, cy, opts) {
  opts = opts || {};
  const t = def(b), s = t.size, half = (s * T) / 2 - 2.5;
  let col = buildingColor(b);
  if (b.flash > 0) col = '#ffffff';
  const sel = opts.selected;
  if (b.type === 'wall') { drawWall(b, cx, cy, col, opts); return; }
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (b.destroyed) {
    g.setLineDash([3, 3]); rrect(cx - half, cy - half, half * 2, half * 2, 3, null, NEON.dim, 1); g.setLineDash([]);
    line(cx - half * 0.5, cy - half * 0.5, cx + half * 0.5, cy + half * 0.5, NEON.dim, 1.2);
    line(cx + half * 0.5, cy - half * 0.5, cx - half * 0.5, cy + half * 0.5, NEON.dim, 1.2);
    if (sel) rrect(cx - half, cy - half, half * 2, half * 2, 3, 'rgba(255,255,255,0.08)');
    g.restore(); return;
  }
  if (b.cons && !opts.preview) {   // being built or upgraded: dimmed icon with a progress ring in the middle
    if (b.lvl < 1) { g.setLineDash([2, 3]); rrect(cx - half, cy - half, half * 2, half * 2, 3, sel ? 'rgba(255,255,255,0.08)' : null, col, 1); g.setLineDash([]); }
    else glow(col, sel ? 18 : 6, () => rrect(cx - half, cy - half, half * 2, half * 2, 3, sel ? hexA(col, 0.16) : 'rgba(255,255,255,0.025)', col, sel ? 2 : 1.2));
    g.globalAlpha = 0.28; buildingIcon(b, cx, cy, half, col, 1.1); g.globalAlpha = 1;
    drawProgressRing(cx, cy, Math.min(11, half * 0.62), consProgress(b), b.cons.days + 'd');
    g.restore(); return;
  }
  const blur = sel ? 18 : 8;
  glow(col, blur, () => {
    rrect(cx - half, cy - half, half * 2, half * 2, 3, sel ? hexA(col, 0.16) : 'rgba(255,255,255,0.025)', col, sel ? 2 : 1.2);
    buildingIcon(b, cx, cy, half, col, sel ? 1.7 : 1.4);
  });
  // health status along the bottom of the pad
  if (!opts.ghost && !opts.preview && b.hp != null && b.id) {
    const f = clamp(b.hp / maxHp(b), 0, 1), bw = half * 2 - 8, by = cy + half - 4;
    rect(cx - bw / 2, by, bw, 1.6, 'rgba(255,255,255,0.12)');
    glow(hpColor(f), 6, () => rect(cx - bw / 2, by, bw * f, 1.6, hpColor(f)));
  }
  g.restore();
}
// how far along a building project is (0..1)
function consProgress(b) {
  if (!b.cons) return 1;
  const total = b.cons.total || (TYPES[b.type].cost[b.cons.to - 1] || [0, 0, 1])[2] || 1;
  return clamp(1 - b.cons.days / total, 0, 1);
}
function drawProgressRing(cx, cy, r, f, label) {
  disc(cx, cy, r + 1.5, 'rgba(7,7,15,0.85)');
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.strokeStyle = 'rgba(255,210,63,0.22)'; g.lineWidth = 2.2; g.stroke();
  if (f > 0) glow('#ffd23f', 8, () => { g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.strokeStyle = '#ffd23f'; g.lineWidth = 2.2; g.lineCap = 'round'; g.stroke(); });
  g.font = `700 ${Math.max(6, r * 0.75)}px ${FONT_STACK}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd23f';
  g.fillText(label, cx, cy + 0.5);
}
function hexA(hex, a) { const p = (i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16); return `rgba(${p(0)},${p(1)},${p(2)},${a})`; }
function drawWall(b, cx, cy, col, opts) {
  const j = opts.join || {}, lvl = Math.max(1, b.lvl);
  if (b.destroyed) { line(cx - 2, cy - 2, cx + 2, cy + 2, NEON.dim, 1); line(cx + 2, cy - 2, cx - 2, cy + 2, NEON.dim, 1); return; }
  // a damaged wall shifts toward red
  if (b.id && b.hp < maxHp(b) && b.flash <= 0) col = mixHex(col, '#ff3b5c', 1 - b.hp / maxHp(b));
  const lw = 1 + lvl * 0.5;
  glow(col, opts.selected ? 16 : 7, () => {
    if (j.r) line(cx, cy, cx + T / 2, cy, col, lw);
    if (j.l) line(cx, cy, cx - T / 2, cy, col, lw);
    if (j.d) line(cx, cy, cx, cy + T / 2, col, lw);
    if (j.u) line(cx, cy, cx, cy - T / 2, col, lw);
    rrect(cx - 3, cy - 3, 6, 6, 1, opts.selected ? hexA(col, 0.35) : NEON.bg, col, 1.3);
  });
}
// the symbol in the middle of each building, drawn in a box about ±20 units (scaled to the building's size)
function buildingIcon(b, cx, cy, half, col, lw) {
  const k = half / 21.5;
  g.save(); g.translate(cx, cy); g.scale(k, k);
  g.strokeStyle = col; g.lineWidth = lw / k * 1.1; g.lineJoin = 'round'; g.lineCap = 'round';
  const L = g.lineWidth;
  const ang = b.angle || 0;
  switch (b.type) {
    case 'townhall': {   // a castle with two towers and a door
      poly([[-13, 12], [-13, -12], [-11, -12], [-11, -9], [-9, -9], [-9, -12], [-7, -12], [-7, -4], [-3, -4], [-3, -7], [3, -7], [3, -4], [7, -4], [7, -12], [9, -12], [9, -9], [11, -9], [11, -12], [13, -12], [13, 12]], null, col, L);
      g.beginPath(); g.moveTo(-3.5, 12); g.lineTo(-3.5, 6); g.arc(0, 6, 3.5, Math.PI, 0); g.lineTo(3.5, 12); g.stroke();
      disc(-10, -1, 1.2, col); disc(10, -1, 1.2, col);
      break;
    }
    case 'cannon':       // round body with a thick barrel aimed at the target
      disc(0, 0, 6.5, null, col, L);
      turned(0, 0, ang, () => { rrect(5, -2.6, 9 - (b.recoil ? 2 : 0), 5.2, 1.5, null, col, L); });
      disc(0, 0, 2, col);
      break;
    case 'archer':       // a bow with an arrow, aimed at the target
      turned(0, 0, ang, () => {
        g.beginPath(); g.arc(-4, 0, 10, -1.15, 1.15); g.stroke();
        const ex = -4 + Math.cos(1.15) * 10, ey = Math.sin(1.15) * 10;
        line(ex, -ey, ex, ey, col, L * 0.6);                 // string
        line(-9, 0, 11, 0, col, L);                           // arrow
        poly([[13, 0], [9, -3], [9, 3]], col);
        line(-9, 0, -12, -3, col, L * 0.8); line(-9, 0, -12, 3, col, L * 0.8);
      });
      break;
    case 'mortar':       // a wide pot, with the dotted arc of a lobbed shell
      disc(0, 3, 8, null, col, L); disc(0, 3, 4 + (b.recoil ? 1 : 0), col);
      g.setLineDash([2, 3]); g.beginPath(); g.moveTo(-12, -2); g.quadraticCurveTo(0, -22, 12, -2); g.stroke(); g.setLineDash([]);
      break;
    case 'airdef':       // a rocket pointing at the target
      turned(0, 0, ang, () => {
        poly([[13, 0], [7, -4], [-8, -4], [-8, 4], [7, 4]], null, col, L);
        poly([[-6, -4], [-11, -9], [-11, -4]], null, col, L); poly([[-6, 4], [-11, 9], [-11, 4]], null, col, L);
        disc(3, 0, 1.8, col);
      });
      break;
    case 'goldmine': {   // a pickaxe, with the resource it digs
      line(-10, 10, 6, -6, col, L);
      g.beginPath(); g.moveTo(-3, -12); g.quadraticCurveTo(8, -10, 12, 1); g.stroke();
      resIcon('gold', 8, 9, 4.5, col, L * 0.9);
      break;
    }
    case 'elixir': {     // a pump: a tank with a lever and a pipe, holding the resource
      rrect(-6, -9, 12, 19, 3, null, col, L);
      line(0, -9, 0, -13, col, L); line(0, -13, 10, -16, col, L);   // lever
      line(6, 6, 12, 6, col, L); line(12, 6, 12, 11, col, L);       // spout
      resIcon('elixir', 0, 1, 4, col, L * 0.9);
      break;
    }
    case 'goldstore':
    case 'elixstore': {  // a vault that fills up
      const res = b.type === 'goldstore' ? 'gold' : 'elixir', f = storedFrac(b);
      rrect(-12, -12, 24, 24, 3, null, col, L);
      for (let y = 10; y > 12 - 24 * f; y -= 3) line(-10, y, 10, y, hexA(col, 0.55), L * 0.6);
      disc(0, 0, 6.5, NEON.bg);
      resIcon(res, 0, 0, 5, col, L);
      break;
    }
    case 'builder':      // a hammer
      turned(0, 0, -Math.PI / 4, () => { line(0, 12, 0, -5, col, L); rrect(-7, -11, 14, 6, 1.5, null, col, L); });
      break;
    case 'spellfactory': // a potion flask with a sparkle
      g.beginPath(); g.moveTo(-3, -12); g.lineTo(-3, -5); g.lineTo(-10, 9); g.quadraticCurveTo(0, 13, 10, 9); g.lineTo(3, -5); g.lineTo(3, -12); g.stroke();
      line(-5, -12, 5, -12, col, L);
      line(-7, 4, 7, 4, col, L * 0.7);
      line(10, -12, 10, -6, col, L * 0.7); line(7, -9, 13, -9, col, L * 0.7);
      break;
  }
  g.restore();
}
function drawHpBar(cx, y, w, frac) {
  rect(cx - w / 2, y, w, 1.6, 'rgba(255,255,255,0.15)');
  rect(cx - w / 2, y, w * clamp(frac, 0, 1), 1.6, hpColor(frac));
}

// ---------- raiders: red outlined shapes that turn to face where they are going ----------
const UNIT_R = { barbarian: 4.2, archer: 3.9, goblin: 3.6, giant: 6.8, breaker: 4, dragon: 7.4 };
function drawUnitShape(u, cx, cy, now) {
  let col = NEON.enemy;
  if (u.frozen > 0) col = '#a8e0ff';
  if (u.flash > 0) col = '#ffffff';
  const r = UNIT_R[u.type] || 4, a = u.heading || 0, y = cy - (u.d.air ? 3 : 0);
  glow(col, 8, () => turned(cx, y, a, () => {
    switch (u.type) {
      case 'barbarian': poly([[r * 1.15, 0], [-r * 0.8, -r * 0.85], [-r * 0.4, 0], [-r * 0.8, r * 0.85]], null, col, 1.2); break;
      case 'archer': poly([[r * 1.2, 0], [0, -r * 0.7], [-r * 0.9, 0], [0, r * 0.7]], null, col, 1.2); line(r * 0.2, 0, r * 1.6, 0, col, 0.8); break;
      case 'goblin': disc(0, 0, r * 0.8, null, col, 1.2); poly([[r * 0.7, -r * 0.45], [r * 1.5, 0], [r * 0.7, r * 0.45]], col); break;
      case 'giant': rrect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, 1.5, null, col, 1.6); poly([[r * 0.85, -r * 0.4], [r * 1.35, 0], [r * 0.85, r * 0.4]], col); break;
      case 'breaker': disc(0, 0, r * 0.8, null, col, 1.2); line(-r * 0.5, -r * 0.6, -r * 1.1, -r * 1.3, '#ffd23f', 1); disc(r * 0.45, 0, 1, col); break;
      case 'dragon': poly([[r * 1.2, 0], [-r * 0.6, -r * 1.25], [-r * 0.15, 0], [-r * 0.6, r * 1.25]], hexA(col === NEON.enemy ? '#ff3b5c' : '#ffffff', 0.15), col, 1.4); break;
    }
  }));
}

// ---------- the ground: a dark grid, with the village edge dashed ----------
function drawGroundNeon() {
  rect(0, 0, W, H, NEON.bg);
  const x0 = sx(-MARGIN), y0 = sy(0, -MARGIN);
  g.fillStyle = NEON.grid;
  for (let i = 0; i <= N; i++) { g.fillRect(x0 + i * T, y0, 0.4, N * T); g.fillRect(x0, y0 + i * T, N * T, 0.4); }
  g.fillStyle = NEON.major;
  for (let i = 0; i <= N; i += 5) { g.fillRect(x0 + i * T, y0, 0.6, N * T); g.fillRect(x0, y0 + i * T, N * T, 0.6); }
  g.save(); g.setLineDash([4, 3]); rrect(sx(0), sy(0, 0), GRID * T, GRID * T, 2, null, NEON.edge, 1); g.restore();
}
// faint dots scattered outside the village
let decor = [];
function makeDecor() {
  decor = [];
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4), t = -MARGIN + r() * (GRID + MARGIN * 2), d = -MARGIN + r() * (MARGIN - 1.5);
    let x, y;
    if (side === 0) { x = t; y = d; } else if (side === 1) { x = GRID - d; y = t; } else if (side === 2) { x = t; y = GRID - d; } else { x = d; y = t; }
    decor.push({ x, y, v: r() });
  }
}

// ---------- the frame ----------
function render(now) {
  const night = S.phase === 'raid' || S.phase === 'won' || S.phase === 'lost';
  drawGroundNeon();
  for (const d of decor) disc(sx(d.x), sy(0, d.y), 0.8 + d.v, 'rgba(93,255,155,0.22)');
  const sel = selectedId && byId(selectedId);
  for (const p of placingSpots()) {
    const s = TYPES[p.type].size;
    sq(sx(p.x + s / 2), sy(0, p.y + s / 2), s, p.ok ? 'rgba(61,255,168,0.18)' : 'rgba(255,59,92,0.25)');
  }
  const hi = placing && placing.arrange ? byId(placing.sel) : !placing ? sel : null;
  for (const b of S.buildings) {
    if (placing && placing.moveId === b.id) continue;
    drawBuildingAt(b, hi === b);
  }
  for (const p of placingSpots()) {
    const s = TYPES[p.type].size;
    g.globalAlpha = 0.85;
    drawBuilding({ type: p.type, lvl: p.lvl || 1, x: p.x, y: p.y, angle: 0.6, cons: null }, sx(p.x + s / 2), sy(0, p.y + s / 2), { ghost: true, join: {} });
    g.globalAlpha = 1;
  }
  for (const f of flags) drawFlag(f, now);
  const order = units.slice().sort((a, b) => (a.d.air ? 1 : 0) - (b.d.air ? 1 : 0));
  for (const u of order) drawUnit(u, now);
  if (sel && def(sel).range && !placing) {
    const c = center(sel), t = def(sel);
    ring(sx(c.x), sy(0, c.y), t.range * T, t.range * T, 'rgba(53,240,255,0.6)', true);
    if (t.minRange) ring(sx(c.x), sy(0, c.y), t.minRange * T, t.minRange * T, 'rgba(255,59,92,0.6)', true);
  }
  if (placing && !placing.multi && TYPES[placing.type].range) {
    const t = TYPES[placing.type], s = t.size;
    ring(sx(placing.x + s / 2), sy(0, placing.y + s / 2), t.range * T, t.range * T, 'rgba(53,240,255,0.5)', true);
  }
  for (const s of shots) drawShot(s);
  for (const e of fx) drawFx(e);
  for (const t of texts) {
    const k = t.t / t.life;
    worldText(t.text, sx(t.x), sy(0, t.y) - 14 - k * 14, t.color, 8);
  }
  if (spellArmed && hover && S.phase === 'raid') {
    const sp = SPELLS[spellArmed], x = sx(hover.x), y = sy(0, hover.y), r = sp.radius * T;
    g.globalAlpha = 0.15; circ(x, y, r, sp.color); g.globalAlpha = 1;
    ring(x, y, r, r, sp.color, true);
  }
  if (night) rect(0, 0, W, H, 'rgba(0,0,0,0.3)');
}
function drawBuildingAt(b, selected) {
  const c = center(b);
  const cx = sx(c.x), cy = sy(0, c.y);
  if (cx < -50 || cx > W + 50 || cy < -40 || cy > H + 40) return;
  let join = null;
  if (b.type === 'wall') {
    const nbr = (dx, dy) => {
      if (!inField(b.x + dx, b.y + dy)) return false;
      const id = blocked[cellIndex(b.x + dx, b.y + dy)]; const o = id && byId(id);
      return !!(o && o.type === 'wall' && !o.destroyed && o.lvl >= 1);
    };
    join = { l: nbr(-1, 0), r: nbr(1, 0), u: nbr(0, -1), d: nbr(0, 1) };
  }
  drawBuilding(b, cx, cy, { join, selected });
}
function drawUnit(u, now) {
  const cx = sx(u.x), cy = sy(0, u.y);
  if (cx < -30 || cx > W + 30 || cy < -40 || cy > H + 30) return;
  drawUnitShape(u, cx, cy, now);
  if (u.hp < u.maxhp) drawHpBar(cx, cy - (UNIT_R[u.type] || 4) - (u.d.air ? 3 : 0) - 5, 9, u.hp / u.maxhp);
}
function drawFlag(f, now) {
  const cx = sx(f.x), cy = sy(0, f.y);
  if (raidTime > 8) return;
  glow(NEON.enemy, 8, () => {
    line(cx, cy, cx, cy - 14, NEON.enemy, 1);
    poly([[cx, cy - 14], [cx + 8, cy - 11 + Math.sin(now / 150)], [cx, cy - 8]], null, NEON.enemy, 1);
  });
}
function drawShot(s) {
  const x = sx(s.x), y = sy(0, s.y);
  if (s.kind === 'ball') glow('#35f0ff', 6, () => circ(x, y, 1.4, '#bff9ff'));
  else if (s.kind === 'arrow' || s.kind === 'enemyArrow') {
    const tx = s.target ? s.target.x : s.tx, ty = s.target ? s.target.y : s.ty;
    const a = Math.atan2(ty - s.y, tx - s.x), c = s.kind === 'arrow' ? '#bff9ff' : '#ff8aa0';
    glow(c, 4, () => line(x - Math.cos(a) * 5, y - Math.sin(a) * 5, x, y, c, 1));
  } else if (s.kind === 'shell') glow('#35f0ff', 8, () => circ(x, y, 2.4, '#bff9ff'));
  else if (s.kind === 'rocket') glow('#ffd23f', 6, () => circ(x, y, 1.6, '#fff3b0'));
  else if (s.kind === 'fire') glow('#ff8a3d', 8, () => circ(x, y, 2.6, '#ffb070'));
}
function drawFx(e) {
  const k = e.t / e.life;
  const x = sx(e.x), y = sy(0, e.y);
  if (e.kind === 'bit') rect(x - 0.8, y - 0.8, 1.6, 1.6, e.c);
  else if (e.kind === 'boom') {
    const r = Math.max(1, (2 + e.r * T * 0.6) * (0.4 + k));
    g.globalAlpha = 1 - k;
    glow(e.fire ? '#ff8a3d' : '#35f0ff', 10, () => disc(x, y, r, null, e.fire ? '#ffb070' : '#bff9ff', 1.5));
    g.globalAlpha = 1;
  } else if (e.kind === 'smoke') rect(x - 0.8, y - 0.8, 1.6, 1.6, 'rgba(200,200,255,' + (0.5 - k * 0.5).toFixed(2) + ')');
  else if (e.kind === 'ghost') {
    g.globalAlpha = 1 - k;
    glow(NEON.enemy, 6, () => disc(x, y - 4 - k * 12, 2, null, NEON.enemy, 1));
    g.globalAlpha = 1;
  } else if (e.kind === 'bolt') {
    if (k < 0.15) { g.globalAlpha = 0.25; rect(0, 0, W, H, '#ffffff'); g.globalAlpha = 1; }
    g.globalAlpha = 1 - k;
    glow('#a8e0ff', 12, () => {
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i];
        line(x + a[0], y + a[1], x + b[0], y + b[1], '#ffffff', 1.5);
      }
    });
    g.globalAlpha = 1;
  } else if (e.kind === 'pulse') {
    const r = e.r * T * Math.min(1, k * 1.6);
    g.globalAlpha = 0.2 * (1 - k); circ(x, y, r, e.c); g.globalAlpha = 1;
    glow(e.c, 10, () => disc(x, y, r, null, e.c, 1.4));
  }
}
// a building picture for the shop (and other menus)
function previewCanvas(type) {
  const w = 72, h = 60, k = 3;
  const c = document.createElement('canvas');
  c.width = w * k; c.height = h * k;
  const prev = g; g = c.getContext('2d'); g.scale(k, k);
  drawBuilding({ type, lvl: 1, x: 0, y: 0, angle: -0.5, cons: null }, w / 2, h / 2, { preview: true, join: { l: true, r: true } });
  g = prev;
  c.style.width = '144px'; c.style.height = '120px';
  return c;
}
function buildingThumb(b, px) {   // a small picture of one real building (repair list)
  const k = 3, size = 40, c = document.createElement('canvas');
  c.width = c.height = size * k;
  const prev = g; g = c.getContext('2d'); g.scale(k, k);
  const s = def(b).size, z = Math.min(1, (size - 4) / (s * T));
  g.translate(size / 2, size / 2); g.scale(z, z);
  drawBuilding(Object.assign({}, b, { flash: 0, cons: null }), 0, 0, { preview: true, join: { l: true, r: true } });
  g = prev;
  c.style.width = c.style.height = (px || 40) + 'px';
  c.className = 'thumb';
  return c;
}

/* =====================================================================
   INPUT
   ===================================================================== */
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  W = vw / scale; H = vh / scale;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  g = canvas.getContext('2d');
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  g.imageSmoothingEnabled = true;
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
  let mode = 'pan', grab = null;
  if (placing && placing.arrange) {
    grab = buildingAt(t.x, t.y);
    if (grab) { mode = 'arrange'; placing.sel = grab.id; }
  } else if (placing && placing.multi) {
    if (pendingAt(Math.floor(t.x), Math.floor(t.y)) >= 0) { mode = 'paint'; placing.paintFrom = [Math.floor(t.x), Math.floor(t.y)]; placing.warned = false; }
  } else if (placing) {
    const s = TYPES[placing.type].size;
    if (t.x >= placing.x - 0.5 && t.x < placing.x + s + 0.5 && t.y >= placing.y - 0.5 && t.y < placing.y + s + 0.5) mode = 'ghost';
  }
  drag = { mode, grab, bx: grab ? grab.x : 0, by: grab ? grab.y : 0, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, gx: placing ? placing.x : 0, gy: placing ? placing.y : 0, tx: t.x, ty: t.y };
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
  if (drag.mode === 'arrange') {
    const t = screenToTile(e.clientX, e.clientY), b = drag.grab, sz = def(b).size;
    const nx = clamp(Math.round(drag.bx + (t.x - drag.tx)), 0, GRID - sz), ny = clamp(Math.round(drag.by + (t.y - drag.ty)), 0, GRID - sz);
    if (fits(b.type, nx, ny, b.id)) { if (b.x !== nx || b.y !== ny) { b.x = nx; b.y = ny; rebuildBlocked(); } placing.bad = null; }
    else placing.bad = { type: b.type, x: nx, y: ny, lvl: b.lvl };
  } else if (drag.mode === 'paint') {
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
  if (placing && placing.arrange) placing.bad = null;
  if (d.moved || e.type === 'pointercancel') return;
  // a tap
  const t = screenToTile(e.clientX, e.clientY);
  if (spellArmed && S.phase === 'raid') { castSpell(spellArmed, t.x, t.y); return; }
  if (placing && placing.arrange) return;   // a tap just picks the building (done on press)
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
// HUD icons: small neon line drawings on a 24x24 grid (drawn at 2x for sharpness)
const ICON_COL = { sword: '#ff3b5c', sun: '#ffd23f', moon: '#c8c8ff', hammer: '#e0e0ff', shop: '#35f0ff', shield: '#35f0ff',
  clock: '#e0e0ff', wall: '#7d7dff', move: '#c8c8ff', check: '#07070f', cross: '#07070f', bolt: '#a8e0ff', snow: '#7cd8f8', heart: '#3dffa8', stats: '#35f0ff' };
function drawIcon(c, name) {
  c.width = 48; c.height = 48; c.dataset.icon = name;
  const prev = g; g = c.getContext('2d'); g.scale(2, 2);
  const col = name === 'gold' || name === 'elixir' ? resCol(name) : ICON_COL[name] || '#ffffff';
  g.lineJoin = 'round'; g.lineCap = 'round';
  glow(col, 3, () => {
    const L = 1.8;
    switch (name) {
      case 'gold': case 'elixir': resIcon(name, 12, 12, 8.5, col, L); break;
      case 'sword': line(5, 19, 18, 6, col, L); line(18, 6, 20, 4, col, L); line(7, 13, 11, 17, col, L); line(4, 20, 6, 18, col, 2.4); break;
      case 'sun': disc(12, 12, 4.5, null, col, L); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(12 + Math.cos(a) * 7.5, 12 + Math.sin(a) * 7.5, 12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10, col, L); } break;
      case 'moon': g.beginPath(); g.arc(12, 12, 8, 0.9, TAU - 0.9 + 0.001, false); g.arc(16, 9, 6.5, TAU - 1.6, 1.9, true); g.closePath(); g.strokeStyle = col; g.lineWidth = L; g.stroke(); break;
      case 'hammer': turned(12, 12, -Math.PI / 4, () => { line(0, 9, 0, -3, col, L); rrect(-6, -8, 12, 5, 1, null, col, L); }); break;
      case 'shop': poly([[4, 10], [6, 4], [18, 4], [20, 10]], null, col, L); rrect(5, 10, 14, 10, 1, null, col, L); rrect(10, 14, 4, 6, 0.5, null, col, L); break;
      case 'shield': poly([[12, 3], [19, 6], [18, 14], [12, 21], [6, 14], [5, 6]], null, col, L); break;
      case 'clock': disc(12, 12, 8.5, null, col, L); line(12, 12, 12, 7, col, L); line(12, 12, 16, 13, col, L); break;
      case 'wall': for (const [x, y, w] of [[3, 6, 8], [13, 6, 8], [3, 11, 4], [9, 11, 6], [17, 11, 4], [3, 16, 8], [13, 16, 8]]) rrect(x, y, w, 3.5, 0.6, null, col, 1.4); break;
      case 'bolt': poly([[14, 2], [6, 13], [11, 13], [9, 22], [18, 10], [13, 10]], null, col, L); break;
      case 'snow': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(12 - Math.cos(a) * 9, 12 - Math.sin(a) * 9, 12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9, col, L); } break;
      case 'heart': g.beginPath(); g.moveTo(12, 20); g.bezierCurveTo(2, 13, 4, 4, 12, 8); g.bezierCurveTo(20, 4, 22, 13, 12, 20); g.strokeStyle = col; g.lineWidth = L; g.stroke(); break;
      case 'move': line(12, 3, 12, 21, col, L); line(3, 12, 21, 12, col, L); for (const [a, b2, c2, d2] of [[12, 3, 9, 6], [12, 3, 15, 6], [12, 21, 9, 18], [12, 21, 15, 18], [3, 12, 6, 9], [3, 12, 6, 15], [21, 12, 18, 9], [21, 12, 18, 15]]) line(a, b2, c2, d2, col, L); break;
      case 'check': poly([[5, 12], [10, 17], [19, 6]], null, col, 2.6, true); break;
      case 'cross': line(6, 6, 18, 18, col, 2.6); line(18, 6, 6, 18, col, 2.6); break;
      case 'stats': line(5, 19, 19, 19, col, L); line(7, 19, 7, 12, col, 2.6); line(12, 19, 12, 6, col, 2.6); line(17, 19, 17, 10, col, 2.6); break;
    }
  });
  g = prev;
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
  $('wallsBtn').hidden = !building || !!placing || !wallTotal();
  $('moveBtn').hidden = !building || !!placing;
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
  if (S.elixir < sp.cost) { toast(`Not enough ${resName('elixir').toLowerCase()}`); sfx('nope'); return; }
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
  if (S.gold < cost) { toast(`Not enough ${resName('gold').toLowerCase()}`); sfx('nope'); return; }
  S.gold -= cost;
  fixBuilding(b);
  toast(`${def(b).name} repaired`);
  sfx('build'); if (S.phase === 'build') save(); refreshUI(); if (selectedId) renderSel(true);
  if (!$('modal').hidden && $('repairList')) showRepairs();
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
  const g1 = resName('gold').toLowerCase();
  if (!fixed) { toast(`Not enough ${g1}`); sfx('nope'); return; }
  toast(fixed === list.length ? `Repaired ${fixed} building${fixed > 1 ? 's' : ''} for ${fmt(spent)} ${g1}` : `Repaired ${fixed} of ${list.length}. Not enough ${g1} for the rest.`);
  sfx('build'); if (S.phase === 'build') save(); refreshUI(); if (selectedId) renderSel(true);
  if (!$('modal').hidden && $('repairList')) showRepairs();
}
// the repair list: every damaged building, its health and price, with a button each and one for all
function showRepairs() {
  const list = damaged().sort((a, b) => (b.type === 'townhall') - (a.type === 'townhall') || missingHp(b) / maxHp(b) - missingHp(a) / maxHp(a));
  if (!list.length) { closeModal(); toast('Everything is in perfect shape'); return; }
  const total = list.reduce((a, b) => a + repairCost(b), 0);
  // group walls into one row so a long wall line doesn't flood the list
  const walls = list.filter((b) => b.type === 'wall'), others = list.filter((b) => b.type !== 'wall');
  const rows = others.map((b) => {
    const f = b.destroyed ? 0 : b.hp / maxHp(b);
    return `<div class="rep-row" data-id="${b.id}"><span class="rep-pic"></span>
      <div class="rep-info"><div class="rep-name">${def(b).name} <span class="lvl">Lv ${Math.max(1, b.lvl)}</span></div>
        <div class="hpbar mini"><i style="width:${f * 100}%;background:${hpColor(f)}"></i></div>
        <div class="rep-hp">${b.destroyed ? 'Destroyed' : `${fmt(b.hp)} / ${fmt(maxHp(b))} HP`}</div></div>
      <button class="btn mini go${S.gold < repairCost(b) ? ' off' : ''}" data-fix="${b.id}">Repair <span class="cost" data-cost="gold">${fmt(repairCost(b))}</span></button></div>`;
  });
  if (walls.length) {
    const wc = walls.reduce((a, b) => a + repairCost(b), 0), down = walls.filter((w) => w.destroyed).length;
    rows.push(`<div class="rep-row"><span class="rep-pic" data-ico="wall" data-px="32"></span>
      <div class="rep-info"><div class="rep-name">Walls × ${walls.length}</div><div class="rep-hp">${down ? down + ' destroyed, ' : ''}${walls.length - down} damaged</div></div>
      <button class="btn mini go${S.gold < wc ? ' off' : ''}" data-fixwalls="1">Repair <span class="cost" data-cost="gold">${fmt(wc)}</span></button></div>`);
  }
  popup('REPAIRS', `<div class="rep-list" id="repairList">${rows.join('')}</div>`,
    [[`Repair all <span class="cost" data-cost="gold">${fmt(total)}</span>`, 'go', () => repairAll()], ['Close', 'wood', closeModal]], 'repairs');
  const m = $('modal');
  m.querySelectorAll('.rep-row[data-id]').forEach((row) => row.querySelector('.rep-pic').appendChild(buildingThumb(byId(+row.dataset.id), 36)));
  m.querySelectorAll('[data-fix]').forEach((bt) => { bt.onclick = () => repair(byId(+bt.dataset.fix)); });
  const fw = m.querySelector('[data-fixwalls]');
  if (fw) fw.onclick = () => {
    let fixed = 0;
    for (const w of damaged().filter((b) => b.type === 'wall')) { const c = repairCost(w); if (S.gold < c) break; S.gold -= c; fixBuilding(w); fixed++; }
    if (!fixed) { toast(`Not enough ${resName('gold').toLowerCase()}`); sfx('nope'); return; }
    sfx('build'); if (S.phase === 'build') save(); refreshUI(); showRepairs();
  };
}
function updateRepairAll() {
  const btn = $('repairAllBtn');
  const list = S.phase === 'build' || S.phase === 'raid' ? damaged() : [];
  btn.hidden = !list.length || !!placing;
  if (btn.hidden) return;
  const cost = list.reduce((a, b) => a + repairCost(b), 0);
  $('repairAllText').textContent = list.length;
  btn.title = `${list.length} damaged building${list.length > 1 ? 's' : ''}: tap to see repairs`;
  btn.classList.toggle('off', S.gold < Math.min(...list.map(repairCost)));
}

// ----- selection panel -----
// The panel is only rebuilt when its layout changes. Live numbers (HP, repair price) update in place,
// so buttons stay clickable during a raid.
let selKey = '';
function select(id) { selectedId = id; renderSel(true); }
function deselect() { selectedId = null; selKey = ''; $('sel').hidden = true; }
// a circular gauge: value in the middle, label underneath, optional next-level value
const RING_C = 2 * Math.PI * 20;
const short = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : fmt(n));
function ringHTML(live, f, col, val, label, next) {
  f = clamp(f, 0, 1);
  return `<div class="ring" ${live ? `data-live="${live}"` : ''} style="--rc:${col}">
    <svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ring-bg" cx="24" cy="24" r="20"/><circle class="ring-fg" cx="24" cy="24" r="20" stroke-dasharray="${RING_C * f} ${RING_C}"/></svg>
    <div class="ring-val">${val}</div><div class="ring-label">${label}</div>${next ? `<div class="ring-next">▲ ${next}</div>` : ''}</div>`;
}
function setRing(el, f, val, col) {
  const fg = el.querySelector('.ring-fg'); fg.setAttribute('stroke-dasharray', `${RING_C * clamp(f, 0, 1)} ${RING_C}`);
  el.querySelector('.ring-val').textContent = val;
  if (col) el.style.setProperty('--rc', col);
}
// why an upgrade can't start right now (empty string = it can)
function upgradeBlock(b) {
  const t = def(b), next = b.lvl + 1, p = t.cost[next - 1];
  if (next > levelCap(b.type)) return `Needs Town Hall ${b.type === 'wall' ? next : next - 1}`;
  if (S.phase !== 'build') return 'Upgrades start during the day';
  if (b.destroyed) return 'Repair it first';
  if (!canAfford(p)) return `Not enough ${resName(S.gold < p[0] ? 'gold' : 'elixir').toLowerCase()}`;
  if (p[2] > 0 && builders().free <= 0) return 'All builders are busy';
  return '';
}
function renderSel(force) {
  const b = byId(selectedId);
  const el = $('sel');
  if (!b) { deselect(); return; }
  const isFactory = b.type === 'spellfactory';
  const key = [b.id, b.lvl, b.cons ? b.cons.days : '-', b.destroyed, S.phase, missingHp(b) > 0, isFactory ? JSON.stringify(S.spells) : '', b.lvl >= 1 && !b.cons && b.lvl < def(b).max ? upgradeBlock(b) : ''].join('|');
  if (!force && key === selKey && !el.hidden) { updateSelLive(b); return; }
  selKey = key;
  const t = def(b), lvl = b.lvl, building = S.phase === 'build';
  const L = Math.max(1, lvl), next = lvl + 1;
  const canUp = lvl >= 1 && !b.cons && next <= t.max && t.cost[next - 1];
  const nx = (arr) => (canUp && arr ? arr[next - 1] : null);
  const rings = [];
  if (b.cons) rings.push(ringHTML('', consProgress(b), '#ffd23f', `${b.cons.days}d`, lvl < 1 ? 'Building' : `To Lv ${b.cons.to}`));
  if (lvl >= 1) {
    rings.push(ringHTML('hp', 1, '#3dffa8', '', 'Health', nx(t.hp) && short(nx(t.hp))));
    rings.push(ringHTML('', L / t.max, '#ffd23f', `${L}/${t.max}`, 'Level'));
    if (t.dmg) {
      rings.push(ringHTML('', t.dmg[L - 1] / t.dmg[t.max - 1], '#35f0ff', t.dmg[L - 1], 'Damage', nx(t.dmg)));
      rings.push(ringHTML('', t.range / 12, '#35f0ff', t.range, 'Range'));
    }
    if (t.prod) rings.push(ringHTML('', t.prod[L - 1] / t.prod[t.max - 1], resCol(t.res), short(t.prod[L - 1]), 'Per night', nx(t.prod) && short(nx(t.prod))));
    if (t.store) rings.push(ringHTML('store-' + t.res, 0, resCol(t.res), '', 'Stored', nx(t.store) && short(nx(t.store))));
    if (t.cap) for (const r of ['gold', 'elixir']) rings.push(ringHTML('store-' + r, 0, resCol(r), '', resName(r), nx(t.cap) && short(nx(t.cap))));
    if (b.type === 'builder') { const bl = builders(); rings.push(ringHTML('', bl.total ? bl.free / bl.total : 0, '#c8c8e8', `${bl.free}/${bl.total}`, 'Free')); }
    if (t.slots) rings.push(ringHTML('', spellSlots() ? spellsStored() / spellSlots() : 0, '#ff8a3d', `${spellsStored()}/${spellSlots()}`, 'Spells', nx(t.slots)));
  }
  // Spell Factory: brew by day
  let brewHTML = '';
  if (isFactory && lvl >= 1 && !b.cons) {
    brewHTML = `<div class="brew">${Object.entries(SPELLS).map(([type, sp]) => {
      const why = !building ? 'Spells are brewed during the day' : b.lvl < sp.lvl ? `Needs Spell Factory level ${sp.lvl}` : spellsStored() >= spellSlots() ? 'The Spell Factory is full' : S.elixir < sp.cost ? `Not enough ${resName('elixir').toLowerCase()}` : '';
      return `<div class="brew-row" title="${sp.desc}"><span data-ico="${sp.icon}" data-px="16"></span><span class="brew-name">${sp.name}</span><b>×${S.spells[type] || 0}</b>
        <button class="btn mini go${why ? ' is-disabled' : ''}" ${why ? `data-why="${why}"` : `data-brew="${type}"`}>Brew <span class="cost" data-cost="elixir">${fmt(sp.cost)}</span></button></div>`;
    }).join('')}</div>`;
  }
  const actions = [];
  if (missingHp(b) > 0 && !b.cons) {
    const c = repairCost(b);
    actions.push(`<button class="btn mini go${S.gold < c ? ' is-disabled' : ''}" id="repairBtn" ${S.gold < c ? `data-why="Not enough ${resName('gold').toLowerCase()}"` : ''}>Repair <span class="cost" data-cost="gold" id="repairCost">${fmt(c)}</span></button>`);
  }
  if (canUp) {
    const p = t.cost[next - 1], why = upgradeBlock(b);
    actions.push(`<button class="btn mini go${why ? ' is-disabled' : ''}" ${why ? `data-why="${why}"` : 'id="upBtn"'}>Upgrade ${costHTML(p)} · ${daysLabel(p[2])}</button>`);
  } else if (lvl >= 1 && !b.cons && t.max > 1) actions.push('<button class="btn mini is-disabled" data-why="This building is at its highest level">Max level</button>');
  if (building && b.type === 'wall' && !b.cons) actions.push('<button class="btn mini no" id="sellBtn">Remove</button>');
  el.innerHTML = `
    <div class="sel-head">
      <div class="sel-name" title="${t.desc}">${t.name}</div>
      <button class="btn no close-x" id="selClose" aria-label="Close">&#x2716;</button>
    </div>
    <div class="sel-body">
      <div class="rings">${rings.join('')}</div>
      ${brewHTML}
      ${actions.length ? `<div class="sel-actions">${actions.join('')}</div>` : ''}
    </div>`;
  hydrateCosts(el);
  el.hidden = false;
  updateSelLive(b);
  $('selClose').onclick = deselect;
  el.querySelectorAll('[data-brew]').forEach((bt) => { bt.onclick = () => brew(bt.dataset.brew); });
  el.querySelectorAll('[data-why]').forEach((bt) => { bt.onclick = () => { toast(bt.dataset.why); sfx('nope'); }; });
  const rp = $('repairBtn'); if (rp && !rp.dataset.why) rp.onclick = () => repair(b);
  const up = $('upBtn'); if (up) up.onclick = () => upgrade(b);
  const sl = $('sellBtn'); if (sl) sl.onclick = () => { S.buildings = S.buildings.filter((o) => o !== b); rebuildBlocked(); deselect(); save(); refreshUI(); sfx('click'); };
}
function updateSelLive(b) {
  const el = $('sel');
  const hpR = el.querySelector('[data-live="hp"]');
  if (hpR) { const hp = b.destroyed ? 0 : b.hp, f = hp / maxHp(b); setRing(hpR, f, short(Math.round(hp)), hpColor(f)); }
  for (const r of ['gold', 'elixir']) {
    const st = el.querySelector(`[data-live="store-${r}"]`);
    if (!st) continue;
    const cap = b.type === 'townhall' ? TYPES.townhall.cap[thLevel() - 1] : def(b).store[b.lvl - 1];
    const v = storedIn(b, r); setRing(st, v / cap, short(Math.floor(v)));
  }
  const rc = $('repairCost');
  if (rc) { const c = rc.lastChild; if (c && c.nodeType === 3) c.textContent = fmt(repairCost(b)); }
}
function upgrade(b) {
  const t = def(b), next = b.lvl + 1, p = t.cost[next - 1];
  if (!canAfford(p)) { toast(`Not enough ${resName(S.gold < p[0] ? 'gold' : 'elixir').toLowerCase()}`); sfx('nope'); return; }
  if (p[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
  S.gold -= p[0]; S.elixir -= p[1];
  if (p[2] === 0) { b.lvl = next; b.hp = maxHp(b); toast(`${t.name} upgraded to level ${next}!`); }
  else { b.cons = { to: next, days: p[2], total: p[2] }; toast(`Upgrade started: ${daysLabel(p[2])}`); }
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
// ----- move mode: drag any building to a new spot -----
function beginArrange() {
  if (S.phase !== 'build' || placing) return;
  closeModal(); deselect();
  placing = { arrange: true, type: 'townhall', orig: new Map(S.buildings.map((b) => [b.id, { x: b.x, y: b.y }])), sel: null, bad: null };
  refreshUI();
}
// ----- rearranging every wall from scratch -----
const stashCount = () => (S.wallStash || []).length;
const wallTotal = () => countOf('wall') + stashCount();
function beginRearrange() {
  if (S.phase !== 'build' || placing) return;
  const walls = S.buildings.filter((b) => b.type === 'wall');
  if (!walls.length && !stashCount()) { toast('You have no walls yet'); return; }
  closeModal(); deselect();
  // lift every wall off the map; the best walls get placed first
  const pool = walls.map((w) => ({ lvl: w.lvl, hp: w.destroyed ? 0 : w.hp })).concat(S.wallStash.map((w) => ({ ...w })));
  pool.sort((a, b) => b.lvl - a.lvl || b.hp - a.hp);
  S.buildings = S.buildings.filter((b) => b.type !== 'wall');
  placing = { type: 'wall', multi: true, rearrange: true, walls: [], pool, backup: walls, stashBackup: S.wallStash.slice(), moveId: null };
  rebuildBlocked();
  refreshUI();
  toast('All walls picked up. Tap or drag to place them again.', 2600);
}
// every square being placed right now, for drawing
function placingSpots() {
  if (!placing) return [];
  if (placing.arrange) return placing.bad ? [{ type: placing.bad.type, x: placing.bad.x, y: placing.bad.y, ok: false, lvl: placing.bad.lvl }] : [];
  if (placing.multi) {
    // free walls (rearranged or stored) keep their level; bought ones are level 1
    const free = placing.rearrange ? placing.pool : S.wallStash;
    return placing.walls.map((w, i) => ({ type: 'wall', x: w.x, y: w.y, ok: true, lvl: free[i] ? free[i].lvl : 1 }));
  }
  return [{ type: placing.type, x: placing.x, y: placing.y, ok: placing.ok, lvl: placing.lvl }];
}
// ----- laying many walls at once -----
const pendingAt = (x, y) => placing.walls.findIndex((w) => w.x === x && w.y === y);
function wallsToBuy(n) { return placing.rearrange ? 0 : Math.max(0, n - stashCount()); }
function addPendingWall(x, y, quiet) {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID || pendingAt(x, y) >= 0 || !fits('wall', x, y)) return false;
  const n = placing.walls.length + 1, price = priceOf('wall', 1);
  if (placing.rearrange) {
    if (n > placing.pool.length) { if (!quiet) toast('All your walls are placed'); return false; }
  } else {
    if (wallTotal() + wallsToBuy(n) > limitOf('wall')) { if (!quiet) toast(`Wall limit reached (${limitOf('wall')}). Upgrade the Town Hall for more.`); return false; }
    if (S.gold < price[0] * wallsToBuy(n)) { if (!quiet) toast(`Not enough ${resName('gold').toLowerCase()} for more walls`); return false; }
  }
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
function cancelPlace() {
  if (placing && placing.arrange) {   // put every building back where it was
    for (const b of S.buildings) { const o = placing.orig.get(b.id); if (o) { b.x = o.x; b.y = o.y; } }
    placing = null; rebuildBlocked(); refreshUI();
    return;
  }
  if (placing && placing.rearrange) {   // put every wall back where it was
    S.buildings.push(...placing.backup);
    S.wallStash = placing.stashBackup;
    placing = null; rebuildBlocked(); refreshUI();
    toast('Walls put back');
    return;
  }
  placing = null; refreshUI();
}
function confirmPlace() {
  if (!placing) return;
  const p = placing;
  if (p.arrange) { placing = null; rebuildBlocked(); save(); refreshUI(); sfx('build'); toast('Layout saved'); return; }
  if (p.multi && p.rearrange) {
    // place the walls that were drawn; any left over are stored and can be placed later from the shop
    p.walls.forEach((w, i) => { const src = p.pool[i], b = add('wall', w.x, w.y, src.lvl); if (src.hp > 0) b.hp = Math.min(src.hp, maxHp(b)); else b.hp = 1; });
    S.wallStash = p.pool.slice(p.walls.length);
    placing = null; rebuildBlocked(); sfx('build'); save(); refreshUI();
    toast(S.wallStash.length ? `Walls placed. ${S.wallStash.length} stored for later (free in the shop).` : 'Walls rearranged', 2600);
    return;
  }
  if (p.multi) {
    const n = p.walls.length, price = priceOf('wall', 1), buy = wallsToBuy(n);
    if (!n) { toast('Tap the ground to add walls'); sfx('nope'); return; }
    if (S.gold < price[0] * buy) { toast(`Not enough ${resName('gold').toLowerCase()}`); sfx('nope'); return; }
    S.gold -= price[0] * buy;
    for (const w of p.walls) {
      const st = S.wallStash.shift();   // stored walls go down first, for free
      const b = add('wall', w.x, w.y, st ? st.lvl : 1);
      if (st && st.hp > 0) b.hp = Math.min(st.hp, maxHp(b));
    }
    placing = null; rebuildBlocked(); sfx('build'); save(); refreshUI();
    toast(`Placed ${n} wall${n > 1 ? 's' : ''}`);
    return;
  }
  if (!p.ok) { toast("Can't build there"); sfx('nope'); return; }
  if (p.moveId) {
    const b = byId(p.moveId); b.x = p.x; b.y = p.y;
    placing = null; rebuildBlocked(); save(); refreshUI(); sfx('build'); return;
  }
  const t = TYPES[p.type], price = priceOf(p.type, 1);
  if (!canAfford(price)) { toast(`Not enough ${resName(S.gold < price[0] ? 'gold' : 'elixir').toLowerCase()}`); sfx('nope'); return; }
  if (price[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
  if (countOf(p.type) >= limitOf(p.type)) { toast('Upgrade the Town Hall to build more'); return; }
  S.gold -= price[0]; S.elixir -= price[1];
  if (price[2] === 0) add(p.type, p.x, p.y, 1);
  else add(p.type, p.x, p.y, 0, { to: 1, days: price[2], total: price[2] });
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
  if (placing.arrange) {
    html = `<div class="tip-title">Move buildings</div><div class="tip-help">Drag any building to a new spot. ✔ keeps the layout, ✖ puts everything back.</div>`;
  } else if (placing.multi && placing.rearrange) {
    const n = placing.walls.length, total = placing.pool.length;
    html = `<div class="tip-title">Rearranging walls · ${n} of ${total} placed</div>
      <div class="tip-help">Tap ground to place, tap a wall to pick it up. Drag from a wall to draw a line. ✔ saves (unplaced walls are stored), ✖ puts everything back.</div>`;
  } else if (placing.multi) {
    const n = placing.walls.length, price = priceOf('wall', 1), buy = wallsToBuy(n), free = n - buy;
    html = `<div class="tip-title">${n} wall${n === 1 ? '' : 's'} · ${buy ? costHTML([price[0] * buy, 0]) : 'Free'}${free ? ` <span class="tip-free">(${free} stored)</span>` : ''}</div>
      <div class="tip-help">Tap ground to add, tap a wall to remove. Drag from a wall to draw a line. Walls left: ${Math.max(0, limitOf('wall') - wallTotal() - buy) + Math.max(0, stashCount() - free)}</div>`;
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
    const isWall = type === 'wall', stored = isWall ? stashCount() : 0;
    const have = isWall ? wallTotal() : countOf(type), lim = limitOf(type);
    const price = stored ? [0, 0, 0] : priceOf(type, 1);
    const maxed = have >= lim && !stored;
    const nextTh = LIMITS[type].findIndex((v) => v > have) + 1;
    const card = document.createElement('button');
    card.className = 'card' + (maxed ? ' locked' : '');
    card.innerHTML = `<div class="art"></div>
      <div class="name">${t.name}</div>
      <div class="meta">${maxed ? '' : costHTML(price)}<span class="count">${have}/${lim}</span></div>
      <div class="meta"><span class="count">${maxed ? '' : stored ? stored + ' stored' : daysLabel(price[2])}</span></div>
      ${maxed ? `<div class="lock ol">${nextTh > 0 ? 'TOWN HALL ' + nextTh : 'MAXED'}</div>` : ''}`;
    card.querySelector('.art').appendChild(previewCanvas(type));
    hydrateCosts(card);
    card.onclick = () => {
      if (maxed) { toast(nextTh > 0 ? `Upgrade the Town Hall to level ${nextTh}` : 'You have built all of these'); sfx('nope'); return; }
      if (!canAfford(price)) { toast(`Not enough ${resName(S.gold < price[0] ? 'gold' : 'elixir').toLowerCase()}`); sfx('nope'); return; }
      if (price[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
      sfx('click');
      beginPlace(type);
    };
    cards.appendChild(card);
  }
  const first = m.querySelector('.tab[aria-selected="true"]'); if (first) first.focus();
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
    ${best ? `<div class="loot"><div>BEST: ${best} NIGHTS</div></div>` : ''}`,
  hasSave ? [['NEW', 'no', () => { closeModal(); newGame(); rebuildBlocked(); refreshUI(); }], [`CONTINUE · DAY ${S.day}`, 'go', () => { closeModal(); }]]
    : [['PLAY', 'go', () => { closeModal(); }]], 'title-screen');
}
function showStats() {
  const count = (f) => S.buildings.filter(f).length;
  const bl = builders();
  const r = nightIncome();
  const row = (label, val) => `<div class="stat-row"><span>${label}</span><b>${val}</b></div>`;
  const defenses = count((b) => def(b).cat === 'defense' && b.lvl >= 1);
  popup(`${S.phase === 'build' ? 'DAY' : 'NIGHT'} ${S.day}`, `
    <div class="stats-list">
      ${row('Nights survived', fmt(S.day - 1))}
      ${row('Best run', fmt(Math.max(bestDay(), S.day - 1)) + ' nights')}
      ${row('Town Hall', 'Level ' + thLevel())}
      ${row('Defenses', defenses)}
      ${row('Walls', countOf('wall') + (stashCount() ? ` (+${stashCount()} stored)` : ''))}
      ${row('Builders free', `${bl.free} / ${bl.total}`)}
      ${row(`<span data-ico="gold" data-px="16"></span>${resName('gold')}`, `${fmt(S.gold)} / ${fmt(capOf('gold'))}`)}
      ${row(`<span data-ico="elixir" data-px="16"></span>${resName('elixir')}`, `${fmt(S.elixir)} / ${fmt(capOf('elixir'))}`)}
      ${row('Earned each night', `+${fmt(r.mineGold)} ${resName('gold').toLowerCase()} · +${fmt(r.pumpElixir)} ${resName('elixir').toLowerCase()}`)}
      ${spellSlots() ? row('Spells ready', spellsStored() + ' / ' + spellSlots()) : ''}
      ${row('Damaged buildings', damaged().length)}
    </div>
    <button class="version-link" id="statsVersion">Clash v${GAME_VERSION} · patch notes</button>`, [['Close', 'go', closeModal]], 'stats');
  $('statsVersion').onclick = () => { sfx('click'); showPatchNotes(); };
}
// resource styles: tap a resource bar to try the next look
function cycleResources() {
  resStyle = (resStyle + 1) % RES_STYLES.length;
  try { localStorage.setItem(RES_KEY, String(resStyle)); } catch (e) { /* ignore */ }
  applyResStyle();
  document.querySelectorAll('canvas[data-icon]').forEach((c) => drawIcon(c, c.dataset.icon));
  refreshUI();
  if (selectedId) renderSel(true);
  toast(`Resources: ${resName('gold')} & ${resName('elixir')} (${resStyle + 1} of ${RES_STYLES.length})`);
}
function showPatchNotes() {
  const body = PATCH_NOTES.map((p) => `<section class="patch">
      <h3 class="ol">v${p.v}${p.v === GAME_VERSION ? ' <span class="now">CURRENT</span>' : ''}</h3>
      <div class="patch-date">${p.date}</div>
      <ul>${p.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    </section>`).join('');
  popup('PATCH NOTES', `<div class="patch-list">${body}</div>`, [['CLOSE', 'go', closeModal]], 'notes');
}
$('phase').onclick = () => { unlockAudio(); sfx('click'); showStats(); };
for (const id of ['resGold', 'resElixir']) $(id).onclick = () => { unlockAudio(); sfx('click'); cycleResources(); };
$('wallsBtn').onclick = () => { unlockAudio(); sfx('click'); beginRearrange(); };
$('moveBtn').onclick = () => { unlockAudio(); sfx('click'); beginArrange(); };
buildSpellBar();
$('shopBtn').onclick = () => { unlockAudio(); sfx('click'); openShop(); };
$('repairAllBtn').onclick = () => { unlockAudio(); sfx('click'); showRepairs(); };
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
applyResStyle();
resize();
makeDecor();
showTitle();
requestAnimationFrame(frame);

// hooks for automated tests
window.ClashDebug = { get S() { return S; }, get units() { return units; }, step, startRaid, startBuild, waveFor, fits, getField, rebuildBlocked, endRaid, priceOf, newGame, add, builders, limitOf, countOf, levelCap, canAfford, freeSpotFor, thLevel, closeModal, TYPES, previewCanvas, refreshUI, get placing() { return placing; }, tileToScreen: (x, y) => ({ x: (x * T - cam.x + W / 2) * scale, y: (y * T - cam.y + H / 2) * scale }), maxHpOf: maxHp, repairCost, castSpell, armSpell, get spellCd() { return spellCd; }, SPELLS, GAME_VERSION, showPatchNotes };
