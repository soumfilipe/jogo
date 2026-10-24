// Ações do jogador. Toda mudança feita pela interface passa por aqui:
//
//   planCommand(state, rt, cmd)  -> { tiles, cost }   (prévia, não altera nada)
//   applyCommand(state, rt, cmd) -> { ok, cost, count, reason }
//
// Comandos:
//   { type: 'road',     tiles }
//   { type: 'zone',     tiles, zone, density? }
//                       (zone = ZONE.NONE remove a zona; density padrão: média.
//                        Mudar só a densidade vale também em lote construído)
//   { type: 'bulldoze', tiles }
//   { type: 'place', building, tile }    (prédio do jogador; tile = canto de cima)
//   { type: 'tax', zone, percent }       (zone: residential | commercial | industrial)
//   { type: 'loan', amount }             (um dos valores de loanOffers())
//   { type: 'repay', id }                (quita o empréstimo de uma vez)
//   { type: 'funding', area, amount }    (verba de pesquisa por mês numa área)
//   { type: 'priority', area, tech }     (tecnologia prioritária da área; null = automático)

import { BUILDINGS, COSTS, DENSITY, TERRAIN, ZONE } from './catalog.js';
import { addBuilding, clearForest, recomputeRoads, removeBuilding, touchMap } from './runtime.js';
import { isBuildable } from './world.js';
import { BUILDING_TECH, TECH_BY_ID, marcoAt } from './techs.js';
import { repayLoan, setTax, takeLoan } from '../systems/economy.js';
import { computeMods, isUnlocked, mod, utilityCost } from '../systems/mods.js';
import { setFunding, setPriority } from '../systems/research.js';

export function planCommand(state, rt, cmd) {
  if (cmd.type === 'place') return planPlace(state, rt, cmd);
  const { road, zone, terrain, density } = state.map;
  const tiles = [];
  const buildings = new Set(); // prédios grandes ocupam vários tiles: conta uma vez
  const c = costs(rt);
  let cost = 0;

  for (const tile of new Set(cmd.tiles)) {
    if (tile < 0 || tile >= road.length) continue;
    const forest = terrain[tile] === TERRAIN.FOREST;

    if (cmd.type === 'road') {
      if (road[tile] || rt.buildingAt[tile] || !isBuildable(state, tile)) continue;
      cost += c.road + (forest ? c.clearForest : 0);
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
      else if (forest) cost += c.clearForest;
      else if (!zone[tile]) continue;
    } else {
      throw new Error(`Comando desconhecido: ${cmd.type}`);
    }
    tiles.push(tile);
  }
  return { tiles, cost: Math.round(cost) };
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
  if (cmd.type === 'funding') return setFunding(state, cmd.area, cmd.amount);
  if (cmd.type === 'priority') return setPriority(state, rt, cmd.area, cmd.tech);

  const { tiles, cost, reason } = planCommand(state, rt, cmd);
  if (reason) return { ok: false, cost, count: 0, reason };
  if (tiles.length === 0) return { ok: false, cost: 0, count: 0, reason: 'Nada a fazer aqui.' };
  if (cost > state.economy.money) {
    return { ok: false, cost, count: 0, reason: `Dinheiro insuficiente (custa $${cost}).` };
  }

  if (cmd.type === 'place') {
    for (const t of tiles) state.map.zone[t] = ZONE.NONE;
    addBuilding(state, rt, cmd.building, cmd.tile);
    // A primeira usina (ou bomba/poço) própria encerra a importação daquele recurso.
    const utility = BUILDINGS[cmd.building].utility;
    const imported = state.utilities.imported;
    if (utility.power) imported.power = false;
    if (utility.water) imported.water = false;
    state.economy.money -= cost;
    computeMods(state, rt);
    return { ok: true, cost, count: 1 };
  }

  const { road, zone, terrain, density } = state.map;
  let roadsChanged = false;

  for (const tile of tiles) {
    if (cmd.type === 'road') {
      road[tile] = 1;
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
      } else if (terrain[tile] === TERRAIN.FOREST) {
        clearForest(state, tile);
      } else {
        zone[tile] = ZONE.NONE;
      }
    }
  }

  state.economy.money -= cost;
  if (roadsChanged) recomputeRoads(state, rt);
  if (cmd.type === 'bulldoze') computeMods(state, rt);
  touchMap(rt);
  return { ok: true, cost, count: tiles.length };
}

const zoneDensity = (cmd) => cmd.density ?? DENSITY.MEDIUM;

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
