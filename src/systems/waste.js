// Lixo: cada morador e cada vaga geram lixo, que um lixão ou aterro recolhe
// no raio dele até encher.
//
//   lixo do prédio = moradores × perResident + vagas × perJob da zona
//                    × modificadores (plásticos, coleta seletiva)
//                    × share do centro de reciclagem, se houver um no raio
//
// O prédio é atendido pelo lixão/aterro mais perto (com funcionários e ainda
// com espaço) que o alcança. Sem coleta, o lixo polui em volta e a casa perde
// saúde e satisfação. Uma vez por dia, cada lixão/aterro recebe o lixo dos
// prédios que atende (b.fill, no estado); cheio, para de recolher.
//
// A situação de cada prédio (atendido ou não) é derivada do estado e
// recalculada sempre antes de ser usada.

import { BUILDINGS, WASTE, ZONE, capacityOf } from '../world/catalog.js';
import { mod, ZONE_KEY } from './mods.js';

const staffed = (rt, b) => (rt.workers.get(b.id)?.size ?? 0) > 0;

/** Capacidade do lixão/aterro (a reciclagem de entulho não muda isso). */
export function wasteCapacity(type) {
  return BUILDINGS[type].utility.waste.capacity;
}

/** Raio de um lixão/aterro ou centro de reciclagem. */
export function wasteRadius(type) {
  const u = BUILDINGS[type].utility;
  return (u.waste ?? u.recycle).radius;
}

function center(state, b) {
  const width = state.map.width;
  const size = BUILDINGS[b.type].size;
  return [b.tile % width + (size - 1) / 2, Math.floor(b.tile / width) + (size - 1) / 2];
}

/** Lixo por dia de um prédio, sem a reciclagem. */
export function wasteOf(rt, b) {
  const info = BUILDINGS[b.type];
  if ((info.utility && !info.utility.housing) || b.abandoned !== undefined) return 0;
  const people = capacityOf(b);
  const per = info.residents ? WASTE.perResident : WASTE.perJob[ZONE_KEY[info.zone]] ?? 0;
  return people * per * mod(rt, 'waste');
}

/**
 * Situação do lixo agora: { status: Map(id -> { waste, by }), loads: Map(id do
 * lixão -> lixo do dia) }. `by` é o id do lixão/aterro que atende (ou null).
 */
export function computeWaste(state, rt) {
  const dumps = [];
  const recyclers = [];
  for (const b of state.buildings) {
    const u = BUILDINGS[b.type].utility;
    if (!u || !staffed(rt, b)) continue;
    if (u.waste && (b.fill ?? 0) < wasteCapacity(b.type)) dumps.push({ b, at: center(state, b), r: u.waste.radius });
    if (u.recycle) recyclers.push({ at: center(state, b), r: u.recycle.radius, share: u.recycle.share });
  }

  const status = new Map();
  const loads = new Map();
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (!info.zone || info.zone === ZONE.NONE) continue;
    let waste = wasteOf(rt, b);
    if (waste === 0) {
      status.set(b.id, { waste: 0, by: null });
      continue;
    }
    const [x, y] = center(state, b);
    const dist = ([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y);
    let share = 1;
    for (const r of recyclers) if (dist(r.at) <= r.r) share = Math.min(share, r.share);
    waste *= share;
    // O lixão/aterro mais perto que alcança (empate: o de id menor).
    let best = null;
    let bestD = Infinity;
    for (const d of dumps) {
      const dd = dist(d.at);
      if (dd <= d.r && (dd < bestD || (dd === bestD && d.b.id < best.b.id))) {
        best = d;
        bestD = dd;
      }
    }
    status.set(b.id, { waste, by: best ? best.b.id : null });
    if (best) loads.set(best.b.id, (loads.get(best.b.id) ?? 0) + waste);
  }
  return { status, loads };
}

/** O lixo do prédio está sendo recolhido? (prédios do jogador não geram lixo) */
export function isCollected(waste, b) {
  const s = waste.status.get(b.id);
  return !s || s.waste === 0 || s.by !== null;
}

/** Uma vez por dia: cada lixão/aterro recebe o lixo dos prédios que atende. */
export function collectWaste(state, rt, waste = computeWaste(state, rt)) {
  for (const [id, load] of waste.loads) {
    const b = rt.buildingById.get(id);
    b.fill = Math.min(wasteCapacity(b.type), Math.round(((b.fill ?? 0) + load) * 100) / 100);
  }
  return waste;
}

/** Mapa do lixo (para a tela): 1 = recolhido, 0 = acumulando; NaN = sem prédio. */
export function fillWasteMap(state, rt, waste) {
  const { width, height } = state.map;
  const n = width * height;
  if (!rt.wasteMap || rt.wasteMap.length !== n) rt.wasteMap = new Float32Array(n);
  rt.wasteMap.fill(NaN);
  for (const b of state.buildings) {
    const s = waste.status.get(b.id);
    if (!s || s.waste === 0) continue;
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) rt.wasteMap[b.tile + dy * width + dx] = s.by !== null ? 1 : 0;
  }
}
