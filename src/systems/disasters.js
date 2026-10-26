// Desastres: enchente, deslizamento e queimada. Saem do tempo (chuva de 30
// dias, chuva do dia, dias secos, calor; ver weather.js) e do relevo (terra
// baixa perto da água, encostas íngremes). A opção do jogo
// (state.settings.disasters: 'off' | 'rare' | 'normal') multiplica as chances.
//
// state.disasters = {
//   floods: [{ id, tiles, until }],        tiles alagados até `until` (tick)
//   fires:  [{ id, start, burning, startedAt, burned, lost, deaths }]  (burning: tiles queimando agora)
//   log:    [{ day, kind, tile, lost, damaged, deaths, homeless }]  (últimos 30)
//   nextId
// }
// state.map.scar: dias que faltam para o chão queimado ou enlameado sumir.
//
// Estragos: o prédio perdido vira ruína (como no incêndio, ver fire.js); o
// danificado (b.damaged = { until }) não recebe moradores nem contrata até o
// reparo, que é cobrado no fechamento do mês (state.economy.rebuild). No raio
// da defesa civil, estragos e reparos diminuem. Os sorteios usam state.rng, na
// ordem fixa enchente → deslizamento → queimada.

import { BUILDINGS, CLIMATES, DISASTERS, TERRAIN } from '../world/catalog.js';
import { clearForest, removeCitizen, touchMap } from '../world/runtime.js';
import { chance, randomInt } from '../core/rng.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { constrain, isSteep, tileHeight } from '../world/relief.js';
import { ruin } from './fire.js';
import { mod } from './mods.js';
import { rain30 } from './weather.js';
import { report } from './news.js';

const LOG_SIZE = 30;

export function createDisasters() {
  return { floods: [], fires: [], log: [], nextId: 1 };
}

/** Multiplicador da opção do jogo (0 desliga). */
export const disasterLevel = (state) => DISASTERS.levels[state.settings?.disasters ?? 'normal'] ?? 1;

/** Liga, enfraquece ou desliga os desastres (comando 'disasters'). */
export function setDisasterLevel(state, level) {
  if (!(level in DISASTERS.levels)) return { ok: false, reason: 'Opção desconhecida.' };
  (state.settings ??= {}).disasters = level;
  return { ok: true };
}

/** Cobertura da defesa civil no tile (0 a 1). */
const defense = (rt, tile) => rt.coverage?.defesa?.[tile] ?? 0;
/** Fator de estrago no tile (defesa civil). */
const damageFactor = (rt, tile) => 1 - (1 - DISASTERS.defense.damage) * defense(rt, tile);
/** Chance de morrer de quem foi atingido (alerta de desastres). */
const deathChance = (rt) => DISASTERS.deathChance * mod(rt, 'disasterDeaths');

/** Ruas que os desastres fecham agora (ver races.js updateClosures). */
export function disasterClosures(state) {
  const tiles = [];
  for (const f of state.disasters?.floods ?? []) for (const t of f.tiles) if (state.map.road[t]) tiles.push(t);
  return tiles;
}

// ---------------------------------------------------------------------------
// Virada do dia
// ---------------------------------------------------------------------------

/** Uma vez por dia, logo depois do tempo novo: fim das enchentes, reparos e desastres novos. */
export function dailyDisasters(state, rt) {
  const d = (state.disasters ??= createDisasters());
  const tick = state.time.tick;
  // Enchentes que passaram.
  const before = d.floods.length;
  d.floods = d.floods.filter((f) => f.until > tick);
  if (d.floods.length !== before) touchMap(rt);
  repairBuildings(state, rt);
  fadeScars(state, rt);
  const level = disasterLevel(state);
  if (!level) return;
  const w = state.weather;
  if (!w?.today) return;
  // A chuva forte apaga as queimadas.
  if (w.today.mm >= 5 && d.fires.length) {
    d.fires = [];
    touchMap(rt);
  }
  maybeFlood(state, rt, level);
  maybeLandslides(state, rt, level);
  maybeWildfire(state, rt, level);
}

/** Chuva de 30 dias que já é demais para o clima (a do mês mais chuvoso × flood.rain). */
export function floodThreshold(state) {
  const C = CLIMATES[state.weather?.climate ?? 'subtropical'];
  return Math.max(...C.rain) * DISASTERS.flood.rain;
}

