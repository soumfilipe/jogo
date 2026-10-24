import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, LARGE_BUILDINGS, LEVELS, MAX_LEVEL, TERRAIN, ZONE, floorsOf,
} from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding, footprint, removeCitizen } from '../src/world/runtime.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { computeLandValue } from '../src/systems/landvalue.js';
import { growBuildings, upgradeBuildings, upgradeBlockers } from '../src/systems/growth.js';
import { createCitizen } from '../src/agents/citizens.js';
import { computeUtilities } from '../src/systems/utilities.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

function flatWorld(size = 24) {
  const state = createWorld({ width: size, height: size, seed: 9 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 1_000_000;
  const rt = prepare(state);
  return { state, rt };
}

test('catálogo: cada zona tem os três níveis e um prédio grande', () => {
  for (const zone of [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL]) {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      assert.ok(LEVELS[zone][level]?.length > 0, `zona ${zone} nível ${level}`);
    }
    assert.ok(LARGE_BUILDINGS[zone]?.length > 0, `zona ${zone} sem prédio grande`);
  }
  // Ids do formato de save 2 continuam existindo como nível 1.
  for (const id of ['casa', 'loja', 'fabrica']) assert.equal(BUILDINGS[id].level, 1);
  for (const [id, info] of Object.entries(BUILDINGS)) {
    if (info.utility) continue;
    assert.ok(info.residents > 0 !== info.jobs > 0, `${id}: mora ou trabalha`);
    assert.ok(info.perFloor > 0, `${id}: pessoas por andar`);
  }
});

test('poluição perto da indústria derruba o valor do terreno', () => {
  const { state, rt } = flatWorld(40);
  for (let i = 0; i < 6; i++) addBuilding(state, rt, 'complexo', 5 * 40 + 3 + i);
  computeLandValue(state, rt);
  const near = 6 * 40 + 6;
  const far = 35 * 40 + 35;
  assert.ok(rt.pollution[near] > 0.5, `poluição perto: ${rt.pollution[near]}`);
  assert.equal(rt.pollution[far], 0);
  assert.ok(rt.landValue[near] < rt.landValue[far]);

  // Água por perto valoriza.
  for (let x = 0; x < 10; x++) for (let y = 30; y < 40; y++) state.map.terrain[y * 40 + x] = TERRAIN.WATER;
  computeLandValue(state, rt);
  assert.ok(rt.landValue[35 * 40 + 12] > rt.landValue[far]);
});

function fullHouse() {
  const { state, rt } = flatWorld();
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(24, 0, 5, 23, 5) });
  const house = addBuilding(state, rt, 'casa', 6 * 24 + 5);
  while (rt.residents.get(house.id).size < BUILDINGS.casa.residents) createCitizen(state, rt, house);
  state.time.tick += TICKS_PER_DAY * 10;
  rt.demand.residential = 10;
  computeUtilities(state, rt);
  return { state, rt, house };
}

test('casa lotada em terreno valorizado vira sobrado e ganha vagas', () => {
  const { state, rt, house } = fullHouse();
  rt.landValue.fill(0.9);
  const residents = [...rt.residents.get(house.id)];
  for (let i = 0; i < 100 && house.type === 'casa'; i++) upgradeBuildings(state, rt);

  assert.equal(BUILDINGS[house.type].level, 2);
  assert.equal(house.upgradedAt, state.time.tick);
  assert.deepEqual([...rt.residents.get(house.id)], residents, 'os moradores continuam lá');
  assert.ok(BUILDINGS[house.type].residents > residents.length, 'sobra vaga para mais gente');

  // Recém-promovido: precisa esperar alguns dias antes do próximo nível.
  for (let i = 0; i < 100; i++) upgradeBuildings(state, rt);
  assert.equal(BUILDINGS[house.type].level, 2);
});

test('sem valor do terreno ou sem lotação, não sobe de nível', () => {
  const { state, rt, house } = fullHouse();
  rt.landValue.fill(0.2);
  for (let i = 0; i < 100; i++) upgradeBuildings(state, rt);
  assert.equal(house.type, 'casa');
  assert.match(upgradeBlockers(state, rt, house).blockers.join(), /valor do terreno 45%/);

  rt.landValue.fill(0.9);
  const [someone] = rt.residents.get(house.id);
  removeCitizen(state, rt, someone);
  for (let i = 0; i < 100; i++) upgradeBuildings(state, rt);
  assert.equal(house.type, 'casa');
  assert.match(upgradeBlockers(state, rt, house).blockers.join(), /lotado/);
});

