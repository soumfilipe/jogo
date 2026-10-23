// Cidade de teste: mapa pequeno, só grama, com ruas em grade e zonas misturadas.

import { createWorld } from '../src/world/world.js';
import { TERRAIN, ZONE } from '../src/world/catalog.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { prepare } from '../src/systems/simulation.js';

export function testCity({ size = 48, seed = 1234 } = {}) {
  const state = createWorld({ name: 'Teste', width: size, height: size, seed });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.economy.money = 1_000_000;
  const rt = prepare(state);
  const W = size;
  for (let y = 2; y < size - 2; y += 5) applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 1, y, size - 2, y) });
  for (let x = 1; x < size - 1; x += 8) applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, x, 2, x, size - 3) });
  const zones = [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.RESIDENTIAL, ZONE.INDUSTRIAL];
  for (let y = 3, k = 0; y < size - 3; y += 5, k++) {
    applyCommand(state, rt, { type: 'zone', zone: zones[k % 4], tiles: rectTiles(W, 1, y, size - 2, y + 3) });
  }
  return { state, rt };
}