function repairBuildings(state, rt) {
  const tick = state.time.tick;
  for (const b of state.buildings) {
    if (b.damaged && b.damaged.until <= tick) {
      delete b.damaged;
      touchMap(rt, b.tile, BUILDINGS[b.type].size);
    }
  }
}

function fadeScars(state, rt) {
  const scar = state.map.scar;
  if (!scar) return;
  let any = false;
  for (let i = 0; i < scar.length; i++) {
    if (!scar[i]) continue;
    scar[i]--;
    if (!scar[i]) any = true;
  }
  if (any) touchMap(rt);
}

function markScar(state, tile, days) {
  const map = state.map;
  map.scar ??= new Uint8Array(map.width * map.height);
  map.scar[tile] = Math.max(map.scar[tile], days);
}

/** Danifica o prédio (fecha até o reparo) e soma o reparo ao mês. */
function damage(state, rt, b) {
  if (b.abandoned !== undefined || b.damaged) return false;
  const info = BUILDINGS[b.type];
  const days = DISASTERS.repairDays * (1 - (1 - DISASTERS.defense.repair) * defense(rt, b.tile));
  b.damaged = { until: state.time.tick + Math.round(days * TICKS_PER_DAY) };
  state.economy.rebuild = (state.economy.rebuild ?? 0) + DISASTERS.repairCost * Math.max(1, info.level) * info.size * info.size;
  touchMap(rt, b.tile, info.size);
  return true;
}

/** Perde o prédio: ruína; quem morava ou trabalhava pode morrer. Devolve [atingidos, mortes]. */
function lose(state, rt, b, reason) {
  const people = [...rt.residents.get(b.id), ...rt.workers.get(b.id)];
  let deaths = 0;
  for (const id of people) {
    if (!rt.citizenById.has(id) || !chance(state.rng, deathChance(rt))) continue;
    removeCitizen(state, rt, id);
    deaths++;
  }
  const homeless = rt.residents.get(b.id).size;
  ruin(state, rt, b, reason);
  return [homeless, deaths];
}

/** Dias desde o último desastre do tipo (Infinity se não houve). */
function daysSince(state, kind) {
  const last = state.disasters.log.findLast((e) => e.kind === kind);
  return last ? Math.floor(state.time.tick / TICKS_PER_DAY) - last.day : Infinity;
}

function logEvent(state, entry) {
  const log = state.disasters.log;
  log.push({ day: Math.floor(state.time.tick / TICKS_PER_DAY), ...entry });
  if (log.length > LOG_SIZE) log.shift();
}

// ---------------------------------------------------------------------------
// Enchente
// ---------------------------------------------------------------------------

/** Terra baixa perto da água: tiles que podem alagar (Uint8Array, 1 = pode). */
export function floodZone(state) {
  const { width, height, terrain } = state.map;
  const F = DISASTERS.flood;
  const n = width * height;
  const dist = new Int16Array(n).fill(-1);
  const queue = [];
  for (let t = 0; t < n; t++) if (terrain[t] === TERRAIN.WATER) (dist[t] = 0, queue.push(t));
  for (let q = 0; q < queue.length; q++) {
    const t = queue[q];
    if (dist[t] >= F.radius) continue;
    const x = t % width;
    const y = (t - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const u = ny * width + nx;
      if (dist[u] >= 0) continue;
      dist[u] = dist[t] + 1;
      queue.push(u);
    }
  }
  const zone = new Uint8Array(n);
  for (let t = 0; t < n; t++) {
    if (dist[t] > 0 && terrain[t] !== TERRAIN.WATER && tileHeight(state.map, t) <= F.maxHeight) zone[t] = 1;
  }
  return zone;
}