test('prédio grande ocupa 2x2, é demolido inteiro e cobrado uma vez', () => {
  const { state, rt } = flatWorld();
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(24, 0, 4, 23, 4) });
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: rectTiles(24, 4, 5, 7, 8) });
  const condo = addBuilding(state, rt, 'condominio', 5 * 24 + 5);
  const tiles = footprint(state, condo);
  assert.deepEqual(tiles, [125, 126, 149, 150]);
  for (const t of tiles) assert.equal(rt.buildingAt[t], condo.id);
  assert.ok(rt.access.get(condo.id) >= 0, 'acesso pela estrada ao lado');

  const before = state.economy.money;
  const result = applyCommand(state, rt, { type: 'bulldoze', tiles });
  assert.equal(result.count, 1);
  assert.equal(state.economy.money, before - result.cost);
  for (const t of tiles) {
    assert.equal(rt.buildingAt[t], 0);
    assert.equal(state.map.zone[t], ZONE.RESIDENTIAL, 'a zona continua');
  }
});

test('lotes vazios valorizados recebem prédios grandes', () => {
  const { state, rt } = flatWorld(40);
  for (const y of [4, 10, 16, 22]) applyCommand(state, rt, { type: 'road', tiles: lineTiles(40, 0, y, 39, y) });
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: rectTiles(40, 0, 5, 39, 21) });
  rt.landValue.fill(0.9);
  rt.stats.population = 1000;
  rt.demand.residential = 10_000;
  for (let i = 0; i < 5; i++) growBuildings(state, rt);
  const types = new Set(state.buildings.map((b) => b.type));
  assert.ok(types.has('condominio'), [...types].join());
  assert.ok(types.has('casa'));
});

test('numa cidade rodando, os níveis aparecem sozinhos', () => {
  const { state, rt } = testCity({ size: 48, seed: 3 });
  advance(state, rt, TICKS_PER_DAY * 25);
  const levels = new Set(state.buildings.map((b) => BUILDINGS[b.type].level));
  assert.ok(levels.has(2), `níveis: ${[...levels]}`);
});

test('20 projetos diferentes para cada tipo (zona, nível e tamanho)', async () => {
  const { design, designFor, VARIANTS } = await import('../src/render/designs.js');
  const { MAX_FLOORS } = await import('../src/render/buildings.js');
  assert.equal(VARIANTS, 20);
  for (const type of Object.keys(BUILDINGS).filter((t) => !BUILDINGS[t].utility)) {
    const seen = new Set();
    for (let i = 0; i < VARIANTS; i++) {
      const d = design(type, i);
      assert.ok(d.parts.length > 0, `${type} #${i} sem partes`);
      for (const part of d.parts) {
        if (part.kind !== 'block') continue;
        const [x0, y0, x1, y1] = part.box;
        const size = BUILDINGS[type].size;
        assert.ok(x0 >= 0 && y0 >= 0 && x1 <= size && y1 <= size && x0 < x1 && y0 < y1, `${type} #${i}: parte fora do lote`);
        // Faixas (sacadas, letreiros) dentro da altura da própria parte.
        for (const band of part.bands) assert.ok(band.at + band.thick <= part.h, `${type} #${i}: faixa acima da parte`);
        // O renderizador só redesenha até MAX_FLOORS acima do lote.
        const rise = part.roof ? part.roof.rise : 0;
        assert.ok(part.lift + part.h + rise < MAX_FLOORS, `${type} #${i}: mais alto que MAX_FLOORS`);
      }
      seen.add(JSON.stringify(d));
    }
    assert.equal(seen.size, VARIANTS, `${type}: projetos repetidos`);
  }
  // O mesmo prédio sempre usa o mesmo projeto.
  assert.equal(designFor({ id: 77, type: 'casa' }), designFor({ id: 77, type: 'casa' }));
});

test('1 cidadão = 1 pessoa: os andares saem da capacidade', async () => {
  const { design, VARIANTS } = await import('../src/render/designs.js');
  assert.equal(floorsOf(BUILDINGS.casa), 1);
  assert.equal(floorsOf(BUILDINGS.escritorios), 4);
  assert.equal(floorsOf(BUILDINGS.usina_solar), 0);
  for (const type of ['casa', 'sobrado', 'apartamentos', 'escritorios']) {
    const n = floorsOf(BUILDINGS[type]);
    for (let i = 0; i < VARIANTS; i++) {
      // Andares ocupados (sem térreo de loja), somando as partes empilhadas
      // da torre principal: nunca menos que o necessário, no máximo um a mais.
      const floors = design(type, i).parts.filter((p) => p.floors && p.windows?.style !== 'shop');
      const stacked = Math.max(...floors.map((p) => floors.filter((q) => q.lift < p.lift + 1e-9).reduce((a, q) => a + q.floors.count, 0)));
      assert.ok(stacked >= n - 1 && stacked <= n + 1, `${type} #${i}: ${stacked} andares, esperado ~${n}`);
    }
  }
});
