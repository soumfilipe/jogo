// Luzes das janelas à noite. É só visual: não altera o estado do jogo.
//
// Cada janela sorteia (pelo id do prédio e o índice da janela, sempre com o
// mesmo resultado) a hora em que acende e a hora em que apaga:
// - residências: acendem ao anoitecer e apagam ao longo da noite; alguns
//   ficam acordados até de madrugada e parte acende cedo, antes do trabalho.
//   Quanto mais moradores em casa, mais janelas acesas.
// - comércio: acende quando a noite chega e vai fechando entre 20h e 23h;
//   alguns escritórios ficam acesos até tarde.
// - indústria: turno da noite, com poucas janelas acesas.

import { hash2 } from '../core/rng.js';
import { ZONE } from '../world/catalog.js';

const H = (hours) => Math.round(hours * 60);

export const LIGHT_COLORS = {
  [ZONE.RESIDENTIAL]: '#ffd98a',
  [ZONE.COMMERCIAL]: '#e9f3ff',
  [ZONE.INDUSTRIAL]: '#ffbf6b',
  [ZONE.NONE]: '#ffe2a8', // serviços públicos
};

/**
 * A janela `k` do prédio `b` está acesa no minuto do dia `minute`?
 * `occupancy` (0 a 1) é a fração de gente no prédio (moradores em casa,
 * para residências; para o resto, 1 se tem funcionários, 0 se não tem).
 */
export function isWindowLit(b, info, k, minute, occupancy) {
  return isLit(windowSchedules(b, info, k + 1), k, minute, occupancy);
}

/**
 * Horários das janelas 0..count-1 do prédio, sorteados uma vez só (o
 * renderizador guarda e reaproveita a cada redesenho das luzes). Por janela,
 * SCHEDULE_FIELDS números: o limite de ocupação para acender e dois
 * intervalos [acende, apaga) em minutos do dia (-1 = sem o intervalo).
 */
export function windowSchedules(b, info, count) {
  const out = new Int16Array(count * SCHEDULE_FIELDS);
  for (let k = 0; k < count; k++) {
    const r = (salt) => hash2(b.id * 64 + k, salt);
    const o = k * SCHEDULE_FIELDS;
    // Limite em milésimos: acende se a ocupação passar dele.
    out[o] = Math.floor(r(1) * 1000);
    out[o + 1] = out[o + 2] = out[o + 3] = out[o + 4] = -1;
    const set = (i, start, end) => {
      out[o + 1 + i * 2] = Math.floor(start) % 1440;
      out[o + 2 + i * 2] = Math.floor(end) % 1440;
    };

    if (info.zone === ZONE.RESIDENTIAL) {
      const on = H(17.5) + r(2) * H(2.5); //                  17h30 a 20h
      const nightOwl = r(6) < 0.08;
      const off = nightOwl ? H(2) + r(3) * H(2) : H(22) + r(3) * H(3.5); // 22h a 1h30 (ou 2h a 4h)
      set(0, on, off);
      // Parte das casas acende cedo, antes de sair para o trabalho.
      if (r(4) < 0.35) set(1, H(5.5) + r(5) * H(1), H(7));
    } else if (info.zone === ZONE.COMMERCIAL) {
      const on = H(17) + r(2) * H(1.5); //                    17h a 18h30
      const lateOffice = info.level >= 3 && r(6) < 0.06;
      const off = lateOffice ? H(1) + r(3) * H(2) : H(20) + r(3) * H(3); // 20h a 23h
      set(0, on, off);
    } else if (r(2) < 0.3) {
      // Indústria: turno da noite.
      set(0, H(17.5) + r(3) * H(1), H(6));
    }
  }
  return out;
}
export const SCHEDULE_FIELDS = 5;

/** A janela `k` de `schedules` (ver windowSchedules) está acesa? */
export function isLit(schedules, k, minute, occupancy) {
  const o = k * SCHEDULE_FIELDS;
  if (schedules[o] >= occupancy * 1000) return false;
  return within(minute, schedules[o + 1], schedules[o + 2]) || within(minute, schedules[o + 3], schedules[o + 4]);
}

/** Minuto dentro do intervalo [start, end), que pode virar a meia-noite. */
function within(minute, start, end) {
  if (start < 0) return false;
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Quão escuro está (0 = dia, 1 = noite fechada), pela hora do dia. */
export function darkness(minute) {
  const hour = minute / 60;
  if (hour < 5 || hour >= 19.5) return 1;
  if (hour < 6.5) return 1 - (hour - 5) / 1.5; //  amanhecer
  if (hour >= 17.5) return (hour - 17.5) / 2; //   anoitecer
  return 0;
}
