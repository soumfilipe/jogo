import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, EDU, SANITATION, TERRAIN, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { createCitizen } from '../src/agents/citizens.js';
import { collectWaste, computeWaste, isCollected, wasteOf } from '../src/systems/waste.js';
import { computeSanitation } from '../src/systems/sanitation.js';
import { computeCoverage } from '../src/systems/services.js';
import { computeWellbeing } from '../src/systems/wellbeing.js';
import { utilityOutput } from '../src/systems/mods.js';
import { createSave, readSave } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

const W = 60;

function town() {
  const state = createWorld({ width: W, height: W, seed: 4 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

/** Prédio do jogador já com funcionários. */
function staffed(state, rt, type, tile) {
  const b = addBuilding(state, rt, type, tile);
  rt.workers.get(b.id).add(-1 - b.id * 1000);
  return b;
}

function home(state, rt, x, people = 4) {
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: [6 * W + x] });
  const b = addBuilding(state, rt, 'apartamentos', 6 * W + x);
  for (let i = 0; i < people; i++) createCitizen(state, rt, b, { age: 30, edu: EDU.FUNDAMENTAL });
  return b;
}

test('lixão recolhe no raio até encher; o aterro vem da pesquisa', () => {
  const { state, rt } = town();
  const near = home(state, rt, 10);
  const far = home(state, rt, 55);
  assert.equal(isCollected(computeWaste(state, rt), near), false, 'sem lixão, o lixo acumula');
  assert.match(applyCommand(state, rt, { type: 'place', building: 'aterro', tile: 3 * W + 8 }).reason, /Aterro/);
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'lixao', tile: 3 * W + 8 }).ok, 'lixão começa liberado');
  const dump = rt.buildingById.get(rt.buildingAt[3 * W + 8]);
  rt.workers.get(dump.id).add(-1);
  let waste = computeWaste(state, rt);
  assert.equal(isCollected(waste, near), true);
  assert.equal(isCollected(waste, far), false, 'fora do raio');

  collectWaste(state, rt, waste);
  assert.ok(Math.abs(dump.fill - wasteOf(rt, near)) < 0.01);
  dump.fill = BUILDINGS.lixao.utility.waste.capacity;
  waste = computeWaste(state, rt);
  assert.equal(isCollected(waste, near), false, 'cheio, para de recolher');
});

test('reciclagem e coleta seletiva diminuem o lixo', () => {
  const { state, rt } = town();
  const h = home(state, rt, 10, 16);
  staffed(state, rt, 'lixao', 3 * W + 30);
  const base = computeWaste(state, rt).status.get(h.id).waste;
  staffed(state, rt, 'centro_reciclagem', 4 * W + 11);
  const recycled = computeWaste(state, rt).status.get(h.id).waste;
  assert.ok(Math.abs(recycled - base * BUILDINGS.centro_reciclagem.utility.recycle.share) < 1e-9);
  completeTech(state, rt, 'coleta_seletiva');
  assert.ok(applyCommand(state, rt, { type: 'policy', id: 'coleta_seletiva', on: true }).ok);
  assert.ok(computeWaste(state, rt).status.get(h.id).waste < recycled);
});

test('casa sem coleta de lixo tem menos saúde e satisfação', () => {
  const { state, rt } = town();
  const near = home(state, rt, 10);
  const far = home(state, rt, 55);
  staffed(state, rt, 'lixao', 3 * W + 8);
  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  const a = rt.wellbeing.get(near.id);
  const b = rt.wellbeing.get(far.id);
  assert.ok(a.satisfaction > b.satisfaction && a.health > b.health);
});

test('esgoto: sem tratamento polui o rio e adoece quem bebe água de bomba; a estação resolve', () => {
  const { state, rt } = town();
  state.utilities.imported = { power: true, water: false };
  home(state, rt, 10, 40);
  // Água de poço: rio poluído, mas ninguém adoece.
  staffed(state, rt, 'poco', 4 * W + 20);
  let s = computeSanitation(state, rt);
  assert.equal(s.river, 1);
  assert.equal(s.healthLoss, 0);
  // Bomba no rio: adoece.
  staffed(state, rt, 'bomba_agua', 4 * W + 22);
  s = computeSanitation(state, rt);
  assert.ok(s.pumpShare > 0.5);
  assert.ok(Math.abs(s.healthLoss - SANITATION.health * s.pumpShare) < 1e-9);
  completeTech(state, rt, 'biodegradavel');
  assert.ok(Math.abs(computeSanitation(state, rt).river - 0.7) < 1e-9);
  // Estação de tratamento com funcionários trata tudo.
  completeTech(state, rt, 'esgoto');
  staffed(state, rt, 'estacao_esgoto', 2 * W + 30);
  s = computeSanitation(state, rt);
  assert.equal(s.treated, 1);
  assert.equal(s.healthLoss, 0);
});

test('biogás e reúso: produção que só existe depois da pesquisa', () => {
  const { state, rt } = town();
  assert.equal(utilityOutput(rt, 'aterro', 'power'), 0);
  assert.equal(utilityOutput(rt, 'estacao_esgoto', 'water'), 0);
  completeTech(state, rt, 'biogas');
  completeTech(state, rt, 'reuso_agua');
  assert.ok(utilityOutput(rt, 'aterro', 'power') > 0);
  assert.ok(utilityOutput(rt, 'estacao_esgoto', 'water') > 0);
});

test('cidade com lixão: o lixo acumulado é salvo e salvar no meio do dia não muda nada', () => {
  const build = () => {
    const { state, rt } = testCity({ seed: 51 });
    applyCommand(state, rt, { type: 'bulldoze', tiles: [8 * 48 + 18, 8 * 48 + 19, 9 * 48 + 18, 9 * 48 + 19] });
    assert.ok(applyCommand(state, rt, { type: 'place', building: 'lixao', tile: 8 * 48 + 18 }).ok);
    return { state, rt };
  };
  const a = build();
  advance(a.state, a.rt, TICKS_PER_DAY * 10 + 600);
  const dump = a.state.buildings.find((b) => b.type === 'lixao');
  assert.ok(dump.fill > 0, 'o lixão recebeu lixo');
  const { state: loaded } = readSave(JSON.stringify(createSave(a.state, { id: 'meio-do-dia' })));
  assert.equal(loaded.buildings.find((b) => b.type === 'lixao').fill, dump.fill);
  const rtLoaded = prepare(loaded);
  advance(a.state, a.rt, TICKS_PER_DAY * 5);
  advance(loaded, rtLoaded, TICKS_PER_DAY * 5);
  assert.deepEqual(loaded.buildings, a.state.buildings);
  assert.deepEqual(loaded.citizens, a.state.citizens);
  assert.deepEqual(loaded.wellbeing, a.state.wellbeing);
});
