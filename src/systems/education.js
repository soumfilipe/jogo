// Escolaridade: escolas com vagas e raio, matrícula dos alunos, formatura e
// a escolaridade exigida pelos empregos.
//
// Cada cidadão tem (no estado e no save):
//   edu:    0 a 4 (EDU no catálogo): o maior nível que concluiu
//   field:  área do conhecimento da graduação (null sem curso superior)
//   school: id da escola em que estuda (null se não estuda)
//   stage:  etapa que cursa ('creche', 'fundamental', 'medio', 'tecnico',
//           'superior', 'pos'; null se não estuda)
//   study:  anos já cursados na etapa (fração: bibliotecas e tecnologias aceleram)
//
// Uma vez por dia, quem está em idade de estudar e não estuda procura a escola
// mais perto da casa, dentro do raio dela, com vaga na etapa certa. No
// aniversário (ver demography.js) o aluno soma um ano de curso; ao completar
// os anos da etapa, se forma e sai da escola.
//
// Estudante em tempo integral (fundamental, médio, graduação, pós) não
// trabalha: a força de trabalho da cidade diminui enquanto ela estuda.

import { BUILDINGS, EDU, EDUCATION, ZONE } from '../world/catalog.js';
import { AREA_IDS } from '../world/techs.js';
import { enroll, leaveSchool, sendHome, setJob } from '../world/runtime.js';
import { random } from '../core/rng.js';
import { mod, ZONE_KEY } from './mods.js';

const STAGES = EDUCATION.stages;

/** A etapa da escola de um tipo de prédio ('pos' é dado pela universidade, como 'superior'). */
const schoolStage = (type) => BUILDINGS[type].utility?.school?.stage ?? null;
const offers = (type, stage) => {
  const own = schoolStage(type);
  return own === stage || (stage === 'pos' && own === 'superior') || (stage === 'eja' && own === 'fundamental');
};

/** Vagas de alunos de uma escola, com os modificadores. */
export function seatsOf(rt, type) {
  const school = BUILDINGS[type].utility?.school;
  if (!school) return 0;
  return Math.round(school.seats * mod(rt, 'schoolSeats'));
}

/** Raio (em tiles) que a escola atende. */
export function radiusOf(rt, type) {
  const school = BUILDINGS[type].utility.school;
  return Math.round(school.radius * mod(rt, `radius.${school.stage}`));
}

/** Estudante em tempo integral não trabalha. */
export function isFullTimeStudent(citizen) {
  return Boolean(citizen.stage && STAGES[citizen.stage].full);
}

/** Escolaridade mínima para trabalhar num tipo de prédio. */
export function minEduFor(rt, type) {
  const info = BUILDINGS[type];
  const key = ZONE_KEY[info.zone];
  let need;
  if (info.utility) need = EDUCATION.jobs.buildings[type] ?? EDU.NONE;
  else need = (EDUCATION.jobs[key]?.[info.level] ?? EDU.NONE)
    + mod(rt, `jobEdu.${key}`, 0) + mod(rt, `jobEdu.${key}.${info.level}`, 0);
  return Math.max(EDU.NONE, Math.min(EDU.POS, need));
}

/**
 * Etapas que o cidadão pode cursar agora, na ordem de preferência (ex.: o
 * médio e, sem vaga nele, o técnico). Vazio se não é hora de estudar.
 */
