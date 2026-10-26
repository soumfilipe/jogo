// Censo computadorizado (pesquisa `estatistica`): a previsão da demanda RCI
// para os próximos 3 meses, pela tendência dos últimos 30 dias, e os mapas de
// escolaridade e desemprego (camadas montadas em wellbeing.js).
//
// rt.demandTrend guarda uma amostra da demanda por dia. É só para a
// interface (não muda a simulação); depois de carregar um save, junta de novo.

import { mod } from './mods.js';

const KEYS = ['residential', 'commercial', 'industrial', 'rural'];
const SAMPLES = 30;
const MIN_SAMPLES = 7;
const HORIZON = 90; // dias
const LIMIT = 25; //   a demanda vai de −25 a +25

export const censusDone = (rt) => mod(rt, 'census', 0) > 0;

/** Guarda a demanda do dia (uma amostra por dia). */
export function noteDemand(rt, day) {
  const trend = (rt.demandTrend ??= []);
  if (trend.at(-1)?.day === day) return;
  trend.push({ day, ...Object.fromEntries(KEYS.map((k) => [k, rt.demand?.[k] ?? 0])) });
  if (trend.length > SAMPLES) trend.shift();
}

/**
 * Previsão: { residential: { now, future, dir: 'sobe' | 'cai' | 'estavel' }, ... }
 * pela reta dos últimos dias, ou null com poucos dados.
 */
export function demandForecast(rt) {
  const trend = rt.demandTrend ?? [];
  if (trend.length < MIN_SAMPLES) return null;
  const n = trend.length;
  const mx = trend.reduce((s, p) => s + p.day, 0) / n;
  const out = {};
  for (const k of KEYS) {
    const my = trend.reduce((s, p) => s + p[k], 0) / n;
    let num = 0;
    let den = 0;
    for (const p of trend) {
      num += (p.day - mx) * (p[k] - my);
      den += (p.day - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    const now = trend.at(-1)[k];
    const future = Math.max(-LIMIT, Math.min(LIMIT, now + slope * HORIZON));
    const diff = future - now;
    out[k] = { now, future, dir: diff > 2 ? 'sobe' : diff < -2 ? 'cai' : 'estavel' };
  }
  return out;
}

/** Texto da previsão para a dica do botão de demanda. */
export function forecastText(rt) {
  if (!censusDone(rt)) return '';
  const f = demandForecast(rt);
  if (!f) return 'Previsão (3 meses): coletando dados…';
  const word = { sobe: '↑ subindo', cai: '↓ caindo', estavel: '→ estável' };
  return `Previsão (3 meses): R ${word[f.residential.dir]}, C ${word[f.commercial.dir]}, I ${word[f.industrial.dir]}, F ${word[f.rural.dir]}`;
}
