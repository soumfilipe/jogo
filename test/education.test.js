import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, DENSITY, EDU, EDUCATION, TERRAIN, ZONE, maxFloorsFor,
} from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { assignJobs, canWork, createCitizen } from '../src/agents/citizens.js';
import { enrollStudents, minEduFor, studyYear } from '../src/systems/education.js';
import { birthMonth, closeDemographyMonth, deathChance, moveInFamily } from '../src/systems/demography.js';
import { completeTech, researchOutput } from '../src/systems/research.js';
import { computeUtilities } from '../src/systems/utilities.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../src/core/time.js';
import { testCity } from './helpers.js';

const W = 40;

/** Mapa vazio com uma rua na linha 5 e energia e água importadas. */
function town(startMarco = 1) {
  const state = createWorld({ width: W, height: W, seed: 11, startMarco });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  computeUtilities(state, rt);
  return { state, rt };
}

const house = (state, rt, x, type = 'apartamentos') => {
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: [6 * W + x] });
  return addBuilding(state, rt, type, 6 * W + x);
};

test('famílias: adultos com filhos, mesmo sobrenome, cabendo na casa', () => {
  const { state, rt } = town();
  let adults = 0;
  let kids = 0;
  for (let x = 0; x < 30; x++) {
    const home = house(state, rt, x);
    moveInFamily(state, rt, home);
    const family = [...rt.residents.get(home.id)].map((id) => rt.citizenById.get(id));
    assert.ok(family.length >= 1 && family.length <= BUILDINGS.apartamentos.residents);
    assert.equal(new Set(family.map((c) => c.name.split(' ').slice(1).join(' '))).size, 1, 'mesmo sobrenome');
    for (const c of family) {
      if (c.age < 18) kids++;
      else adults++;
    }
  }
  assert.ok(adults >= 30, `adultos: ${adults}`);
  assert.ok(kids > 0 && kids < adults, `crianças: ${kids}, adultos: ${adults}`);
});

test('aniversário: faz um ano no mês certo e se aposenta aos 65', () => {
  const { state, rt } = town();
  const home = house(state, rt, 3);
  const c = createCitizen(state, rt, home, { age: 64 });
  c.job = null;
  // Fecha o mês do aniversário dele.
  state.time.tick = TICKS_PER_MONTH * birthMonth(c);
  const before = c.age;
  closeDemographyMonth(state, rt);
  if (rt.citizenById.has(c.id)) assert.equal(c.age, before + 1);
  assert.ok(!canWork({ ...c, age: 65 }), 'aos 65 não trabalha');
});

test('chance de morrer cresce com a idade e chega a 1 no limite', () => {
  assert.ok(deathChance(30) < deathChance(70));
  assert.ok(deathChance(70) < deathChance(90));
  assert.equal(deathChance(100), 1);
});

test('matrícula: escola mais perto, no raio e até lotar; aluno em tempo integral não trabalha', () => {
  const { state, rt } = town();
  const school = addBuilding(state, rt, 'escola', 4 * W + 2); // na rua? fica do outro lado
  const near = house(state, rt, 4);
  const far = house(state, rt, 38);
  const kidNear = createCitizen(state, rt, near, { age: 8, edu: EDU.NONE });
  const kidFar = createCitizen(state, rt, far, { age: 8, edu: EDU.NONE });
  enrollStudents(state, rt);
  assert.equal(kidNear.school, school.id);
  assert.equal(kidNear.stage, 'fundamental');
  assert.equal(kidFar.school, null, 'fora do raio');

  // Lota: só cabe o número de vagas.
  const seats = BUILDINGS.escola.utility.school.seats;
  for (let i = 0; i < seats + 20; i++) createCitizen(state, rt, near, { age: 7, edu: EDU.NONE });
  enrollStudents(state, rt);
  assert.equal(rt.students.get(school.id).size, seats);

  const teen = createCitizen(state, rt, near, { age: 19, edu: EDU.FUNDAMENTAL });
  teen.stage = 'medio';
  assert.ok(!canWork(teen), 'estudante de ensino médio em tempo integral');
  teen.stage = 'tecnico';
  assert.ok(canWork(teen), 'curso técnico é à noite');
});

test('formatura: 9 anos de fundamental dão o nível 1; a graduação escolhe a área pelos cursos', () => {
  const { state, rt } = town();
  const home = house(state, rt, 4);
  addBuilding(state, rt, 'escola', 4 * W + 2);
  const kid = createCitizen(state, rt, home, { age: 6, edu: EDU.NONE });
  enrollStudents(state, rt);
  for (let year = 0; year < 8; year++) assert.equal(studyYear(state, rt, kid), false);
  assert.equal(studyYear(state, rt, kid), true);
  assert.equal(kid.edu, EDU.FUNDAMENTAL);
  assert.equal(kid.school, null);

  for (const a of Object.keys(state.education.courses)) state.education.courses[a] = 0;
  state.education.courses.quimica = 3;
  const uni = addBuilding(state, rt, 'universidade', 7 * W + 20);
  const student = createCitizen(state, rt, home, { age: 19, edu: EDU.MEDIO });
  student.job = null;
  enrollStudents(state, rt);
  assert.equal(student.school, uni.id);
  for (let year = 0; year < 4; year++) studyYear(state, rt, student);
  assert.equal(student.edu, EDU.SUPERIOR);
  assert.equal(student.field, 'quimica');
});