export function wantedStages(rt, c) {
  const inAge = (stage) => c.age >= STAGES[stage].ages[0] && c.age <= STAGES[stage].ages[1];
  const out = [];
  const edu = c.edu ?? EDU.NONE;
  if (inAge('creche')) out.push('creche');
  if (edu < EDU.FUNDAMENTAL && inAge('fundamental')) out.push('fundamental');
  // Tempo integral só para quem não trabalha (ou já está matriculado nela).
  const free = (stage) => c.job === null || c.stage === stage
    || (stage === 'superior' && mod(rt, 'universityForWorkers', 0) > 0);
  if (edu === EDU.FUNDAMENTAL && inAge('medio') && free('medio')) out.push('medio');
  if (edu === EDU.FUNDAMENTAL && inAge('tecnico')) out.push('tecnico');
  if (edu === EDU.NONE && inAge('eja') && mod(rt, 'eja', 0) > 0) out.push('eja');
  if (edu === EDU.MEDIO && inAge('superior') && free('superior')) out.push('superior');
  if (edu === EDU.SUPERIOR && inAge('pos') && free('pos') && mod(rt, 'posGraduacao', 0) > 0) out.push('pos');
  return out;
}

/**
 * Matrícula do dia: cada um que deveria estudar e não estuda procura a escola
 * mais perto de casa, no raio dela, com vaga na etapa certa. Quem saiu da
 * idade da etapa sem se formar desiste. Também monta o mapa de escolas.
 */
export function enrollStudents(state, rt) {
  const width = state.map.width;
  const schools = state.buildings.filter((b) => schoolStage(b.type));
  const free = new Map(schools.map((s) => [s.id, seatsOf(rt, s.type) - rt.students.get(s.id).size]));

  for (const c of state.citizens) {
    const wants = wantedStages(rt, c);
    if (c.stage && !wants.includes(c.stage)) {
      // Saiu da idade (ou da etapa) sem terminar: desiste. Da creche, leva o adiantamento.
      if (c.stage === 'creche') c.headStart = true;
      if (c.school != null) free.set(c.school, free.get(c.school) + 1);
      leaveSchool(rt, c);
      c.study = 0;
    }
    if (wants.length === 0 || c.stage) continue;
    const home = rt.buildingById.get(c.home);
    const hx = home.tile % width;
    const hy = Math.floor(home.tile / width);
    let best = null;
    let want = null;
    for (const stage of wants) {
      let bestDist = Infinity;
      for (const s of schools) {
        if (!offers(s.type, stage) || free.get(s.id) <= 0) continue;
        const d = Math.abs((s.tile % width) - hx) + Math.abs(Math.floor(s.tile / width) - hy);
        // A TV educativa leva a EJA para casas longe da escola.
        const radius = radiusOf(rt, s.type) * (stage === 'eja' ? mod(rt, 'radius.eja') : 1);
        if (d <= radius && d < bestDist) {
          best = s;
          bestDist = d;
        }
      }
      if (best) {
        want = stage;
        break;
      }
    }
    if (!best) continue;
    // Tempo integral: quem trabalhava larga o emprego para estudar.
    if (STAGES[want].full && c.job !== null) {
      if (c.state !== 'casa') sendHome(state, rt, c);
      setJob(rt, c, null);
    }
    enroll(rt, c, best.id, want);
    // Quem já tinha anos de estudo (chegou de fora) continua de onde parou; quem
    // passou pela creche ganha o adiantamento.
    c.study = want === 'fundamental' ? Math.max(c.study || 0, c.headStart ? EDUCATION.crecheHeadStart : 0) : 0;
    delete c.headStart;
    free.set(best.id, free.get(best.id) - 1);
  }
  fillSchoolMap(state, rt, schools, free);
}

/**
 * Um ano de curso (no aniversário do aluno). Devolve true se ele se formou.
 * `libraries`: bibliotecas da cidade (para o bônus de quem mora perto).
 */
export function studyYear(state, rt, c, libraries = []) {
  if (!c.stage) return false;
  const stage = STAGES[c.stage];
  if (!stage.years) return false; // creche: só o adiantamento
  let rate = mod(rt, 'study.all') * mod(rt, `study.${c.stage}`);
  const home = rt.buildingById.get(c.home);
  if (home && libraries.some((lib) => near(state, lib, home.tile, BUILDINGS[lib.type].utility.library.radius))) {
    rate *= 1 + Math.max(...libraries.map((lib) => BUILDINGS[lib.type].utility.library.bonus));
  }
  c.study = (c.study || 0) + rate;
  if (c.study + 1e-9 < stage.years) return false;
  c.edu = Math.max(c.edu, stage.gives);
  if (stage.gives === EDU.SUPERIOR) c.field = pickField(state);
  leaveSchool(rt, c);
  c.study = 0;
  return true;
}

