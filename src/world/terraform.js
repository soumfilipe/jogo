// Terraplanagem (comando 'terrain'): sobe, desce ou aplaina os cantos dos
// tiles arrastados.
//   { type: 'terrain', tiles, mode: 'raise' | 'lower' | 'level' }
// 'level' nivela tudo na altura do primeiro canto do primeiro tile. Os cantos
// encostados na água ou embaixo de prédios não mudam; os vizinhos se ajustam
// (em rampa) para o degrau entre cantos continuar no máximo RELIEF.maxStep, e
// pagam também. Recusa se uma rua ficaria numa encosta íngreme.

import { RELIEF, TERRAIN } from './catalog.js';
import { constrain, cornerIndex, isSteep } from './relief.js';
import { footprint, touchMap } from './runtime.js';
import { mod } from '../systems/mods.js';

export const TERRAIN_MODES = ['raise', 'lower', 'level'];

/** Prévia: { tiles, cost, reason?, elevation } (`elevation` é o resultado). */
export function planTerrain(state, rt, cmd) {
  const map = state.map;
  const { width, height } = map;
  const tiles = [...new Set(cmd.tiles)].filter((t) => t >= 0 && t < width * height);
  const fail = (reason) => ({ tiles, cost: 0, reason });
  if (!TERRAIN_MODES.includes(cmd.mode)) return fail('Escolha subir, descer ou aplainar.');
  if (!tiles.length) return fail('Nada a fazer aqui.');

  const W = width + 1;
  const old = map.elevation;
  const next = Uint8Array.from(old);
  // Cantos que não mudam: na água e embaixo de prédios.
  const locked = new Uint8Array(old.length);
  const lockTile = (t) => {
    const x = t % width;
    const y = (t - x) / width;
    for (const i of [y * W + x, y * W + x + 1, (y + 1) * W + x, (y + 1) * W + x + 1]) locked[i] = 1;
  };
  for (let t = 0; t < width * height; t++) if (map.terrain[t] === TERRAIN.WATER) lockTile(t);
  for (const b of state.buildings) for (const t of footprint(state, b)) lockTile(t);

  const corners = new Set();
  for (const t of tiles) {
    const x = t % width;
    const y = (t - x) / width;
    for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) corners.add(cornerIndex(map, cx, cy));
  }
  const first = tiles[0];
  const target = old[cornerIndex(map, first % width, Math.floor(first / width))];
  const fixed = Uint8Array.from(locked);
  let moved = 0;
  for (const i of corners) {
    if (locked[i]) continue;
    const h = cmd.mode === 'raise' ? old[i] + 1 : cmd.mode === 'lower' ? old[i] - 1 : target;
    next[i] = Math.max(0, Math.min(RELIEF.maxLevel, h));
    fixed[i] = 1;
    if (next[i] !== old[i]) moved++;
  }
  if (!moved) return fail(cmd.mode === 'level' ? 'O terreno já está nivelado.' : 'Esses cantos não podem mudar (água ou prédio).');

  const result = { width, height, elevation: next };
  constrain(result, fixed);
  // Os cantos travados (água e prédios) não podem ter sido empurrados.
  for (let i = 0; i < next.length; i++) {
    if (locked[i] && next[i] !== old[i]) return fail('Um prédio ou a água no caminho não deixa mexer tanto o terreno.');
  }
  // Nenhum degrau acima do limite (quando dois cantos fixos brigam).
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const i = y * W + x;
      if ((x < width && Math.abs(next[i] - next[i + 1]) > RELIEF.maxStep) || (y < height && Math.abs(next[i] - next[i + W]) > RELIEF.maxStep)) {
        return fail('O terreno em volta não deixa: mexa numa área maior.');
      }
    }
  }
  let levels = 0;
  for (let i = 0; i < next.length; i++) levels += Math.abs(next[i] - old[i]);
  // Ruas não podem ficar em encosta íngreme.
  const after = { ...map, elevation: next };
  for (let t = 0; t < width * height; t++) {
    if (map.road[t] && isSteep(after, t) && !isSteep(map, t)) return fail('Uma rua ficaria numa encosta íngreme demais.');
  }
  const cost = Math.round(levels * RELIEF.terraformCost * mod(rt, 'buildCost'));
  return { tiles, cost, elevation: next };
}

/** Aplica a terraplanagem (o dinheiro é conferido e cobrado aqui). */
export function applyTerrain(state, rt, cmd) {
  const plan = planTerrain(state, rt, cmd);
  if (plan.reason) return { ok: false, cost: plan.cost, count: 0, reason: plan.reason };
  if (plan.cost > state.economy.money) return { ok: false, cost: plan.cost, count: 0, reason: `Dinheiro insuficiente (custa $${plan.cost}).` };
  state.map.elevation.set(plan.elevation);
  state.economy.money -= plan.cost;
  touchMap(rt);
  return { ok: true, cost: plan.cost, count: plan.tiles.length };
}
