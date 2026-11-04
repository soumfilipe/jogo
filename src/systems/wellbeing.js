// Bem-estar das casas: saúde, crime e satisfação (de 0 a 1), uma vez por dia.
//
//   saúde      = base + cobertura de hospitais/clínicas ± acesso a alimentos − poluição
//                − lixo sem coleta − água de rio poluído (+ tecnologias e leis)
//   crime      = (base + desemprego + insatisfação + densidade) × (1 − polícia)
//   satisfação = base + saúde + segurança + lazer + escola ± alimentos − lixo − poluição
//                − estresse dos pais sem creche
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

import { BUILDINGS, CHILDCARE, ECONOMY, EDU, TOURISM, WELLBEING, capacityOf } from '../world/catalog.js';
import { removeCitizen } from '../world/runtime.js';
import { canWork } from '../agents/citizens.js';
import { chance } from '../core/rng.js';
import { TICKS_PER_MONTH } from '../core/time.js';
import { mod } from './mods.js';
import { computeWaste, fillWasteMap, isCollected } from './waste.js';
import { computeSanitation } from './sanitation.js';
import { todaysEvents } from './events.js';

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
  // Carnaval: a cidade inteira mais feliz nos dias de festa.
  const party = todaysEvents(state, rt).carnaval ? TOURISM.carnaval.satisfaction : 0;
  const satisfactionAdd = mod(rt, 'satisfaction', 0) + mod(rt, 'satisfactionPolicy', 0) + party;
  const tax = (state.economy.taxes.residential - ECONOMY.taxDefault) * S.taxPerPoint;
  const waste = computeWaste(state, rt);
  const sanitation = computeSanitation(state, rt);

  let people = 0;
  const sum = { health: 0, crime: 0, satisfaction: 0 };
  // Quanto cada fator tira da satisfação, somado por morador (para as
  // críticas da imprensa, ver news.js).
  const homes = homeTotals(state);
  const census = new Map(); // id da casa -> [escolaridade média, parte empregada]
  const complaints = { health: 0, leisure: 0, school: 0, food: 0, garbage: 0, pollution: 0, unemployment: 0, tax: 0, stress: 0, crime: 0 };
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (!info.zone || b.abandoned !== undefined) continue;
    const t = b.tile;
    const pollution = rt.pollution[t];

    // Desemprego entre os moradores em idade de trabalhar. Na mesma passada,
    // os números do censo da casa (escolaridade e emprego, para fillMaps).
    let unemployment = 0;
    let stress = 0;
    if (info.residents) {
      const k = homes.slot[b.id] * HOME_FIELDS;
      const d = homes.data;
      const n = k >= 0 ? d[k] : 0;
      const eduSum = k >= 0 ? d[k + 1] : 0;
      const workers = k >= 0 ? d[k + 3] : 0;
      const jobless = k >= 0 ? d[k + 4] : 0;
      const censusWorkers = k >= 0 ? d[k + 5] : 0;
      const censusEmployed = k >= 0 ? d[k + 6] : 0;
      unemployment = workers ? jobless / workers : 0;
      // Estresse médio da casa (o mesmo de homeStress, ver childcare.js).
      stress = n ? d[k + 2] / n : 0;
      census.set(b.id, [n ? eduSum / n / EDU.POS : NaN, censusWorkers ? censusEmployed / censusWorkers : NaN]);
    }

    // Acesso a alimentos: de −0,5 (sem mercado no raio) a +0,5 (bem servido).
    const food = (cov?.alimentos?.[t] ?? 0) - 0.5;
    const dirty = isCollected(waste, b) ? 0 : 1;
    const health = clamp(H.base + H.coverage * (cov?.saude[t] ?? 0) + H.food * food + healthAdd
      - H.pollution * pollution * pollutionHealth - H.garbage * dirty - sanitation.healthLoss - CHILDCARE.health * stress);
    // Satisfação com tudo menos a segurança (o crime depende dela).
    const schoolOk = rt.schoolMap?.[t] === 1 ? 1 : 0;
    const content = clamp(
      S.base
      + S.health * (health - 0.5) * 2
      + S.leisure * Math.min(1, (cov?.lazer[t] ?? 0) * leisureMul)
      + (info.residents ? S.school * schoolOk + S.food * food - S.garbage * dirty - CHILDCARE.satisfaction * stress : 0)
      - S.pollution * pollution
      - S.unemployment * unemployment
      - tax
      + satisfactionAdd
      // Conjunto habitacional: sem aluguel.
      + (info.utility?.housing?.satisfaction ?? 0),
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
      complaints.health += Math.max(0, -S.health * (health - 0.5) * 2) * n;
      complaints.leisure += S.leisure * (1 - Math.min(1, (cov?.lazer[t] ?? 0) * leisureMul)) * n;
      complaints.school += S.school * (1 - schoolOk) * n;
      complaints.food += Math.max(0, -S.food * food) * n;
      complaints.garbage += S.garbage * dirty * n;
      complaints.pollution += S.pollution * pollution * n;
      complaints.unemployment += S.unemployment * unemployment * n;
      complaints.tax += Math.max(0, tax) * n;
      complaints.stress += CHILDCARE.satisfaction * stress * n;
      complaints.crime += Math.max(0, -S.safety * (0.5 - crime) * 2) * n;
      sum.health += health * n;
      sum.crime += crime * n;
      sum.satisfaction += satisfaction * n;
    }
    wellbeing.set(b.id, { health, crime, satisfaction });
  }

  rt.wellbeing = wellbeing;
  for (const k of Object.keys(complaints)) complaints[k] = people ? complaints[k] / people : 0;
  rt.complaints = complaints;
  rt.waste = waste;
  rt.sanitation = sanitation;
  fillWasteMap(state, rt, waste);
  rt.cityWellbeing = people
    ? { health: sum.health / people, crime: sum.crime / people, satisfaction: sum.satisfaction / people }
    : { health: WELLBEING.health.base, crime: 0, satisfaction: 0.5 };
  fillMaps(state, rt, census);
}

