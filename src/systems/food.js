// Alimentos: as fazendas da zona rural produzem, os moradores consomem.
//
// Balanço do mês (derivado do estado, como o orçamento):
//   produção = soma das fazendas: food × (funcionários ÷ vagas) × modificadores
//              (fazenda em areia produz FOOD.sand, até a agricultura tropical)
//   consumo  = moradores × perResident × (1 + desperdício)
// O que falta é importado (despesa no orçamento) e o que sobra é exportado
// (receita). A demanda rural cresce enquanto a cidade importa comida.
//
// Acesso: a comida chega às casas pelos mercados (rt.coverage.alimentos, ver
// services.js): mercado municipal, restaurante popular e o comércio de nível
// 2. Casa sem mercado no raio perde saúde e satisfação (wellbeing.js).

import { BUILDINGS, FOOD, TERRAIN, ZONE } from '../world/catalog.js';
import { companyJobs } from '../world/runtime.js';
import { mod } from './mods.js';

/** Fator de produção de uma fazenda pelo terreno (areia produz menos). */
function terrainFactor(state, rt, b) {
  return state.map.terrain[b.tile] === TERRAIN.SAND ? Math.min(1, mod(rt, 'food.sand', FOOD.sand)) : 1;
}

/** Vagas abertas pelas empresas da fazenda (o trator reduz). */
function farmJobs(rt, b) {
  let jobs = 0;
  for (const co of rt.companiesIn.get(b.id) ?? []) jobs += companyJobs(rt, co);
  return jobs;
}

/**
 * Produção da fazenda no mês com a lotação atual (ou cheia, com `full`).
 * Fazenda sem empresa (vaga) não produz nem cheia: a demanda rural chama uma
 * empresa nova para ela.
 */
export function farmOutput(state, rt, b, full = false) {
  const info = BUILDINGS[b.type];
  if (!info.food || b.abandoned !== undefined) return 0;
  const jobs = farmJobs(rt, b);
  if (!jobs) return 0;
  const share = full ? 1 : Math.min(1, rt.workers.get(b.id).size / jobs);
  return info.food * share * terrainFactor(state, rt, b) * mod(rt, 'food.output');
}

/** Consumo do mês: moradores, com o desperdício no caminho. */
export function foodConsumption(state, rt) {
  const waste = FOOD.waste * mod(rt, 'food.waste');
  return state.citizens.length * FOOD.perResident * (1 + waste) * mod(rt, 'food.consumption');
}

/**
 * Balanço do mês: { production, potential, consumption, imported, exported,
 * importCost, exportIncome }. `potential` é a produção com as fazendas cheias.
 */
export function foodBalance(state, rt) {
  let production = 0;
  let potential = 0;
  for (const b of state.buildings) {
    if (BUILDINGS[b.type].zone !== ZONE.RURAL) continue;
    production += farmOutput(state, rt, b);
    potential += farmOutput(state, rt, b, true);
  }
  const consumption = foodConsumption(state, rt);
  const imported = Math.max(0, consumption - production);
  const exported = Math.max(0, production - consumption);
  return {
    production,
    potential,
    consumption,
    imported,
    exported,
    importCost: Math.round(imported * FOOD.importPrice * mod(rt, 'food.price')),
    exportIncome: Math.round(exported * FOOD.exportPrice),
  };
}

/** Demanda rural (em vagas): quanto ainda falta produzir, com as fazendas cheias. */
export function ruralDemand(state, rt) {
  const { potential, consumption } = foodBalance(state, rt);
  return Math.round((consumption - potential) / (FOOD.perJob * mod(rt, 'food.output'))) + 4;
}
