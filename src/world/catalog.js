// Catálogo de tipos: tudo que é balanceamento mora aqui, como dados.

export const TERRAIN = { GRASS: 0, WATER: 1, FOREST: 2, SAND: 3 };

export const ZONE = { NONE: 0, RESIDENTIAL: 1, COMMERCIAL: 2, INDUSTRIAL: 3 };

export const ZONE_INFO = {
  [ZONE.RESIDENTIAL]: { name: 'Residencial', color: '#5fbf5a', key: 'r' },
  [ZONE.COMMERCIAL]: { name: 'Comercial', color: '#4f8ff7', key: 'c' },
  [ZONE.INDUSTRIAL]: { name: 'Industrial', color: '#e8b931', key: 'i' },
};

// Prédios que crescem sozinhos nas zonas.
//   level:     nível (1 a 3); prédios 1x1 sobem de nível no lugar
//   size:      lado do terreno ocupado, em tiles (1 ou 2)
//   residents: quantos cidadãos moram
//   jobs:      quantas vagas de emprego
//   style.height: altura de referência em "andares" (1 = altura de meio tile);
//                 a aparência de cada prédio vem dos projetos em
//                 src/render/designs.js (20 por tipo)
//
// Os ids 'casa', 'loja' e 'fabrica' existem desde o formato de save 2 e não
// podem ser renomeados (saves antigos guardam o id do tipo).
export const BUILDINGS = {
  // --- Residencial -----------------------------------------------------------
  casa: {
    name: 'Casa', zone: ZONE.RESIDENTIAL, level: 1, size: 1, residents: 4, jobs: 0,
    style: { height: 0.6 },
  },
  sobrado: {
    name: 'Sobrado', zone: ZONE.RESIDENTIAL, level: 2, size: 1, residents: 8, jobs: 0,
    style: { height: 1.2 },
  },
  apartamentos: {
    name: 'Prédio de apartamentos', zone: ZONE.RESIDENTIAL, level: 3, size: 1, residents: 16, jobs: 0,
    style: { height: 3 },
  },
  condominio: {
    name: 'Condomínio', zone: ZONE.RESIDENTIAL, level: 3, size: 2, residents: 48, jobs: 0,
    style: { height: 5 },
  },

  // --- Comercial -------------------------------------------------------------
  loja: {
    name: 'Loja', zone: ZONE.COMMERCIAL, level: 1, size: 1, residents: 0, jobs: 5,
    style: { height: 0.8 },
  },
  mercado: {
    name: 'Mercado', zone: ZONE.COMMERCIAL, level: 2, size: 1, residents: 0, jobs: 12,
    style: { height: 1.3 },
  },
  escritorios: {
    name: 'Escritórios', zone: ZONE.COMMERCIAL, level: 3, size: 1, residents: 0, jobs: 30,
    style: { height: 4 },
  },
  shopping: {
    name: 'Shopping', zone: ZONE.COMMERCIAL, level: 3, size: 2, residents: 0, jobs: 80,
    style: { height: 1.6 },
  },

  // --- Industrial ------------------------------------------------------------
  fabrica: {
    name: 'Fábrica', zone: ZONE.INDUSTRIAL, level: 1, size: 1, residents: 0, jobs: 10,
    style: { height: 1.1 },
  },
  industria: {
    name: 'Indústria', zone: ZONE.INDUSTRIAL, level: 2, size: 1, residents: 0, jobs: 18,
    style: { height: 1.6 },
  },
  complexo: {
    name: 'Complexo industrial', zone: ZONE.INDUSTRIAL, level: 3, size: 1, residents: 0, jobs: 30,
    style: { height: 2.2 },
  },
  galpao: {
    name: 'Galpão logístico', zone: ZONE.INDUSTRIAL, level: 3, size: 2, residents: 0, jobs: 70,
    style: { height: 1.4 },
  },

  // --- Prédios colocados pelo jogador (serviços públicos e estatais) ----------
  //   utility.power / water: quanto produz por hora (mesma unidade do consumo)
  //   utility.cost: preço para construir; upkeep: manutenção por mês
  //   utility.pollution: peso na poluição em volta (como a indústria)
  //   utility.needsWater: precisa encostar em rio ou lago
  //   utility.income: receita por mês com todas as vagas preenchidas (estatais)
  //   utility.area: área do conhecimento em que atua (gera um pouco de pesquisa)
  //   utility.institute: instituição de pesquisa (transforma verba em pesquisa)
  //   utility.privateResearch: P&D privado dos escritórios em volta
  //   utility.mods: modificadores ativos enquanto o prédio funciona
  //   (a tecnologia que libera cada um está em techs.js)
  usina_carvao: {
    name: 'Usina a carvão', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 20,
    style: { height: 1.4 },
    utility: { power: 3000, water: 0, cost: 12_000, upkeep: 400, pollution: 14, area: 'energia' },
  },
  usina_solar: {
    name: 'Usina solar', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 4,
    style: { height: 0.4 },
    utility: { power: 1200, water: 0, cost: 20_000, upkeep: 150, pollution: 0, area: 'energia' },
  },
  bomba_agua: {
    name: "Bomba d'água", zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    style: { height: 0.8 },
    utility: { power: 0, water: 2500, cost: 6_000, upkeep: 200, pollution: 0, needsWater: true, area: 'saude' },
  },
  poco: {
    name: 'Poço artesiano', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 2,
    style: { height: 1.2 },
    utility: { power: 0, water: 700, cost: 3_500, upkeep: 90, pollution: 0, area: 'saude' },
  },
  usina_gas: {
    name: 'Usina a gás', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 14,
    style: { height: 1.2 },
    utility: { power: 2500, water: 0, cost: 16_000, upkeep: 350, pollution: 7, area: 'energia' },
  },
  hidreletrica: {
    name: 'Hidrelétrica', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 16,
    style: { height: 1.3 },
    utility: { power: 5000, water: 0, cost: 45_000, upkeep: 300, pollution: 0, needsWater: true, area: 'energia' },
  },
  usina_eolica: {
    name: 'Parque eólico', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 3,
    style: { height: 2.5 },
    utility: { power: 900, water: 0, cost: 14_000, upkeep: 120, pollution: 0, area: 'energia' },
  },
  usina_hidrogenio: {
    name: 'Usina a hidrogênio', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 12,
    style: { height: 1.1 },
    utility: { power: 2000, water: 0, cost: 60_000, upkeep: 1_200, pollution: 0, area: 'energia' },
  },
  refinaria: {
    name: 'Refinaria', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 60,
    style: { height: 1.8 },
    utility: { power: 0, water: 0, cost: 40_000, upkeep: 300, pollution: 18, income: 1_500, area: 'quimica' },
  },
  fabrica_cimento: {
    name: 'Fábrica de cimento', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 25,
    style: { height: 1.6 },
    utility: {
      power: 0, water: 0, cost: 15_000, upkeep: 100, pollution: 12, income: 500, area: 'quimica',
      mods: [{ mod: 'buildCost', mul: 0.9 }],
    },
  },
  usina_etanol: {
    name: 'Usina de etanol', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    style: { height: 1.3 },
    utility: { power: 600, water: 0, cost: 20_000, upkeep: 150, pollution: 6, income: 700, area: 'quimica' },
  },
  instituto_pesquisa: {
    name: 'Instituto de pesquisa', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 30,
    style: { height: 1.6 },
    utility: { power: 0, water: 0, cost: 25_000, upkeep: 600, pollution: 0, institute: true },
  },
  parque_tecnologico: {
    name: 'Parque tecnológico', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    style: { height: 2 },
    utility: { power: 0, water: 0, cost: 35_000, upkeep: 400, pollution: 0, privateResearch: ['computacao', 'social'] },
  },
};