// Números de cada casa, somados numa passada pela lista de cidadãos (bem mais
// rápido que percorrer os moradores prédio a prédio): moradores, soma da
// escolaridade, soma do estresse, em idade de trabalhar, desempregados e, para
// o censo, quem conta como trabalhador e quem está empregado (atleta conta).
const HOME_FIELDS = 7;
function homeTotals(state) {
  let maxId = 0;
  for (const b of state.buildings) if (b.id > maxId) maxId = b.id;
  const slot = new Int32Array(maxId + 1).fill(-1);
  let homes = 0;
  for (const b of state.buildings) if (BUILDINGS[b.type].residents) slot[b.id] = homes++;
  const data = new Float64Array(homes * HOME_FIELDS);
  for (const c of state.citizens) {
    const s = c.home <= maxId ? slot[c.home] : -1;
    if (s < 0) continue;
    const k = s * HOME_FIELDS;
    data[k]++;
    data[k + 1] += c.edu ?? 0;
    data[k + 2] += c.stress ?? 0;
    const able = canWork(c);
    if (c.job !== null || c.athlete !== undefined) {
      data[k + 5]++;
      data[k + 6]++;
    } else if (able) data[k + 5]++;
    if (!able) continue;
    data[k + 3]++;
    if (c.job === null) data[k + 4]++;
  }
  return { slot, data };
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
function fillMaps(state, rt, census) {
  const n = state.map.width * state.map.height;
  for (const key of ['healthMap', 'crimeMap', 'satisfactionMap', 'foodMap', 'eduMap', 'jobsMap']) {
    if (!rt[key] || rt[key].length !== n) rt[key] = new Float32Array(n);
    rt[key].fill(NaN);
  }
  const width = state.map.width;
  for (const b of state.buildings) {
    const w = rt.wellbeing.get(b.id);
    if (!w) continue;
    const info = BUILDINGS[b.type];
    // Censo: escolaridade média (0 a 1) e parte dos adultos empregados da casa.
    const [edu, jobs] = census.get(b.id) ?? [NaN, NaN];
    for (let dy = 0; dy < info.size; dy++) {
      for (let dx = 0; dx < info.size; dx++) {
        const t = b.tile + dy * width + dx;
        // O mapa de crime é "quanto mais verde, melhor": guarda 1 − crime.
        rt.crimeMap[t] = 1 - w.crime;
        if (info.residents) {
          rt.healthMap[t] = w.health;
          rt.satisfactionMap[t] = w.satisfaction;
          rt.foodMap[t] = Math.min(1, rt.coverage?.alimentos?.[b.tile] ?? 0);
          rt.eduMap[t] = edu;
          rt.jobsMap[t] = jobs;
        }
      }
    }
  }
}
