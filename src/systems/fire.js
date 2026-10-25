// Incêndios: uma vez por dia, cada prédio das zonas pode pegar fogo (mais
// chance nos maiores). Com bombeiros no raio, a chance de apagar é a
// cobertura do quartel ali; sem apagar, o prédio vira ruína (fica abandonado:
// moradores se mudam, funcionários perdem o emprego e ele desaba como os
// abandonados) e o fogo pode passar aos prédios vizinhos.
//
// O detector de fumaça e o código contra incêndio diminuem os estragos e o
// risco (mod 'fireDamage', 'fireRisk'). Nada aqui fica no save além do que o
// incêndio muda no prédio (abandoned, burned).

import { BUILDINGS, FIRE } from '../world/catalog.js';
import { footprint, removeCitizen, sendHome, setJob, touchMap } from '../world/runtime.js';
import { chance } from '../core/rng.js';
import { mod } from './mods.js';

/** Incêndios do dia. Devolve os ids dos prédios que viraram ruína. */
export function applyFires(state, rt) {
  const risk = FIRE.dailyChance * mod(rt, 'fireRisk');
  const burned = [];
  const queue = [];
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (!info.zone || b.abandoned !== undefined) continue;
    if (chance(state.rng, risk * Math.max(1, info.level) * info.size * info.size)) queue.push(b.id);
  }
  const seen = new Set(queue);
  while (queue.length) {
    const b = rt.buildingById.get(queue.shift());
    if (!b || b.abandoned !== undefined) continue;
    const cover = rt.coverage?.bombeiros[b.tile] ?? 0;
    if (chance(state.rng, cover)) continue; // os bombeiros apagaram
    // O detector de fumaça faz parte dos incêndios não passarem de um susto.
    if (chance(state.rng, 1 - mod(rt, 'fireDamage'))) continue;
    burn(state, rt, b);
    burned.push(b.id);
    for (const n of neighbors(state, rt, b)) {
      if (seen.has(n.id) || n.abandoned !== undefined || !BUILDINGS[n.type].zone) continue;
      if (!chance(state.rng, FIRE.spreadChance)) continue;
      seen.add(n.id);
      queue.push(n.id);
    }
  }
  if (burned.length) (rt.events ??= []).push({ kind: 'incendio', count: burned.length, tile: rt.buildingById.get(burned[0]).tile });
  return burned;
}

function burn(state, rt, b) {
  for (const id of [...rt.residents.get(b.id)]) removeCitizen(state, rt, id);
  for (const id of [...rt.workers.get(b.id)]) {
    const c = rt.citizenById.get(id);
    if (c.state !== 'casa') sendHome(state, rt, c);
    setJob(rt, c, null);
  }
  b.abandoned = state.time.tick;
  b.burned = true;
  touchMap(rt, b.tile, BUILDINGS[b.type].size);
}

// Prédios encostados (inclusive na diagonal), em ordem de id.
function neighbors(state, rt, b) {
  const { width, height } = state.map;
  const ids = new Set();
  for (const t of footprint(state, b)) {
    const x = t % width;
    const y = (t - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const id = rt.buildingAt[ny * width + nx];
        if (id && id !== b.id) ids.add(id);
      }
    }
  }
  return [...ids].sort((a, c) => a - c).map((id) => rt.buildingById.get(id));
}
