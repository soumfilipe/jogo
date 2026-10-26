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
//
// Banco de baterias (utility.storage): guarda o excedente das usinas solares
// e eólicas (utility.renewable) para a noite. Na rede, soma à oferta até o
// armazenamento das baterias com funcionários e no máximo metade do que as
// renováveis da rede produzem; sem renovável, não acrescenta nada.

import {
  ABANDON_AFTER_DAYS, BUILDINGS, COLLAPSE_AFTER_DAYS, CONSUMPTION, UNSERVED_LEAVE_SHARE, ZONE, capacityOf,
} from '../world/catalog.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { footprint, removeBuilding, removeCitizen, sendHome, setJob, touchMap } from '../world/runtime.js';
import { jobsOf, mod, utilityOutput, ZONE_KEY } from './mods.js';

// Parte da produção renovável que as baterias conseguem deslocar para a noite.
const STORAGE_SHARE = 0.5;

export const RESOURCES = ['power', 'water'];

/**
 * Consumo de um tipo de prédio: { power, water }. `people` é a capacidade
 * (padrão: a do tipo; um prédio que cresceu andares passa a dele). Com `rt`,
 * aplica os modificadores da pesquisa (ex.: iluminação LED).
 */
export function consumption(info, people = info.residents || info.jobs, rt = null) {
  // Prédios do jogador não consomem (menos o conjunto habitacional, que é casa).
  if ((info.utility && !info.utility.housing) || !info.zone) return { power: 0, water: 0 };
  const per = CONSUMPTION[info.zone];
  const power = rt ? per.power * mod(rt, `consumption.${ZONE_KEY[info.zone]}`) : per.power;
  return { power: Math.ceil(people * power), water: Math.ceil(people * per.water) };
}

/**
 * Recalcula a oferta de cada rede e quem está abastecido. Resultado no runtime:
 *   rt.service:  Map(id do prédio -> { power, water }) (true = abastecido)
 *   rt.utilityNets: Map(rede -> { power: {supply, used, renewable, storage,
 *                   stored}, water: {supply, used} })
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
    if (!e) nets.set(net, (e = { power: { supply: 0, used: 0, renewable: 0, storage: 0, stored: 0 }, water: { supply: 0, used: 0 } }));
    return e;
  };

  const sources = { power: [], water: [] };
  const consumers = [];
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    const net = netOf(b);
    if (info.utility && !info.utility.housing) {
      if (!net) continue;
      for (const res of RESOURCES) {
        if (!info.utility[res]) continue;
        const out = utilityOutput(rt, b.type, res);
        entry(net)[res].supply += out;
        if (res === 'power' && info.utility.renewable) entry(net).power.renewable += out;
        sources[res].push(rt.access.get(b.id));
      }
      if (info.utility.storage) {
        const jobs = jobsOf(rt, b.type);
        const staffed = jobs ? Math.min(1, (rt.workers.get(b.id)?.size ?? 0) / jobs) : 1;
        entry(net).power.storage += info.utility.storage * staffed;
        sources.power.push(rt.access.get(b.id));
      }
    } else if (b.abandoned === undefined && info.zone !== ZONE.RURAL) {
      consumers.push({ b, net, need: consumption(info, capacityOf(b), rt) });
      if (net) entry(net);
    }
  }

  // Baterias: o excedente renovável guardado entra como oferta.
  for (const e of nets.values()) {
    const p = e.power;
    p.stored = Math.round(Math.min(p.storage, p.renewable * STORAGE_SHARE));
    p.supply += p.stored;
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

  // Redesenha (ícones de falta) só os prédios que ganharam ou perderam serviço.
  // Prédios novos, demolidos ou abandonados já avisaram o renderizador.
  for (const [id, s] of service) {
    const old = rt.service?.get(id);
    if (old && (old.power !== s.power || old.water !== s.water)) {
      const b = rt.buildingById.get(id);
      touchMap(rt, b.tile, BUILDINGS[b.type].size);
    }
  }
  rt.service = service;
  rt.utilityNets = nets;
  rt.utilityTotals = totals(nets);
  fillMaps(state, rt, nets, imported);
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

/** Prédio com energia e água (serviços públicos e fazendas funcionam sempre). */
export function isServed(rt, b) {
  const info = BUILDINGS[b.type];
  if ((info.utility && !info.utility.housing) || info.zone === ZONE.RURAL) return true;
  const s = rt.service?.get(b.id);
  return Boolean(s && s.power && s.water);
}

/**
 * Efeitos de um dia sem energia ou água: moradores vão embora, funcionários
 * são demitidos, prédios vazios ficam abandonados e abandonados desabam.
 */
export function applyUtilityEffects(state, rt) {
  const tick = state.time.tick;
  const collapseTicks = COLLAPSE_AFTER_DAYS * mod(rt, 'collapseDays') * TICKS_PER_DAY;
  const abandonDays = ABANDON_AFTER_DAYS * mod(rt, 'abandonDays');
  const leaveShare = UNSERVED_LEAVE_SHARE * mod(rt, 'unservedLeave');
  for (const b of [...state.buildings]) {
    const info = BUILDINGS[b.type];
    if (info.utility && !info.utility.housing) continue;

    if (b.abandoned !== undefined) {
      if (tick - b.abandoned >= collapseTicks) removeBuilding(state, rt, b.id);
      continue;
    }
    if (isServed(rt, b)) {
      delete b.unservedDays;
      continue;
    }

    b.unservedDays = (b.unservedDays || 0) + 1;
    const people = [...(info.residents ? rt.residents.get(b.id) : rt.workers.get(b.id))].sort((x, y) => x - y);
    const leaving = Math.min(people.length, Math.max(1, Math.ceil(people.length * leaveShare)));
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
    if (left === 0 && b.unservedDays >= abandonDays) {
      b.abandoned = tick;
      delete b.unservedDays;
      touchMap(rt, b.tile, info.size);
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
      if (info.utility && !info.utility.housing) v = info.utility[res] ? 1 : NaN;
      else if (b.abandoned !== undefined) v = 0;
      else v = rt.service.get(b.id)?.[res] ? 1 : 0;
      for (const t of footprint(state, b)) map[t] = v;
    }
  }
}
