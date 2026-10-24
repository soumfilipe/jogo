import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, DENSITY, TERRAIN, ZONE, buildingFloors, capacityOf, floorsOf, maxFloorsFor,
} from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding, vacancies } from '../src/world/runtime.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { prepare } from '../src/systems/simulation.js';
import { upgradeBuildings, upgradeBlockers } from '../src/systems/growth.js';
import { computeDemand } from '../src/systems/demand.js';
import { computeUtilities, consumption } from '../src/systems/utilities.js';
import { createCitizen } from '../src/agents/citizens.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { checksum, createSave, readSave, SAVE_VERSION } from '../src/save/format.js';

// Densidade das zonas e crescimento andar por andar.

const W = 24;

// Marco 2: o código de zoneamento (nível 3) já vem pesquisado.
function world(startMarco = 2) {
  const state = createWorld({ width: W, height: W, seed: 5, startMarco });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 1_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

/** Prédio lotado, abastecido, com demanda e terreno valorizado. */
function fullBuilding(type, density, startMarco = 2) {
  const { state, rt } = world(startMarco);
  const tile = 6 * W + 5;
  applyCommand(state, rt, { type: 'zone', zone: BUILDINGS[type].zone, density, tiles: [tile] });
  const b = addBuilding(state, rt, type, tile);
  rt.landValue.fill(0.95);
  const fill = () => {
    while (vacancies(rt, b) > 0) createCitizen(state, rt, b);
    state.time.tick += TICKS_PER_DAY * 10;
    rt.demand.residential = 10;
    computeUtilities(state, rt);
  };
  fill();
  return { state, rt, b, fill };
}

/** Roda o crescimento até o prédio mudar (ou desistir). */
function grow(state, rt, b) {
  const before = `${b.type}:${buildingFloors(b)}`;
  for (let i = 0; i < 200 && `${b.type}:${buildingFloors(b)}` === before; i++) upgradeBuildings(state, rt);
}

test('zonear guarda a densidade; em lote construído, só a densidade muda', () => {
  const { state, rt } = world();
  const tiles = rectTiles(W, 2, 6, 4, 7);
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, density: DENSITY.HIGH, tiles });
  for (const t of tiles) assert.equal(state.map.density[t], DENSITY.HIGH);

  // Mesma zona e densidade: nada a fazer.
  assert.equal(applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, density: DENSITY.HIGH, tiles }).ok, false);

  const b = addBuilding(state, rt, 'casa', tiles[0]);
  const low = applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, density: DENSITY.LOW, tiles: [tiles[0]] });
  assert.equal(low.ok, true);
  assert.equal(state.map.density[tiles[0]], DENSITY.LOW);
  assert.ok(low.cost > 0);
  assert.equal(rt.buildingById.get(b.id), b, 'o prédio continua lá');

  // Trocar a zona de um lote construído continua exigindo demolir antes.
  assert.equal(applyCommand(state, rt, { type: 'zone', zone: ZONE.COMMERCIAL, tiles: [tiles[0]] }).ok, false);
  // Sem densidade, o padrão é a média.
  applyCommand(state, rt, { type: 'zone', zone: ZONE.COMMERCIAL, tiles: [tiles[1]] });
  assert.equal(state.map.density[tiles[1]], DENSITY.MEDIUM);
});

test('densidade baixa para no sobrado', () => {
  const { state, rt, b, fill } = fullBuilding('casa', DENSITY.LOW);
  grow(state, rt, b);
  assert.equal(b.type, 'sobrado');
  fill();
  grow(state, rt, b);
  assert.equal(b.type, 'sobrado', 'não vira prédio de apartamentos');
  assert.equal(upgradeBlockers(state, rt, b).limited.name, 'Baixa');

  // Rezoneado para média, volta a crescer.
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, density: DENSITY.MEDIUM, tiles: [b.tile] });
  grow(state, rt, b);
  assert.equal(b.type, 'apartamentos');
});

