// Catálogo de tipos: tudo que é balanceamento mora aqui, como dados.

export const TERRAIN = { GRASS: 0, WATER: 1, FOREST: 2, SAND: 3 };

export const ZONE = { NONE: 0, RESIDENTIAL: 1, COMMERCIAL: 2, INDUSTRIAL: 3 };

// Densidade de uma zona residencial ou comercial, escolhida pelo jogador ao
// zonear (state.map.density, por tile). Limita até onde os prédios crescem:
//   maxLevel:  nível máximo (baixa fica em casas, sobrados, lojas e mercados,
//              e não recebe prédios grandes)
//   maxFloors: andares máximos dos prédios que crescem andar por andar
// A indústria não usa densidade.
export const DENSITY = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export const DENSITY_INFO = {
  [DENSITY.LOW]: { name: 'Baixa', maxLevel: 2, maxFloors: 2 },
  [DENSITY.MEDIUM]: { name: 'Média', maxLevel: 3, maxFloors: 6 },
  [DENSITY.HIGH]: { name: 'Alta', maxLevel: 3, maxFloors: 12 },
};

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
//   perFloor:  quantas pessoas cabem num andar; o número de andares sai da
//              capacidade, 1 pessoa = 1 cidadão (ver floorsOf)
//   tall:      cresce andar por andar depois de pronto, até o limite da
//              densidade da zona (residents/jobs são a capacidade inicial;
//              cada andar a mais soma perFloor, ver capacityOf). A aparência
//              de cada prédio vem dos projetos em src/render/designs.js (20
//              por tipo)
//
// Os ids 'casa', 'loja' e 'fabrica' existem desde o formato de save 2 e não
// podem ser renomeados (saves antigos guardam o id do tipo).
export const BUILDINGS = {
  // --- Residencial -----------------------------------------------------------
  casa: {
    name: 'Casa', zone: ZONE.RESIDENTIAL, level: 1, size: 1, residents: 4, jobs: 0, perFloor: 4,
  },
  sobrado: {
    name: 'Sobrado', zone: ZONE.RESIDENTIAL, level: 2, size: 1, residents: 8, jobs: 0, perFloor: 4,
  },
  apartamentos: {
    name: 'Prédio de apartamentos', zone: ZONE.RESIDENTIAL, level: 3, size: 1, residents: 16, jobs: 0, perFloor: 4, tall: true,
  },
  condominio: {
    name: 'Condomínio', zone: ZONE.RESIDENTIAL, level: 3, size: 2, residents: 48, jobs: 0, perFloor: 8, tall: true,
  },

  // --- Comercial -------------------------------------------------------------
  loja: {
    name: 'Loja', zone: ZONE.COMMERCIAL, level: 1, size: 1, residents: 0, jobs: 5, perFloor: 5,
  },
  mercado: {
    name: 'Mercado', zone: ZONE.COMMERCIAL, level: 2, size: 1, residents: 0, jobs: 12, perFloor: 6,
  },
  escritorios: {
    name: 'Escritórios', zone: ZONE.COMMERCIAL, level: 3, size: 1, residents: 0, jobs: 32, perFloor: 8, tall: true,
  },
  shopping: {
    name: 'Shopping', zone: ZONE.COMMERCIAL, level: 3, size: 2, residents: 0, jobs: 80, perFloor: 40,
  },

  // --- Industrial ------------------------------------------------------------
  fabrica: {
    name: 'Fábrica', zone: ZONE.INDUSTRIAL, level: 1, size: 1, residents: 0, jobs: 10, perFloor: 10,
  },
  industria: {
    name: 'Indústria', zone: ZONE.INDUSTRIAL, level: 2, size: 1, residents: 0, jobs: 18, perFloor: 18,
  },
  complexo: {
    name: 'Complexo industrial', zone: ZONE.INDUSTRIAL, level: 3, size: 1, residents: 0, jobs: 30, perFloor: 15,
  },
  galpao: {
    name: 'Galpão logístico', zone: ZONE.INDUSTRIAL, level: 3, size: 2, residents: 0, jobs: 70, perFloor: 70,
  },

  // --- Serviços públicos (colocados pelo jogador) ----------------------------
  //   utility.power / water: quanto produz por hora (mesma unidade do consumo)
  //   utility.cost: preço para construir; upkeep: manutenção por mês
  //   utility.pollution: peso na poluição em volta (como a indústria)
  //   utility.needsWater: precisa encostar em rio ou lago
  usina_carvao: {
    name: 'Usina a carvão', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 20,
    utility: { power: 3000, water: 0, cost: 12_000, upkeep: 400, pollution: 14 },
  },
  usina_solar: {
    name: 'Usina solar', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 4,
    utility: { power: 1200, water: 0, cost: 20_000, upkeep: 150, pollution: 0 },
  },
  bomba_agua: {
    name: "Bomba d'água", zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    utility: { power: 0, water: 2500, cost: 6_000, upkeep: 200, pollution: 0, needsWater: true },
  },
  poco: {
    name: 'Poço artesiano', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 2,
    utility: { power: 0, water: 700, cost: 3_500, upkeep: 90, pollution: 0 },
  },
};

/**
 * Andares de um prédio das zonas: só os necessários para a capacidade dele
 * (0 para os serviços públicos, que não têm perFloor).
 */
export function floorsOf(info) {
  if (!info.perFloor) return 0;
  return Math.ceil((info.residents || info.jobs) / info.perFloor);
}

/** Andares de um prédio já construído (os do tipo, mais os que cresceu). */
export function buildingFloors(b) {
  return b.floors ?? floorsOf(BUILDINGS[b.type]);
}

