// Ações do jogador. Toda mudança feita pela interface passa por aqui:
//
//   planCommand(state, rt, cmd)  -> { tiles, cost }   (prévia, não altera nada)
//   applyCommand(state, rt, cmd) -> { ok, cost, count, reason }
//
// Comandos:
//   { type: 'road',     tiles, road }     (road: tipo de rua de ROAD_TYPES, padrão 1;
//                                         sobre uma rua de tipo menor, melhora ela)
//   { type: 'zone',     tiles, zone, density? }
//   { type: 'district', tiles }          (bairro planejado: ruas e zonas de uma vez, com a pesquisa)
//                       (zone = ZONE.NONE remove a zona; density padrão: média.
//                        Mudar só a densidade vale também em lote construído)
//   { type: 'bulldoze', tiles }
//   { type: 'place', building, tile }    (prédio do jogador; tile = canto de cima)
//   { type: 'tax', zone, percent }       (zone: residential | commercial | industrial)
//   { type: 'loan', amount }             (um dos valores de loanOffers())
//   { type: 'repay', id }                (quita o empréstimo de uma vez)
//   { type: 'ppp', on }                  (obras públicas por PPP, com a pesquisa)
//   { type: 'funding', area, amount }    (verba de pesquisa por mês numa área)
//   { type: 'priority', area, tech }     (tecnologia prioritária da área; null = automático)
//   { type: 'course', area, weight }     (peso da área nos cursos da universidade, 0 a 5)
//   { type: 'policy', id, on }           (liga ou desliga uma lei)
//   { type: 'park',  tiles }             (mata vira parque de conservação; com a pesquisa)
//   { type: 'revitalize', tile }         (indústria abandonada vira centro cultural)
//   { type: 'event', eventType, venue, day, days, artists, work?, ticket,
//     marketing, recurrence?, name? }    (agenda um evento; ver systems/agenda.js)
//   { type: 'confirmEvent', id, artists?, marketing?, ticket? }   (próxima edição da série)
//   { type: 'cancelEvent', id }
//   { type: 'club', sport, home, name? }  (funda um clube; ver systems/sports.js)
//   { type: 'clubBudget', id, training?, subsidy?, reinvest?, youthBudget? }
//   { type: 'clubCt', id }                (sobe o centro de treinamento)
//   { type: 'closeClub', id }
//   { type: 'clubAcademy', id }           (abre a próxima categoria da escolinha)
//   { type: 'promoteYouth', id, player }  (jovem de 16 ou 17 anos sobe ao time adulto)
//   { type: 'acceptOffer', id } / { type: 'rejectOffer', id }   (propostas pelos craques)
//   { type: 'race', from, to, day?, name?, marketing?, annual? }  (corrida de rua; ver systems/races.js)
//   { type: 'cancelRace', id } / { type: 'raceOptions', id, annual?, marketing? }

import { BUILDINGS, COSTS, DENSITY, ROAD_TYPES, TERRAIN, ZONE } from './catalog.js';
import { addBuilding, clearForest, recomputeRoads, removeBuilding, touchMap } from './runtime.js';
import { isBuildable } from './world.js';
import { BUILDING_TECH, TECH_BY_ID, marcoAt } from './techs.js';
import { pppActive, pppContract, repayLoan, setPpp, setTax, takeLoan } from '../systems/economy.js';
import { computeMods, isUnlocked, mod, utilityCost } from '../systems/mods.js';
import { setFunding, setPriority } from '../systems/research.js';
import { refreshSchoolMap, setCourse } from '../systems/education.js';
import { setPolicy } from '../systems/policies.js';
import { computeCoverage } from '../systems/services.js';
import { computeTransit } from '../systems/transit.js';
import { computeFreight } from '../systems/logistics.js';
import { cancelEvent, confirmEdition, scheduleEvent } from '../systems/agenda.js';
import {
  acceptOffer, closeClub, clubBudget, foundClub, openAcademy, promoteYouth, rejectOffer, upgradeCt,
} from '../systems/sports.js';
import { cancelRace, planRace, raceOptions, scheduleRace } from '../systems/races.js';

// Ferramentas que vêm da pesquisa (efeito { tool } em techs.js).
export const TOOL_TECH = {
  avenida: 'via_expressa', expressa: 'via_expressa', calcadao: 'ciclovia_lazer', parque: 'parque_nacional', revitalizar: 'revitalizacao',
  corrida: 'educacao_fisica', bairro: 'plano_piloto',
};

