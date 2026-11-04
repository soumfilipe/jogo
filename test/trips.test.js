import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERRAIN } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { applyCommand, lineTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { addCitizen } from '../src/world/runtime.js';
import { finishArrivals, startTrip, travelPosition } from '../src/agents/trips.js';
import { countOccupancy } from '../src/systems/traffic.js';
import { checksum, createSave, readSave } from '../src/save/format.js';
import { encodeTable, decodeTable } from '../src/save/table.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

// Viagens com horário de chegada (agents/trips.js).

const W = 60;

/** Uma rua reta na linha 5 e um viajante "solto" (sem casa) por chamada. */
function street() {
  const state = createWorld({ width: W, height: W, seed: 3 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.map.elevation.fill(0);
  state.economy.money = 1_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  const path = lineTiles(W, 0, 5, 50, 5);
  const traveler = () => {
    // Sem casa no índice: o teste só usa a viagem.
    rt.residents.set(-1, new Set());
    const c = addCitizen(state, rt, {
      id: 0, name: 'Teste', age: 30, home: -1, job: null, company: null, departWork: null, departHome: null,
      state: 'viajando', dest: 'casa', x: 0.5, y: 5.5, path: [...path], step: 0, mode: null, left: null, arrive: null,
    });
    rt.movers.delete(c.id);
    startTrip(state, rt, c);
    return c;
  };
  return { state, rt, traveler };
}

test('viagem sai com horário de chegada; na rua vazia, no tempo livre', () => {
  const { state, rt, traveler } = street();
  const c = traveler();
  // 50 tiles a 0,5 tile por minuto: 100 minutos, contando o da saída.
  assert.equal(c.left, state.time.tick);
  assert.equal(c.arrive - c.left + 1, 100);
  assert.ok(rt.movers.has(c.id));

  // A posição anda pelo caminho e chega ao fim.
  const before = travelPosition(state, rt, c);
  state.time.tick += 40;
  const mid = travelPosition(state, rt, c);
  assert.ok(mid.x > before.x && Math.abs(mid.x - (0.5 + 41 * 0.5)) < 1e-6, `x = ${mid.x}`);
  state.time.tick = c.arrive;
  finishArrivals(state, rt);
  assert.equal(c.state, 'casa');
  assert.equal(c.x, 50.5);
  assert.equal(rt.movers.has(c.id), false);
});

test('engarrafamento por fluxo: quem sai depois de muitos carros chega mais tarde', () => {
  const { state, rt, traveler } = street();
  const first = traveler();
  for (let i = 0; i < 150; i++) traveler();
  const last = traveler();
  assert.ok(last.arrive > first.arrive + 20, `${first.arrive} → ${last.arrive}`);

  // Os carros aparecem na ocupação das ruas (mapa de trânsito, poluição).
  countOccupancy(state, rt);
  assert.ok(rt.occupancy[5 * W + 5] > 3, `ocupação ${rt.occupancy[5 * W + 5]}`);

  // Quem chega sai da carga: a rua esvazia.
  const end = Math.max(...state.citizens.map((c) => c.arrive ?? 0));
  for (let t = first.left; t <= end; t++) {
    state.time.tick = t;
    finishArrivals(state, rt);
  }
  assert.equal(rt.movers.size, 0);
  assert.ok(rt.trips.load.every((v) => v === 0), 'carga zerada');
});

test('save de antes das viagens com horário: quem estava na rua segue de onde estava', () => {
  const { state, rt } = testCity({ seed: 21 });
  advance(state, rt, TICKS_PER_DAY + 8 * 60 - state.time.tick % TICKS_PER_DAY);
  const save = createSave(state, { id: 'antigo' });
  // Como num save antigo: sem left/arrive e com a posição no meio do caminho.
  const citizens = decodeTable(save.data.citizens, { moves: { path: state.map.width } });
  let moving = 0;
  for (const c of citizens) {
    if (c.state === 'viajando') {
      moving++;
      const at = travelPosition(state, rt, c);
      Object.assign(c, at);
    }
    delete c.left;
    delete c.arrive;
  }
  assert.ok(moving > 0, 'tem gente na rua');
  save.data.citizens = encodeTable(citizens, { moves: { path: state.map.width } });
  save.checksum = checksum(save.data);

  const { state: old } = readSave(JSON.stringify(save));
  const oldRt = prepare(old);
  const travelers = old.citizens.filter((c) => c.state === 'viajando');
  assert.equal(travelers.length, moving);
  assert.ok(travelers.every((c) => c.left === old.time.tick + 1 && c.arrive >= c.left));
  advance(old, oldRt, TICKS_PER_DAY);
});
