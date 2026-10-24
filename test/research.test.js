import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY, RESEARCH, TERRAIN } from '../src/world/catalog.js';
import { START_TECHS, TECHS, TECH_BY_ID } from '../src/world/techs.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import {
  closeResearchMonth, completeAffordable, createResearch, effectiveCost, researchOutput, target,
} from '../src/systems/research.js';
import { mod } from '../src/systems/mods.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { TICKS_PER_MONTH } from '../src/core/time.js';
import { testCity } from './helpers.js';

/** Mapa vazio com uma rua; `fill(b)` lota as vagas de um prédio. */
function lab(startMarco = 1) {
  const state = createWorld({ width: 30, height: 30, seed: 5, startMarco });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 1_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(30, 0, 5, 29, 5) });
  const fill = (b, count = BUILDINGS[b.type].jobs) => {
    const workers = rt.workers.get(b.id);
    for (let i = workers.size; i < count; i++) workers.add(-1 - i - b.id * 1000);
  };
  return { state, rt, fill };
}

test('nova cidade: só as tecnologias iniciais; marcos depois trazem o passado pronto', () => {
  assert.deepEqual(new Set(createResearch(1).done), new Set(START_TECHS));
  const r3 = createResearch(3);
  assert.equal(r3.world, 1945);
  for (const t of TECHS) assert.equal(r3.done.includes(t.id), t.start || t.order < 1945, t.id);
});

test('instituto lotado com verba de referência rende pointsPerInstitute na área', () => {
  const { state, rt, fill } = lab();
  const inst = addBuilding(state, rt, 'instituto_pesquisa', 6 * 30 + 2);
  applyCommand(state, rt, { type: 'funding', area: 'quimica', amount: RESEARCH.fundingRef });
  assert.equal(researchOutput(state, rt).byArea.quimica, 0, 'sem pesquisadores, nada');

  fill(inst);
  const out = researchOutput(state, rt);
  assert.equal(out.byArea.quimica, RESEARCH.pointsPerInstitute);
  assert.equal(out.byArea.energia, 0, 'área sem verba não pesquisa no instituto');
  assert.equal(out.fundingCost, RESEARCH.fundingRef);

  // Retorno decrescente: 4× a verba rende 2× os pontos.
  applyCommand(state, rt, { type: 'funding', area: 'quimica', amount: RESEARCH.fundingRef * 4 });
  assert.equal(researchOutput(state, rt).byArea.quimica, RESEARCH.pointsPerInstitute * 2);
  assert.equal(monthlyBudget(state, rt).expenses.research, RESEARCH.fundingRef * 4);
});

test('sem instituto a verba não rende nem é cobrada; prédios da área pesquisam 15× mais devagar', () => {
  const { state, rt, fill } = lab();
  applyCommand(state, rt, { type: 'funding', area: 'energia', amount: 5_000 });
  const plant = addBuilding(state, rt, 'usina_carvao', 6 * 30 + 2);
  fill(plant);
  const out = researchOutput(state, rt);
  assert.equal(out.fundingCost, 0);
  assert.equal(monthlyBudget(state, rt).expenses.research, 0);
  assert.ok(Math.abs(out.byArea.energia - RESEARCH.pointsPerInstitute / 15) < 0.01, `energia ${out.byArea.energia}`);
});

