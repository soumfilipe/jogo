// Energia e água, distribuídas pelas ruas (como no Cities: Skylines).
//
// Cada rede de ruas conectadas é uma rede de energia e água. Usinas, bombas
// e poços abastecem a rede da rua em que estão encostados. Se a produção não
// dá para todos, os prédios mais longe das fontes (pelo caminho das ruas)
// ficam sem primeiro.
//
// Tudo aqui é derivado do estado e fica no runtime (rt.service etc.), exceto
// os efeitos diários (moradores indo embora, prédios abandonados), que mudam
// o estado e por isso só rodam em horários fixos da simulação.

import {
  ABANDON_AFTER_DAYS, BUILDINGS, COLLAPSE_AFTER_DAYS, CONSUMPTION, UNSERVED_LEAVE_SHARE,
} from '../world/catalog.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { footprint, removeBuilding, removeCitizen, sendHome, setJob } from '../world/runtime.js';

export const RESOURCES = ['power', 'water'];

/** Consumo de um tipo de prédio: { power, water }. */
export function consumption(info) {
  if (info.utility || !info.zone) return { power: 0, water: 0 };
  const per = CONSUMPTION[info.zone];
  const people = info.residents || info.jobs;
  return { power: Math.ceil(people * per.power), water: Math.ceil(people * per.water) };
}

/**
 * Recalcula a oferta de cada rede e quem está abastecido. Resultado no runtime:
 *   rt.service:  Map(id do prédio -> { power, water }) (true = abastecido)
 *   rt.utilityNets: Map(rede -> { power: {supply, used}, water: {supply, used} })
 *   rt.utilityTotals: somas de todas as redes, para o painel
 *   rt.powerMap / rt.waterMap: valor por tile para os mapas (NaN = nada)
 */
export function computeUtilities(state, rt) {
  const imported = state.utilities?.imported ?? { power: false, water: false };
  const nets = new Map();
  const netOf = (b) => {
    const a = rt.access.get(b.id);
    return a >= 0 ? rt.roadComponent[a] : 0;
  };
  const entry = (net) => {
    let e = nets.get(net);
    if (!e) nets.set(net, (e = { power: { supply: 0, used: 0 }, water: { supply: 0, used: 0 } }));
    return e;
  };

  const sources = { power: [], water: [] };
  const consumers = [];
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    const net = netOf(b);
    if (info.utility) {
      if (!net) continue;
      for (const res of RESOURCES) {
        if (!info.utility[res]) continue;
        entry(net)[res].supply += info.utility[res];
        sources[res].push(rt.access.get(b.id));
      }
    } else if (b.abandoned === undefined) {
      consumers.push({ b, net, need: consumption(info) });
      if (net) entry(net);
    }
  }

  const service = new Map();
  for (const { b } of consumers) service.set(b.id, { power: false, water: false });

  for (const res of RESOURCES) {
    if (imported[res]) {
      // Importado da região: tudo que tem acesso a rua está abastecido.
      for (const { b, net, need } of consumers) {
        if (!net) continue;
        service.get(b.id)[res] = true;
        nets.get(net)[res].used += need[res];
      }
      for (const e of nets.values()) e[res].supply = Infinity;
      continue;
    }
    const dist = roadDistances(state, sources[res]);
    const ranked = consumers
      .filter((c) => c.net && dist[rt.access.get(c.b.id)] >= 0)
      .map((c) => ({ ...c, d: dist[rt.access.get(c.b.id)] }))
      .sort((a, b) => a.d - b.d || a.b.id - b.b.id);
    for (const { b, net, need } of ranked) {
      const e = nets.get(net)[res];
      if (e.supply - e.used >= need[res]) {
        e.used += need[res];
        service.get(b.id)[res] = true;
      }
    }
  }

  // Muda o desenho (ícones, mapas) só quando alguém ganhou ou perdeu serviço.
  let changed = !rt.service || rt.service.size !== service.size;
  if (!changed) {
    for (const [id, s] of service) {
      const old = rt.service.get(id);
      if (!old || old.power !== s.power || old.water !== s.water) {
        changed = true;
        break;
      }
    }
  }
  rt.service = service;
  rt.utilityNets = nets;
  rt.utilityTotals = totals(nets);
  fillMaps(state, rt, nets, imported);
  if (changed) rt.mapVersion++;
}

/** Energia/água sobrando na rede do tile de estrada `access` (para crescer). */
export function spare(state, rt, access, res) {
  if (state.utilities?.imported?.[res]) return Infinity;
  if (access < 0) return 0;
  const e = rt.utilityNets?.get(rt.roadComponent[access]);
  return e ? e[res].supply - e[res].used : 0;
}

