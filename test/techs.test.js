import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_IDS, BUILDING_TECH, EFFECTS, IMPLEMENTED_PHASE, MARCOS, START_TECHS, SYSTEMS, TECHS, TECH_BY_ID, marcoAt,
} from '../src/world/techs.js';
import { BUILDINGS } from '../src/world/catalog.js';

test('árvore: ids únicos e requisitos que existem e vêm antes', () => {
  assert.equal(TECH_BY_ID.size, TECHS.length);
  for (const t of TECHS) {
    assert.ok(AREA_IDS.includes(t.area), `${t.id}: área ${t.area}`);
    for (const a of t.extraAreas) assert.ok(AREA_IDS.includes(a), `${t.id}: área secundária ${a}`);
    for (const r of t.requires) {
      const req = TECH_BY_ID.get(r);
      assert.ok(req, `${t.id} requer ${r}, que não existe`);
      assert.ok(req.order <= t.order, `${t.id} requer ${r}, que vem depois`);
    }
    for (const s of t.systems) assert.ok(SYSTEMS[s], `${t.id}: sistema ${s}`);
  }
});

test('árvore: cada área tem entre 18 e 22 tecnologias', () => {
  for (const area of AREA_IDS) {
    const n = TECHS.filter((t) => t.area === area).length;
    assert.ok(n >= 18 && n <= 22, `${area}: ${n}`);
  }
});

test('árvore: nenhuma tecnologia solta (fora as iniciais)', () => {
  const needed = new Set(TECHS.flatMap((t) => t.requires));
  for (const t of TECHS) {
    if (t.start) continue;
    assert.ok(t.requires.length > 0 || needed.has(t.id), `${t.id} não se liga a nada`);
  }
});

test('marcos: cada tecnologia cai num dos seis', () => {
  assert.equal(MARCOS.length, 6);
  assert.equal(marcoAt(1910).id, 1);
  assert.equal(marcoAt(1944).id, 2);
  assert.equal(marcoAt(1945).id, 3);
  assert.equal(marcoAt(2026).id, 6);
  for (const t of TECHS) assert.equal(t.marco, marcoAt(t.order).id);
});

test('efeitos: apontam para tecnologias e prédios que existem', () => {
  for (const [id, effects] of Object.entries(EFFECTS)) {
    assert.ok(TECH_BY_ID.has(id), `efeito de ${id}, que não existe`);
    for (const e of effects) {
      const kinds = ['mod', 'unlock', 'level', 'loan'].filter((k) => k in e);
      assert.equal(kinds.length, 1, `${id}: efeito ${JSON.stringify(e)}`);
      if (e.mod) assert.ok(('mul' in e) !== ('add' in e), `${id}: ${e.mod} precisa de mul ou add`);
      if (e.unlock) assert.ok(BUILDINGS[e.unlock]?.utility, `${id} libera ${e.unlock}, que não é prédio do jogador`);
    }
  }
  for (const [type, tech] of Object.entries(BUILDING_TECH)) assert.ok(TECH_BY_ID.has(tech), type);
  for (const id of START_TECHS) assert.ok(TECH_BY_ID.get(id).start);
});

test('só pode ser pesquisado o que já tem efeito nesta versão', () => {
  const ready = TECHS.filter((t) => t.ready);
  assert.ok(ready.length >= 50, `prontas: ${ready.length}`);
  for (const t of ready) {
    assert.ok(t.phase <= IMPLEMENTED_PHASE, `${t.id} é da etapa ${t.phase}`);
    assert.ok(t.start || t.kind === 'Base' || t.effects.length > 0, `${t.id} sem efeito`);
  }
});
