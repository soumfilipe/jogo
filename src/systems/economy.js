// Fechamento do mês: impostos de quem trabalha e das empresas, menos a
// manutenção das estradas.

import { BUILDINGS, ECONOMY } from '../world/catalog.js';

export function closeMonth(state, rt) {
  let employed = 0;
  for (const c of state.citizens) if (c.job !== null) employed++;

  let businesses = 0;
  for (const b of state.buildings) if (BUILDINGS[b.type].jobs > 0) businesses++;

  let roads = 0;
  for (const r of state.map.road) roads += r;

  const income = Math.round((employed * 1000 + businesses * 2500) * state.economy.taxRate);
  const upkeep = Math.round(roads * ECONOMY.roadUpkeepPerMonth);
  state.economy.money += income - upkeep;
  state.economy.lastMonth = { income, upkeep };
}
