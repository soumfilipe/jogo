// Modificadores: o que as tecnologias concluídas (e alguns prédios, como a
// fábrica de cimento) mudam nos parâmetros do jogo.
//
// Tudo aqui é derivado do estado e fica no runtime: rt.mods é refeito por
// computeMods() ao carregar, a cada hora de jogo e quando uma tecnologia é
// concluída ou um prédio colocado/demolido. Os sistemas leem com
//
//   mod(rt, 'roadUpkeep', ECONOMY.roadUpkeepPerMonth)
//
// que devolve (base + soma dos `add`) × produto dos `mul`.
//
// Chaves usadas (ver EFFECTS em world/techs.js):
//   roadUpkeep, maintenance, utilityUpkeep, buildCost, demolishCost,
//   clearForestCost, loanRate, citizenSpeed, abandonDays, collapseDays,
//   upgradeDays, unservedLeave, largeLandValue, research, funding,
//   privateResearch, demand.<zona>, income.all, income.<zona>.<nível>,
//   jobs.<zona>.<nível>, consumption.<zona>, landValue.all,
//   landValue.<zona>, upgradeChance.<zona>, pollution.industry,
//   pollution.<tipo>, output.power, output.<tipo>, cost.<tipo>, upkeep.<tipo>

import { BUILDINGS, ZONE } from '../world/catalog.js';
import { BUILDING_TECH, TECH_BY_ID } from '../world/techs.js';

export const ZONE_KEY = {
  [ZONE.RESIDENTIAL]: 'residential',
  [ZONE.COMMERCIAL]: 'commercial',
  [ZONE.INDUSTRIAL]: 'industrial',
};

export function computeMods(state, rt) {
  const mods = new Map();
  const unlocked = new Set();
  const levels = new Set();
  const loans = [];
  const apply = (e) => {
    if (e.mod) {
      const m = mods.get(e.mod) ?? { add: 0, mul: 1 };
      if (e.add) m.add += e.add;
      if (e.mul) m.mul *= e.mul;
      mods.set(e.mod, m);
    } else if (e.unlock) unlocked.add(e.unlock);
    else if (e.level) levels.add(e.level.join(':'));
    else if (e.loan) loans.push(e.loan);
  };

  const done = new Set(state.research?.done ?? []);
  for (const id of done) for (const e of TECH_BY_ID.get(id)?.effects ?? []) apply(e);
  for (const b of state.buildings) {
    const effects = BUILDINGS[b.type].utility?.mods;
    if (effects && rt.workers.get(b.id)?.size > 0) for (const e of effects) apply(e);
  }

  rt.techDone = done;
  rt.mods = mods;
  rt.unlocked = unlocked;
  rt.levels = levels;
  rt.extraLoans = loans.sort((a, b) => a.amount - b.amount);
}

/** Valor de um parâmetro com os modificadores aplicados. */
export function mod(rt, key, base = 1) {
  const m = rt.mods?.get(key);
  return m ? (base + m.add) * m.mul : base;
}

/** O jogador pode construir este tipo? (prédios sem tecnologia estão sempre liberados) */
export function isUnlocked(rt, type) {
  return !(type in BUILDING_TECH) || Boolean(rt.unlocked?.has(type));
}

/**
 * Nível de prédio liberado na zona. O nível 1 e a indústria não dependem de
 * tecnologia; os outros vêm de techs como o concreto armado e o zoneamento.
 */
export function levelUnlocked(rt, zone, level) {
  const key = ZONE_KEY[zone];
  if (level <= 1 || key === 'industrial') return true;
  return Boolean(rt.levels?.has(`${key}:${level}`));
}

/** Vagas de emprego de um tipo de prédio, com os modificadores. */
export function jobsOf(rt, type) {
  const info = BUILDINGS[type];
  if (!info.jobs) return 0;
  const key = ZONE_KEY[info.zone];
  const mul = key ? mod(rt, `jobs.${key}.${info.level}`) : 1;
  return Math.round(info.jobs * mul);
}

/** Produção de energia e água de um prédio colocado pelo jogador. */
export function utilityOutput(rt, type, res) {
  const base = BUILDINGS[type].utility?.[res] ?? 0;
  if (!base) return 0;
  const general = res === 'power' ? mod(rt, 'output.power') : 1;
  return Math.round(base * general * mod(rt, `output.${type}`));
}

/** Preço para construir um prédio do jogador. */
export function utilityCost(rt, type) {
  return Math.round(BUILDINGS[type].utility.cost * mod(rt, `cost.${type}`) * mod(rt, 'buildCost'));
}

/** Manutenção mensal de um prédio do jogador. */
export function utilityUpkeep(rt, type) {
  return Math.round(BUILDINGS[type].utility.upkeep * mod(rt, `upkeep.${type}`) * mod(rt, 'utilityUpkeep') * mod(rt, 'maintenance'));
}

/** Peso de poluição de um prédio do jogador. */
export function utilityPollution(rt, type) {
  return BUILDINGS[type].utility.pollution * mod(rt, `pollution.${type}`);
}
