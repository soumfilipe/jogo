// Esgoto e rios: o esgoto sai pela mesma rede da água (o consumo de água de
// cada prédio vira esgoto). Estações de tratamento com funcionários tratam até
// a capacidade delas; o resto vai para os rios.
//
//   poluição do rio = parte não tratada × modificadores (detergentes pioram,
//                     o biodegradável melhora)
//
// Casas que bebem água de bomba em rio poluído adoecem: a perda de saúde é
// SANITATION.health × poluição do rio × parte da água da cidade que vem de
// bombas no rio (poços não pegam água do rio; importada também não).
//
// Derivado do estado (prédios e funcionários), recalculado antes de usar.

import { BUILDINGS, SANITATION, capacityOf } from '../world/catalog.js';
import { consumption } from './utilities.js';
import { mod, utilityOutput } from './mods.js';

/**
 * { sewage, capacity, treated (0 a 1), river (0 a 1), pumpShare (0 a 1),
 *   healthLoss } da cidade agora.
 */
export function computeSanitation(state, rt) {
  let sewage = 0;
  let capacity = 0;
  let pumps = 0;
  let water = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (info.utility) {
      if ((rt.workers.get(b.id)?.size ?? 0) > 0 && info.utility.sewage) capacity += info.utility.sewage * mod(rt, 'output.sewage');
      const out = utilityOutput(rt, b.type, 'water');
      water += out;
      if (info.utility.needsWater && !info.utility.sewage) pumps += out;
    } else if (b.abandoned === undefined) {
      sewage += consumption(info, capacityOf(b), rt).water;
    }
  }
  const treated = sewage > 0 ? Math.min(1, capacity / sewage) : 1;
  const river = Math.min(1, (1 - treated) * mod(rt, 'pollution.river'));
  const pumpShare = state.utilities?.imported?.water || water === 0 ? 0 : pumps / water;
  return { sewage, capacity, treated, river, pumpShare, healthLoss: SANITATION.health * river * pumpShare };
}
