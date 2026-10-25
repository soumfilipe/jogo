// Transporte público: garagens de ônibus e estações de BRT, VLT e metrô.
//
// Cada estação atende um raio. Quem mora E trabalha no raio de estações do
// mesmo modo faz a viagem nele em vez de carro: o ônibus ainda pega trânsito
// (mas ocupa pouco a rua), BRT, VLT e metrô não; o metrô anda escondido,
// por baixo. O modo mais rápido disponível ganha. Cada viagem paga a
// passagem (receita da cidade no fechamento do mês).
//
// A cobertura não depende de funcionários (só de onde estão as estações),
// para que a escolha do modo seja sempre a mesma depois de carregar um save.

import { BUILDINGS, TRAFFIC } from '../world/catalog.js';
import { mod } from './mods.js';

export const TRANSIT_MODES = Object.keys(TRAFFIC.modes);

/** Raio de uma estação, com os modificadores (ex.: GPS nos ônibus). */
export function transitRadius(rt, type) {
  const t = BUILDINGS[type].utility.transit;
  return Math.round(t.radius * mod(rt, `radius.${t.mode}`));
}

/** Refaz rt.transit = { modo: Uint8Array } (1 = tile atendido por estação do modo). */
export function computeTransit(state, rt) {
  const { width, height } = state.map;
  const transit = {};
  for (const mode of TRANSIT_MODES) transit[mode] = null;
  for (const b of state.buildings) {
    const t = BUILDINGS[b.type].utility?.transit;
    if (!t) continue;
    const map = (transit[t.mode] ??= new Uint8Array(width * height));
    const r = transitRadius(rt, b.type);
    const bx = b.tile % width;
    const by = (b.tile - bx) / width;
    for (let y = Math.max(0, by - r); y <= Math.min(height - 1, by + r); y++) {
      for (let x = Math.max(0, bx - r); x <= Math.min(width - 1, bx + r); x++) {
        if (Math.abs(x - bx) + Math.abs(y - by) <= r) map[y * width + x] = 1;
      }
    }
  }
  rt.transit = transit;
}

/** Modo de transporte para ir de `from` a `to` (prédios), ou null (carro). */
export function chooseMode(rt, from, to) {
  if (!rt.transit) return null;
  let best = null;
  for (const mode of TRANSIT_MODES) {
    const map = rt.transit[mode];
    if (!map || !map[from.tile] || !map[to.tile]) continue;
    if (!best || TRAFFIC.modes[mode].speed > TRAFFIC.modes[best].speed) best = mode;
  }
  return best;
}

/** Passagem de uma viagem no modo (soma em state.economy.fares). */
export function payFare(state, mode) {
  state.economy.fares = (state.economy.fares ?? 0) + TRAFFIC.modes[mode].fare;
}
