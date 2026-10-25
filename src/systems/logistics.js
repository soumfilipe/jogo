// Carga: a indústria precisa escoar a produção por um terminal (pátio
// ferroviário, porto, centro de distribuição) e o comércio vende mais quando
// é abastecido por um centro de distribuição.
//
// Cada terminal alcança a indústria a até `range` tiles pela rua (com o
// caminhão de carga, bem mais longe). Indústria sem terminal ao alcance
// arrecada menos (EXPORT.isolated); o porto ainda soma um bônus. Comércio no
// raio de um centro de distribuição arrecada `EXPORT.supplied` a mais.
//
// Derivado só de onde estão os prédios e as ruas (não de funcionários), para
// dar o mesmo resultado depois de carregar um save.

import { BUILDINGS, ZONE } from '../world/catalog.js';
import { roadDistances } from './utilities.js';
import { mod } from './mods.js';

export const EXPORT = {
  // Receita da indústria sem terminal ao alcance.
  isolated: 0.8,
  // Receita a mais do comércio abastecido por um centro de distribuição.
  supplied: 0.05,
};

/**
 * Refaz rt.freight: Map(id da indústria -> fator de receita) e
 * rt.supplied: Set(ids de prédios comerciais abastecidos).
 */
export function computeFreight(state, rt) {
  const width = state.map.width;
  const range = mod(rt, 'freightRange');
  const terminals = state.buildings.filter((b) => BUILDINGS[b.type].utility?.freight);
  const freight = new Map();
  const supplied = new Set();

  // Distância pela rua de cada terminal até cada tile (uma busca por terminal).
  const reach = terminals.map((b) => ({
    b, info: BUILDINGS[b.type].utility, dist: roadDistances(state, [rt.access.get(b.id)]),
  }));

  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    const access = rt.access.get(b.id);
    if (info.zone === ZONE.INDUSTRIAL) {
      let factor = EXPORT.isolated;
      for (const { info: u, dist } of reach) {
        const d = access >= 0 ? dist[access] : -1;
        if (d >= 0 && d <= u.freight.range * range) factor = Math.max(factor, 1 + u.freight.bonus);
      }
      freight.set(b.id, factor);
    } else if (info.zone === ZONE.COMMERCIAL) {
      for (const { b: t, info: u } of reach) {
        if (!u.supply) continue;
        const d = Math.abs((t.tile % width) - (b.tile % width)) + Math.abs(Math.floor(t.tile / width) - Math.floor(b.tile / width));
        if (d <= u.supply.radius) {
          supplied.add(b.id);
          break;
        }
      }
    }
  }
  rt.freight = freight;
  rt.supplied = supplied;
}

/** Fator de receita de um prédio pela carga (1 = normal). */
export function freightFactor(rt, b) {
  if (rt.freight?.has(b.id)) return rt.freight.get(b.id);
  if (rt.supplied?.has(b.id)) return 1 + EXPORT.supplied;
  return 1;
}
