// Painel da cultura, em abas:
//   Cena       gêneros em moda, artistas em alta (com a tendência, quem está
//              em turnê e quem é da cidade), novatos do ano e o que está em cartaz
//   Agenda     próximos eventos e edições de séries esperando confirmação
//   Novo       formulário para agendar um evento, com a previsão de público,
//              receita, custo e lucro
//   Séries     eventos que se repetem: reputação e último resultado
//   Histórico  resultados dos últimos eventos
// (ver systems/culture.js e systems/agenda.js). As ações passam por
// applyCommand, como no orçamento.

import { BUILDINGS, CULTURE } from '../world/catalog.js';
import { TICKS_PER_DAY, WEEKDAY_NAMES, calendar } from '../core/time.js';
import { effectiveFame, nowShowing, ranking, workCurve } from '../systems/culture.js';
import { artistFee, forecast, today, unlockedTypes, venueOf, venuesFor } from '../systems/agenda.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('pt-BR')}`;
const num = (v) => Math.round(v).toLocaleString('pt-BR');
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const arrow = (trend) => (trend > 0.15 ? '<b class="up">↑</b>' : trend < -0.15 ? '<b class="down">↓</b>' : '→');
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "sáb, 12 mar, ano 2" para um dia absoluto. */
export function dayLabel(day) {
  const c = calendar(day * TICKS_PER_DAY);
  return `${WEEKDAY_NAMES[c.weekday]}, ${c.day} ${MONTHS[c.month - 1]}, ano ${c.year}`;
}

const STATUS = { agendado: 'agendado', pendente: 'esperando confirmação', realizado: 'realizado', cancelado: 'cancelado', pulado: 'pulado' };
const TABS = [['cena', 'Cena'], ['agenda', 'Agenda'], ['novo', 'Novo evento'], ['series', 'Séries'], ['historico', 'Histórico']];

// Local no <select>: "b:12" (prédio) ou "t:3456" (calçadão).
const venueKey = (v) => (typeof v === 'object' ? `t:${v.tile}` : `b:${v}`);
const venueFromKey = (k) => (k.startsWith('t:') ? { tile: Number(k.slice(2)) } : Number(k.slice(2)));

