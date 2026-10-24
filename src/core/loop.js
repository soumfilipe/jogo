// Laço principal com passo fixo: a simulação avança em ticks inteiros,
// independente do FPS da tela. A renderização roda a cada quadro.

import { SPEEDS } from './time.js';

// Limite de ticks por quadro: se o PC não acompanhar, o jogo fica mais lento
// em vez de travar tentando recuperar o atraso.
const MAX_TICKS_PER_FRAME = 40;

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
    let ticks = Math.min(Math.floor(pending), MAX_TICKS_PER_FRAME);
    pending = ticks === MAX_TICKS_PER_FRAME ? 0 : pending - ticks;
    stats.ticks = ticks;
    const t0 = performance.now();
    while (ticks-- > 0) tick();
    const t1 = performance.now();
    render(elapsed / 1000);
    stats.simMs = t1 - t0;
    stats.renderMs = performance.now() - t1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return stats;
}
