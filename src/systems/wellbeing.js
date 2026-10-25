// Bem-estar das casas: saúde, crime e satisfação (de 0 a 1), uma vez por dia.
//
//   saúde      = base + cobertura de hospitais/clínicas ± acesso a alimentos − poluição (+ tecnologias e leis)
//   crime      = (base + desemprego + insatisfação + densidade) × (1 − polícia)
//   satisfação = base + saúde + segurança + lazer + escola ± alimentos − poluição
//                − desemprego − imposto residencial acima do padrão (+ leis)
//
// O crime usa a satisfação "sem a segurança" (todos os outros fatores), e a
// satisfação final soma a segurança. Assim tudo sai do estado atual, sem
// depender do dia anterior (carregar um save não muda nada). Comércio e
// indústria também têm crime, para o mapa e o valor do terreno.
//
// Efeitos: a saúde da casa muda a chance de morrer dos moradores
// (demography.js); casas muito insatisfeitas perdem famílias (emigração); a
// satisfação média puxa a demanda residencial; o crime derruba o valor do
// terreno (landvalue.js). Uma cidade com a saúde baixa pode ter epidemias.
//
// Tudo é derivado do estado (rt.wellbeing), menos a epidemia, que tem data
// para acabar (state.health.epidemicUntil).

import { BUILDINGS, ECONOMY, WELLBEING, ZONE, capacityOf } from '../world/catalog.js';
import { removeCitizen } from '../world/runtime.js';
import { canWork } from '../agents/citizens.js';
import { chance } from '../core/rng.js';
import { TICKS_PER_MONTH } from '../core/time.js';
import { mod } from './mods.js';

const clamp = (v) => Math.min(1, Math.max(0, v));

/** Refaz rt.wellbeing: Map(id do prédio -> { health, crime, satisfaction }) e os mapas. */
export function computeWellbeing(state, rt) {
  const cov = rt.coverage;
  const wellbeing = new Map();
  const H = WELLBEING.health;
  const C = WELLBEING.crime;
  const S = WELLBEING.satisfaction;
  const healthAdd = mod(rt, 'health', 0);
  const pollutionHealth = mod(rt, 'pollution.health');
  const police = mod(rt, 'police');
  const crimeMul = mod(rt, 'crime');
  const community = mod(rt, 'communityPolicing', 0) > 0;
  const leisureMul = mod(rt, 'leisure');
  const satisfactionAdd = mod(rt, 'satisfaction', 0) + mod(rt, 'satisfactionPolicy', 0);
  const tax = (state.economy.taxes.residential - ECONOMY.taxDefault) * S.taxPerPoint;

  let people = 0;
  const sum = { health: 0, crime: 0, satisfaction: 0 };
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (!info.zone || b.abandoned !== undefined) continue;
    const t = b.tile;
    const pollution = rt.pollution[t];

    // Desemprego entre os moradores em idade de trabalhar.
    let unemployment = 0;
    if (info.residents) {
      let workers = 0;
      let jobless = 0;
      for (const id of rt.residents.get(b.id)) {
        const c = rt.citizenById.get(id);
        if (!c || !canWork(c)) continue;
        workers++;
        if (c.job === null) jobless++;
      }
      unemployment = workers ? jobless / workers : 0;
    }

    // Acesso a alimentos: de −0,5 (sem mercado no raio) a +0,5 (bem servido).
    const food = (cov?.alimentos?.[t] ?? 0) - 0.5;
    const health = clamp(H.base + H.coverage * (cov?.saude[t] ?? 0) + H.food * food + healthAdd
      - H.pollution * pollution * pollutionHealth);
    // Satisfação com tudo menos a segurança (o crime depende dela).
    const schoolOk = rt.schoolMap?.[t] === 1 ? 1 : 0;
    const content = clamp(
      S.base
      + S.health * (health - 0.5) * 2
      + S.leisure * Math.min(1, (cov?.lazer[t] ?? 0) * leisureMul)
      + (info.residents ? S.school * schoolOk + S.food * food : 0)
      - S.pollution * pollution
      - S.unemployment * unemployment
      - tax
      + satisfactionAdd,
    );
    const density = Math.min(1, capacityOf(b) / 64);
    const policeCover = (cov?.policia[t] ?? 0) * police * (community ? 0.7 + 0.6 * content : 1);
    const crime = clamp((C.base + C.unemployment * unemployment + C.unhappiness * (1 - content) + C.density * density)
      * (1 - Math.min(0.95, C.police * policeCover)) * crimeMul);

    let satisfaction = content;
    if (info.residents) {
      satisfaction = clamp(content + S.safety * (0.5 - crime) * 2);
      const n = rt.residents.get(b.id).size;
      people += n;
      sum.health += health * n;
      sum.crime += crime * n;
      sum.satisfaction += satisfaction * n;
    }
    wellbeing.set(b.id, { health, crime, satisfaction });
  }

  rt.wellbeing = wellbeing;
  rt.cityWellbeing = people
    ? { health: sum.health / people, crime: sum.crime / people, satisfaction: sum.satisfaction / people }
    : { health: WELLBEING.health.base, crime: 0, satisfaction: 0.5 };
  fillMaps(state, rt);
}

