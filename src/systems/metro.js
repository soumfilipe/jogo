// Região metropolitana (pesquisa `regiao_metropolitana`): com estrada saindo
// do mapa, a cidade troca trabalhadores e clientes com as vizinhas.
//   - trabalhadores de fora ocupam parte das vagas abertas do comércio e da
//     indústria (contam no imposto dessas zonas, sem morar aqui);
//   - parte dos desempregados da cidade trabalha nas vizinhas (conta no
//     imposto residencial e sai do desemprego);
//   - clientes de fora: o comércio rende um pouco mais.
// Tudo derivado do estado (sem sorteio). Uma amostra desses carros aparece
// nas ruas de manhã e no fim da tarde (ver tourism.js).

import { BUILDINGS, METRO, ZONE } from '../world/catalog.js';
import { openJobs } from '../world/runtime.js';
import { canWork } from '../agents/citizens.js';
import { entryTiles } from './tourism.js';
import { mod } from './mods.js';

/** A cidade está na região metropolitana? (pesquisa e estrada para fora) */
export function metroActive(state, rt) {
  return mod(rt, 'metro', 0) > 0 && entryTiles(state, rt).tiles.length > 0;
}

/**
 * Trabalhadores de fora: { total, ratio } — `ratio` é a parte das vagas
 * abertas do comércio e da indústria que eles ocupam (a mesma em todo prédio).
 */
export function commutersIn(state, rt) {
  if (!metroActive(state, rt)) return { total: 0, ratio: 0 };
  let open = 0;
  for (const b of state.buildings) {
    const zone = BUILDINGS[b.type].zone;
    if (zone === ZONE.COMMERCIAL || zone === ZONE.INDUSTRIAL) open += openJobs(rt, b);
  }
  if (!open) return { total: 0, ratio: 0 };
  const pool = METRO.pool + state.citizens.length * METRO.poolShare;
  const total = Math.floor(Math.min(open * METRO.fill, pool));
  return { total, ratio: total / open };
}

/** Desempregados da cidade que trabalham nas vizinhas. */
export function commutersOut(state, rt) {
  if (!metroActive(state, rt)) return 0;
  let jobless = 0;
  for (const c of state.citizens) if (c.job === null && c.athlete === undefined && canWork(c)) jobless++;
  return Math.floor(jobless * METRO.outShare);
}
