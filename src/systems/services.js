// Cobertura dos serviços: hospitais, polícia, bombeiros e lazer.
//
// Cada prédio com `utility.service` cobre os tiles num raio (distância em
// "losango", como a das escolas). No centro a cobertura vale `strength` e cai
// até metade dela na borda; o tile fica com a maior cobertura entre os
// prédios que o alcançam (0 a 1). Prédio sem funcionário não cobre.
//
// Tudo aqui é derivado do estado (fica no runtime) e é refeito uma vez por
// dia e quando um prédio é colocado ou demolido.

import { BUILDINGS } from '../world/catalog.js';
import { mod } from './mods.js';

export const SERVICE_KINDS = ['saude', 'policia', 'bombeiros', 'lazer'];

/** Raio de um prédio de serviço, com os modificadores (ex.: rádio policial). */
export function serviceRadius(rt, type) {
  const s = BUILDINGS[type].utility.service;
  return Math.round(s.radius * mod(rt, `radius.${s.kind}`) * mod(rt, 'radius.services'));
}

/** Força no centro, com os modificadores (ex.: antibióticos nos hospitais). */
export function serviceStrength(rt, type) {
  const s = BUILDINGS[type].utility.service;
  return Math.min(1, s.strength * mod(rt, `service.${s.kind}`));
}

/** Refaz rt.coverage = { saude, policia, bombeiros, lazer } (Float32Array por tile). */
export function computeCoverage(state, rt) {
  const { width, height } = state.map;
  const n = width * height;
  const coverage = {};
  for (const kind of SERVICE_KINDS) coverage[kind] = new Float32Array(n);

  for (const b of state.buildings) {
    const s = BUILDINGS[b.type].utility?.service;
    if (!s || (rt.workers.get(b.id)?.size ?? 0) === 0) continue;
    const radius = serviceRadius(rt, b.type);
    const strength = serviceStrength(rt, b.type);
    const map = coverage[s.kind];
    const size = BUILDINGS[b.type].size;
    const bx = b.tile % width + (size - 1) / 2;
    const by = Math.floor(b.tile / width) + (size - 1) / 2;
    for (let y = Math.max(0, Math.floor(by - radius)); y <= Math.min(height - 1, Math.ceil(by + radius)); y++) {
      for (let x = Math.max(0, Math.floor(bx - radius)); x <= Math.min(width - 1, Math.ceil(bx + radius)); x++) {
        const d = Math.abs(x - bx) + Math.abs(y - by);
        if (d > radius) continue;
        const v = strength * (1 - 0.5 * (d / Math.max(1, radius)));
        const t = y * width + x;
        if (v > map[t]) map[t] = v;
      }
    }
  }

  // Cobertura da cidade toda (cirurgia de alta complexidade, telemedicina).
  const citywide = Math.min(1, mod(rt, 'citywide.saude', 0));
  if (citywide > 0) {
    const map = coverage.saude;
    for (let t = 0; t < n; t++) if (map[t] < citywide) map[t] = citywide;
  }
  rt.coverage = coverage;
}
