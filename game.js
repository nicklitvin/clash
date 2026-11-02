'use strict';
/* =====================================================================
   CLASH: a single-player, defense-only village game.
   Night: build and upgrade. Day: a wave attacks. Survive as many days
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
    cost: [[250, 0, 0], [1000, 0, 1], [3000, 0, 1], [8000, 0, 2]],
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
    cost: [[0, 150, 0], [0, 500, 1], [0, 1500, 1], [0, 4000, 2]],
    desc: 'Digs up gold every day it is working.' },
  elixir: { name: 'Elixir Collector', size: 3, cat: 'resource', res: 'elixir', max: 4,
    hp: [400, 480, 560, 640], prod: [450, 750, 1100, 1500],
    cost: [[150, 0, 0], [500, 0, 1], [1500, 0, 1], [4000, 0, 2]],
    desc: 'Pumps elixir every day it is working.' },
  goldstore: { name: 'Gold Storage', size: 3, cat: 'resource', res: 'gold', max: 4,
    hp: [600, 800, 1000, 1300], store: [1500, 3500, 7000, 15000],
    cost: [[0, 300, 0], [0, 1200, 1], [0, 3500, 1], [0, 8000, 2]],
    desc: 'Holds more gold. Goblins go straight for it.' },
  elixstore: { name: 'Elixir Storage', size: 3, cat: 'resource', res: 'elixir', max: 4,
    hp: [600, 800, 1000, 1300], store: [1500, 3500, 7000, 15000],
    cost: [[300, 0, 0], [1200, 0, 1], [3500, 0, 1], [8000, 0, 2]],
    desc: 'Holds more elixir. Goblins go straight for it.' },
  builder: { name: "Builder's Hut", size: 2, cat: 'other', max: 1,
    hp: [250], cost: [[1000, 0, 0]],
    desc: 'Each hut gives you one builder. Builders work on one project at a time.' },
};
// how many of each a Town Hall level allows (index = TH level - 1)
const LIMITS = {
  cannon: [2, 2, 3, 4, 5], archer: [2, 2, 3, 4, 5], mortar: [0, 1, 1, 2, 3], airdef: [0, 0, 1, 1, 2],
  wall: [25, 50, 75, 100, 125], goldmine: [2, 3, 4, 5, 6], elixir: [2, 3, 4, 5, 6],
  goldstore: [1, 1, 2, 2, 3], elixstore: [1, 1, 2, 2, 3], builder: [3, 3, 4, 4, 5], townhall: [1, 1, 1, 1, 1],
};
const BUILDER_COSTS = [0, 0, 1000, 3000, 6000]; // price of hut #1..#5
const SHOP_TABS = [
  ['defense', 'DEFENSE', ['cannon', 'archer', 'mortar', 'airdef', 'wall']],
  ['resource', 'RESOURCES', ['goldmine', 'elixir', 'goldstore', 'elixstore', 'builder']],
];

const UNITS = {
  barbarian: { name: 'Barbarian', hp: 45, dmg: 8, rate: 1, range: 0.6, speed: 1.6, space: 1, sprite: 'barb' },
  archer: { name: 'Archer', hp: 22, dmg: 7, rate: 1, range: 3.4, speed: 1.8, space: 1, sprite: 'arch', ranged: true },
  goblin: { name: 'Goblin', hp: 28, dmg: 11, rate: 1, range: 0.6, speed: 2.6, space: 1, sprite: 'gob', pref: 'resource' },
  giant: { name: 'Giant', hp: 330, dmg: 14, rate: 1.6, range: 0.8, speed: 1.0, space: 5, sprite: 'giant', pref: 'defense' },
  breaker: { name: 'Wall Breaker', hp: 22, dmg: 650, rate: 1, range: 0.5, speed: 2.4, space: 2, sprite: 'wb', pref: 'wall', bomb: true },
  dragon: { name: 'Dragon', hp: 1000, dmg: 55, rate: 1.4, range: 2.4, speed: 1.15, space: 20, sprite: 'drag', air: true, splash: 1.1 },
};

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const isoX = (x, y) => (x - y) * 8;
const isoY = (x, y) => (x + y) * 4;

// ---------- state ----------
let S = null;            // persistent village state
let units = [], shots = [], fx = [], texts = [], spawnQueue = [], flags = [];
let dayTime = 0, dayStats = null, speed = 1;
let selectedId = null, placing = null;  // placing: {type, x, y, moveId, ok}
let fieldCache = new Map(), fieldVersion = 0;
let blocked = new Int32Array(N * N);   // 0 free, building id otherwise
let paused = true;

function newGame() {
  S = { day: 1, phase: 'night', gold: 1000, elixir: 1000, nextId: 1, buildings: [], over: false };
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
function gain(res, amount) { S[res] = clamp(S[res] + amount, 0, capOf(res)); }
function priceOf(type, lvl) {
  if (type === 'builder') return [BUILDER_COSTS[countOf('builder')] ?? 99999, 0, 0];
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
function startDay() {
  if (S.phase !== 'night' || placing) return;
  deselect();
  S.phase = 'day';
  units = []; shots = []; fx = []; texts = []; spawnQueue = []; flags = [];
  dayTime = 0;
  dayStats = { stolenGold: 0, stolenElixir: 0, kills: 0, total: 0, startCount: S.buildings.filter((b) => b.type !== 'wall').length };
  rebuildBlocked();
  const list = waveFor(S.day);
  dayStats.total = list.length;
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
    next: null, cd: rnd(0, 0.4), dir: 1, walk: Math.random() * 6, flash: 0, ox: rnd(-0.25, 0.25), oy: rnd(-0.25, 0.25), z: d.air ? 10 : 0 });
}
function endDay(victory) {
  if (S.phase !== 'day') return;
  S.phase = victory ? 'won' : 'lost';
  const nonWall = S.buildings.filter((b) => b.type !== 'wall');
  const destroyed = nonWall.filter((b) => b.destroyed).length;
  const pct = nonWall.length ? destroyed / nonWall.length : 0;
  if (!victory) {
    S.over = true;
    setBest(S.day - 1);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    sfx('lose');
    showGameOver(S.day - 1);
    refreshUI();
    return;
  }
  const stars = destroyed === 0 ? 3 : pct < 0.5 ? 2 : 1;
  let gold = 0, elixir = 0;
  for (const b of S.buildings) {
    if (!active(b) || !def(b).prod) continue;
    const amount = def(b).prod[b.lvl - 1];
    if (def(b).res === 'gold') gold += amount; else elixir += amount;
  }
  const bonus = Math.round((200 + S.day * 90) * (0.5 + stars * 0.25));
  gold += bonus; elixir += bonus;
  const before = { g: S.gold, e: S.elixir };
  gain('gold', gold); gain('elixir', elixir);
  setBest(S.day);
  sfx('win');
  showVictory(stars, S.gold - before.g, S.elixir - before.e, dayStats, pct);
  refreshUI();
}
function startNight() {
  S.day++;
  S.phase = 'night';
  units = []; shots = []; texts = []; spawnQueue = []; flags = [];
  const done = [];
  for (const b of S.buildings) {
    b.destroyed = false;
    if (b.cons) {
      b.cons.days -= 1;
      if (b.cons.days <= 0) { b.lvl = b.cons.to; b.cons = null; done.push(b); }
    }
    b.hp = maxHp(b);
    b.cd = 0;
  }
  rebuildBlocked();
  save();
  refreshUI();
  if (done.length) toast(done.length === 1 ? `${def(done[0]).name} is ready! (level ${done[0].lvl})` : `${done.length} projects finished!`);
}

// ---------- simulation ----------
function step(dt) {
  if (S.phase !== 'day') { updateFx(dt); return; }
  dayTime += dt;
  while (spawnQueue.length && spawnQueue[0].at <= dayTime) spawnUnit(spawnQueue.shift());
  for (const b of S.buildings) if (active(b) && def(b).cat === 'defense') updateDefense(b, dt);
  for (const u of units) updateUnit(u, dt);
  units = units.filter((u) => u.hp > 0);
  updateShots(dt);
  updateFx(dt);
  const th = S.buildings.find((b) => b.type === 'townhall');
  if (th && th.destroyed) { endDay(false); return; }
  if (!spawnQueue.length && !units.length && dayTime > 3) endDay(true);
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
  }
}
function steal(b, dmg) {
  const t = def(b);
  const take = (res) => {
    const amount = Math.min(S[res], Math.round(dmg * 1.6));
    if (amount <= 0) return;
    S[res] -= amount;
    if (res === 'gold') dayStats.stolenGold += amount; else dayStats.stolenElixir += amount;
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
  const sx = isoX(dx, dy);
  if (Math.abs(sx) > 0.01) u.dir = sx > 0 ? 1 : -1;
  u.walk += dt * 10;
}

function attack(u, b) {
  const c = center(b);
  const sx = isoX(c.x - u.x, c.y - u.y);
  if (Math.abs(sx) > 0.01) u.dir = sx > 0 ? 1 : -1;
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
  const goal = Math.atan2(isoY(u.x - c.x, u.y - c.y), isoX(u.x - c.x, u.y - c.y));
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
    dayStats.kills++;
    burst(u.x, u.y, u.d.space > 4 ? 12 : 6, u.type === 'goblin' ? ['#58b838', '#2f7a1e'] : ['#f2b880', '#c03030', '#e8e8f0']);
    fx.push({ kind: 'ghost', x: u.x, y: u.y, t: 0, life: 0.9, z: u.z });
  }
}

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
    if (e.kind === 'bit') { e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.vz -= 70 * dt; if (e.z < 0) { e.z = 0; e.vz = 0; e.vx *= 0.8; e.vy *= 0.8; } }
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
let scale = 3, W = 0, H = 0;      // low-res size
const cam = { x: 0, y: 0 };       // world pixel at the low-res canvas centre

const PAL = {
  k: '#1a1a24', s: '#f2b880', S: '#c98a5a', y: '#f8d030', Y: '#c8960e', b: '#8a5a2a', B: '#5c3a18',
  w: '#ececf4', m: '#9a9aae', M: '#5f5f75', g: '#58b838', G: '#2f7a1e', p: '#f070b0', P: '#b03878',
  r: '#e03a30', R: '#8a1a1a', o: '#f08a30', u: '#4a6ad8', U: '#283c8a', e: '#e04ce8', l: '#7cd8f8', n: '#3a2a18',
};
// 8-bit troop sprites, facing right
const SPRITES = {
  barb: [
    '...yyy...',
    '..yyyyy..',
    '..ysksy..',
    '..sssss.w',
    '...rrr..w',
    '..srrrs.w',
    '..sbbbsmm',
    '...b.b...',
    '...n.n...',
  ],
  arch: [
    '...ppp...',
    '..ppppp.b',
    '..psksp.b',
    '...sss..b',
    '...ggg.sb',
    '..sgggs.b',
    '...GGG..b',
    '...s.s...',
    '...n.n...',
  ],
  gob: [
    '.........',
    'g..ggg..g',
    '.ggkgkgg.',
    '...ggg...',
    '..bbbbb..',
    '..gbbbg..',
    '...b.b...',
    '...g.g...',
  ],
  giant: [
    '....oooo.....',
    '...oooooo....',
    '...osssso....',
    '...sksksk....',
    '....ssss.....',
    '..bbbbbbbb...',
    '.sbbbbbbbbs..',
    'ssbbbbbbbbss.',
    'ss.bbbbbb.ss.',
    '...uuuuuu....',
    '...uu..uu....',
    '...uu..uu....',
    '..nnn..nnn...',
  ],
  wb: [
    '...kk...',
    '..kkkk.y',
    '.kkkkkky',
    '.kkkkkk.',
    '..kkkk..',
    '..wkkw..',
    '..wwww..',
    '...ww...',
    '..w..w..',
    '..w..w..',
  ],
  drag: [
    '..R.........R..',
    '.RrR.......RrR.',
    'RrrrR.....RrrrR',
    '.RrrrR...RrrrR.',
    '..RrrrrrrrrrRkw',
    '....rrrrrrrrrrr',
    '...rryyyyyyrr..',
    '..rr.yyyyyy....',
    '.rr...r...r....',
    'r.............. ',
  ],
};
const spriteCache = {};
function spriteCanvas(name, flip, flash) {
  const key = name + (flip ? 'f' : '') + (flash ? 'w' : '');
  if (spriteCache[key]) return spriteCache[key];
  const rows = SPRITES[name], h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
  const x = c.getContext('2d');
  // dark outline first, then fill
  const paint = (ox, oy, col) => {
    for (let r = 0; r < h; r++) for (let i = 0; i < rows[r].length; i++) {
      const ch = rows[r][i]; if (!PAL[ch]) continue;
      x.fillStyle = col || (flash ? '#ffffff' : PAL[ch]);
      const px = flip ? w - 1 - i : i;
      x.fillRect(px + 1 + ox, r + 1 + oy, 1, 1);
    }
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, '#14101c');
  paint(0, 0, null);
  spriteCache[key] = c;
  return c;
}

// --- raster primitives (integer, no anti-aliasing) ---
function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function dia(cx, cy, n, col) {           // flat diamond, n tiles across, centred on (cx, cy)
  const h = Math.round(8 * n), top = Math.round(cy - h / 2);
  cx = Math.round(cx); g.fillStyle = col;
  for (let r = 0; r < h; r++) { const k = r < h / 2 ? r + 1 : h - r; g.fillRect(cx - 2 * k, top + r, 4 * k, 1); }
}
function box(cx, cy, n, h, top, left, right) {   // isometric block standing on a diamond
  cx = Math.round(cx); cy = Math.round(cy); h = Math.round(h);
  const w = Math.round(8 * n);
  g.fillStyle = left;
  for (let i = 0; i < w; i++) { const yb = cy + Math.floor(i / 2); g.fillRect(cx - w + i, yb - h, 1, h + 1); }
  g.fillStyle = right;
  for (let i = 0; i < w; i++) { const yb = cy + Math.round(4 * n) - Math.floor(i / 2); g.fillRect(cx + i, yb - h, 1, h + 1); }
  dia(cx, cy - h, n, top);
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

// world (tile) → screen (low-res pixel)
const sx = (x, y) => Math.round(isoX(x, y) - cam.x + W / 2);
const sy = (x, y) => Math.round(isoY(x, y) - cam.y + H / 2);

// ---------- building art ----------
const LEVEL_TRIM = ['#b7b7c4', '#d8b878', '#8fc8f0', '#f8c830', '#f070f0'];
function drawBuilding(b, cx, cy, opts) {
  const t = def(b), s = t.size, lvl = Math.max(1, b.lvl);
  const ghost = opts && opts.ghost;
  const building = b.lvl < 1;            // brand-new construction site
  if (!ghost) dia(cx, cy, s - 0.25, b.type === 'wall' ? '#4a9628' : '#468f27');
  if (b.destroyed) { drawRubble(cx, cy, s); return; }
  if (building) { drawScaffold(cx, cy, s, b); return; }
  const trim = LEVEL_TRIM[clamp(lvl - 1, 0, 4)];
  const flash = b.flash > 0;
  const F = (c) => (flash ? '#ffffff' : c);
  switch (b.type) {
    case 'townhall': {
      box(cx, cy, 3.25, 6, F('#a8a8b8'), F('#7c7c90'), F('#5c5c70'));
      box(cx, cy - 6, 2.75, 12, F('#d89a58'), F('#b07038'), F('#8a5226'));
      // windows and door
      rect(cx - 9, cy - 12, 3, 4, '#2a1a10'); rect(cx + 6, cy - 12, 3, 4, '#2a1a10');
      rect(cx - 2, cy - 5, 4, 6, '#3a2010');
      const roofs = [['#e0503c', '#b8362a', '#8a2420'], ['#4a7ae0', '#3058b8', '#203c88'], ['#58b838', '#3f8f22', '#2a6a16'], ['#2a2a3a', '#1c1c2a', '#101018'], ['#f8c830', '#c8960e', '#8a6608']][lvl - 1];
      for (let k = 0; k < 9; k++) box(cx, cy - 18 - k * 2, 3 - k * 0.33, 2, F(roofs[0]), F(roofs[1]), F(roofs[2]));
      line(cx, cy - 37, cx, cy - 48, '#3a2a18');
      rect(cx + 1, cy - 48, 6, 4, '#e03a30'); rect(cx + 1, cy - 48, 6, 1, '#ff8a70');
      rect(cx - 13, cy - 7, 26, 1, trim);
      break;
    }
    case 'cannon': {
      box(cx, cy, 2.25, 4 + (b.recoil ? 0 : 0), F('#a0a0b2'), F('#76768a'), F('#56566a'));
      dia(cx, cy - 4, 1.75, F(trim));
      box(cx, cy - 4, 1.25, 3, F('#6b4a2a'), F('#4a2f18'), F('#3a2412'));
      const a = b.angle, kick = b.recoil ? 2 : 0;
      const ex = cx + Math.cos(a) * (10 - kick), ey = cy - 9 + Math.sin(a) * (5 - kick / 2);
      circ(cx, cy - 9, 4, F('#2a2a36'));
      line(cx, cy - 9, ex, ey, F('#2a2a36'), 4);
      line(cx, cy - 10, ex, ey - 1, F('#55556a'), 1);
      circ(Math.round(ex), Math.round(ey), 2, '#101018');
      break;
    }
    case 'archer': {
      for (const [dx, dy] of [[-8, -1], [8, -1], [0, 3], [0, -5]]) rect(cx + dx - 1, cy + dy - 18, 3, 18, F('#7a4a22'));
      box(cx, cy - 2, 1.5, 3, F('#9c6233'), F('#7a4a22'), F('#5c3414'));
      box(cx, cy - 18, 2.1, 4, F('#c98a4b'), F('#9c6233'), F('#6b3f1f'));
      dia(cx, cy - 22, 1.4, F(trim));
      // the archer on top
      const ac = spriteCanvas('arch', Math.cos(b.angle) < 0, false);
      g.drawImage(ac, Math.round(cx - ac.width / 2), Math.round(cy - 22 - ac.height + 2));
      break;
    }
    case 'mortar': {
      box(cx, cy, 2.25, 6, F('#b0b0c0'), F('#82829a'), F('#5e5e74'));
      dia(cx, cy - 6, 1.5, '#3a3a48');
      const lift = b.recoil ? 1 : 0;
      oval(cx, cy - 11 + lift, 6, 5, F('#30303c'));
      oval(cx, cy - 15 + lift, 5, 2, '#0e0e14');
      rect(cx - 6, cy - 10 + lift, 12, 1, F(trim));
      break;
    }
    case 'airdef': {
      box(cx, cy, 2.1, 5, F('#a0a0b2'), F('#76768a'), F('#56566a'));
      box(cx, cy - 5, 1.25, 12, F('#6a86c8'), F('#4a64a8'), F('#34488a'));
      for (const dx of [-5, 0, 5]) {
        rect(cx + dx - 1, cy - 26, 3, 8, F('#e8e8f0'));
        rect(cx + dx - 1, cy - 28, 3, 2, F('#e03a30'));
      }
      rect(cx - 7, cy - 18, 14, 2, F(trim));
      break;
    }
    case 'wall': {
      const cols = [['#b7b7c4', '#8f8fa3', '#6f6f85'], ['#d8b878', '#b08a4a', '#8a6a32'], ['#7a7a96', '#55556e', '#3c3c52'], ['#f8d860', '#d8a820', '#a87c10']][lvl - 1];
      box(cx, cy, 0.75, 7, F(cols[0]), F(cols[1]), F(cols[2]));
      break;
    }
    case 'goldmine': {
      box(cx, cy, 2.1, 5, F('#9c6233'), F('#7a4a22'), F('#5c3414'));
      rect(cx - 12, cy - 6, 24, 1, '#5c3414');
      circ(cx - 3, cy - 9, 4, F('#f8c830')); circ(cx + 4, cy - 8, 3, F('#f8d860')); circ(cx, cy - 12, 3, F('#ffe890'));
      rect(cx - 2, cy - 14, 1, 1, '#fff'); rect(cx + 5, cy - 10, 1, 1, '#fff');
      line(cx + 8, cy - 4, cx + 8, cy - 17, '#5c3414', 2); line(cx + 8, cy - 17, cx + 2, cy - 19, '#5c3414', 2);
      rect(cx - 13, cy - 5, 26, 1, trim);
      break;
    }
    case 'elixir': {
      box(cx, cy, 1.9, 4, F('#a0a0b2'), F('#76768a'), F('#56566a'));
      rect(cx - 1, cy - 16, 3, 12, F('#5c3414'));
      circ(cx, cy - 13, 7, F('#e04ce8'));
      circ(cx - 2, cy - 15, 3, F('#f8a8ff'));
      rect(cx - 3, cy - 17, 1, 2, '#fff');
      rect(cx - 7, cy - 13, 14, 1, F('#8e2aa8'));
      rect(cx - 12, cy - 4, 24, 1, trim);
      break;
    }
    case 'goldstore': {
      box(cx, cy, 2.25, 8, F('#c98a4b'), F('#9c6233'), F('#6b3f1f'));
      dia(cx, cy - 8, 1.9, F('#f8c830'));
      for (let i = 0; i < 6; i++) circ(cx - 8 + i * 3, cy - 11 + (i % 2) * 2, 2, F(i % 2 ? '#f8d860' : '#e8b020'));
      rect(cx - 18, cy - 4, 36, 2, F('#5c3414'));
      rect(cx - 2, cy - 3, 4, 4, trim);
      break;
    }
    case 'elixstore': {
      box(cx, cy, 2.1, 4, F('#a0a0b2'), F('#76768a'), F('#56566a'));
      circ(cx, cy - 13, 10, F('#c03cd0'));
      circ(cx - 3, cy - 16, 5, F('#f070f8'));
      rect(cx - 6, cy - 19, 2, 3, '#fff');
      rect(cx - 10, cy - 13, 21, 2, F('#6b2a80'));
      rect(cx - 2, cy - 24, 4, 3, F('#6b2a80'));
      break;
    }
    case 'builder': {
      box(cx, cy, 1.25, 7, F('#c98a4b'), F('#9c6233'), F('#6b3f1f'));
      for (let k = 0; k < 5; k++) box(cx, cy - 7 - k * 2, 1.4 - k * 0.3, 2, F('#e0503c'), F('#b8362a'), F('#8a2420'));
      rect(cx + 2, cy - 4, 3, 5, '#3a2010');
      break;
    }
  }
  if (b.cons) drawUpgradeBadge(cx, cy, s, b);
}
function drawRubble(cx, cy, s) {
  dia(cx, cy, Math.max(0.75, s - 0.75), '#6a5a48');
  const seed = Math.round(cx * 7 + cy * 13);
  for (let i = 0; i < 4 + s * 2; i++) {
    const a = (seed + i * 97) % 360, r = ((seed + i * 31) % 10) / 10 * s * 4;
    rect(cx + Math.cos(a) * r * 1.6 - 1, cy + Math.sin(a) * r * 0.6 - 1, 3, 2, i % 2 ? '#8f8fa3' : '#4a3a28');
  }
}
function drawScaffold(cx, cy, s, b) {
  dia(cx, cy, s - 0.5, '#9b7a4a');
  const h = 6 + s * 3, w = Math.round(s * 6);
  for (const dx of [-w, 0, w]) rect(cx + dx - 1, cy - h - (dx === 0 ? 3 : 0), 2, h + (dx === 0 ? 3 : 0), '#c98a4b');
  line(cx - w, cy - h, cx + w, cy - h, '#9c6233', 2);
  line(cx - w, cy - 2, cx + w, cy - h, '#9c6233', 1);
  rect(cx - 5, cy - 6, 10, 5, '#d8c49a'); rect(cx - 5, cy - 6, 10, 1, '#f0e0b8');
  drawUpgradeBadge(cx, cy, s, b);
}
function drawUpgradeBadge(cx, cy, s, b) {
  const label = b.cons.days + 'd';
  const y = cy - (s * 4 + 22);
  const w = textWidth(label) + 14;
  rect(cx - w / 2 - 1, y - 1, w + 2, 10, '#14101c');
  rect(cx - w / 2, y, w, 8, '#f8c830');
  // hammer
  rect(cx - w / 2 + 2, y + 2, 4, 2, '#5f5f75'); rect(cx - w / 2 + 3, y + 4, 1, 3, '#7a4a22');
  ptext(label, cx - w / 2 + 9, y + 2, '#ffffff');
}
function drawHpBar(cx, y, w, frac) {
  rect(cx - w / 2 - 1, y - 1, w + 2, 4, '#14101c');
  rect(cx - w / 2, y, w, 2, '#5a1a14');
  rect(cx - w / 2, y, Math.max(1, Math.round(w * frac)), 2, frac > 0.5 ? '#6fe03a' : frac > 0.25 ? '#f8c830' : '#f04a30');
}

// ---------- decorative trees and rocks on the outer ring ----------
let decor = [];
function makeDecor() {
  decor = [];
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(r() * 4), t = -MARGIN + r() * (GRID + MARGIN * 2), d = -MARGIN + r() * (MARGIN - 1.2);
    let x, y;
    if (side === 0) { x = t; y = d; } else if (side === 1) { x = GRID - d; y = t; } else if (side === 2) { x = t; y = GRID - d; } else { x = d; y = t; }
    decor.push({ x, y, kind: r() < 0.75 ? 'tree' : 'rock', v: r() });
  }
}
function drawDecor(d) {
  const cx = sx(d.x, d.y), cy = sy(d.x, d.y);
  if (d.kind === 'tree') {
    oval(cx, cy, 6, 3, 'rgba(0,0,0,0.25)');
    rect(cx - 1, cy - 8, 3, 8, '#6b3f1f');
    const big = d.v > 0.5 ? 1 : 0;
    circ(cx, cy - 12 - big * 2, 6 + big, '#2f7a1e');
    circ(cx - 2, cy - 14 - big * 2, 4 + big, '#3f9a28');
    circ(cx - 3, cy - 16 - big * 2, 2, '#68c848');
  } else {
    oval(cx, cy - 1, 5, 3, '#7c7c90'); oval(cx - 1, cy - 2, 3, 2, '#a8a8b8');
  }
}

// ---------- ground: drawn once, then blitted every frame (much cheaper on phones) ----------
const GROUND_OX = (GRID + MARGIN * 2) * 8 + 8, GROUND_OY = MARGIN * 8 + 8;
let groundCanvas = null;
function buildGround() {
  const c = document.createElement('canvas');
  c.width = GROUND_OX * 2; c.height = (GRID + MARGIN * 2) * 8 + 16;
  const prev = g;
  g = c.getContext('2d');
  for (let y = -MARGIN; y < GRID + MARGIN; y++) for (let x = -MARGIN; x < GRID + MARGIN; x++) {
    const inside = x >= 0 && y >= 0 && x < GRID && y < GRID;
    const checker = (x + y) % 2 === 0;
    dia(isoX(x + 0.5, y + 0.5) + GROUND_OX, isoY(x + 0.5, y + 0.5) + GROUND_OY, 1,
      inside ? (checker ? '#62b236' : '#5aa830') : (checker ? '#4a9228' : '#448a24'));
  }
  const corners = [[0, 0], [GRID, 0], [GRID, GRID], [0, GRID], [0, 0]];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[i + 1];
    line(isoX(ax, ay) + GROUND_OX, isoY(ax, ay) + GROUND_OY, isoX(bx, by) + GROUND_OX, isoY(bx, by) + GROUND_OY, '#3c7a20', 1);
  }
  g = prev;
  groundCanvas = c;
}
function drawGround() {
  if (!groundCanvas) buildGround();
  g.drawImage(groundCanvas, Math.round(W / 2 - cam.x) - GROUND_OX, Math.round(H / 2 - cam.y) - GROUND_OY);
}

// ---------- the frame ----------
function render(now) {
  const night = S.phase === 'night';
  // sky / outside the map
  g.fillStyle = '#1d3b14';
  g.fillRect(0, 0, W, H);
  drawGround();
  // placement grid highlight
  if (placing) {
    const t = TYPES[placing.type], s = t.size;
    const ok = placing.ok;
    dia(sx(placing.x + s / 2, placing.y + s / 2), sy(placing.x + s / 2, placing.y + s / 2), s + 0.25, ok ? 'rgba(120,255,120,0.45)' : 'rgba(255,80,60,0.5)');
  }
  // collect drawables, sort by depth
  const items = [];
  for (const b of S.buildings) {
    if (placing && placing.moveId === b.id) continue;
    const s = def(b).size;
    items.push({ depth: b.x + b.y + s * 2 - 0.5, draw: () => drawBuildingAt(b) });
  }
  for (const d of decor) items.push({ depth: d.x + d.y, draw: () => drawDecor(d) });
  for (const u of units) items.push({ depth: u.x + u.y + (u.d.air ? 60 : 0), draw: () => drawUnit(u, now) });
  for (const f of flags) items.push({ depth: f.x + f.y, draw: () => drawFlag(f, now) });
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
  // selected building range
  const sel = selectedId && byId(selectedId);
  if (sel && def(sel).range && !placing) {
    const c = center(sel), t = def(sel);
    ring(sx(c.x, c.y), sy(c.x, c.y), t.range * 8 * 1.414, t.range * 4 * 1.414, 'rgba(255,255,255,0.8)', true);
    if (t.minRange) ring(sx(c.x, c.y), sy(c.x, c.y), t.minRange * 8 * 1.414, t.minRange * 4 * 1.414, 'rgba(255,120,100,0.8)', true);
  }
  // ghost while placing
  if (placing) {
    const t = TYPES[placing.type], s = t.size;
    const fake = { type: placing.type, lvl: placing.lvl || 1, x: placing.x, y: placing.y, angle: 0.6, cons: null };
    g.globalAlpha = 0.85;
    drawBuilding(fake, sx(placing.x + s / 2, placing.y + s / 2), sy(placing.x + s / 2, placing.y + s / 2), { ghost: true });
    g.globalAlpha = 1;
    if (t.range) ring(sx(placing.x + s / 2, placing.y + s / 2), sy(placing.x + s / 2, placing.y + s / 2), t.range * 8 * 1.414, t.range * 4 * 1.414, 'rgba(255,255,255,0.7)', true);
  }
  // shots and effects on top
  for (const s of shots) drawShot(s);
  for (const e of fx) drawFx(e);
  for (const t of texts) {
    const k = t.t / t.life;
    const x = sx(t.x, t.y), y = sy(t.x, t.y) - 24 - k * 14;
    ptext(t.text, x - textWidth(t.text) / 2, y, t.color);
  }
  // night tint
  if (night) {
    g.fillStyle = 'rgba(20, 24, 70, 0.38)';
    g.fillRect(0, 0, W, H);
    // lanterns: soft light on buildings at night
    for (const b of S.buildings) {
      if (b.type !== 'townhall' && b.type !== 'builder') continue;
      const c = center(b);
      g.fillStyle = 'rgba(255, 200, 90, 0.12)';
      oval(sx(c.x, c.y), sy(c.x, c.y) - 6, 26, 14, 'rgba(255, 200, 90, 0.10)');
    }
  }
}
function drawBuildingAt(b) {
  const s = def(b).size, c = center(b);
  const cx = sx(c.x, c.y), cy = sy(c.x, c.y);
  if (cx < -60 || cx > W + 60 || cy < -80 || cy > H + 40) return;
  // walls connect to neighbours, like a real wall line
  if (b.type === 'wall' && !b.destroyed && b.lvl >= 1) {
    dia(cx, cy, 0.75, '#4a9628');
    const lvl = b.lvl, cols = [['#b7b7c4', '#8f8fa3', '#6f6f85'], ['#d8b878', '#b08a4a', '#8a6a32'], ['#7a7a96', '#55556e', '#3c3c52'], ['#f8d860', '#d8a820', '#a87c10']][lvl - 1];
    const flash = b.flash > 0;
    const F = (col) => (flash ? '#ffffff' : col);
    const nbr = (dx, dy) => { const id = blocked[cellIndex(b.x + dx, b.y + dy)]; const o = id && byId(id); return o && o.type === 'wall' && !o.destroyed && o.lvl >= 1; };
    // links to the neighbours behind us are drawn by them; we draw links toward -x and -y
    if (inField(b.x - 1, b.y) && nbr(-1, 0)) box(sx(c.x - 0.5, c.y), sy(c.x - 0.5, c.y), 0.5, 6, F(cols[0]), F(cols[1]), F(cols[2]));
    if (inField(b.x, b.y - 1) && nbr(0, -1)) box(sx(c.x, c.y - 0.5), sy(c.x, c.y - 0.5), 0.5, 6, F(cols[0]), F(cols[1]), F(cols[2]));
    box(cx, cy, 0.75, 7, F(cols[0]), F(cols[1]), F(cols[2]));
    if (b.hp < maxHp(b)) drawHpBar(cx, cy - 13, 8, b.hp / maxHp(b));
    if (selectedId === b.id) drawSelect(cx, cy, s);
    return;
  }
  drawBuilding(b, cx, cy);
  if (selectedId === b.id) drawSelect(cx, cy, s);
  if (!b.destroyed && b.hp < maxHp(b) && S.phase === 'day') drawHpBar(cx, cy - s * 4 - 16, s * 8, b.hp / maxHp(b));
}
function drawSelect(cx, cy, s) {
  const blink = Math.floor(performance.now() / 300) % 2;
  const hw = s * 8, hh = s * 4;
  const c = blink ? '#ffffff' : '#f8e070';
  line(cx - hw, cy, cx, cy - hh, c); line(cx, cy - hh, cx + hw, cy, c);
  line(cx + hw, cy, cx, cy + hh, c); line(cx, cy + hh, cx - hw, cy, c);
}
function drawUnit(u, now) {
  const cx = sx(u.x, u.y), cy = sy(u.x, u.y);
  if (cx < -30 || cx > W + 30 || cy < -40 || cy > H + 30) return;
  const img = spriteCanvas(u.d.sprite, u.dir < 0, u.flash > 0);
  const bob = u.d.air ? Math.round(Math.sin(now / 160 + u.walk) * 2) : (Math.floor(u.walk) % 2);
  const lunge = u.swing ? u.dir * 2 : 0;
  oval(cx, cy, Math.ceil(img.width / 2.6), 2, 'rgba(0,0,0,0.3)');
  g.drawImage(img, Math.round(cx - img.width / 2 + lunge), Math.round(cy - img.height + 1 - bob - u.z));
  if (u.hp < u.maxhp) drawHpBar(cx, cy - img.height - 4 - u.z, Math.max(8, img.width - 2), u.hp / u.maxhp);
}
function drawFlag(f, now) {
  const cx = sx(f.x, f.y), cy = sy(f.x, f.y);
  if (dayTime > 8) return;
  line(cx, cy, cx, cy - 16, '#3a2a18');
  const wave = Math.floor(now / 200) % 2;
  rect(cx + 1, cy - 16 + wave, 8, 5, '#e03a30'); rect(cx + 1, cy - 16 + wave, 8, 1, '#ff8a70');
}
function drawShot(s) {
  const x = sx(s.x, s.y), y = sy(s.x, s.y) - s.z;
  if (s.kind === 'ball') { circ(x, y, 1, '#16161e'); }
  else if (s.kind === 'arrow' || s.kind === 'enemyArrow') {
    const tx = s.target ? s.target.x : s.tx, ty = s.target ? s.target.y : s.ty;
    const a = Math.atan2(isoY(tx - s.x, ty - s.y), isoX(tx - s.x, ty - s.y));
    line(x - Math.cos(a) * 4, y - Math.sin(a) * 4, x, y, s.kind === 'arrow' ? '#f4f4f4' : '#f8d090', 1);
  }
  else if (s.kind === 'shell') { oval(sx(s.x, s.y), sy(s.x, s.y), 2, 1, 'rgba(0,0,0,0.35)'); circ(x, y, 2, '#1a1a24'); rect(x - 1, y - 1, 1, 1, '#8f8fa3'); }
  else if (s.kind === 'rocket') { rect(x - 1, y - 1, 3, 3, '#e03a30'); rect(x, y, 1, 1, '#ffe070'); }
  else if (s.kind === 'fire') { circ(x, y, 3, '#f8a830'); circ(x, y, 1, '#fff070'); }
}
function drawFx(e) {
  const k = e.t / e.life;
  if (e.kind === 'bit') rect(sx(e.x, e.y) - 1, sy(e.x, e.y) - e.z - 1, 2, 2, e.c);
  else if (e.kind === 'boom') {
    const x = sx(e.x, e.y), y = sy(e.x, e.y) - (e.air || 0) - 4;
    const r = Math.max(1, Math.round((2 + e.r * 8) * (0.4 + k)));
    circ(x, y, r, k < 0.5 ? (e.fire ? '#f8a830' : '#fff0a0') : '#f8a830');
    if (r > 3) circ(x, y, Math.round(r * 0.55), k < 0.5 ? '#ffffff' : '#f86030');
  } else if (e.kind === 'smoke') rect(sx(e.x, e.y) - 1, sy(e.x, e.y) - e.z - 1, 2, 2, 'rgba(200,200,210,' + (0.7 - k * 0.7).toFixed(2) + ')');
  else if (e.kind === 'ghost') {
    const x = sx(e.x, e.y), y = sy(e.x, e.y) - (e.z || 0) - 8 - k * 14;
    g.globalAlpha = 1 - k;
    rect(x - 2, y - 3, 5, 5, '#e8e8f0'); rect(x - 1, y - 2, 1, 1, '#14101c'); rect(x + 1, y - 2, 1, 1, '#14101c');
    g.globalAlpha = 1;
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
  return clamp(Math.round(Math.min(vw / 420, vh / 300)), 2, 5);
}
function screenToTile(clientX, clientY) {
  const wx = clientX / scale - W / 2 + cam.x, wy = clientY / scale - H / 2 + cam.y;
  const a = wx / 8, b = wy / 4;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
function buildingAt(tx, ty) {
  // prefer the front-most (largest depth) building whose footprint holds the tile
  let best = null, bd = -Infinity;
  for (const b of S.buildings) {
    const s = def(b).size;
    if (tx >= b.x && tx < b.x + s && ty >= b.y && ty < b.y + s) { const d = b.x + b.y; if (d > bd) { bd = d; best = b; } }
  }
  return best;
}
function clampCam() {
  const lim = (GRID + MARGIN) * 8;
  cam.x = clamp(cam.x, -lim, lim);
  cam.y = clamp(cam.y, -MARGIN * 4, (GRID + MARGIN) * 8);
}
function centerOn(x, y) { cam.x = isoX(x, y); cam.y = isoY(x, y); clampCam(); }

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
  if (placing) {
    const s = TYPES[placing.type].size;
    if (t.x >= placing.x - 0.5 && t.x < placing.x + s + 0.5 && t.y >= placing.y - 0.5 && t.y < placing.y + s + 0.5) mode = 'ghost';
  }
  drag = { mode, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, gx: placing ? placing.x : 0, gy: placing ? placing.y : 0, tx: t.x, ty: t.y };
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const want = clamp(Math.round(pinch.scale * d / pinch.d), 2, 6);
    if (want !== scale) setScale(want);
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (Math.hypot(dx, dy) > 6) drag.moved = true;
  if (drag.mode === 'ghost') {
    const t = screenToTile(e.clientX, e.clientY);
    placing.x = clamp(Math.round(drag.gx + (t.x - drag.tx)), 0, GRID - TYPES[placing.type].size);
    placing.y = clamp(Math.round(drag.gy + (t.y - drag.ty)), 0, GRID - TYPES[placing.type].size);
    placing.ok = fits(placing.type, placing.x, placing.y, placing.moveId);
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
  if (placing) {
    const s = TYPES[placing.type].size;
    placing.x = clamp(Math.floor(t.x - s / 2 + 0.5), 0, GRID - s);
    placing.y = clamp(Math.floor(t.y - s / 2 + 0.5), 0, GRID - s);
    placing.ok = fits(placing.type, placing.x, placing.y, placing.moveId);
    return;
  }
  const b = buildingAt(t.x, t.y);
  if (b) { select(b.id); sfx('click'); } else deselect();
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setScale(clamp(scale + (e.deltaY < 0 ? 1 : -1), 2, 6)); }, { passive: false });
window.addEventListener('resize', () => { resize(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => resize());
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
// save whenever the app goes to the background (phones may kill it there)
document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.phase === 'night') save(); });
window.addEventListener('pagehide', () => { if (S && S.phase === 'night') save(); });
// no long-press menus or pinch-zooming the page itself
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else if (placing) cancelPlace(); else deselect(); }
});
function setScale(s) { scale = s; resize(); }

/* =====================================================================
   UI
   ===================================================================== */