export class CulturePanel {
  /** `act(cmd)` aplica um comando e devolve o resultado. */
  constructor(el, { act } = {}) {
    this.el = el;
    this.act = act;
    this.tab = 'cena';
    this.key = '';
    this.form = { type: 'show', venue: null, in: 14, days: 1, artists: [], work: null, ticket: CULTURE.ticket, marketing: 5_000, recurrence: '', name: '', genre: '', edit: null };
    this.el.innerHTML = `
      <button class="close" data-close title="Fechar">×</button>
      <h3>Cultura</h3>
      <nav class="tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('')}</nav>
      <div data-body></div>`;
    this.el.addEventListener('click', (e) => this.#click(e));
    this.el.addEventListener('input', (e) => this.#input(e));
    this.el.addEventListener('change', (e) => this.#input(e));
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    this.key = '';
  }

  /** Abre o formulário de novo evento com o local já escolhido (botão do inspetor). */
  planAt(venue) {
    const b = this.rt?.buildingById.get(venue);
    const type = b && Object.keys(CULTURE.eventTypes).find((t) => CULTURE.eventTypes[t].venues.includes(b.type) && unlockedTypes(this.rt).includes(t));
    if (type) this.form.type = type;
    this.form.venue = venueKey(venue);
    this.form.edit = null;
    this.tab = 'novo';
    this.key = '';
  }

  render(state, rt) {
    this.state = state;
    this.rt = rt;
    if (!this.open || !state.culture) return;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === this.tab);
    const c = state.culture;
    // Redesenha só quando algo muda (o formulário não é redesenhado enquanto se digita).
    const day = this.tab === 'novo' ? '' : Math.floor(state.time.tick / TICKS_PER_DAY);
    const key = `${this.tab}:${day}:${c.nextId}:${c.events.length}:${c.events.map((e) => e.status).join('')}`;
    if (key === this.key) return;
    this.key = key;
    const body = this.el.querySelector('[data-body]');
    if (this.tab === 'cena') body.innerHTML = this.#scene(state);
    else if (this.tab === 'agenda') body.innerHTML = this.#agenda(state, rt);
    else if (this.tab === 'novo') {
      body.innerHTML = this.#formHtml(state, rt);
      this.#preview();
    } else if (this.tab === 'series') body.innerHTML = this.#series(state);
    else body.innerHTML = this.#history(state);
  }

  // --- Cena -------------------------------------------------------------------

  #scene(state) {
    const c = state.culture;
    const tick = state.time.tick;
    const year = Math.floor(state.research.world);
    const genres = Object.entries(c.genres).sort(([, a], [, b]) => b.hype - a.hype)
      .map(([id, g]) => `<div class="genre"><span>${esc(CULTURE.genres[id].name)}</span><div class="meter"><i style="width:${pct(g.hype)}"></i></div></div>`).join('');
    const top = ranking(c).slice(0, 10).map((a) => `
      <li><span><b>${esc(a.name)}</b> <small class="muted">${esc(CULTURE.genres[a.genre].name)} · desde ${a.debut}${a.local ? ' · da cidade' : ''}${a.touring ? ' · em turnê' : ''}</small></span>
        <span class="fame">${pct(effectiveFame(c, a))} ${arrow(a.trend)}</span></li>`).join('');
    const rookies = c.artists.filter((a) => a.debut >= year);
    const works = (kind) => {
      const list = nowShowing(c, kind, tick).slice(0, 5).map((w) => {
        const week = Math.floor((tick - w.premiere) / TICKS_PER_DAY / 7) + 1;
        return `<li><span><b>${esc(w.title)}</b> <small class="muted">${esc(w.genre)} · ${week}ª semana</small></span>
          <span class="meter"><i style="width:${pct(workCurve(w, tick))}"></i></span></li>`;
      });
      const soon = c.works.filter((w) => w.kind === kind && w.premiere > tick).sort((a, b) => a.premiere - b.premiere).slice(0, 2)
        .map((w) => `<li><span>${esc(w.title)} <small class="muted">${esc(w.genre)} · estreia em ${Math.ceil((w.premiere - tick) / TICKS_PER_DAY)} dias</small></span></li>`);
      return [...list, ...soon].join('') || '<li class="muted">Nada em cartaz.</li>';
    };
    return `
      <p class="muted small">Artistas surgem, fazem sucesso e envelhecem; os gêneros entram e saem de moda.
        Quem não tem show na cidade sai em turnê; artista da cidade sem palco aqui acaba se mudando.</p>
      <h4>Gêneros em moda</h4><div class="genres">${genres}</div>
      <h4>Artistas em alta</h4><ol class="artists">${top}</ol>
      <h4>Novatos do ano</h4>
      <p class="small">${rookies.length ? rookies.map((a) => `${esc(a.name)} <small class="muted">(${esc(CULTURE.genres[a.genre].name)}${a.local ? ', da cidade' : ''})</small>`).join(', ') : '<span class="muted">Ninguém estreou ainda este ano.</span>'}</p>
      <h4>Em cartaz nos cinemas</h4><ul class="works">${works('filme')}</ul>
      <h4>Em cartaz nos teatros</h4><ul class="works">${works('peca')}</ul>`;
  }

  // --- Agenda, séries e histórico ------------------------------------------------

  #venueName(state, rt, venue) {
    if (typeof venue === 'object') return 'Calçadão';
    const b = rt.buildingById.get(venue);
    return b ? `${BUILDINGS[b.type].name} #${b.id}` : 'local demolido';
  }