/** Saúde da casa do cidadão (ou a base, se não há cálculo ainda). */
export function healthOf(rt, citizen) {
  return rt.wellbeing?.get(citizen.home)?.health ?? WELLBEING.health.base;
}

/** Quanto a saúde multiplica a chance de morrer (com a epidemia, se houver). */
export function mortalityFactor(state, rt, citizen) {
  const [best, worst] = WELLBEING.healthDeath;
  const health = healthOf(rt, citizen);
  const epidemic = isEpidemic(state) ? 1 + (WELLBEING.epidemicDeath - 1) * (1 - health) : 1;
  return (worst + (best - worst) * health) * epidemic;
}

export function isEpidemic(state) {
  return (state.health?.epidemicUntil ?? 0) > state.time.tick;
}

/**
 * Emigração do dia: cada casa muito insatisfeita perde, com uma chance, a
 * família de um morador (quem tem o mesmo sobrenome). Devolve quantos saíram.
 */
export function applyEmigration(state, rt) {
  let left = 0;
  for (const b of [...state.buildings]) {
    if (!BUILDINGS[b.type].residents) continue;
    const w = rt.wellbeing?.get(b.id);
    if (!w || w.satisfaction >= WELLBEING.leaveBelow) continue;
    const ids = [...rt.residents.get(b.id)].sort((x, y) => x - y);
    if (ids.length === 0 || !chance(state.rng, WELLBEING.leaveChance)) continue;
    const family = surname(rt.citizenById.get(ids[0]));
    for (const id of ids) {
      if (surname(rt.citizenById.get(id)) !== family) continue;
      removeCitizen(state, rt, id);
      left++;
    }
  }
  return left;
}

const surname = (c) => c.name.split(' ').slice(1).join(' ');

/**
 * Fechamento do mês: com a saúde média baixa, a cidade pode ter uma epidemia.
 * Devolve true se uma começou agora.
 */
export function closeHealthMonth(state, rt) {
  state.health ??= { epidemicUntil: 0 };
  if (isEpidemic(state)) return false;
  const city = rt.cityWellbeing;
  if (!city || state.citizens.length < WELLBEING.epidemicMinPop || city.health >= WELLBEING.epidemicBelow) return false;
  if (!chance(state.rng, WELLBEING.epidemicChance * mod(rt, 'epidemicChance'))) return false;
  const months = WELLBEING.epidemicMonths * mod(rt, 'epidemicLength');
  state.health.epidemicUntil = state.time.tick + Math.round(months * TICKS_PER_MONTH);
  (rt.events ??= []).push({ kind: 'epidemia' });
  return true;
}

// Mapas de saúde, crime e satisfação: o valor de cada prédio nos tiles dele.
// Saúde e satisfação só nas casas; crime em todas as zonas.
function fillMaps(state, rt) {
  const n = state.map.width * state.map.height;
  for (const key of ['healthMap', 'crimeMap', 'satisfactionMap', 'foodMap']) {
    if (!rt[key] || rt[key].length !== n) rt[key] = new Float32Array(n);
    rt[key].fill(NaN);
  }
  const width = state.map.width;
  for (const b of state.buildings) {
    const w = rt.wellbeing.get(b.id);
    if (!w) continue;
    const info = BUILDINGS[b.type];
    for (let dy = 0; dy < info.size; dy++) {
      for (let dx = 0; dx < info.size; dx++) {
        const t = b.tile + dy * width + dx;
        // O mapa de crime é "quanto mais verde, melhor": guarda 1 − crime.
        rt.crimeMap[t] = 1 - w.crime;
        if (info.zone === ZONE.RESIDENTIAL) {
          rt.healthMap[t] = w.health;
          rt.satisfactionMap[t] = w.satisfaction;
          rt.foodMap[t] = Math.min(1, rt.coverage?.alimentos?.[b.tile] ?? 0);
        }
      }
    }
  }
}