export function planCommand(state, rt, cmd) {
  if (cmd.type === 'place') return planPlace(state, rt, cmd);
  if (cmd.type === 'revitalize') return planRevitalize(state, rt, cmd);
  if (cmd.type === 'race') return planRace(state, rt, cmd);
  if (cmd.type === 'district') return planDistrict(state, rt, cmd).plan;
  const { road, zone, terrain, density } = state.map;
  const park = state.map.park;
  if (cmd.type === 'park' && !rt.techDone?.has(TOOL_TECH.parque)) {
    return { tiles: [], cost: 0, reason: `Parques de conservação precisam da tecnologia ${TECH_BY_ID.get(TOOL_TECH.parque).name}.` };
  }
  const roadType = cmd.road ?? 1;
  if (cmd.type === 'road' && !roadUnlocked(rt, roadType)) {
    const tech = TECH_BY_ID.get(ROAD_TYPES[roadType].tech);
    return { tiles: [], cost: 0, reason: `${ROAD_TYPES[roadType].name} precisa da tecnologia ${tech.name}.` };
  }
  const tiles = [];
  const buildings = new Set(); // prédios grandes ocupam vários tiles: conta uma vez
  const c = costs(rt);
  let cost = 0;

  for (const tile of new Set(cmd.tiles)) {
    if (tile < 0 || tile >= road.length) continue;
    const forest = terrain[tile] === TERRAIN.FOREST;
    // Parque de conservação: nada de rua, zona ou desmatamento (demolir tira o parque).
    if (park?.[tile] && cmd.type !== 'bulldoze') continue;

    if (cmd.type === 'park') {
      if (!forest || park?.[tile] || road[tile] || rt.buildingAt[tile]) continue;
      cost += COSTS.park * mod(rt, 'buildCost');
    } else if (cmd.type === 'road') {
      if (rt.buildingAt[tile] || !isBuildable(state, tile)) continue;
      // O calçadão troca com qualquer rua (nos dois sentidos); entre as vias de
      // carro, só se melhora (avenida sobre expressa não piora a via).
      const pedestrian = ROAD_TYPES[roadType].pedestrian || ROAD_TYPES[road[tile]]?.pedestrian;
      if (pedestrian ? road[tile] === roadType : road[tile] >= roadType) continue;
      // Rua nova paga o tipo inteiro; mudar uma rua paga só a diferença (no mínimo uma rua).
      cost += road[tile]
        ? Math.max(roadCost(rt, 1), roadCost(rt, roadType) - roadCost(rt, road[tile]))
        : roadCost(rt, roadType) + (forest ? c.clearForest : 0);
    } else if (cmd.type === 'zone') {
      if (road[tile] || !isBuildable(state, tile)) continue;
      const sameZone = zone[tile] === cmd.zone;
      if (sameZone && (cmd.zone === ZONE.NONE || density[tile] === zoneDensity(cmd))) continue;
      // Com prédio, só a densidade muda; trocar a zona exige demolir antes.
      if (rt.buildingAt[tile] && !sameZone) continue;
      cost += cmd.zone === ZONE.NONE ? 0 : c.zone;
    } else if (cmd.type === 'bulldoze') {
      const id = rt.buildingAt[tile];
      if (id) {
        if (buildings.has(id)) continue;
        buildings.add(id);
        cost += c.demolishBuilding * Math.max(1, BUILDINGS[rt.buildingById.get(id).type].level);
      } else if (road[tile]) cost += c.demolishRoad;
      else if (park?.[tile]) cost += 0;
      else if (forest) cost += c.clearForest;
      else if (!zone[tile]) continue;
    } else {
      throw new Error(`Comando desconhecido: ${cmd.type}`);
    }
    tiles.push(tile);
  }
  return { tiles, cost: Math.round(cost) };
}

// --- Bairro planejado (pesquisa Cidade planejada) ------------------------------
// Ruas no contorno e a cada DISTRICT.step tiles; entre elas, faixas de zona
// residencial, residencial e comercial (densidade média). 30% mais barato que
// fazer as ruas e as zonas uma a uma.
export const DISTRICT = { step: 5, min: 6, discount: 0.7, bands: [ZONE.RESIDENTIAL, ZONE.RESIDENTIAL, ZONE.COMMERCIAL] };

