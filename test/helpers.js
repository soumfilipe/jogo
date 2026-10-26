// Cidade de teste: mapa pequeno, só grama, com ruas em grade e zonas misturadas.
// Por padrão a energia e a água vêm "importadas" (sem usinas), para os testes
// que não são sobre serviços públicos; com utilities: false, a cidade começa
// sem nada (como um jogo novo).

import { createWorld } from '../src/world/world.js';
import { TERRAIN, ZONE } from '../src/world/catalog.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { prepare } from '../src/systems/simulation.js';

export function testCity({ size = 48, seed = 1234, utilities = true } = {}) {
  const state = createWorld({ name: 'Teste', width: size, height: size, seed });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.map.elevation.fill(0); // plana: os testes não tratam do relevo
  if (utilities) state.utilities.imported = { power: true, water: true };
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