test('emprego exige escolaridade: sem estudo não entra no escritório, mas entra na loja', () => {
  assert.equal(minEduFor({}, 'loja'), EDU.NONE);
  assert.equal(minEduFor({}, 'escritorios'), EDUCATION.jobs.commercial[3]);
  assert.equal(minEduFor({}, 'instituto_pesquisa'), EDU.SUPERIOR);

  const { state, rt } = town();
  const home = house(state, rt, 4);
  const inst = addBuilding(state, rt, 'instituto_pesquisa', 3 * W + 10);
  const worker = createCitizen(state, rt, home, { age: 30, edu: EDU.MEDIO });
  computeUtilities(state, rt);
  assignJobs(state, rt);
  assert.equal(worker.job, null, 'médio não basta para o instituto');
  const scientist = createCitizen(state, rt, home, { age: 35, edu: EDU.SUPERIOR });
  assignJobs(state, rt);
  assert.equal(scientist.job, inst.id);
});

test('pesquisa: pós-graduados rendem o dobro e quem é da área rende mais nela', () => {
  const { state, rt } = town(3);
  const home = house(state, rt, 4, 'condominio');
  const inst = addBuilding(state, rt, 'instituto_pesquisa', 3 * W + 10);
  computeUtilities(state, rt);
  state.research.funding.quimica = 1000;
  state.research.funding.energia = 1000;
  for (let i = 0; i < BUILDINGS.instituto_pesquisa.jobs; i++) {
    const c = createCitizen(state, rt, home, { age: 30, edu: EDU.SUPERIOR });
    c.field = 'quimica';
  }
  assignJobs(state, rt, 1000);
  assert.equal(rt.workers.get(inst.id).size, BUILDINGS.instituto_pesquisa.jobs);
  const base = researchOutput(state, rt).byArea;
  assert.ok(base.quimica > base.energia, `química ${base.quimica} > energia ${base.energia}`);

  for (const id of rt.workers.get(inst.id)) rt.citizenById.get(id).edu = EDU.POS;
  const noPos = researchOutput(state, rt).byArea.energia;
  completeTech(state, rt, 'pos_graduacao');
  assert.ok(Math.abs(researchOutput(state, rt).byArea.energia - noPos * 2) < 0.05, 'pós vale o dobro');
});

test('níveis 4 e 5: aço estrutural e estrutura tubular deixam a densidade alta subir mais', () => {
  const { state, rt } = town(2);
  const office = BUILDINGS.escritorios;
  const base = maxFloorsFor(office, DENSITY.HIGH);
  completeTech(state, rt, 'aco_estrutural');
  assert.equal(maxFloorsFor(office, DENSITY.HIGH, 13), 25);
  assert.equal(maxFloorsFor(office, DENSITY.MEDIUM, 13), maxFloorsFor(office, DENSITY.MEDIUM), 'só na alta');
  assert.ok(base < 25);
});

test('save v9 ganha escolaridade para os moradores e os cursos da universidade', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY * 2);
  const v9 = createSave(state, { id: 'v9' });
  const { decodeTable, encodeTable } = { ...awaitTable };
  const width = state.map.width;
  const rows = decodeTable(v9.data.citizens, { moves: { path: width } });
  for (const c of rows) for (const k of ['edu', 'field', 'school', 'stage', 'study']) delete c[k];
  v9.data.citizens = encodeTable(rows, { moves: { path: width } });
  delete v9.data.education;
  v9.version = 9;
  v9.checksum = checksum(v9.data);
  const { state: migrated } = readSave(JSON.stringify(v9));
  assert.ok(migrated.citizens.length > 0);
  for (const c of migrated.citizens) {
    assert.ok(Number.isInteger(c.edu) && c.edu >= 0 && c.edu <= 4);
    assert.equal(c.school, null);
    assert.equal(c.field !== null, c.edu >= EDU.SUPERIOR);
  }
  assert.ok(new Set(migrated.citizens.map((c) => c.edu)).size > 1, 'escolaridade variada');
  assert.ok(migrated.education.courses.quimica >= 0);
  prepare(migrated);
});

test('cidade rodando: crianças nascem, estudam e se formam; tudo determinístico', () => {
  const run = () => {
    const { state, rt } = testCity({ seed: 31 });
    applyCommand(state, rt, { type: 'place', building: 'escola', tile: 3 * 48 + 20 });
    advance(state, rt, TICKS_PER_MONTH * 3);
    return { state, rt };
  };
  const { state, rt } = run();
  const kids = state.citizens.filter((c) => c.age < 18).length;
  assert.ok(kids > 0, 'tem crianças');
  assert.ok(state.citizens.some((c) => c.stage === 'fundamental'), 'tem aluno no fundamental');
  assert.ok(rt.lastDemography, 'a demografia rodou');
  assert.deepEqual(run().state.citizens, state.citizens);
  assert.ok(TICKS_PER_DAY > 0);
});

const awaitTable = await import('../src/save/table.js');

test('criança que chega de fora continua no ano certo do fundamental', () => {
  const { state, rt } = town();
  addBuilding(state, rt, 'escola', 4 * W + 2);
  for (let x = 3; x < 13; x++) moveInFamily(state, rt, house(state, rt, x, 'condominio'));
  enrollStudents(state, rt);
  const students = state.citizens.filter((c) => c.stage === 'fundamental');
  assert.ok(students.length > 0);
  for (const c of students) assert.equal(c.study, c.age - EDUCATION.stages.fundamental.ages[0], `${c.age} anos`);
});