export const UTILITY_TYPES = Object.keys(BUILDINGS).filter((id) => BUILDINGS[id].utility);

// Consumo de energia e água por morador ou vaga de emprego, por zona.
export const CONSUMPTION = {
  [ZONE.RESIDENTIAL]: { power: 1, water: 1.2 },
  [ZONE.COMMERCIAL]: { power: 1.5, water: 0.6 },
  [ZONE.INDUSTRIAL]: { power: 2.2, water: 1.4 },
};

// Prédio sem energia ou água: a cada dia perde esta fração dos moradores ou
// funcionários; vazio por ABANDON_AFTER_DAYS dias vira abandonado, e
// abandonado por COLLAPSE_AFTER_DAYS dias desaba (o lote fica livre).
export const UNSERVED_LEAVE_SHARE = 0.25;
export const ABANDON_AFTER_DAYS = 3;
export const COLLAPSE_AFTER_DAYS = 15;

// Tipos 1x1 de cada nível, por zona: é o caminho de crescimento no lugar.
export const LEVELS = {};
// Tipos grandes (2x2) por zona: surgem em lotes vazios bem valorizados.
export const LARGE_BUILDINGS = {};
for (const [id, info] of Object.entries(BUILDINGS)) {
  if (info.utility) continue;
  if (info.size === 1) ((LEVELS[info.zone] ??= {})[info.level] ??= []).push(id);
  else (LARGE_BUILDINGS[info.zone] ??= []).push(id);
}
export const MAX_LEVEL = 3;

