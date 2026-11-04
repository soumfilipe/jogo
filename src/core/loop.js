// Laço principal com passo fixo: a simulação avança em ticks inteiros,
// independente do FPS da tela. A renderização roda a cada quadro.
//
// Cada tick vem em etapas (um gerador, ver tickSteps em systems/simulation.js):
// quando o tempo de simulação do quadro acaba no meio de um tick pesado (a
// virada da hora ou do dia numa cidade grande), o laço desenha a tela e
// continua o mesmo tick no quadro seguinte. Nenhum outro código da simulação
// roda entre as etapas; quem vai mudar o estado chama flush() antes.

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
 * Inicia o laço. `steps()` devolve as etapas de um tick novo. Devolve
 * { stats, flush, background }:
 *   stats: tempos do último quadro (ms gastos na simulação e no desenho)
 *   flush(): termina já o tick em andamento (antes de mudar o estado)
 *   background(job): roda um gerador aos poucos, entre os quadros, com a
 *     simulação parada (ex.: montar o save); devolve uma Promise com o resultado
 */
export function startLoop({ getSpeed, steps, render }) {
  let last = performance.now();
  let pending = 0;
  let current = null; // tick em andamento (gerador), se parou no meio
  const jobs = []; // { job, resolve, reject } rodando entre os quadros
  const stats = { ticks: 0, simMs: 0, renderMs: 0 };

  function flush() {
    if (current) {
      while (!current.next().done);
      current = null;
    }
    // Um save em andamento termina antes de o estado mudar.
    while (jobs.length) advanceJob(Infinity);
  }

  /** Avança o tick em andamento até acabar ou até `deadline`; true se acabou. */
  function advanceTick(deadline) {
    current ??= steps();
    for (;;) {
      if (current.next().done) {
        current = null;
        return true;
      }
      if (performance.now() >= deadline) return false;
    }
  }

  /** Avança o primeiro trabalho em segundo plano; true se ainda há tempo no quadro. */
  function advanceJob(deadline) {
    const entry = jobs[0];
    try {
      for (;;) {
        const r = entry.job.next();
        if (r.done) {
          jobs.shift();
          entry.resolve(r.value);
          return performance.now() < deadline;
        }
        if (performance.now() >= deadline) return false;
      }
    } catch (error) {
      jobs.shift();
      entry.reject(error);
      return performance.now() < deadline;
    }
  }

  function frame(now) {
    const elapsed = Math.min(now - last, 250);
    last = now;
    const t0 = performance.now();
    const deadline = t0 + MAX_SIM_MS_PER_FRAME;
    let ticks = 0;
    if (jobs.length) {
      // Um trabalho em segundo plano (salvar) lê o estado: a simulação espera.
      if (current) {
        while (!current.next().done);
        current = null;
      }
      while (jobs.length && advanceJob(deadline));
      pending = 0;
    } else {
      pending += (elapsed / 1000) * SPEEDS[getSpeed()];
      // Um tick que ficou pela metade termina primeiro (mesmo com o jogo pausado).
      if (current && advanceTick(deadline)) pending = Math.max(0, pending - 1);
      const wanted = Math.min(Math.floor(pending), MAX_TICKS_PER_FRAME);
      while (!current && ticks < wanted && performance.now() < deadline) {
        if (advanceTick(deadline)) ticks++;
      }
      // Atrasou (limite de ticks ou de tempo): descarta o resto em vez de acumular.
      pending = ticks < Math.floor(pending) ? 0 : pending - ticks;
    }
    const t1 = performance.now();
    stats.ticks = ticks;
    render(elapsed / 1000);
    stats.simMs = t1 - t0;
    stats.renderMs = performance.now() - t1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function background(job) {
    return new Promise((resolve, reject) => jobs.push({ job, resolve, reject }));
  }
  return { stats, flush, background };
}