/** Plano do bairro: as ruas, as zonas e o custo (com o desconto). */
function planDistrict(state, rt, cmd) {
  const { width } = state.map;
  const fail = (reason) => ({ plan: { tiles: [], cost: 0, reason }, roads: [], zones: [] });
  if (!rt.techDone?.has(TOOL_TECH.bairro)) return fail(`O bairro planejado precisa da tecnologia ${TECH_BY_ID.get(TOOL_TECH.bairro).name}.`);
  const xs = cmd.tiles.map((t) => t % width);
  const ys = cmd.tiles.map((t) => Math.floor(t / width));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (x1 - x0 + 1 < DISTRICT.min || y1 - y0 + 1 < DISTRICT.min) return fail(`O bairro precisa de pelo menos ${DISTRICT.min}×${DISTRICT.min} tiles.`);
  const line = (v, a, b) => v === a || v === b || (v - a) % DISTRICT.step === 0;
  const roadTiles = [];
  const zoneTiles = new Map(DISTRICT.bands.map((z) => [z, []]));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = y * width + x;
      if (line(x, x0, x1) || line(y, y0, y1)) roadTiles.push(t);
      else zoneTiles.get(DISTRICT.bands[Math.floor((y - y0) / DISTRICT.step) % DISTRICT.bands.length]).push(t);
    }
  }
  const roads = planCommand(state, rt, { type: 'road', road: 1, tiles: roadTiles });
  const zones = [...zoneTiles].map(([zone, tiles]) => ({ zone, ...planCommand(state, rt, { type: 'zone', zone, density: DENSITY.MEDIUM, tiles }) }));
  const full = roads.cost + zones.reduce((s, z) => s + z.cost, 0);
  const tiles = [...roads.tiles, ...zones.flatMap((z) => z.tiles)];
  return {
    plan: { tiles, cost: Math.round(full * DISTRICT.discount), reason: tiles.length ? null : 'Nada a fazer aqui.', roads: roads.tiles },
    roads: roads.tiles, zones, full,
  };
}

/** Constrói o bairro planejado (comando 'district'). */
function buildDistrict(state, rt, cmd) {
  const { plan, roads, zones, full } = planDistrict(state, rt, cmd);
  if (plan.reason) return { ok: false, cost: 0, count: 0, reason: plan.reason };
  if (plan.cost > state.economy.money) return { ok: false, cost: plan.cost, count: 0, reason: `Dinheiro insuficiente (custa $${plan.cost}).` };
  // O desconto entra antes; ruas e zonas cobram o preço cheio de cada uma.
  state.economy.money += full - plan.cost;
  if (roads.length) applyCommand(state, rt, { type: 'road', road: 1, tiles: roads });
  for (const z of zones) if (z.tiles.length) applyCommand(state, rt, { type: 'zone', zone: z.zone, density: DENSITY.MEDIUM, tiles: z.tiles });
  return { ok: true, cost: plan.cost, count: plan.tiles.length };
}

/** Preço de um tile de rua do tipo `type` (com os modificadores de construção). */
export function roadCost(rt, type) {
  return ROAD_TYPES[type].cost * mod(rt, 'buildCost');
}

/** O tipo de rua já foi liberado pela pesquisa? */
export function roadUnlocked(rt, type) {
  const tech = ROAD_TYPES[type]?.tech;
  return Boolean(ROAD_TYPES[type]) && (!tech || Boolean(rt.techDone?.has(tech)));
}

/** Preços por tile do momento (tecnologias mudam). */
export function costs(rt) {
  const build = mod(rt, 'buildCost');
  const demolish = mod(rt, 'demolishCost');
  return {
    road: COSTS.road * build,
    zone: COSTS.zone * build,
    demolishRoad: COSTS.demolishRoad * demolish,
    demolishBuilding: COSTS.demolishBuilding * demolish,
    clearForest: COSTS.clearForest * mod(rt, 'clearForestCost'),
  };
}