  #agenda(state, rt) {
    const list = state.culture.events.filter((e) => e.status === 'agendado' || e.status === 'pendente').sort((a, b) => a.day - b.day || a.id - b.id);
    if (!list.length) return '<p class="muted">Nada agendado. Use a aba <b>Novo evento</b> (ou "Agendar evento aqui" no inspetor de uma arena, praça, cinema ou teatro).</p>';
    return `<ul class="events">${list.map((e) => {
      const f = forecast(state, rt, e);
      const running = e.results.length > 0;
      return `<li>
        <div><b>${esc(e.name)}</b> <small class="muted">${esc(CULTURE.eventTypes[e.type].name)} · ${esc(this.#venueName(state, rt, e.venue))}</small></div>
        <div class="small">${dayLabel(e.day)}${e.days > 1 ? ` (${e.days} dias)` : ''} · ${running ? 'acontecendo agora' : STATUS[e.status]}
          · previsão ${num(f.attendance)} pessoas (${pct(f.fill)})</div>
        <div class="row">${e.status === 'pendente' ? `<button data-confirm="${e.id}">Confirmar (${money(f.cost)})</button><button data-edit="${e.id}">Mudar programação</button>` : ''}
          ${!running ? `<button data-cancel="${e.id}">Cancelar</button>` : ''}</div>
      </li>`;
    }).join('')}</ul><p class="small" data-error></p>`;
  }

  #series(state) {
    const list = state.culture.series.filter((s) => !s.ended);
    if (!list.length) return '<p class="muted">Nenhum evento recorrente. Marque "Repetir" ao agendar: mantendo ou aumentando o investimento, a reputação cresce e o público também.</p>';
    return `<ul class="events">${list.map((s) => `<li>
      <div><b>${esc(s.name)}</b> <small class="muted">${s.recurrence === 'anual' ? 'anual' : 'mensal'} · ${s.edition}ª edição</small></div>
      <div class="small">Reputação <span class="meter inline"><i style="width:${pct(s.reputation)}"></i></span> ${pct(s.reputation)}</div>
      <div class="small muted">${s.lastResult ? `Última: ${num(s.lastResult.attendance)} de ${num(s.lastResult.capacity)} pessoas · receita ${money(s.lastResult.revenue)} · custo ${money(s.lastResult.cost)}` : 'Ainda não aconteceu.'}</div>
    </li>`).join('')}</ul>`;
  }