function maybeFlood(state, rt, level) {
  const F = DISASTERS.flood;
  const w = state.weather;
  if (rain30(state) <= floodThreshold(state) && w.today.mm < F.dayRain) return;
  if (state.disasters.floods.length || daysSince(state, 'enchente') < F.gap) return; // uma por vez, com intervalo
  if (!chance(state.rng, F.chance * level)) return;
  // Drenagem e cidade-esponja: área e estragos menores.
  const soft = mod(rt, 'floodDamage');
  const zone = floodZone(state);
  // Começa num tile baixo ocupado (é onde a enchente vira notícia), ou em qualquer um.
  const candidates = [];
  for (let t = 0; t < zone.length; t++) if (zone[t] && (rt.buildingAt[t] || state.map.road[t])) candidates.push(t);
  if (!candidates.length) return;
  const start = candidates[randomInt(state.rng, 0, candidates.length - 1)];
  const { width, height } = state.map;
  const max = Math.max(4, Math.round(F.maxTiles * soft));
  const tiles = [start];
  const seen = new Set(tiles);
  for (let q = 0; q < tiles.length && tiles.length < max; q++) {
    const t = tiles[q];
    const x = t % width;
    const y = (t - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const u = ny * width + nx;
      if (!zone[u] || seen.has(u) || tiles.length >= max) continue;
      // Mata e parques perto absorvem parte da água.
      if (state.map.terrain[u] === TERRAIN.FOREST && chance(state.rng, 0.5)) continue;
      seen.add(u);
      tiles.push(u);
    }
  }
  const days = randomInt(state.rng, F.days[0], F.days[1]);
  const flood = { id: state.disasters.nextId++, tiles, until: state.time.tick + days * TICKS_PER_DAY };
  state.disasters.floods.push(flood);
  // Prédios alagados: danificados; alguns se perdem.
  let damaged = 0;
  let lost = 0;
  let deaths = 0;
  let homeless = 0;
  const hit = new Set();
  for (const t of tiles) {
    markScar(state, t, F.scar);
    const id = rt.buildingAt[t];
    if (!id || hit.has(id)) continue;
    hit.add(id);
    const b = rt.buildingById.get(id);
    if (b.abandoned !== undefined || !BUILDINGS[b.type].zone) continue;
    const f = soft * damageFactor(rt, b.tile);
    if (chance(state.rng, F.lose * f)) {
      const [h, k] = lose(state, rt, b, 'enchente');
      lost++;
      homeless += h;
      deaths += k;
    } else if (chance(state.rng, F.damage * f) && damage(state, rt, b)) {
      damaged++;
      homeless += rt.residents.get(b.id).size;
    }
  }
  touchMap(rt);
  logEvent(state, { kind: 'enchente', tile: start, lost, damaged, deaths, homeless, tiles: tiles.length });
  report(state, {
    kind: 'enchente', tile: start, lost, damaged, deaths, homeless, days,
    roads: tiles.filter((t) => state.map.road[t]).length, drained: soft < 1, defended: defense(rt, start) > 0,
  });
}

// ---------------------------------------------------------------------------
// Deslizamento
// ---------------------------------------------------------------------------

function maybeLandslides(state, rt, level) {
  const L = DISASTERS.landslide;
  const w = state.weather;
  if (w.today.mm < L.dayRain && rain30(state) <= floodThreshold(state)) return;
  const map = state.map;
  const { width, height } = map;
  const risk = L.chance * level * mod(rt, 'landslide');
  let count = 0;
  for (let t = 0; t < width * height && count < L.maxPerDay; t++) {
    if (!isSteep(map, t) || map.terrain[t] === TERRAIN.WATER) continue;
    const near = neighborhood(state, t);
    if (!near.some((u) => rt.buildingAt[u] || map.road[u])) continue;
    const held = map.terrain[t] === TERRAIN.FOREST ? L.forest : 1;
    if (!chance(state.rng, risk * held * damageFactor(rt, t))) continue;
    count++;
    landslide(state, rt, t, near);
  }
}

function neighborhood(state, t) {
  const { width, height } = state.map;
  const x = t % width;
  const y = (t - x) / width;
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) out.push(ny * width + nx);
    }
  }
  return out;
}

function landslide(state, rt, t, near) {
  const map = state.map;
  let lost = 0;
  let deaths = 0;
  let homeless = 0;
  let roads = 0;
  const seen = new Set();
  for (const u of near) {
    const id = rt.buildingAt[u];
    if (id && !seen.has(id)) {
      seen.add(id);
      const b = rt.buildingById.get(id);
      if (b.abandoned === undefined) {
        const [h, k] = lose(state, rt, b, 'deslizamento');
        lost++;
        homeless += h;
        deaths += k;
      }
    } else if (map.road[u] && !id) {
      map.road[u] = 0;
      roads++;
    }
    markScar(state, u, DISASTERS.flood.scar);
  }
  // A encosta desce: os cantos mais altos do tile perdem alguns níveis.
  const W = map.width + 1;
  const x = t % map.width;
  const y = (t - x) / map.width;
  const corners = [y * W + x, y * W + x + 1, (y + 1) * W + x + 1, (y + 1) * W + x];
  const top = Math.max(...corners.map((i) => map.elevation[i]));
  const fixed = new Uint8Array(map.elevation.length);
  for (const i of corners) {
    if (map.elevation[i] === top) map.elevation[i] = Math.max(0, top - DISASTERS.landslide.lower);
    fixed[i] = 1;
  }
  constrain(map, fixed);
  if (roads) rt.pathCache.clear();
  touchMap(rt);
  logEvent(state, { kind: 'deslizamento', tile: t, lost, damaged: 0, deaths, homeless });
  report(state, { kind: 'deslizamento', tile: t, lost, deaths, homeless, roads, contained: mod(rt, 'landslide') < 1 });
}