export function applyCommand(state, rt, cmd) {
  // Ações do orçamento e da pesquisa (não mexem no mapa).
  if (cmd.type === 'tax') return setTax(state, cmd.zone, cmd.percent);
  if (cmd.type === 'loan') return takeLoan(state, rt, cmd.amount);
  if (cmd.type === 'repay') return repayLoan(state, cmd.id);
  if (cmd.type === 'ppp') return setPpp(state, rt, cmd.on);
  if (cmd.type === 'funding') return setFunding(state, cmd.area, cmd.amount);
  if (cmd.type === 'priority') return setPriority(state, rt, cmd.area, cmd.tech);
  if (cmd.type === 'course') return setCourse(state, cmd.area, cmd.weight);
  // Agenda cultural (ver systems/agenda.js).
  if (cmd.type === 'event') return scheduleEvent(state, rt, cmd);
  if (cmd.type === 'confirmEvent') return confirmEdition(state, rt, cmd);
  if (cmd.type === 'cancelEvent') return cancelEvent(state, rt, cmd);
  // Clubes (ver systems/sports.js).
  if (cmd.type === 'club') return foundClub(state, rt, cmd);
  if (cmd.type === 'clubBudget') return clubBudget(state, rt, cmd);
  if (cmd.type === 'clubCt') return upgradeCt(state, rt, cmd);
  if (cmd.type === 'closeClub') return closeClub(state, rt, cmd);
  if (cmd.type === 'clubAcademy') return openAcademy(state, rt, cmd);
  if (cmd.type === 'promoteYouth') return promoteYouth(state, rt, cmd);
  if (cmd.type === 'acceptOffer') return acceptOffer(state, rt, cmd);
  if (cmd.type === 'rejectOffer') return rejectOffer(state, rt, cmd);
  // Corrida de rua (ver systems/races.js).
  if (cmd.type === 'race') return scheduleRace(state, rt, cmd);
  if (cmd.type === 'cancelRace') return cancelRace(state, rt, cmd);
  if (cmd.type === 'raceOptions') return raceOptions(state, rt, cmd);
  if (cmd.type === 'district') return buildDistrict(state, rt, cmd);
  if (cmd.type === 'policy') {
    const result = setPolicy(state, rt, cmd.id, cmd.on);
    if (result.ok) computeMods(state, rt);
    return result;
  }

  const { tiles, cost, reason } = planCommand(state, rt, cmd);
  if (reason) return { ok: false, cost, count: 0, reason };
  if (tiles.length === 0) return { ok: false, cost: 0, count: 0, reason: 'Nada a fazer aqui.' };
  // PPP: o prédio público sai sem pagar à vista (contrato em parcelas).
  const financed = cmd.type === 'place' && BUILDINGS[cmd.building]?.utility && pppActive(state, rt);
  if (financed) {
    const contract = pppContract(state, rt, BUILDINGS[cmd.building].name, cost);
    if (!contract.ok) return { ok: false, cost, count: 0, reason: contract.reason };
  } else if (cost > state.economy.money) {
    return { ok: false, cost, count: 0, reason: `Dinheiro insuficiente (custa $${cost}).` };
  }

  if (cmd.type === 'revitalize') {
    const old = rt.buildingById.get(rt.buildingAt[cmd.tile]);
    removeBuilding(state, rt, old.id);
    addBuilding(state, rt, 'centro_cultural', old.tile);
    state.economy.money -= cost;
    computeMods(state, rt);
    computeCoverage(state, rt);
    touchMap(rt);
    return { ok: true, cost, count: 1 };
  }

  if (cmd.type === 'place') {
    for (const t of tiles) state.map.zone[t] = ZONE.NONE;
    const placed = addBuilding(state, rt, cmd.building, cmd.tile);
    if (financed) state.economy.loans.at(-1).building = `${BUILDINGS[cmd.building].name} #${placed.id}`;
    // A primeira usina (ou bomba/poço) própria encerra a importação daquele recurso.
    const utility = BUILDINGS[cmd.building].utility;
    const imported = state.utilities.imported;
    if (utility.power) imported.power = false;
    if (utility.water) imported.water = false;
    if (!financed) state.economy.money -= cost;
    computeMods(state, rt);
    if (utility.school) refreshSchoolMap(state, rt);
    if (utility.service) computeCoverage(state, rt);
    if (utility.transit) computeTransit(state, rt);
    if (utility.freight) computeFreight(state, rt);
    return { ok: true, cost: financed ? 0 : cost, count: 1, ppp: Boolean(financed) };
  }

  const { road, zone, terrain, density } = state.map;
  let roadsChanged = false;

  for (const tile of tiles) {
    if (cmd.type === 'park') {
      state.map.park[tile] = 1;
      zone[tile] = ZONE.NONE;
    } else if (cmd.type === 'road') {
      road[tile] = cmd.road ?? 1;
      zone[tile] = ZONE.NONE;
      if (terrain[tile] === TERRAIN.FOREST) clearForest(state, tile);
      roadsChanged = true;
    } else if (cmd.type === 'zone') {
      zone[tile] = cmd.zone;
      if (cmd.zone !== ZONE.NONE) density[tile] = zoneDensity(cmd);
    } else if (cmd.type === 'bulldoze') {
      if (rt.buildingAt[tile]) {
        removeBuilding(state, rt, rt.buildingAt[tile]);
      } else if (road[tile]) {
        road[tile] = 0;
        roadsChanged = true;
      } else if (state.map.park?.[tile]) {
        state.map.park[tile] = 0;
      } else if (terrain[tile] === TERRAIN.FOREST) {
        clearForest(state, tile);
      } else {
        zone[tile] = ZONE.NONE;
      }
    }
  }

  state.economy.money -= cost;
  if (roadsChanged) recomputeRoads(state, rt);
  if (cmd.type === 'bulldoze') {
    computeMods(state, rt);
    computeTransit(state, rt);
  }
  if (roadsChanged || cmd.type === 'bulldoze') computeFreight(state, rt);
  touchMap(rt);
  return { ok: true, cost, count: tiles.length };
}

