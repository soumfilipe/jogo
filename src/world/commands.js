// Ações do jogador. Toda mudança feita pela interface passa por aqui:
//
//   planCommand(state, rt, cmd)  -> { tiles, cost }   (prévia, não altera nada)
//   applyCommand(state, rt, cmd) -> { ok, cost, count, reason }
//
// Comandos:
//   { type: 'road',     tiles }
//   { type: 'zone',     tiles, zone }       (zone = ZONE.NONE remove a zona)
//   { type: 'bulldoze', tiles }

import { BUILDINGS, COSTS, TERRAIN, ZONE } from './catalog.js';
import { recomputeRoads, removeBuilding } from './runtime.js';
import { isBuildable } from './world.js';

export function planCommand(state, rt, cmd) {
  const { road, zone, terrain } = state.map;
  const tiles = [];
  const buildings = new Set(); // prédios grandes ocupam vários tiles: conta uma vez
  let cost = 0;

  for (const tile of new Set(cmd.tiles)) {
    if (tile < 0 || tile >= road.length) continue;
    const forest = terrain[tile] === TERRAIN.FOREST;

    if (cmd.type === 'road') {
      if (road[tile] || rt.buildingAt[tile] || !isBuildable(state, tile)) continue;
      cost += COSTS.road + (forest ? COSTS.clearForest : 0);
    } else if (cmd.type === 'zone') {
      if (road[tile] || zone[tile] === cmd.zone || !isBuildable(state, tile)) continue;
      if (rt.buildingAt[tile]) continue; // demolir antes de rezonear
      cost += cmd.zone === ZONE.NONE ? 0 : COSTS.zone;
    } else if (cmd.type === 'bulldoze') {
      const id = rt.buildingAt[tile];
      if (id) {
        if (buildings.has(id)) continue;
        buildings.add(id);
        cost += COSTS.demolishBuilding * BUILDINGS[rt.buildingById.get(id).type].level;
      } else if (road[tile]) cost += COSTS.demolishRoad;
      else if (forest) cost += COSTS.clearForest;
      else if (!zone[tile]) continue;
    } else {
      throw new Error(`Comando desconhecido: ${cmd.type}`);
    }
    tiles.push(tile);
  }
  return { tiles, cost };
}

export function applyCommand(state, rt, cmd) {
  const { tiles, cost } = planCommand(state, rt, cmd);
  if (tiles.length === 0) return { ok: false, cost: 0, count: 0, reason: 'Nada a fazer aqui.' };
  if (cost > state.economy.money) {
    return { ok: false, cost, count: 0, reason: `Dinheiro insuficiente (custa $${cost}).` };
  }

  const { road, zone, terrain } = state.map;
  let roadsChanged = false;

  for (const tile of tiles) {
    if (cmd.type === 'road') {
      road[tile] = 1;
      zone[tile] = ZONE.NONE;
      if (terrain[tile] === TERRAIN.FOREST) terrain[tile] = TERRAIN.GRASS;
      roadsChanged = true;
    } else if (cmd.type === 'zone') {
      zone[tile] = cmd.zone;
    } else if (cmd.type === 'bulldoze') {
      if (rt.buildingAt[tile]) {
        removeBuilding(state, rt, rt.buildingAt[tile]);
      } else if (road[tile]) {
        road[tile] = 0;
        roadsChanged = true;
      } else if (terrain[tile] === TERRAIN.FOREST) {
        terrain[tile] = TERRAIN.GRASS;
      } else {
        zone[tile] = ZONE.NONE;
      }
    }
  }

  state.economy.money -= cost;
  if (roadsChanged) recomputeRoads(state, rt);
  rt.mapVersion++;
  return { ok: true, cost, count: tiles.length };
}

// ---------------------------------------------------------------------------
// Formas de seleção usadas pelas ferramentas
// ---------------------------------------------------------------------------

/** Estrada em "L": anda primeiro no eixo mais longo, depois no outro. */
export function lineTiles(width, x0, y0, x1, y1) {
  const tiles = [];
  const horizontalFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  tiles.push(y * width + x);
  if (horizontalFirst) {
    while (x !== x1) tiles.push(y * width + (x += sx));
    while (y !== y1) tiles.push((y += sy) * width + x);
  } else {
    while (y !== y1) tiles.push((y += sy) * width + x);
    while (x !== x1) tiles.push(y * width + (x += sx));
  }
  return tiles;
}

export function rectTiles(width, x0, y0, x1, y1) {
  const tiles = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles.push(y * width + x);
  }
  return tiles;
}
