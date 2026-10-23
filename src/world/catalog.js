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

  // --- Serviços públicos (colocados pelo jogador) ----------------------------
  //   utility.power / water: quanto produz por hora (mesma unidade do consumo)
  //   utility.cost: preço para construir; upkeep: manutenção por mês
  //   utility.pollution: peso na poluição em volta (como a indústria)
  //   utility.needsWater: precisa encostar em rio ou lago
  usina_carvao: {
    name: 'Usina a carvão', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 20,
    style: { height: 1.4 },
    utility: { power: 3000, water: 0, cost: 12_000, upkeep: 400, pollution: 14 },
  },
  usina_solar: {
    name: 'Usina solar', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 4,
    style: { height: 0.4 },
    utility: { power: 1200, water: 0, cost: 20_000, upkeep: 150, pollution: 0 },
  },
  bomba_agua: {
    name: "Bomba d'água", zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    style: { height: 0.8 },
    utility: { power: 0, water: 2500, cost: 6_000, upkeep: 200, pollution: 0, needsWater: true },
  },
  poco: {
    name: 'Poço artesiano', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 2,
    style: { height: 1.2 },
    utility: { power: 0, water: 700, cost: 3_500, upkeep: 90, pollution: 0 },
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
  taxRate: 0.09,
  roadUpkeepPerMonth: 0.5,
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