/** Moradores ou vagas de um prédio construído, contando os andares a mais. */
export function capacityOf(b) {
  const info = BUILDINGS[b.type];
  const base = info.residents || info.jobs;
  if (b.floors === undefined) return base;
  return base + (b.floors - floorsOf(info)) * info.perFloor;
}

/** Até quantos andares um prédio do tipo `info` cresce na densidade dada. */
export function maxFloorsFor(info, density) {
  if (!info.tall) return floorsOf(info);
  return Math.max(floorsOf(info), DENSITY_INFO[density].maxFloors);
}

/**
 * Valor do terreno exigido para o andar `floor` de um prédio que cresce: o
 * do nível 3 no primeiro andar a mais, subindo até TOWER_LAND_VALUE no
 * andar mais alto possível (o limite da densidade alta).
 */
export function landValueForFloor(info, floor) {
  const base = floorsOf(info);
  const top = DENSITY_INFO[DENSITY.HIGH].maxFloors;
  const from = LAND_VALUE_FOR_LEVEL[info.zone][3];
  return from + ((floor - base) / Math.max(1, top - base)) * (TOWER_LAND_VALUE - from);
}
export const TOWER_LAND_VALUE = 0.9;

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

// Florestas: densidade de 1 a `maxDensity` (árvores por tile). A cada tick,
// com `growChance`, até `tilesPerTick` tiles sorteados crescem: mata fica mais
// densa, e grama livre ao lado de mata com pelo menos `spreadDensity` vira mata.
export const FOREST = {
  maxDensity: 6,
  growChance: 0.05,
  tilesPerTick: 5,
  spreadDensity: 3,
};

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

// Empresas: ocupam andares inteiros dos prédios comerciais e industriais, e
// cada andar alugado dá perFloor vagas do prédio. Andar sem empresa fica
// vago ("aluga-se") e não tem vagas. Cada setor tem os turnos dos seus
// funcionários (frações, como em SHIFTS) e um modelo de nome ({L} e {M} são
// sobrenomes sorteados).
//   kind: 'varejo' (térreos e lojas), 'escritorio' (andares de escritórios)
//         ou 'industria' (uma empresa ocupa o prédio industrial inteiro)
export const SECTORS = {
  padaria: { name: 'Padaria', kind: 'varejo', label: 'Padaria {L}', shifts: { madrugada: 0.2, diurno: 0.65, manha: 0.1, tarde: 0.05 } },
  mercadinho: { name: 'Mercadinho', kind: 'varejo', label: 'Mercadinho {L}', shifts: { diurno: 0.85, manha: 0.05, tarde: 0.1 } },
  farmacia: { name: 'Farmácia', kind: 'varejo', label: 'Farmácia {L}', shifts: { diurno: 0.8, noturno: 0.1, tarde: 0.1 } },
  restaurante: { name: 'Restaurante', kind: 'varejo', label: 'Restaurante {L}', shifts: { diurno: 0.75, tarde: 0.15, noturno: 0.1 } },
  bar: { name: 'Bar', kind: 'varejo', label: 'Bar {L}', shifts: { diurno: 0.3, tarde: 0.35, noturno: 0.35 } },
  roupas: { name: 'Loja de roupas', kind: 'varejo', label: '{L} Modas', shifts: { diurno: 0.9, manha: 0.05, tarde: 0.05 } },
  contabilidade: { name: 'Contabilidade', kind: 'escritorio', label: 'Contabilidade {L}', shifts: { diurno: 0.9, manha: 0.05, tarde: 0.05 } },
  advocacia: { name: 'Advocacia', kind: 'escritorio', label: '{L} & {M} Advogados', shifts: { diurno: 1 } },
  tecnologia: { name: 'Tecnologia', kind: 'escritorio', label: '{L} Tecnologia', shifts: { diurno: 0.85, tarde: 0.15 } },
  clinica: { name: 'Clínica', kind: 'escritorio', label: 'Clínica {L}', shifts: { diurno: 0.7, manha: 0.15, tarde: 0.15 } },
  atendimento: { name: 'Central de atendimento', kind: 'escritorio', label: '{L} Atendimento', shifts: { diurno: 0.55, tarde: 0.2, noturno: 0.15, madrugada: 0.1 } },
  metalurgica: { name: 'Metalúrgica', kind: 'industria', label: 'Metalúrgica {L}', shifts: { diurno: 0.8, noturno: 0.12, madrugada: 0.08 } },
  alimentos: { name: 'Alimentos', kind: 'industria', label: '{L} Alimentos', shifts: { diurno: 0.75, noturno: 0.1, madrugada: 0.1, manha: 0.05 } },
  textil: { name: 'Têxtil', kind: 'industria', label: 'Têxtil {L}', shifts: { diurno: 0.8, tarde: 0.1, noturno: 0.1 } },
  logistica: { name: 'Logística', kind: 'industria', label: '{L} Logística', shifts: { diurno: 0.7, noturno: 0.15, madrugada: 0.1, manha: 0.025, tarde: 0.025 } },
  quimica: { name: 'Química', kind: 'industria', label: 'Química {L}', shifts: { diurno: 0.8, noturno: 0.1, madrugada: 0.1 } },
};

// Uma empresa nova tem COMPANY_GRACE_DAYS dias para contratar; depois, se
// passar COMPANY_CLOSE_DAYS dias seguidos com menos da metade das vagas
// preenchidas, fecha e o andar volta a ficar vago.
export const COMPANY_GRACE_DAYS = 7;
export const COMPANY_CLOSE_DAYS = 20;
// Chance por hora de uma empresa nova abrir num andar vago, havendo demanda.
export const COMPANY_OPEN_CHANCE = 0.1;

// Velocidade dos cidadãos, em tiles por minuto de jogo.
export const CITIZEN_SPEED = 0.5;