const zoneDensity = (cmd) => cmd.density ?? DENSITY.MEDIUM;

/**
 * Revitalização: um prédio industrial 1x1 abandonado vira centro cultural
 * (precisa da tecnologia). Devolve { tiles, cost, reason }.
 */
function planRevitalize(state, rt, cmd) {
  const cost = utilityCost(rt, 'centro_cultural');
  const b = rt.buildingById.get(rt.buildingAt[cmd.tile]);
  const fail = (reason) => ({ tiles: b ? [b.tile] : [], cost, reason });
  if (!rt.techDone?.has(TOOL_TECH.revitalizar)) {
    return fail(`Revitalizar precisa da tecnologia ${TECH_BY_ID.get(TOOL_TECH.revitalizar).name}.`);
  }
  if (!b || BUILDINGS[b.type].zone !== ZONE.INDUSTRIAL || BUILDINGS[b.type].size !== 1 || b.abandoned === undefined) {
    return fail('Escolha uma indústria abandonada (1x1).');
  }
  return { tiles: [b.tile], cost };
}

/**
 * Prédio do jogador: precisa estar liberado pela pesquisa; o terreno inteiro
 * precisa estar livre (sem rua, prédio ou água), encostado numa rua; alguns
 * (bomba d'água, hidrelétrica) também precisam encostar em água.
 * Devolve { tiles, cost, reason } — reason explica por que não dá.
 */
function planPlace(state, rt, cmd) {
  const info = BUILDINGS[cmd.building];
  if (!info?.utility) throw new Error(`Não é um prédio do jogador: ${cmd.building}`);
  const { width, height, road, terrain } = state.map;
  const x0 = cmd.tile % width;
  const y0 = Math.floor(cmd.tile / width);
  const cost = utilityCost(rt, cmd.building);
  const tiles = [];
  for (let dy = 0; dy < info.size; dy++) {
    for (let dx = 0; dx < info.size; dx++) tiles.push((y0 + dy) * width + x0 + dx);
  }
  const fail = (reason) => ({ tiles, cost, reason });
  if (!isUnlocked(rt, cmd.building)) {
    const tech = TECH_BY_ID.get(BUILDING_TECH[cmd.building]);
    return fail(`Precisa da tecnologia ${tech.name} (marco ${marcoAt(tech.order).id}).`);
  }
  if (x0 + info.size > width || y0 + info.size > height) return fail('Fora do mapa.');
  for (const t of tiles) {
    if (terrain[t] === TERRAIN.WATER) return fail('Não dá para construir na água.');
    if (road[t] || rt.buildingAt[t]) return fail('O terreno precisa estar livre.');
  }
  const around = [];
  for (const t of tiles) {
    const x = t % width;
    const y = (t - x) / width;
    if (x > 0) around.push(t - 1);
    if (x < width - 1) around.push(t + 1);
    if (y > 0) around.push(t - width);
    if (y < height - 1) around.push(t + width);
  }
  if (!around.some((t) => road[t])) return fail('Precisa encostar numa rua.');
  if (info.utility.needsWater && !around.some((t) => terrain[t] === TERRAIN.WATER)) {
    return fail(`${info.name} precisa ficar na beira de um rio ou lago.`);
  }
  if (cost > state.economy.money) return fail(`Dinheiro insuficiente (custa $${cost}).`);
  return { tiles, cost };
}

// ---------------------------------------------------------------------------
// Formas de seleção usadas pelas ferramentas
// ---------------------------------------------------------------------------

/** Estrada em "L": anda primeiro no eixo mais longo, depois no outro. */
export function lineTiles(width, x0, y0, x1, y1) {
  const tiles = [];
  const horizontalFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  tiles.push(y * width + x);
  if (horizontalFirst) {
    while (x !== x1) tiles.push(y * width + (x += sx));
    while (y !== y1) tiles.push((y += sy) * width + x);
  } else {
    while (y !== y1) tiles.push((y += sy) * width + x);
    while (x !== x1) tiles.push(y * width + (x += sx));
  }
  return tiles;
}

export function rectTiles(width, x0, y0, x1, y1) {
  const tiles = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles.push(y * width + x);
  }
  return tiles;
}