// ---------------------------------------------------------------------------
// Queimada
// ---------------------------------------------------------------------------

function maybeWildfire(state, rt, level) {
  const W = DISASTERS.wildfire;
  const w = state.weather;
  const dry = w.dry ?? 0;
  if (!((dry >= W.dry && w.today.hot) || dry >= W.dryAlone)) return;
  if (state.disasters.fires.length || daysSince(state, 'queimada') < W.gap) return;
  if (!chance(state.rng, W.chance * level * mod(rt, 'wildfire'))) return;
  const { terrain, park } = state.map;
  const forest = [];
  for (let t = 0; t < terrain.length; t++) if (terrain[t] === TERRAIN.FOREST && !rt.buildingAt[t]) forest.push(t);
  if (!forest.length) return;
  const start = forest[randomInt(state.rng, 0, forest.length - 1)];
  if (park?.[start] && !chance(state.rng, W.park)) return;
  state.disasters.fires.push({ id: state.disasters.nextId++, start, burning: [start], startedAt: state.time.tick, burned: 0, lost: 0, deaths: 0 });
  touchMap(rt);
}

/** A cada hora: o fogo passa para a mata vizinha, queima prédios encostados e se apaga. */
export function spreadFires(state, rt) {
  const d = state.disasters;
  if (!d?.fires.length) return;
  const W = DISASTERS.wildfire;
  const map = state.map;
  const { terrain, park } = map;
  const spread = W.spread * mod(rt, 'wildfire');
  const done = [];
  for (const fire of d.fires) {
    const next = [];
    const lit = new Set();
    for (const t of fire.burning) {
      // O tile que queimava vira chão queimado (a mata rebrota com o tempo).
      if (terrain[t] === TERRAIN.FOREST) clearForest(state, t);
      markScar(state, t, W.scar);
      fire.burned++;
      for (const u of neighborhood(state, t)) {
        if (u === t || lit.has(u)) continue;
        const cover = rt.coverage?.bombeiros?.[u] ?? 0;
        const id = rt.buildingAt[u];
        if (id) {
          const b = rt.buildingById.get(id);
          if (b.abandoned === undefined && BUILDINGS[b.type].zone && chance(state.rng, W.building * (1 - cover) * damageFactor(rt, u))) {
            const [, k] = lose(state, rt, b, 'queimada');
            fire.lost++;
            fire.deaths += k;
          }
          continue;
        }
        if (terrain[u] !== TERRAIN.FOREST) continue;
        const p = spread * (park?.[u] ? W.park : 1) * (1 - cover);
        if (!chance(state.rng, p)) continue;
        lit.add(u);
        next.push(u);
      }
    }
    fire.burning = next;
    const hours = (state.time.tick - fire.startedAt) / 60;
    if (!next.length || hours >= W.maxHours) done.push(fire);
  }
  touchMap(rt);
  for (const fire of done) {
    d.fires.splice(d.fires.indexOf(fire), 1);
    const tile = fire.start;
    logEvent(state, { kind: 'queimada', tile, lost: fire.lost, damaged: 0, deaths: fire.deaths, homeless: 0, tiles: fire.burned });
    report(state, { kind: 'queimada', tile, burned: fire.burned, lost: fire.lost, deaths: fire.deaths, brigade: mod(rt, 'wildfire') < 1 });
  }
}

/** Tiles de mata queimando agora (para o desenho e a fumaça). */
export function burningTiles(state) {
  const out = [];
  for (const f of state.disasters?.fires ?? []) out.push(...f.burning);
  return out;
}

/** Tiles alagados agora. */
export function floodedTiles(state) {
  const out = [];
  for (const f of state.disasters?.floods ?? []) out.push(...f.tiles);
  return out;
}
