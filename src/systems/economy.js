// Fechamento do mês: impostos de quem trabalha e das empresas, menos a
// manutenção das estradas e dos serviços públicos.

import { BUILDINGS, ECONOMY } from '../world/catalog.js';

export function closeMonth(state, rt) {
  let employed = 0;
  for (const c of state.citizens) if (c.job !== null) employed++;

  let businesses = 0;
  let utilities = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (info.utility) utilities += info.utility.upkeep;
    else if (info.jobs > 0 && b.abandoned === undefined) businesses++;
  }

  let roads = 0;
  for (const r of state.map.road) roads += r;

  const income = Math.round((employed * 1000 + businesses * 2500) * state.economy.taxRate);
  const roadUpkeep = Math.round(roads * ECONOMY.roadUpkeepPerMonth);
  const upkeep = roadUpkeep + utilities;
  state.economy.money += income - upkeep;
  state.economy.lastMonth = { income, upkeep, roads: roadUpkeep, utilities };
}