function near(state, b, tile, radius) {
  const width = state.map.width;
  return Math.abs((b.tile % width) - (tile % width)) + Math.abs(Math.floor(b.tile / width) - Math.floor(tile / width)) <= radius;
}

/** Área da graduação, pela distribuição de cursos da universidade. */
export function pickField(state) {
  const courses = state.education.courses;
  const total = AREA_IDS.reduce((s, a) => s + courses[a], 0);
  if (total <= 0) return AREA_IDS[Math.floor(random(state.rng) * AREA_IDS.length)];
  let roll = random(state.rng) * total;
  for (const a of AREA_IDS) {
    roll -= courses[a];
    if (roll < 0) return a;
  }
  return AREA_IDS.at(-1);
}

/** Estado inicial: todas as áreas com o mesmo peso nos cursos da universidade. */
export function createEducation() {
  return { courses: Object.fromEntries(AREA_IDS.map((a) => [a, 1])) };
}

export const COURSE_MAX = 5;

/** Peso de uma área nos cursos da universidade (0 a COURSE_MAX). */
export function setCourse(state, area, weight) {
  if (!AREA_IDS.includes(area)) return { ok: false, reason: `Área desconhecida: ${area}` };
  const value = Math.round(Number(weight));
  if (!Number.isFinite(value) || value < 0 || value > COURSE_MAX) {
    return { ok: false, reason: `O peso vai de 0 a ${COURSE_MAX}.` };
  }
  state.education.courses[area] = value;
  return { ok: true, cost: 0, count: 1 };
}

/** Quantos cidadãos em cada nível de escolaridade e estudando em cada etapa. */
export function educationStats(state) {
  const levels = [0, 0, 0, 0, 0];
  const studying = {};
  let adults = 0;
  for (const c of state.citizens) {
    if (c.age >= 18) {
      adults++;
      levels[c.edu ?? 0]++;
    }
    if (c.stage) studying[c.stage] = (studying[c.stage] || 0) + 1;
  }
  return { levels, adults, studying };
}

/** Refaz o mapa de escolas sem matricular ninguém (ao carregar, ao construir). */
export function refreshSchoolMap(state, rt) {
  const schools = state.buildings.filter((b) => schoolStage(b.type));
  const free = new Map(schools.map((s) => [s.id, seatsOf(rt, s.type) - rt.students.get(s.id).size]));
  fillSchoolMap(state, rt, schools, free);
}

// Mapa de escolas (ensino fundamental, que toda criança precisa): tiles de
// casas atendidas por escola com vaga (1), atendidas mas sem vaga (0,5) e sem
// escola no raio (0). O resto do mapa fica com a cor normal (NaN).
function fillSchoolMap(state, rt, schools, free) {
  const { width, zone } = state.map;
  let map = rt.schoolMap;
  if (!map || map.length !== zone.length) map = rt.schoolMap = new Float32Array(zone.length);
  map.fill(NaN);
  const fundamental = schools.filter((s) => schoolStage(s.type) === 'fundamental');
  for (let t = 0; t < zone.length; t++) {
    if (zone[t] !== ZONE.RESIDENTIAL) continue;
    let v = 0;
    for (const s of fundamental) {
      if (!near(state, s, t, radiusOf(rt, s.type))) continue;
      v = Math.max(v, free.get(s.id) > 0 ? 1 : 0.5);
      if (v === 1) break;
    }
    map[t] = v;
  }
  for (const s of schools) for (let dy = 0; dy < BUILDINGS[s.type].size; dy++) {
    for (let dx = 0; dx < BUILDINGS[s.type].size; dx++) map[s.tile + dy * width + dx] = 1;
  }
}