// Valor do terreno (0 a 1) necessário para um prédio chegar a cada nível.
// A indústria não liga para valor do terreno, só para demanda e lotação.
export const LAND_VALUE_FOR_LEVEL = {
  [ZONE.RESIDENTIAL]: { 2: 0.45, 3: 0.62 },
  [ZONE.COMMERCIAL]: { 2: 0.45, 3: 0.6 },
  [ZONE.INDUSTRIAL]: { 2: 0, 3: 0 },
};

// Dias mínimos entre uma mudança de nível e a próxima.
export const DAYS_BETWEEN_UPGRADES = 3;

export const COSTS = {
  road: 10,
  zone: 5,
  demolishRoad: 2,
  demolishBuilding: 20,
  clearForest: 5,
};

export const ECONOMY = {
  startMoney: 50_000,
  roadUpkeepPerMonth: 2,
  // Impostos por zona, em % (inteiros). O padrão é neutro para a demanda.
  taxDefault: 9,
  taxMin: 0,
  taxMax: 20,
  // Arrecadação por mês a cada 1% de imposto: por morador empregado
  // (residencial) e por vaga ocupada (comercial e industrial).
  incomePerWorker: 1.2,
  incomePerJob: 0.6,
  // Cada ponto percentual acima do padrão tira esta demanda da zona (e
  // abaixo do padrão, soma).
  taxDemandEffect: { residential: 4, commercial: 3, industrial: 3 },
  // Empréstimos: valores oferecidos, juros ao ano, número de parcelas mensais
  // e quantos podem estar abertos ao mesmo tempo.
  loanOptions: [25_000, 50_000, 100_000],
  loanAnnualRate: 0.1,
  loanMonths: 24,
  maxLoans: 3,
  // Meses guardados no histórico do orçamento.
  historyMonths: 36,
};

export const TAX_ZONES = ['residential', 'commercial', 'industrial'];

// Pesquisa (ver systems/research.js e world/techs.js).
export const RESEARCH = {
  // Quantos anos o mundo avança a cada ano de jogo.
  worldPace: 3,
  // Antes de o mundo chegar a uma tecnologia, ela custa este tanto a mais.
  pioneerMultiplier: 3,
  // Pontos por mês, numa área, de um instituto lotado recebendo fundingRef.
  pointsPerInstitute: 20,
  fundingRef: 1_000,
  // Verba por área: $ por mês, de 0 até fundingMax, em passos de fundingStep.
  fundingMax: 10_000,
  fundingStep: 250,
  // Prédios que atuam numa área pesquisam 15× mais devagar que um instituto.
  fieldShare: 1 / 15,
  // P&D privado: pontos por mês por vaga ocupada de escritório (comércio
  // nível 3) perto de um parque tecnológico.
  privatePerJob: 0.05,
  privateRadius: 10,
};

// Um prédio só cresce se houver estrada a até esta distância (em tiles).
export const ROAD_ACCESS_RADIUS = 2;

// Turnos de trabalho. Cada contratação sorteia um turno pela fração `share`;
// os horários de saída de casa (`leave`) e do trabalho (`back`) são sorteados
// dentro das faixas, em minutos do dia. Em vez de `back`, `hours` dá a
// duração da jornada (a volta é calculada a partir da saída de cada um).
// Turnos que passam da meia-noite voltam para casa no dia seguinte.
const hm = (h, m = 0) => h * 60 + m;
export const SHIFTS = {
  diurno: { name: 'Diurno', share: 0.8, leave: [hm(6, 30), hm(8, 30)], back: [hm(16, 30), hm(18, 30)] },
  noturno: { name: 'Noturno', share: 0.07, leave: [hm(21), hm(23)], back: [hm(6), hm(7, 30)] },
  madrugada: { name: 'Madrugada', share: 0.03, leave: [hm(0), hm(4, 30)], hours: [hm(8), hm(9)] },
  manha: { name: 'Meio período (manhã)', share: 0.05, leave: [hm(7), hm(9)], back: [hm(12), hm(13, 30)] },
  tarde: { name: 'Meio período (tarde)', share: 0.05, leave: [hm(12, 30), hm(14)], back: [hm(17, 30), hm(19, 30)] },
};

// Velocidade dos cidadãos, em tiles por minuto de jogo.
export const CITIZEN_SPEED = 0.5;