/** Reserva consumo na rede (um prédio novo ou maior) até o próximo cálculo. */
export function reserve(state, rt, access, need) {
  const e = rt.utilityNets?.get(rt.roadComponent[access]);
  if (!e) return;
  for (const res of RESOURCES) if (!state.utilities?.imported?.[res]) e[res].used += need[res];
}

/** Prédio com energia e água (serviços públicos funcionam sempre). */
export function isServed(rt, b) {
  if (BUILDINGS[b.type].utility) return true;
  const s = rt.service?.get(b.id);
  return Boolean(s && s.power && s.water);
}

/**
 * Efeitos de um dia sem energia ou água: moradores vão embora, funcionários
 * são demitidos, prédios vazios ficam abandonados e abandonados desabam.
 */
export function applyUtilityEffects(state, rt) {
  const tick = state.time.tick;
  for (const b of [...state.buildings]) {
    const info = BUILDINGS[b.type];
    if (info.utility) continue;

    if (b.abandoned !== undefined) {
      if (tick - b.abandoned >= COLLAPSE_AFTER_DAYS * TICKS_PER_DAY) removeBuilding(state, rt, b.id);
      continue;
    }
    if (isServed(rt, b)) {
      delete b.unservedDays;
      continue;
    }

    b.unservedDays = (b.unservedDays || 0) + 1;
    const people = [...(info.residents ? rt.residents.get(b.id) : rt.workers.get(b.id))].sort((x, y) => x - y);
    const leaving = Math.min(people.length, Math.max(1, Math.ceil(people.length * UNSERVED_LEAVE_SHARE)));
    for (const id of people.slice(0, leaving)) {
      if (info.residents) {
        removeCitizen(state, rt, id);
      } else {
        const c = rt.citizenById.get(id);
        if (c.state !== 'casa') sendHome(state, rt, c);
        setJob(rt, c, null);
      }
    }
    const left = info.residents ? rt.residents.get(b.id).size : rt.workers.get(b.id).size;
    if (left === 0 && b.unservedDays >= ABANDON_AFTER_DAYS) {
      b.abandoned = tick;
      delete b.unservedDays;
      rt.mapVersion++;
    }
  }
}

/** Distância pelas ruas até a fonte mais próxima (-1 = sem caminho). */
export function roadDistances(state, sources) {
  const { width, height, road } = state.map;
  const dist = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const s of [...new Set(sources)].sort((a, b) => a - b)) {
    if (s < 0 || !road[s] || dist[s] >= 0) continue;
    dist[s] = 0;
    queue[tail++] = s;
  }
  while (head < tail) {
    const t = queue[head++];
    const x = t % width;
    const y = (t - x) / width;
    const next = dist[t] + 1;
    if (y > 0 && road[t - width] && dist[t - width] < 0) { dist[t - width] = next; queue[tail++] = t - width; }
    if (x < width - 1 && road[t + 1] && dist[t + 1] < 0) { dist[t + 1] = next; queue[tail++] = t + 1; }
    if (y < height - 1 && road[t + width] && dist[t + width] < 0) { dist[t + width] = next; queue[tail++] = t + width; }
    if (x > 0 && road[t - 1] && dist[t - 1] < 0) { dist[t - 1] = next; queue[tail++] = t - 1; }
  }
  return dist;
}

function totals(nets) {
  const sum = { power: { supply: 0, used: 0 }, water: { supply: 0, used: 0 } };
  for (const e of nets.values()) {
    for (const res of RESOURCES) {
      sum[res].supply += e[res].supply;
      sum[res].used += e[res].used;
    }
  }
  return sum;
}

// Mapas de energia e água: prédios abastecidos (1) ou não (0), e as ruas
// de redes com produção (0,85) ou sem (0,25).
function fillMaps(state, rt, nets, imported) {
  const { road } = state.map;
  for (const res of RESOURCES) {
    const key = res === 'power' ? 'powerMap' : 'waterMap';
    let map = rt[key];
    if (!map || map.length !== road.length) map = rt[key] = new Float32Array(road.length);
    map.fill(NaN);
    for (let t = 0; t < road.length; t++) {
      if (!road[t]) continue;
      const e = nets.get(rt.roadComponent[t]);
      map[t] = imported[res] || (e && e[res].supply > 0) ? 0.85 : 0.25;
    }
    for (const b of state.buildings) {
      const info = BUILDINGS[b.type];
      let v;
      if (info.utility) v = info.utility[res] ? 1 : NaN;
      else if (b.abandoned !== undefined) v = 0;
      else v = rt.service.get(b.id)?.[res] ? 1 : 0;
      for (const t of footprint(state, b)) map[t] = v;
    }
  }
}
