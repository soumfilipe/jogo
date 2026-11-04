// Laço principal com passo fixo: a simulação avança em ticks inteiros,
// independente do FPS da tela. A renderização roda a cada quadro.

import { SPEEDS } from './time.js';

// Limite de ticks por quadro: se o PC não acompanhar, o jogo fica mais lento
// em vez de travar tentando recuperar o atraso.
const MAX_TICKS_PER_FRAME = 40;
// Tempo máximo de simulação por quadro (ms). Numa cidade grande, 40 ticks
// podem passar de 100 ms e a tela fica travando; com o limite, o jogo anda um
// pouco mais devagar, mas a tela e os cliques continuam fluidos. Só muda o
// ritmo: os ticks são os mesmos, então a cidade evolui igual.
const MAX_SIM_MS_PER_FRAME = 30;

/**
 * Inicia o laço. Devolve `stats` com os tempos do último quadro (ms gastos
 * na simulação e no desenho), usados para medir desempenho.
 */
export function startLoop({ getSpeed, tick, render }) {
  let last = performance.now();
  let pending = 0;
  const stats = { ticks: 0, simMs: 0, renderMs: 0 };

  function frame(now) {
    const elapsed = Math.min(now - last, 250);
    last = now;
    pending += (elapsed / 1000) * SPEEDS[getSpeed()];
    const wanted = Math.min(Math.floor(pending), MAX_TICKS_PER_FRAME);
    const t0 = performance.now();
    let ticks = 0;
    while (ticks < wanted) {
      tick();
      ticks++;
      if (performance.now() - t0 >= MAX_SIM_MS_PER_FRAME) break;
    }
    const t1 = performance.now();
    // Atrasou (limite de ticks ou de tempo): descarta o resto em vez de acumular.
    pending = ticks < Math.floor(pending) ? 0 : pending - ticks;
    stats.ticks = ticks;
    render(elapsed / 1000);
    stats.simMs = t1 - t0;
    stats.renderMs = performance.now() - t1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return stats;
}
