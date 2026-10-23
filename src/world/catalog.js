// Catálogo de tipos: tudo que é balanceamento mora aqui, como dados.

export const TERRAIN = { GRASS: 0, WATER: 1, FOREST: 2, SAND: 3 };

export const ZONE = { NONE: 0, RESIDENTIAL: 1, COMMERCIAL: 2, INDUSTRIAL: 3 };

export const ZONE_INFO = {
  [ZONE.RESIDENTIAL]: { name: 'Residencial', color: '#5fbf5a', key: 'r' },
  [ZONE.COMMERCIAL]: { name: 'Comercial', color: '#4f8ff7', key: 'c' },
  [ZONE.INDUSTRIAL]: { name: 'Industrial', color: '#e8b931', key: 'i' },
};

// Prédios que crescem sozinhos nas zonas.
//   residents: quantos cidadãos moram
//   jobs:      quantas vagas de emprego
//   height:    altura do bloco isométrico (em "andares")
export const BUILDINGS = {
  casa: {
    name: 'Casa', zone: ZONE.RESIDENTIAL, residents: 4, jobs: 0, height: 0.6,
    colors: { top: '#e9d8b4', left: '#c9a87a', right: '#b08c5e', roof: '#b5523b' },
  },
  loja: {
    name: 'Loja', zone: ZONE.COMMERCIAL, residents: 0, jobs: 5, height: 0.8,
    colors: { top: '#cfe0f5', left: '#7fa6d6', right: '#5f86b8' },
  },
  fabrica: {
    name: 'Fábrica', zone: ZONE.INDUSTRIAL, residents: 0, jobs: 10, height: 1.1,
    colors: { top: '#d8d2c4', left: '#a89f8a', right: '#8a826f' },
  },
};

export const BUILDING_FOR_ZONE = {
  [ZONE.RESIDENTIAL]: 'casa',
  [ZONE.COMMERCIAL]: 'loja',
  [ZONE.INDUSTRIAL]: 'fabrica',
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
  taxRate: 0.09,
  roadUpkeepPerMonth: 0.5,
};

// Um prédio só cresce se houver estrada a até esta distância (em tiles).
export const ROAD_ACCESS_RADIUS = 2;

// Velocidade dos cidadãos, em tiles por minuto de jogo.
export const CITIZEN_SPEED = 0.5;
