// Estado do jogo. Tudo que precisa ser salvo mora aqui, em dados simples
// (sem classes nem funções), para que o save seja só uma cópia deste objeto.

export const TILE = {
  EMPTY: 0,
  ROAD: 1,
  RESIDENTIAL: 2,
  COMMERCIAL: 3,
  INDUSTRIAL: 4,
};

export const TILE_INFO = {
  [TILE.EMPTY]: { name: 'Demolir', color: '#7aa35a', cost: 5 },
  [TILE.ROAD]: { name: 'Estrada', color: '#5b5b66', cost: 10 },
  [TILE.RESIDENTIAL]: { name: 'Residencial', color: '#4caf50', cost: 50 },
  [TILE.COMMERCIAL]: { name: 'Comercial', color: '#2f80ed', cost: 80 },
  [TILE.INDUSTRIAL]: { name: 'Industrial', color: '#e2b93b', cost: 100 },
};

export const DAYS_PER_MONTH = 30;

export function createNewState({ name = 'Nova Cidade', width = 64, height = 64 } = {}) {
  return {
    city: { name },
    time: { year: 1, month: 1, day: 1 },
    playTimeSeconds: 0,
    economy: { money: 20_000, taxRate: 0.09 },
    stats: { population: 0, jobs: 0 },
    map: { width, height, tiles: new Uint8Array(width * height) },
  };
}

export function placeTile(state, x, y, type) {
  const { width, height, tiles } = state.map;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const index = y * width + x;
  const cost = TILE_INFO[type].cost;
  if (tiles[index] === type || state.economy.money < cost) return false;
  if (type === TILE.EMPTY && tiles[index] === TILE.EMPTY) return false;
  tiles[index] = type;
  state.economy.money -= cost;
  return true;
}

/** Avança um dia. Placeholder da simulação, só para o save ter o que guardar. */
export function stepDay(state) {
  state.time.day++;
  if (state.time.day > DAYS_PER_MONTH) {
    state.time.day = 1;
    state.time.month++;
    if (state.time.month > 12) {
      state.time.month = 1;
      state.time.year++;
    }
    stepMonth(state);
  }
}

function stepMonth(state) {
  const counts = countTiles(state.map.tiles);
  const housing = counts[TILE.RESIDENTIAL] * 20;
  state.stats.jobs = counts[TILE.COMMERCIAL] * 10 + counts[TILE.INDUSTRIAL] * 15;

  // População cresce em direção à capacidade de moradia, limitada por empregos.
  const target = Math.min(housing, state.stats.jobs * 1.5 + 50);
  state.stats.population += Math.round((target - state.stats.population) * 0.2);
  state.stats.population = Math.max(0, state.stats.population);

  const income = state.stats.population * state.economy.taxRate * 10;
  const upkeep = counts[TILE.ROAD] * 1;
  state.economy.money = Math.round(state.economy.money + income - upkeep);
}

function countTiles(tiles) {
  const counts = [0, 0, 0, 0, 0];
  for (const t of tiles) counts[t]++;
  return counts;
}