const ICONS = {
  gold: ['....yyyy....', '..yyYYYYyy..', '.yYYyyyyYYy.', '.yYyYYYYyYy.', 'yYyYyyyyYyYy', 'yYyYyyyyYyYy', 'yYyYyyyyYyYy', 'yYyYyyyyYyYy', '.yYyYYYYyYy.', '.yYYyyyyYYy.', '..yyYYYYyy..', '....yyyy....'],
  elixir: ['.....kk.....', '.....ee.....', '....eppe....', '....eppe....', '...eeppee...', '..eeewpeee..', '.eeewwpeeee.', '.eeewpeeeee.', '.eeeeeeePee.', '..eePPPPee..', '...eeeeee...', '............'],
  sword: ['..........ww', '.........wmw', '........wmw.', '.......wmw..', '..b...wmw...', '...b.wmw....', '....bmw.....', '....yb......', '...yby......', '..yy..b.....', '.yy.........', 'yy..........'],
  plus: ['............', '....wwww....', '....wwww....', '....wwww....', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '....wwww....', '....wwww....', '....wwww....', '............'],
  minus: ['............', '............', '............', '............', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '............', '............', '............', '............'],
  sound: ['............', '.....w......', '....ww...w..', '...www....w.', 'wwwwww..w.w.', 'wwwwww...w.w', 'wwwwww...w.w', 'wwwwww..w.w.', '...www....w.', '....ww...w..', '.....w......', '............'],
  mute: ['............', '.....w......', '....ww......', '...www......', 'wwwwww.r...r', 'wwwwww..r.r.', 'wwwwww...r..', 'wwwwww..r.r.', '...www.r...r', '....ww......', '.....w......', '............'],
  menu: ['............', '............', '.wwwwwwwwww.', '.wwwwwwwwww.', '............', '.wwwwwwwwww.', '.wwwwwwwwww.', '............', '.wwwwwwwwww.', '.wwwwwwwwww.', '............', '............'],
  shop: ['............', '..rwrwrwrw..', '.rwrwrwrwrw.', 'rwrwrwrwrwrw', 'rrrrrrrrrrrr', '.bbbbbbbbbb.', '.bllbbbbllb.', '.bllbbbbllb.', '.bbbbnnbbbb.', '.bbbbnnbbbb.', '.bbbbnnbbbb.', 'kkkkkkkkkkkk'],
  sun: ['.....y......', '..y..y..y...', '...yyyyy....', '..yyyyyyy...', 'yyyyyyyyyyy.', '..yyyyyyy...', '..yyyyyyy...', '...yyyyy....', '..y..y..y...', '.....y......', '............', '............'],
  moon: ['............', '....wwww....', '...www......', '..www.......', '..ww........', '..ww........', '..www.......', '...wwww..w..', '....wwwwww..', '......ww....', '............', '............'],
  hammer: ['............', '.mmmmmm.....', '.mMMMMm.....', '.mmmmmm.....', '...bb.......', '...bb.......', '...bb.......', '...bb.......', '...bb.......', '...bb.......', '...nn.......', '............'],
  star: ['.....yy.....', '.....yy.....', '....yyyy....', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..yyyyyyyy..', '...yyyyyy...', '..yyyyyyyy..', '..yyy..yyy..', '.yy......yy.', '.y........y.', '............'],
  starOff: ['.....MM.....', '.....MM.....', '....MMMM....', 'MMMMMMMMMMMM', '.MMMMMMMMMM.', '..MMMMMMMM..', '...MMMMMM...', '..MMMMMMMM..', '..MMM..MMM..', '.MM......MM.', '.M........M.', '............'],
  clock: ['....kkkk....', '..kkwwwwkk..', '.kwwwwkwwwk.', '.kwwwwkwwwk.', 'kwwwwwkwwwwk', 'kwwwwwkkkkwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '..kkwwwwkk..', '....kkkk....'],
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

let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function refreshUI() {
  if (!S) return;
  const day = S.phase !== 'night';
  const ph = $('phase');
  ph.classList.toggle('is-day', day);
  drawIcon($('phaseIcon'), day ? 'sun' : 'moon');
  $('phaseTitle').textContent = (day ? 'DAY ' : 'NIGHT ') + S.day;
  const bl = builders();
  $('phaseSub').innerHTML = day ? `<span data-ico="shield" data-px="14"></span>Defend!` : `<span data-ico="hammer" data-px="14"></span>Builders ${bl.free}/${bl.total}`;
  hydrateCosts($('phaseSub'));
  for (const res of ['gold', 'elixir']) {
    const cap = capOf(res);
    $(res + 'Amt').textContent = fmt(S[res]);
    $(res + 'Cap').textContent = 'Max ' + fmt(cap);
    $(res + 'Fill').style.width = clamp((S[res] / cap) * 100, 0, 100) + '%';
  }
  const night = S.phase === 'night';
  $('shopBtn').hidden = !night || !!placing;
  $('defendBtn').hidden = !night || !!placing;
  $('defendText').textContent = 'START DAY ' + S.day;
  $('wave').hidden = S.phase !== 'day';
  $('speedBtn').hidden = S.phase !== 'day';
  $('speedBtn').textContent = 'x' + speed;
  $('placeBar').hidden = !placing;
  updateWave();
}
function updateWave() {
  if (S.phase !== 'day') return;
  const left = units.length + spawnQueue.length;
  $('waveText').textContent = 'ENEMIES ' + left;
}

// ----- selection panel -----
function select(id) { selectedId = id; renderSel(); }
function deselect() { selectedId = null; $('sel').hidden = true; }
function renderSel() {
  const b = byId(selectedId);
  const el = $('sel');
  if (!b) { deselect(); return; }
  const t = def(b), lvl = b.lvl;
  const night = S.phase === 'night';
  const shownLvl = Math.max(1, lvl);
  const stats = [];
  stats.push(`<div>Hitpoints <b>${fmt(b.destroyed ? 0 : b.hp)}/${fmt(maxHp(b))}</b></div>`);
  if (t.dmg) stats.push(`<div>Damage <b>${t.dmg[shownLvl - 1]}</b> per shot</div>`, `<div>Range <b>${t.range}</b> tiles</div>`, `<div>Targets <b>${t.air && t.ground ? 'Ground &amp; air' : t.air ? 'Air' : 'Ground'}</b></div>`);
  if (t.prod) stats.push(`<div>Makes <b>${fmt(t.prod[shownLvl - 1])}</b> a day</div>`);
  if (t.store) stats.push(`<div>Holds <b>${fmt(t.store[shownLvl - 1])}</b></div>`);
  if (t.cap) stats.push(`<div>Holds <b>${fmt(t.cap[shownLvl - 1])}</b> of each</div>`);
  let status = '';
  if (b.cons) status = lvl < 1 ? `Under construction: ready in ${daysLabel(b.cons.days)}.` : `Upgrading to level ${b.cons.to}: ready in ${daysLabel(b.cons.days)}. It won't work until then.`;
  else if (b.destroyed) status = 'Destroyed. Builders will repair it tonight for free.';
  const actions = [];
  if (night && !b.cons && lvl >= 1) {
    const next = lvl + 1;
    if (next <= t.max && t.cost[next - 1]) {
      const p = t.cost[next - 1];
      const cap = levelCap(b.type);
      if (next > cap) actions.push(`<button class="btn" disabled>Needs Town Hall ${b.type === 'wall' ? next : next - 1}</button>`);
      else actions.push(`<button class="btn go" id="upBtn">Upgrade ${costHTML(p)} · ${daysLabel(p[2])}</button>`);
    } else if (t.max > 1) actions.push('<button class="btn" disabled>Max level</button>');
  }
  if (night && b.type !== 'townhall') actions.push('<button class="btn wood" id="moveBtn">Move</button>');
  if (night && b.type === 'wall' && !b.cons) actions.push('<button class="btn no" id="sellBtn">Remove</button>');
  el.innerHTML = `
    <div class="sel-head">
      <div class="sel-name ol">${t.name}${lvl >= 1 ? ' · Level ' + lvl : ''}</div>
      <button class="btn no close-x" id="selClose" aria-label="Close">&#x2716;</button>
    </div>
    <div class="sel-body">
      <div class="hpbar"><i style="width:${b.destroyed ? 0 : (b.hp / maxHp(b)) * 100}%"></i></div>
      <div class="stats">${stats.join('')}</div>
      ${status ? `<div class="note">${status}</div>` : `<div class="note">${t.desc}</div>`}
      ${actions.length ? `<div class="sel-actions">${actions.join('')}</div>` : ''}
    </div>`;
  hydrateCosts(el);
  el.hidden = false;
  $('selClose').onclick = deselect;
  const up = $('upBtn'); if (up) up.onclick = () => upgrade(b);
  const mv = $('moveBtn'); if (mv) mv.onclick = () => beginMove(b);
  const sl = $('sellBtn'); if (sl) sl.onclick = () => { S.buildings = S.buildings.filter((o) => o !== b); rebuildBlocked(); deselect(); save(); refreshUI(); sfx('click'); };
}
function upgrade(b) {
  const t = def(b), next = b.lvl + 1, p = t.cost[next - 1];
  if (!canAfford(p)) { toast(`Not enough ${S.gold < p[0] ? 'gold' : 'elixir'}`); sfx('nope'); return; }
  if (p[2] > 0 && builders().free <= 0) { toast('All builders are busy'); sfx('nope'); return; }
  S.gold -= p[0]; S.elixir -= p[1];
  if (p[2] === 0) { b.lvl = next; b.hp = maxHp(b); toast(`${t.name} upgraded to level ${next}!`); }
  else { b.cons = { to: next, days: p[2] }; toast(`Upgrade started: ${daysLabel(p[2])}`); }
  sfx('build'); save(); refreshUI(); renderSel();
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
  placing = { type, x: spot.x, y: spot.y, ok: true, moveId: null };
  refreshUI();
}
function beginMove(b) {
  deselect();
  placing = { type: b.type, x: b.x, y: b.y, ok: true, moveId: b.id, lvl: b.lvl };
  refreshUI();
}
function cancelPlace() { placing = null; refreshUI(); }
function confirmPlace() {
  if (!placing) return;
  if (!placing.ok) { toast("Can't build there"); sfx('nope'); return; }
  const p = placing;
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
  // walls: keep laying the next segment along the same line
  if (p.type === 'wall' && countOf('wall') < limitOf('wall') && canAfford(priceOf('wall', 1))) {
    const dir = p.lastDir || [1, 0];
    let nx = p.x + dir[0], ny = p.y + dir[1];
    if (!fits('wall', nx, ny)) {
      const alt = [[1, 0], [0, 1], [-1, 0], [0, -1]].find(([dx, dy]) => fits('wall', p.x + dx, p.y + dy));
      if (alt) { nx = p.x + alt[0]; ny = p.y + alt[1]; }
    }
    if (fits('wall', nx, ny)) {
      placing = { type: 'wall', x: nx, y: ny, ok: true, moveId: null, lastDir: [nx - p.x, ny - p.y] };
      refreshUI(); return;
    }
  }
  placing = null;
  refreshUI();
  if (price[2] > 0) toast(`${t.name} will be ready in ${daysLabel(price[2])}`);
}
$('placeOk').onclick = confirmPlace;
$('placeNo').onclick = cancelPlace;

// ----- shop -----
let shopTab = 'defense';
function openShop() {
  if (S.phase !== 'night') return;
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
  const s = TYPES[type].size;
  const c = document.createElement('canvas');
  c.width = 64; c.height = height || 56;
  const prev = g; g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const cy = c.height - 22 + (4 - s) * 2;
  drawBuilding({ type, lvl: 1, x: 0, y: 0, angle: 0.5, cons: null, hp: 1 }, 32, cy, { ghost: false });
  g = prev;
  c.style.width = '128px'; c.style.height = '112px';
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
function starsHTML(n) { return `<div class="stars">${[0, 1, 2].map((i) => `<span data-ico="${i < n ? 'star' : 'starOff'}" data-px="40"></span>`).join('')}</div>`; }
function showVictory(stars, gold, elixir, st, pct) {
  const stolen = st.stolenGold + st.stolenElixir;
  popup(`DAY ${S.day} SURVIVED`, `${starsHTML(stars)}
    <p>You held off ${st.total} attackers. ${pct > 0 ? Math.round(pct * 100) + '% of your buildings fell.' : 'Not a single building fell.'}</p>
    <div class="loot">
      <div><span data-ico="gold" data-px="22"></span>+${fmt(gold)}</div>
      <div><span data-ico="elixir" data-px="22"></span>+${fmt(elixir)}</div>
      ${stolen ? `<div style="color:#b8241a">Goblins stole ${fmt(stolen)}</div>` : ''}
    </div>`, [['NIGHT FALLS', 'go', () => { closeModal(); startNight(); }]]);
}
function showGameOver(days) {
  popup('VILLAGE FALLEN', `<p>Your Town Hall was destroyed on day ${days + 1}.</p>
    <div class="loot"><div>DAYS SURVIVED: ${days}</div><div>BEST: ${Math.max(days, bestDay())}</div></div>`,
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
      <div><span data-ico="moon" data-px="18"></span><span>At night, build and upgrade your village. Bigger buildings take days to finish.</span></div>
      <div><span data-ico="sun" data-px="18"></span><span>By day, a wave of raiders attacks. Your defenses fight on their own.</span></div>
      <div><span data-ico="shield" data-px="18"></span><span>Keep your Town Hall standing. How many days can you last?</span></div>
    </div>
    ${best ? `<div class="loot"><div>BEST: ${best} DAYS</div></div>` : ''}`,
  hasSave ? [['NEW', 'no', () => { closeModal(); newGame(); rebuildBlocked(); refreshUI(); }], [`CONTINUE · NIGHT ${S.day}`, 'go', () => { closeModal(); }]]
    : [['PLAY', 'go', () => { closeModal(); }]], 'title-screen');
}
function showMenu() {
  popup('PAUSED', `<p>Night ${S.day}. Your village saves itself every night.</p>`, [
    ['NEW VILLAGE', 'no', () => { popup('START OVER?', '<p>This village will be lost.</p>', [['KEEP PLAYING', 'wood', closeModal], ['START OVER', 'no', () => { closeModal(); newGame(); rebuildBlocked(); units = []; shots = []; centerOn(15, 15); refreshUI(); }]]); }],
    ['RESUME', 'go', closeModal],
  ]);
}

$('shopBtn').onclick = () => { unlockAudio(); sfx('click'); openShop(); };
$('defendBtn').onclick = () => { unlockAudio(); startDay(); };
$('zoomIn').onclick = () => setScale(clamp(scale + 1, 2, 6));
$('zoomOut').onclick = () => setScale(clamp(scale - 1, 2, 6));
$('speedBtn').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; refreshUI(); };
$('menuBtn').onclick = () => { unlockAudio(); if (S.phase === 'night') showMenu(); else toast('Wait for the day to end'); };
$('soundBtn').onclick = () => { muted = !muted; unlockAudio(); drawIcon($('soundIco'), muted ? 'mute' : 'sound'); $('soundBtn').setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); try { localStorage.setItem('clash-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } };
document.querySelectorAll('canvas[data-icon]').forEach((c) => drawIcon(c, c.dataset.icon));

/* =====================================================================
   SOUND: tiny square-wave effects, made on the fly
   ===================================================================== */
let actx = null, muted = false, lastSfx = {};
try { muted = localStorage.getItem('clash-muted') === '1'; } catch (e) { /* ignore */ }
drawIcon($('soundIco'), muted ? 'mute' : 'sound');
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
  if (muted || !navigator.vibrate) return;
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
  if (muted || !actx || actx.state !== 'running') return;
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
    acc += dt * (S.phase === 'day' ? speed : 1);
    const STEP = 1 / 60;
    let n = 0;
    while (acc >= STEP && n++ < 12) { step(STEP); acc -= STEP; }
    render(now);
    uiTick += dt;
    if (uiTick > 0.25) { uiTick = 0; if (S.phase === 'day') { updateWave(); for (const r of ['gold', 'elixir']) { $(r + 'Amt').textContent = fmt(S[r]); $(r + 'Fill').style.width = clamp(S[r] / capOf(r) * 100, 0, 100) + '%'; } if (selectedId) renderSel(); } }
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
window.ClashDebug = { get S() { return S; }, get units() { return units; }, step, startDay, startNight, waveFor, fits, getField, rebuildBlocked, endDay, priceOf, newGame, add, builders, limitOf, countOf, levelCap, canAfford, freeSpotFor, thLevel, closeModal, TYPES, previewCanvas };