test('sem o código de zoneamento, nem a densidade média passa do sobrado', () => {
  const { state, rt, b, fill } = fullBuilding('sobrado', DENSITY.MEDIUM, 1);
  fill();
  grow(state, rt, b);
  assert.equal(b.type, 'sobrado');
  assert.match(upgradeBlockers(state, rt, b).blockers.join(), /Código de zoneamento/);
});

test('prédio alto ganha um andar por vez, até o limite da densidade', () => {
  const { state, rt, b, fill } = fullBuilding('apartamentos', DENSITY.MEDIUM);
  const info = BUILDINGS.apartamentos;
  assert.equal(buildingFloors(b), floorsOf(info));
  assert.match(upgradeBlockers(state, rt, b).label, /5º andar/);

  grow(state, rt, b);
  assert.equal(b.type, 'apartamentos');
  assert.equal(b.floors, floorsOf(info) + 1);
  assert.equal(capacityOf(b), info.residents + info.perFloor);
  assert.equal(vacancies(rt, b), info.perFloor, 'o andar novo vem vazio');
  computeDemand(state, rt);
  assert.equal(rt.stats.housing, capacityOf(b));
  assert.ok(consumption(info, capacityOf(b)).power > consumption(info).power);

  // Recém-crescido: espera alguns dias; depois, lotado de novo, cresce de novo.
  for (let i = 0; i < 100; i++) upgradeBuildings(state, rt);
  assert.equal(b.floors, floorsOf(info) + 1);

  for (let k = 0; k < 10; k++) {
    fill();
    grow(state, rt, b);
  }
  assert.equal(b.floors, maxFloorsFor(info, DENSITY.MEDIUM));
  assert.equal(upgradeBlockers(state, rt, b).limited.name, 'Média');

  state.map.density[b.tile] = DENSITY.HIGH;
  for (let k = 0; k < 10; k++) {
    fill();
    grow(state, rt, b);
  }
  assert.equal(b.floors, maxFloorsFor(info, DENSITY.HIGH));
  assert.equal(upgradeBlockers(state, rt, b), null, 'altura máxima');
});

test('andares mais altos pedem terreno mais valorizado', () => {
  const { state, rt, b } = fullBuilding('escritorios', DENSITY.HIGH);
  rt.landValue.fill(0.62);
  rt.demand.commercial = 10;
  for (let i = 0; i < 200; i++) upgradeBuildings(state, rt);
  assert.equal(buildingFloors(b), floorsOf(BUILDINGS.escritorios));
  assert.match(upgradeBlockers(state, rt, b).blockers.join(), /valor do terreno/);
});

test('indústria não usa densidade e não cresce andares', () => {
  const { state, rt, b } = fullBuilding('complexo', DENSITY.LOW);
  rt.demand.industrial = 10;
  for (let i = 0; i < 200; i++) upgradeBuildings(state, rt);
  assert.equal(b.floors, undefined);
  assert.equal(upgradeBlockers(state, rt, b), null);
});

test('andares e densidade vão para o save; saves antigos ganham densidade média', () => {
  const { state, b } = fullBuilding('apartamentos', DENSITY.HIGH);
  b.floors = 7;
  const save = createSave(state, { id: 'densa' });
  const { state: loaded } = readSave(JSON.stringify(save));
  assert.equal(loaded.buildings.find((x) => x.id === b.id).floors, 7);
  assert.equal(loaded.map.density[b.tile], DENSITY.HIGH);

  // Save do formato 6: sem a camada de densidade.
  const v6 = JSON.parse(JSON.stringify(save));
  delete v6.data.map.density;
  v6.version = 6;
  v6.checksum = checksum(v6.data);
  const { save: migrated, state: old } = readSave(JSON.stringify(v6));
  assert.equal(migrated.version, SAVE_VERSION);
  assert.ok(old.map.density.every((d) => d === DENSITY.MEDIUM));
});
