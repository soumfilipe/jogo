// Demografia: famílias que chegam, aniversários, nascimentos e mortes.
//
// Cada cidadão faz aniversário num mês do ano (o resto do id por 12): no
// fechamento desse mês ele faz um ano a mais, soma um ano de curso se estuda
// (education.js), pode ter um filho (adultos de 20 a 40 anos, se a casa tem
// vaga) e pode morrer (a chance cresce depois dos 60). Aos 65 se aposenta.
//
// Quem chega à cidade vem em família: um ou dois adultos e, se couber, filhos.
// A escolaridade dos adultos que chegam depende do marco do mundo (EDUCATION.immigrants).

import { BUILDINGS, DEMOGRAPHY, EDU, EDUCATION } from '../world/catalog.js';
import { AREA_IDS, marcoAt } from '../world/techs.js';
import { removeCitizen, sendHome, setJob, vacancies } from '../world/runtime.js';
import { createCitizen, WORKING_AGE } from '../agents/citizens.js';
import { chance, random, randomInt } from '../core/rng.js';
import { calendar } from '../core/time.js';
import { studyYear } from './education.js';
import { mod } from './mods.js';
import { mortalityFactor } from './wellbeing.js';

/** Mês (1 a 12) do aniversário de um cidadão. */
export const birthMonth = (c) => (c.id % 12) + 1;

/** Escolaridade sorteada para um adulto que chega, pelo marco do mundo. */
export function immigrantEdu(state) {
  const odds = EDUCATION.immigrants[marcoAt(state.research.world).id];
  let roll = random(state.rng);
  for (let edu = 0; edu < odds.length; edu++) {
    roll -= odds[edu];
    if (roll < 0) return edu;
  }
  return EDU.FUNDAMENTAL;
}

/** Escolaridade de uma criança que chega, pela idade (estudou onde morava). */
function childEdu(state, age) {
  if (age >= 18) return immigrantEdu(state);
  return age >= 15 && chance(state.rng, 0.8) ? EDU.FUNDAMENTAL : EDU.NONE;
}

/**
 * Uma família se muda para a casa `home`: adultos e, se couber, filhos.
 * Devolve quantos adultos chegaram (os que procuram emprego).
 */
export function moveInFamily(state, rt, home) {
  const room = vacancies(rt, home);
  if (room <= 0) return 0;
  const adults = Math.min(room, randomInt(state.rng, ...DEMOGRAPHY.familyAdults));
  let kids = 0;
  for (let i = 0; i < DEMOGRAPHY.familyChildren; i++) if (chance(state.rng, DEMOGRAPHY.childChance)) kids++;
  kids = Math.min(room - adults, kids);
  const first = createCitizen(state, rt, home, { age: randomInt(state.rng, 20, 60), edu: immigrantEdu(state) });
  first.field = first.edu >= EDU.SUPERIOR ? AREA_IDS[randomInt(state.rng, 0, AREA_IDS.length - 1)] : null;
  const lastName = first.name.split(' ').slice(1).join(' ');
  for (let i = 1; i < adults; i++) {
    const age = Math.max(18, Math.min(75, first.age + randomInt(state.rng, -6, 6)));
    const c = createCitizen(state, rt, home, { age, edu: immigrantEdu(state), lastName });
    c.field = c.edu >= EDU.SUPERIOR ? AREA_IDS[randomInt(state.rng, 0, AREA_IDS.length - 1)] : null;
  }
  // Filhos só de pais em idade de ter filhos pequenos.
  const maxChildAge = Math.min(17, first.age - 18);
  for (let i = 0; i < kids && maxChildAge >= 0; i++) {
    const age = randomInt(state.rng, 0, maxChildAge);
    const kid = createCitizen(state, rt, home, { age, edu: childEdu(state, age), lastName });
    // Já estudava onde morava: chega no ano certo do fundamental.
    const [from, to] = EDUCATION.stages.fundamental.ages;
    if (kid.edu === EDU.NONE && age > from && age <= to) kid.study = age - from;
  }
  return adults;
}

/**
 * Chance de morrer neste ano, pela idade. `extraLife`: anos a mais de
 * expectativa de vida (tecnologias como a insulina e a vacina da pólio).
 */
export function deathChance(age, extraLife = 0) {
  if (age >= DEMOGRAPHY.maxAge) return 1;
  if (age <= DEMOGRAPHY.childAges) return DEMOGRAPHY.childDeath;
  const from = DEMOGRAPHY.deathFromAge + extraLife;
  if (age < from) return DEMOGRAPHY.baseDeath;
  return Math.min(1, DEMOGRAPHY.deathAt60 * DEMOGRAPHY.deathGrowth ** (age - from));
}

/**
 * Fechamento do mês: aniversários do mês. Devolve { births, deaths, graduates }.
 */
export function closeDemographyMonth(state, rt) {
  // O mês que acabou (o tick do fechamento já é o primeiro do mês seguinte).
  const { month } = calendar(state.time.tick - 1);
  const libraries = state.buildings.filter((b) => BUILDINGS[b.type].utility?.library && rt.workers.get(b.id).size > 0);
  const result = { births: 0, deaths: 0, graduates: 0 };

  for (const c of [...state.citizens]) {
    if (!rt.citizenById.has(c.id) || birthMonth(c) !== month) continue;
    c.age++;
    if (studyYear(state, rt, c, libraries)) result.graduates++;

    // Aposentadoria.
    if (c.age > WORKING_AGE[1] && c.job !== null) {
      if (c.state !== 'casa') sendHome(state, rt, c);
      setJob(rt, c, null);
    }
    // Morte: pela idade, pela saúde da casa (e epidemia) e, nas crianças pequenas, pela vacinação.
    let p = deathChance(c.age, mod(rt, 'lifeExpectancy', 0)) * mortalityFactor(state, rt, c);
    if (c.age <= DEMOGRAPHY.childAges) p *= mod(rt, 'infantMortality');
    if (chance(state.rng, Math.min(1, p))) {
      removeCitizen(state, rt, c.id);
      result.deaths++;
      continue;
    }
    // Nascimento: um filho na mesma casa, se houver vaga.
    const [from, to] = DEMOGRAPHY.birthAges;
    if (c.age >= from && c.age <= to && chance(state.rng, DEMOGRAPHY.birthChance)) {
      const home = rt.buildingById.get(c.home);
      if (home && vacancies(rt, home) > 0) {
        createCitizen(state, rt, home, { age: 0, edu: EDU.NONE, lastName: c.name.split(' ').slice(1).join(' ') });
        result.births++;
      }
    }
  }
  rt.lastDemography = result;
  return result;
}
