// Painel da cultura: gêneros em moda, artistas em alta (com a tendência),
// novatos do ano e os filmes e peças em cartaz (ver systems/culture.js).

import { CULTURE } from '../world/catalog.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { effectiveFame, nowShowing, ranking, workCurve } from '../systems/culture.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const arrow = (trend) => (trend > 0.15 ? '<b class="up">↑</b>' : trend < -0.15 ? '<b class="down">↓</b>' : '→');

export class CulturePanel {
  constructor(el) {
    this.el = el;
    this.key = '';
    this.el.innerHTML = `
      <button class="close" data-close title="Fechar">×</button>
      <h3>Cultura</h3>
      <p class="muted small">Artistas surgem, fazem sucesso e envelhecem; os gêneros entram e saem de moda.
        Cinemas e teatros atraem público com os filmes e as peças em cartaz.</p>
      <h4>Gêneros em moda</h4>
      <div class="genres" data-genres></div>
      <h4>Artistas em alta</h4>
      <ol class="artists" data-ranking></ol>
      <h4>Novatos do ano</h4>
      <p class="small" data-new></p>
      <h4>Em cartaz nos cinemas</h4>
      <ul class="works" data-filme></ul>
      <h4>Em cartaz nos teatros</h4>
      <ul class="works" data-peca></ul>`;
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
    });
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    this.key = '';
  }

  render(state) {
    if (!this.open || !state.culture) return;
    // A cena só muda no fechamento do mês (e as curvas, uma vez por dia).
    const key = `${Math.floor(state.time.tick / TICKS_PER_DAY)}:${state.culture.nextId}`;
    if (key === this.key) return;
    this.key = key;
    const c = state.culture;
    const q = (sel) => this.el.querySelector(sel);
    const tick = state.time.tick;
    const year = Math.floor(state.research.world);

    q('[data-genres]').innerHTML = Object.entries(c.genres)
      .sort(([, a], [, b]) => b.hype - a.hype)
      .map(([id, g]) => `<div class="genre"><span>${esc(CULTURE.genres[id].name)}</span>
        <div class="meter"><i style="width:${pct(g.hype)}"></i></div></div>`).join('');

    q('[data-ranking]').innerHTML = ranking(c).slice(0, 10).map((a) => `
      <li><span><b>${esc(a.name)}</b> <small class="muted">${esc(CULTURE.genres[a.genre].name)} · desde ${a.debut}${a.local ? ' · da cidade' : ''}</small></span>
        <span class="fame">${pct(effectiveFame(c, a))} ${arrow(a.trend)}</span></li>`).join('');

    const rookies = c.artists.filter((a) => a.debut >= year);
    q('[data-new]').innerHTML = rookies.length
      ? rookies.map((a) => `${esc(a.name)} <small class="muted">(${esc(CULTURE.genres[a.genre].name)})</small>`).join(', ')
      : '<span class="muted">Ninguém estreou ainda este ano.</span>';

    for (const kind of ['filme', 'peca']) {
      const list = nowShowing(c, kind, tick).slice(0, 5);
      const soon = c.works.filter((w) => w.kind === kind && w.premiere > tick).sort((a, b) => a.premiere - b.premiere).slice(0, 2);
      q(`[data-${kind}]`).innerHTML = [
        ...list.map((w) => {
          const week = Math.floor((tick - w.premiere) / TICKS_PER_DAY / 7) + 1;
          return `<li><span><b>${esc(w.title)}</b> <small class="muted">${esc(w.genre)} · ${week}ª semana</small></span>
            <span class="meter"><i style="width:${pct(workCurve(w, tick))}"></i></span></li>`;
        }),
        ...soon.map((w) => `<li><span>${esc(w.title)} <small class="muted">${esc(w.genre)} · estreia em ${Math.ceil((w.premiere - tick) / TICKS_PER_DAY)} dias</small></span></li>`),
      ].join('') || '<li class="muted">Nada em cartaz.</li>';
    }
  }
}