  #history(state) {
    const list = [...state.culture.history].reverse();
    if (!list.length) return '<p class="muted">Nenhum evento realizado ainda.</p>';
    return `<table class="history"><thead><tr><th>Evento</th><th>Público</th><th>Lucro</th></tr></thead><tbody>${list.map((h) => `
      <tr class="${h.success > 0 ? 'good' : h.success < 0 ? 'bad' : ''}"><td>${esc(h.name)}<br><small class="muted">${dayLabel(h.day)}</small></td>
        <td>${num(h.attendance)}<br><small class="muted">${pct(h.attendance / Math.max(1, h.capacity))}</small></td>
        <td>${money(h.revenue - h.cost)}</td></tr>`).join('')}</tbody></table>`;
  }

  // --- Novo evento --------------------------------------------------------------

  #formHtml(state, rt) {
    const f = this.form;
    const types = unlockedTypes(rt);
    if (!types.includes(f.type)) f.type = types[0];
    const T = CULTURE.eventTypes[f.type];
    const venues = venuesFor(state, rt, f.type);
    if (!venues.some((v) => venueKey(v) === f.venue)) f.venue = venues.length ? venueKey(venues[0]) : null;
    f.days = Math.min(T.days[1], Math.max(T.days[0], f.days));
    const c = state.culture;
    const kind = f.type === 'teatro' ? 'teatro' : f.type === 'feira' ? null : 'musica';
    const pool = ranking(c).filter((a) => (!kind || a.kind === kind) && (!f.genre || a.genre === f.genre));
    const plays = c.works.filter((w) => w.kind === 'peca' && w.premiere <= (today(state) + 120) * TICKS_PER_DAY);
    const genres = [...new Set(c.artists.filter((a) => !kind || a.kind === kind).map((a) => a.genre))];
    const title = f.edit ? `Mudar a programação de "${esc(c.events.find((e) => e.id === f.edit)?.name ?? '')}"` : 'Novo evento';
    return `
      <h4>${title}</h4>
      <div class="form">
        <label>Tipo <select data-f="type" ${f.edit ? 'disabled' : ''}>${types.map((t) => `<option value="${t}" ${t === f.type ? 'selected' : ''}>${CULTURE.eventTypes[t].name}</option>`).join('')}</select></label>
        <label>Local <select data-f="venue" ${f.edit ? 'disabled' : ''}>${venues.length ? venues.map((v) => {
          const info = venueOf(state, rt, v);
          return `<option value="${venueKey(v)}" ${venueKey(v) === f.venue ? 'selected' : ''}>${esc(this.#venueName(state, rt, v))} · ${num(info.capacity)} lugares</option>`;
        }).join('') : '<option value="">Nenhum local na cidade</option>'}</select></label>
        ${venues.length ? '' : `<p class="small muted">Construa ${T.venues.map((v) => (v === 'calcadao' ? 'um calçadão' : BUILDINGS[v]?.name.toLowerCase())).filter(Boolean).join(', ')} para ${T.name.toLowerCase()}.</p>`}
        <label>Daqui a <input type="number" data-f="in" min="${CULTURE.minDays}" max="${CULTURE.maxDays}" value="${f.in}" ${f.edit ? 'disabled' : ''}> dias <small data-date class="muted"></small></label>
        ${T.days[1] > 1 ? `<label>Duração <input type="number" data-f="days" min="${T.days[0]}" max="${T.days[1]}" value="${f.days}" ${f.edit ? 'disabled' : ''}> dias</label>` : ''}
        ${f.type === 'teatro' ? `<label>Peça <select data-f="work">${plays.map((w) => `<option value="${w.id}" ${w.id === f.work ? 'selected' : ''}>${esc(w.title)} (${esc(w.genre)})</option>`).join('')}</select></label>` : ''}
        ${T.artists[1] > 0 ? `
          <div class="lineup">
            <div class="row"><b>Atrações</b> <small class="muted">${T.artists[0]} a ${T.artists[1]}</small>
              <select data-f="genre"><option value="">Todos os gêneros</option>${genres.map((g) => `<option value="${g}" ${g === f.genre ? 'selected' : ''}>${esc(CULTURE.genres[g].name)}</option>`).join('')}</select></div>
            <ul class="artist-pick">${pool.slice(0, 40).map((a) => `
              <li><label><input type="checkbox" data-artist="${a.id}" ${f.artists.includes(a.id) ? 'checked' : ''}>
                <span><b>${esc(a.name)}</b> <small class="muted">${esc(CULTURE.genres[a.genre].name)}${a.local ? ' · da cidade' : ''}${a.touring ? ' · em turnê' : ''}</small></span>
                <span class="fame">${pct(effectiveFame(c, a))} ${arrow(a.trend)} · ${money(artistFee(c, rt, a))}</span></label></li>`).join('')}</ul>
          </div>` : ''}
        <label>Ingresso <input type="number" data-f="ticket" min="0" max="500" step="1" value="${f.ticket}"> <small class="muted">(0 = grátis)</small></label>
        <label>Propaganda <input type="range" data-f="marketing" min="0" max="100000" step="1000" value="${f.marketing}"> <b data-mkt>${money(f.marketing)}</b></label>
        ${f.edit ? '' : `<label>Repetir <select data-f="recurrence"><option value="">Não</option><option value="mensal" ${f.recurrence === 'mensal' ? 'selected' : ''}>Todo mês</option><option value="anual" ${f.recurrence === 'anual' ? 'selected' : ''}>Todo ano</option></select></label>
        <label>Nome <input type="text" data-f="name" maxlength="60" placeholder="automático" value="${esc(f.name)}"></label>`}
      </div>
      <div class="preview" data-preview></div>
      <div class="row"><button class="primary" data-submit>${f.edit ? 'Confirmar edição' : 'Agendar'}</button>${f.edit ? '<button data-cancel-edit>Voltar</button>' : ''}</div>
      <p class="small" data-error></p>`;
  }

  /** Evento do formulário (para a previsão e para o comando). */
  #draft() {
    const f = this.form;
    return {
      id: -1,
      type: f.type,
      venue: f.venue ? venueFromKey(f.venue) : null,
      day: today(this.state) + Number(f.in),
      days: Number(f.days),
      artists: [...f.artists],
      work: f.type === 'teatro' ? Number(f.work) || null : null,
      ticket: Number(f.ticket),
      marketing: Number(f.marketing),
      series: f.edit ? this.state.culture.events.find((e) => e.id === f.edit)?.series ?? null : null,
      status: 'rascunho',
      results: [],
    };
  }

  #preview() {
    const box = this.el.querySelector('[data-preview]');
    if (!box) return;
    const f = this.form;
    if (f.edit) {
      const ev = this.state.culture.events.find((e) => e.id === f.edit);
      if (ev) Object.assign(f, { in: ev.day - today(this.state) });
    }
    const date = this.el.querySelector('[data-date]');
    if (date) date.textContent = dayLabel(today(this.state) + Number(f.in));
    const mkt = this.el.querySelector('[data-mkt]');
    if (mkt) mkt.textContent = money(f.marketing);
    if (!f.venue) {
      box.innerHTML = '';
      return;
    }
    const p = forecast(this.state, this.rt, this.#draft());
    box.innerHTML = `
      <div><span>Público previsto</span><b>${num(p.attendance)} de ${num(p.capacity)} (${pct(p.fill)})</b></div>
      <div><span>Ingressos</span><b>${money(p.revenue)}</b></div>
      <div><span>Custo (cachês, aluguel, propaganda)</span><b>${money(-p.cost)}</b></div>
      <div class="total"><span>Lucro previsto</span><b class="${p.profit >= 0 ? 'up' : 'down'}">${money(p.profit)}</b></div>`;
  }

  #input(e) {
    const t = e.target;
    const f = this.form;
    if (t.dataset.f) {
      const field = t.dataset.f;
      f[field] = t.type === 'number' || t.type === 'range' ? Number(t.value) : t.value;
      // Trocar tipo, local ou filtro de gênero redesenha o formulário.
      if (field === 'type') f.artists = [];
      if (['type', 'genre'].includes(field) && e.type === 'change') {
        this.key = '';
        this.render(this.state, this.rt);
        return;
      }
    } else if (t.dataset.artist) {
      const id = Number(t.dataset.artist);
      const max = CULTURE.eventTypes[f.type].artists[1];
      if (t.checked && !f.artists.includes(id)) {
        if (f.artists.length >= max) {
          t.checked = false;
          this.#error(`No máximo ${max} ${max === 1 ? 'atração' : 'atrações'}.`);
          return;
        }
        f.artists.push(id);
      } else if (!t.checked) f.artists = f.artists.filter((x) => x !== id);
    } else return;
    this.#error('');
    this.#preview();
  }

  #error(text, ok = false) {
    const el = this.el.querySelector('[data-error]');
    if (el) {
      el.textContent = text;
      el.className = `small ${ok ? 'ok' : 'error'}`;
    }
  }

  #click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if ('close' in t.dataset) return this.toggle(false);
    if (t.dataset.tab) {
      this.tab = t.dataset.tab;
      if (this.tab !== 'novo') this.form.edit = null;
      this.key = '';
      return this.render(this.state, this.rt);
    }
    if ('submit' in t.dataset) {
      const d = this.#draft();
      const f = this.form;
      const cmd = f.edit
        ? { type: 'confirmEvent', id: f.edit, artists: d.artists, marketing: d.marketing, ticket: d.ticket }
        : { type: 'event', eventType: d.type, venue: d.venue, day: d.day, days: d.days, artists: d.artists, work: d.work, ticket: d.ticket, marketing: d.marketing, recurrence: f.recurrence || null, name: f.name };
      const result = this.act(cmd);
      if (!result.ok) return this.#error(result.reason);
      Object.assign(f, { artists: [], name: '', edit: null });
      this.tab = 'agenda';
      this.key = '';
      return this.render(this.state, this.rt);
    }
    if ('cancelEdit' in t.dataset) {
      this.form.edit = null;
      this.tab = 'agenda';
      this.key = '';
      return this.render(this.state, this.rt);
    }
    if (t.dataset.confirm || t.dataset.cancel) {
      const result = this.act(t.dataset.confirm
        ? { type: 'confirmEvent', id: Number(t.dataset.confirm) }
        : { type: 'cancelEvent', id: Number(t.dataset.cancel) });
      this.key = '';
      this.render(this.state, this.rt);
      if (!result.ok) this.#error(result.reason);
      return;
    }
    if (t.dataset.edit) {
      const ev = this.state.culture.events.find((x) => x.id === Number(t.dataset.edit));
      if (!ev) return;
      Object.assign(this.form, {
        type: ev.type, venue: venueKey(ev.venue), in: ev.day - today(this.state), days: ev.days,
        artists: [...ev.artists], work: ev.work, ticket: ev.ticket, marketing: ev.marketing, edit: ev.id, genre: '',
      });
      this.tab = 'novo';
      this.key = '';
      this.render(this.state, this.rt);
    }
  }
}
