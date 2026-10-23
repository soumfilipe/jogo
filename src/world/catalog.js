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
//   style:     como desenhar (ver src/render/buildings.js)
//     height:   altura em "andares" (1 = altura de meio tile)
//     roof:     'hip' (telhado de quatro águas) | 'flat'
//     windows, chimney, stripes: detalhes opcionais
//     palettes: variações de cor; cada prédio sorteia uma pelo id
//
// Os ids 'casa', 'loja' e 'fabrica' existem desde o formato de save 2 e não
// podem ser renomeados (saves antigos guardam o id do tipo).
const WALLS = {
  creme: { left: '#d9c39a', right: '#bfa57a' },
  tijolo: { left: '#c98262', right: '#ab6a4d' },
  branco: { left: '#e6e2da', right: '#c9c4ba' },
  azul: { left: '#9fb7cf', right: '#8299b2' },
  verde: { left: '#a9c4a0', right: '#8ea886' },
  vidro: { left: '#7fa6d6', right: '#5f86b8' },
  vidroEscuro: { left: '#5b7fa8', right: '#486889' },
  concreto: { left: '#b5b0a6', right: '#98938a' },
  galpao: { left: '#a89f8a', right: '#8a826f' },
  ferrugem: { left: '#b08260', right: '#94694b' },
};
const p = (walls, top, extra = {}) => ({ ...WALLS[walls], top, ...extra });

export const BUILDINGS = {
  // --- Residencial --------------------------------------------------------
  casa: {
    name: 'Casa', zone: ZONE.RESIDENTIAL, level: 1, size: 1, residents: 4, jobs: 0,
    style: {
      height: 0.6, roof: 'hip',
      palettes: [p('creme', '#e9d8b4', { roof: '#b5523b' }), p('branco', '#f0ece4', { roof: '#7a4b3a' }),
        p('azul', '#dce6ef', { roof: '#9c4a3a' }), p('verde', '#e1ebdc', { roof: '#6f5b4b' })],
    },
  },
  sobrado: {
    name: 'Sobrado', zone: ZONE.RESIDENTIAL, level: 2, size: 1, residents: 8, jobs: 0,
    style: {
      height: 1.2, roof: 'hip', windows: true,
      palettes: [p('tijolo', '#e2c4b2', { roof: '#7c3b2c' }), p('branco', '#f0ece4', { roof: '#a04a36' }),
        p('creme', '#efe2c4', { roof: '#5d4a3e' })],
    },
  },
  apartamentos: {
    name: 'Prédio de apartamentos', zone: ZONE.RESIDENTIAL, level: 3, size: 1, residents: 16, jobs: 0,
    style: {
      height: 3, roof: 'flat', windows: true,
      palettes: [p('branco', '#d8d4cc'), p('tijolo', '#c9a796'), p('azul', '#c6d3df')],
    },
  },
  condominio: {
    name: 'Condomínio', zone: ZONE.RESIDENTIAL, level: 3, size: 2, residents: 48, jobs: 0,
    style: {
      height: 5, roof: 'flat', windows: true,
      palettes: [p('branco', '#d8d4cc'), p('azul', '#c6d3df')],
    },
  },

  // --- Comercial ----------------------------------------------------------
  loja: {
    name: 'Loja', zone: ZONE.COMMERCIAL, level: 1, size: 1, residents: 0, jobs: 5,
    style: {
      height: 0.8, roof: 'flat', windows: true, awning: true,
      palettes: [p('vidro', '#cfe0f5', { awning: '#e05a47' }), p('branco', '#e9edf2', { awning: '#3d8f5a' }),
        p('creme', '#f1e6cf', { awning: '#3f6fc0' })],
    },
  },
  mercado: {
    name: 'Mercado', zone: ZONE.COMMERCIAL, level: 2, size: 1, residents: 0, jobs: 12,
    style: {
      height: 1.3, roof: 'flat', windows: true, awning: true,
      palettes: [p('branco', '#e9edf2', { awning: '#d9822b' }), p('vidro', '#cfe0f5', { awning: '#c23b3b' })],
    },
  },
  escritorios: {
    name: 'Escritórios', zone: ZONE.COMMERCIAL, level: 3, size: 1, residents: 0, jobs: 30,
    style: {
      height: 4, roof: 'flat', windows: true,
      palettes: [p('vidro', '#b9d0ec'), p('vidroEscuro', '#9fb6d2')],
    },
  },
  shopping: {
    name: 'Shopping', zone: ZONE.COMMERCIAL, level: 3, size: 2, residents: 0, jobs: 80,
    style: {
      height: 1.6, roof: 'flat', windows: true, stripes: true,
      palettes: [p('branco', '#dfe6ee', { stripe: '#4f8ff7' }), p('vidro', '#cfe0f5', { stripe: '#e8b931' })],
    },
  },

  // --- Industrial ---------------------------------------------------------
  fabrica: {
    name: 'Fábrica', zone: ZONE.INDUSTRIAL, level: 1, size: 1, residents: 0, jobs: 10,
    style: {
      height: 1.1, roof: 'flat', chimney: true,
      palettes: [p('galpao', '#d8d2c4'), p('ferrugem', '#d2b9a3')],
    },
  },
  industria: {
    name: 'Indústria', zone: ZONE.INDUSTRIAL, level: 2, size: 1, residents: 0, jobs: 18,
    style: {
      height: 1.6, roof: 'flat', chimney: true, stripes: true,
      palettes: [p('concreto', '#d6d2ca', { stripe: '#e8b931' }), p('ferrugem', '#d2b9a3', { stripe: '#5c5f68' })],
    },
  },
  complexo: {
    name: 'Complexo industrial', zone: ZONE.INDUSTRIAL, level: 3, size: 1, residents: 0, jobs: 30,
    style: {
      height: 2.2, roof: 'flat', chimney: true, windows: true,
      palettes: [p('concreto', '#d6d2ca'), p('galpao', '#d8d2c4')],
    },
  },
  galpao: {
    name: 'Galpão logístico', zone: ZONE.INDUSTRIAL, level: 3, size: 2, residents: 0, jobs: 70,
    style: {
      height: 1.4, roof: 'flat', stripes: true,
      palettes: [p('concreto', '#cfcbc2', { stripe: '#3f6fc0' }), p('galpao', '#d8d2c4', { stripe: '#c23b3b' })],
    },
  },
};

// Tipos 1x1 de cada nível, por zona: é o caminho de crescimento no lugar.
export const LEVELS = {};
// Tipos grandes (2x2) por zona: surgem em lotes vazios bem valorizados.
export const LARGE_BUILDINGS = {};
for (const [id, info] of Object.entries(BUILDINGS)) {
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

// Velocidade dos cidadãos, em tiles por minuto de jogo.
export const CITIZEN_SPEED = 0.5;
