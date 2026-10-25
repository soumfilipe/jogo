// Calendário de eventos: tudo derivado da data e do que a cidade tem.
//
//   jogo        domingo: campos e estádios lotam à tarde
//   fim de semana sábado e domingo: parques temáticos e arenas lotam
//   carnaval    fevereiro, dias 10 a 14 (com a tecnologia): mais turistas,
//               desfile pela cidade e mais satisfação
//   megaevento  julho, a cada 4 anos (com a tecnologia), se a cidade tem
//               estádio e metrô: um mês de turismo intenso

import { BUILDINGS, TOURISM } from '../world/catalog.js';
import { calendar } from '../core/time.js';
import { mod } from './mods.js';

const has = (state, type) => state.buildings.some((b) => b.type === type);

/** Eventos de hoje: { game, weekend, carnaval, mega }. */
export function todaysEvents(state, rt, tick = state.time.tick) {
  const c = calendar(tick);
  const C = TOURISM.carnaval;
  const M = TOURISM.mega;
  return {
    game: c.weekday === 6,
    weekend: c.weekday >= 5,
    carnaval: mod(rt, 'event.carnaval', 0) > 0 && c.month === C.month && c.day >= C.days[0] && c.day <= C.days[1],
    mega: mod(rt, 'event.mega', 0) > 0 && c.month === M.month && c.year % M.every === 0
      && has(state, 'estadio') && has(state, 'estacao_metro'),
  };
}

/** Multiplicador de turistas pelos eventos de hoje. */
export function eventMultiplier(events) {
  return (events.carnaval ? TOURISM.carnaval.multiplier : 1) * (events.mega ? TOURISM.mega.multiplier : 1);
}

/** Turistas por dia que a atração chama hoje (sem os multiplicadores da cidade). */
export function attractionAppeal(type, events) {
  const t = BUILDINGS[type].utility?.tourism;
  if (!t) return 0;
  let appeal = t.appeal ?? 0;
  if (events.game && t.game) appeal = Math.max(appeal, t.game);
  if (events.weekend && t.weekend) appeal = Math.max(appeal, t.weekend);
  return appeal;
}

/** Nome dos eventos de hoje, para avisos na tela. */
export function eventNames(events) {
  const names = [];
  if (events.carnaval) names.push('Carnaval');
  if (events.mega) names.push('Megaevento esportivo');
  return names;
}