test('pontos viram tecnologias: o alvo é a mais barata disponível, ou a prioridade', () => {
  const { state, rt } = lab();
  // Empate de custo: vence a mais antiga e, depois, a ordem alfabética.
  assert.equal(target(state, rt, 'quimica').id, 'craqueamento');
  assert.match(applyCommand(state, rt, { type: 'priority', area: 'quimica', tech: 'asfalto' }).reason, /ainda não/);
  assert.ok(applyCommand(state, rt, { type: 'priority', area: 'quimica', tech: 'haber_bosch' }).ok);
  assert.equal(target(state, rt, 'quimica').id, 'haber_bosch');

  const upkeep = mod(rt, 'roadUpkeep', ECONOMY.roadUpkeepPerMonth);
  state.research.points.quimica = 2_000;
  state.research.points.engenharia = 2_000;
  state.research.world = 1925; // o mundo já conhece o asfalto
  assert.ok(applyCommand(state, rt, { type: 'priority', area: 'quimica', tech: 'craqueamento' }).ok);
  const done = completeAffordable(state, rt);
  assert.equal(done[0], 'craqueamento', 'a prioridade vem primeiro');
  assert.ok(done.includes('asfalto'), done.join());
  assert.equal(state.research.priority.quimica, null, 'prioridade concluída volta ao automático');
  assert.ok(mod(rt, 'roadUpkeep', ECONOMY.roadUpkeepPerMonth) < upkeep, 'asfalto barateia as ruas');
  assert.ok(rt.unlocked.has('refinaria'));
});

test('antes de o mundo chegar, a tecnologia custa 3× (pioneira)', () => {
  const { state } = lab();
  const asfalto = TECH_BY_ID.get('asfalto');
  assert.equal(effectiveCost(state, asfalto).quimica, asfalto.cost.quimica * RESEARCH.pioneerMultiplier);
  state.research.world = asfalto.order;
  assert.equal(effectiveCost(state, asfalto).quimica, asfalto.cost.quimica);
});

test('o relógio do mundo anda worldPace anos por ano de jogo', () => {
  const { state, rt } = lab();
  for (let i = 0; i < 12; i++) closeResearchMonth(state, rt);
  assert.ok(Math.abs(state.research.world - (1910 + RESEARCH.worldPace)) < 1e-9);
});

test('tecnologias de etapas futuras não podem ser pesquisadas', () => {
  const { state, rt } = lab(3);
  const future = TECHS.find((t) => !t.ready && !state.research.done.includes(t.id) && t.requires.every((r) => rt.techDone.has(r)));
  assert.ok(future);
  assert.match(applyCommand(state, rt, { type: 'priority', area: future.area, tech: future.id }).reason, /ainda não/);
});

test('cidade rodando com instituto e verba pesquisa de verdade (e de forma determinística)', () => {
  const run = () => {
    const { state, rt } = testCity({ seed: 21 });
    assert.ok(applyCommand(state, rt, { type: 'place', building: 'instituto_pesquisa', tile: 3 * 48 + 2 }).ok);
    applyCommand(state, rt, { type: 'funding', area: 'quimica', amount: 4_000 });
    advance(state, rt, TICKS_PER_MONTH * 2);
    return state;
  };
  const a = run();
  assert.ok(a.research.lastMonth.quimica > 0, 'química ganhou pontos');
  assert.ok(a.research.done.length > START_TECHS.length || a.research.points.quimica > 0);
  assert.deepEqual(run().research, a.research);
});

test('save v4 ganha a pesquisa do primeiro marco', () => {
  const { state } = testCity();
  const v4 = createSave(state, { id: 'v4' });
  delete v4.data.research;
  v4.version = 4;
  v4.checksum = checksum(v4.data);
  const { state: migrated } = readSave(JSON.stringify(v4));
  assert.deepEqual(new Set(migrated.research.done), new Set(START_TECHS));
  assert.equal(migrated.research.world, 1910);
  const rt = prepare(migrated);
  assert.ok(rt.unlocked.has('usina_carvao'));
  assert.ok(!rt.unlocked.has('usina_solar'));
});

test('salvar e carregar mantém a pesquisa e os modificadores', () => {
  const { state, rt } = lab();
  state.research.points.quimica = 5_000;
  state.research.world = 1930;
  completeAffordable(state, rt);
  const { state: loaded } = readSave(JSON.stringify(createSave(state, { id: 'pesquisa' })));
  assert.deepEqual(loaded.research, state.research);
  const rt2 = prepare(loaded);
  assert.deepEqual([...rt2.mods.entries()], [...rt.mods.entries()]);
});
