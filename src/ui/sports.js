// Painel do esporte, em abas:
//   Clubes     os clubes da cidade (caixa, divisão, força, torcida), a verba de
//              cada um e o formulário para fundar um clube
//   Tabela     a classificação das ligas da temporada
//   Jogos      próximos jogos e resultados dos clubes da cidade
//   Elenco     os atletas (cidadãos) de cada clube
//   Base       os jovens da escolinha, por categoria
//   Mercado    propostas de clubes de fora pelos craques e as vendas feitas
//   Corridas   corridas de rua (marcadas com a ferramenta Corrida de rua)
//   Histórico  temporadas passadas
// (ver systems/sports.js). As ações passam por applyCommand, como no orçamento.

import { BUILDINGS, SPORTS } from '../world/catalog.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../core/time.js';
import {
  academyKids, activeClubs, clubCosts, clubIncome, clubStrength, seasonStart, squad, standings, starSkill, teamName,
  today, unlockedSports, youthCategory,
} from '../systems/sports.js';
import { expectedRunners } from '../systems/races.js';
import { dayLabel } from './culture.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('pt-BR')}`;
const num = (v) => Math.round(v).toLocaleString('pt-BR');
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const TABS = [['clubes', 'Clubes'], ['tabela', 'Tabela'], ['jogos', 'Jogos'], ['elenco', 'Elenco'], ['base', 'Base'], ['mercado', 'Mercado'], ['corridas', 'Corridas'], ['historico', 'Histórico']];
const sportName = (id) => SPORTS.kinds[id].name;
const divName = (d) => SPORTS.divisions[d].name;
const individual = (league) => Boolean(SPORTS.kinds[league.sport].individual);
const score = (sport, [a, b]) => (sport === 'volei' ? `${a} × ${b} sets` : `${a} × ${b}`);

export class SportsPanel {
  /** `act(cmd)` aplica um comando; `inspect(id)` abre um cidadão no inspetor. */
  constructor(el, { act, inspect } = {}) {
    this.el = el;
    this.act = act;
    this.inspect = inspect;
    this.tab = 'clubes';
    this.key = '';
    this.form = { sport: '', home: '', name: '' };
    this.el.innerHTML = `
      <button class="close" data-close title="Fechar">×</button>
      <h3>Esporte</h3>
      <nav class="tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('')}</nav>
      <div data-body></div>`;
    this.el.addEventListener('click', (e) => this.#click(e));
    this.el.addEventListener('change', (e) => this.#change(e));
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    this.key = '';
  }

  /** Abre o painel numa aba (ex.: 'corridas' depois de marcar uma corrida). */
  showTab(tab) {
    this.tab = tab;
    this.key = '';
  }

  /** Abre o formulário de fundar clube com o local já escolhido (botão do inspetor). */
  foundAt(home) {
    const b = this.rt?.buildingById.get(home);
    const sport = b && unlockedSports(this.rt).find((s) => SPORTS.kinds[s].venues.includes(b.type));
    if (sport) this.form.sport = sport;
    this.form.home = String(home);
    this.tab = 'clubes';
    this.key = '';
  }

  render(state, rt) {
    this.state = state;
    this.rt = rt;
    if (!this.open || !state.sports) return;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === this.tab);
    const s = state.sports;
    // Na aba Clubes (com campos de verba), redesenha só a cada mês ou quando algo muda.
    const when = this.tab === 'clubes' ? Math.floor(state.time.tick / TICKS_PER_MONTH) : Math.floor(state.time.tick / TICKS_PER_DAY);
    const key = `${this.tab}:${when}:${s.nextId}:${s.offers.length}:${s.races.map((r) => `${r.status}${r.annual}${r.marketing}`).join()}:${s.clubs.map((c) => `${c.training}/${c.subsidy}/${c.ct}/${c.reinvest}/${c.closed}/${c.academy}/${c.youthBudget}/${c.players.length}/${c.youth.length}`).join()}`;
    if (key === this.key) return;
    this.key = key;
    const body = this.el.querySelector('[data-body]');
    if (this.tab === 'clubes') body.innerHTML = this.#clubs(state, rt);
    else if (this.tab === 'tabela') body.innerHTML = this.#tables(state);
    else if (this.tab === 'jogos') body.innerHTML = this.#games(state);
    else if (this.tab === 'elenco') body.innerHTML = this.#squads(state, rt);
    else if (this.tab === 'base') body.innerHTML = this.#academy(state, rt);
    else if (this.tab === 'mercado') body.innerHTML = this.#market(state, rt);
    else if (this.tab === 'corridas') body.innerHTML = this.#races(state, rt);
    else body.innerHTML = this.#history(state);
  }

  // --- Clubes -----------------------------------------------------------------

  #league(state, club) {
    return state.sports.leagues.filter((l) => l.sport === club.sport && l.teams.some((t) => t.club === club.id))
      .sort((a, b) => b.season - a.season)[0];
  }

  #clubs(state, rt) {
    const clubs = activeClubs(state);
    const list = clubs.map((c) => {
      const league = this.#league(state, c);
      const pos = league && !league.done ? standings(league).findIndex((i) => league.teams[i].club === c.id) + 1 : 0;
      const income = clubIncome(state, rt, c);
      const costs = clubCosts(state, rt, c);
      const kind = SPORTS.kinds[c.sport];
      const players = squad(state, rt, c).length;
      const venue = rt.buildingById.get(c.home);
      const next = SPORTS.academy.categories[c.academy];
      const academy = next ? `<button data-academy="${c.id}">Abrir ${next.name} (${money(SPORTS.academy.cost[c.academy])})</button>` : '';
      const ct = c.ct < SPORTS.ct.cost.length ? `<button data-ct="${c.id}">Centro de treinamento: nível ${c.ct + 1} (${money(SPORTS.ct.cost[c.ct])})</button>` : '<small class="muted">Centro de treinamento no nível máximo.</small>';
      return `<li>
        <div><b>${esc(c.name)}</b> <small class="muted">${sportName(c.sport)} · ${esc(venue ? `${BUILDINGS[venue.type].name} #${venue.id}` : 'sem casa')}</small></div>
        <div class="small">Campeonato ${divName(c.division).toLowerCase()}${pos ? ` · ${pos}º lugar` : league ? '' : ' · estreia na próxima temporada'}
          · ${c.trophies ? `${c.trophies} ${c.trophies === 1 ? 'título' : 'títulos'} · ` : ''}força ${pct(clubStrength(state, rt, c))} · torcida ${pct(c.fans)}</div>
        <div class="small">Caixa <b class="${c.cash < 0 ? 'down' : ''}">${money(c.cash)}</b> · por mês: ${money(income.total)} de receita (patrocínio ${money(income.sponsor)}${income.broadcast ? `, TV ${money(income.broadcast)}` : ''}${c.subsidy ? `, prefeitura ${money(c.subsidy)}` : ''}),
          ${money(costs.salaries)} de salários, ${money(costs.training)} de treino${costs.youth ? ` e ${money(costs.youth)} da base` : ''}, mais os ingressos dos jogos em casa.</div>
        ${players < kind.squad ? `<div class="small down">Elenco incompleto: ${players} de ${kind.squad} atletas (faltam cidadãos de ${SPORTS.ages[0]} a ${SPORTS.ages[1]} anos sem emprego fixo).</div>` : ''}
        <div class="form">
          <label>Treino <input type="number" min="0" max="1000000" step="500" value="${c.training}" data-training="${c.id}"> /mês</label>
          <label>Repasse da prefeitura <input type="number" min="0" max="1000000" step="500" value="${c.subsidy}" data-subsidy="${c.id}"> /mês</label>
          <label><input type="checkbox" data-reinvest="${c.id}" ${c.reinvest ? 'checked' : ''}> Reinvestir prêmios no treino</label>
          ${c.academy ? `<label>Verba da base <input type="number" min="0" max="1000000" step="500" value="${c.youthBudget}" data-youth-budget="${c.id}"> /mês</label>` : ''}
        </div>
        <div class="small">Escolinha: ${c.academy ? `${SPORTS.academy.categories.slice(0, c.academy).map((x) => x.name).join(', ')} · ${academyKids(state, rt, c).length} alunos` : 'fechada'}</div>
        <div class="row">${ct}${academy}<button data-close-club="${c.id}">Fechar clube</button></div>
      </li>`;
    }).join('');
    return `
      <p class="muted small">Os atletas são moradores da cidade (primeiro quem tem vocação para o esporte). Treino e centro de treinamento
        melhoram o time; os dois primeiros sobem de divisão e os dois últimos caem. Prêmios, patrocínio e ingressos vão para o caixa do clube.</p>
      ${clubs.length ? `<ul class="events">${list}</ul>` : '<p class="muted">A cidade ainda não tem clubes.</p>'}
      ${this.#foundForm(state, rt)}
      <p class="small" data-error></p>`;
  }

  #foundForm(state, rt) {
    const sports = unlockedSports(rt);
    if (!sports.length) return '<p class="small muted">Pesquise <b>Futebol profissional</b> ou <b>Ginásio poliesportivo</b> para fundar clubes.</p>';
    const f = this.form;
    if (!sports.includes(f.sport)) f.sport = sports[0];
    const kind = SPORTS.kinds[f.sport];
    const homes = state.buildings.filter((b) => kind.venues.includes(b.type));
    if (!homes.some((b) => String(b.id) === f.home)) f.home = homes.length ? String(homes[0].id) : '';
    const start = seasonStart(f.sport, Math.floor(today(state) / 360) + 1);
    const next = start >= today(state) ? start : seasonStart(f.sport, Math.floor(today(state) / 360) + 2);
    return `
      <h4>Fundar clube</h4>
      <div class="form">
        <label>Modalidade <select data-f="sport">${sports.map((s) => `<option value="${s}" ${s === f.sport ? 'selected' : ''}>${sportName(s)}</option>`).join('')}</select></label>
        <label>Casa <select data-f="home">${homes.length ? homes.map((b) => `<option value="${b.id}" ${String(b.id) === f.home ? 'selected' : ''}>${BUILDINGS[b.type].name} #${b.id} · ${num(SPORTS.venues[b.type].capacity)} lugares</option>`).join('') : '<option value="">Nenhum local na cidade</option>'}</select></label>
        <label>Nome <input type="text" maxlength="40" placeholder="automático" data-f="name" value="${esc(f.name)}"></label>
      </div>
      <p class="small muted">Custa ${money(SPORTS.foundCost)} (vira o caixa inicial do clube). Elenco de ${kind.squad} atletas; jogos ${kind.weekday === 6 ? 'aos domingos' : 'aos sábados'} às ${kind.hour}h.
        A próxima temporada começa em ${dayLabel(next)}.</p>
      <div class="row"><button class="primary" data-found ${f.home ? '' : 'disabled'}>Fundar clube</button></div>`;
  }

  // --- Tabela, jogos, elenco e histórico ----------------------------------------

  #tables(state) {
    const year = Math.floor(today(state) / 360) + 1;
    const leagues = state.sports.leagues.filter((l) => l.season === year || (l.season === year - 1 && !state.sports.leagues.some((x) => x.sport === l.sport && x.season === year)))
      .sort((a, b) => a.sport.localeCompare(b.sport) || b.division - a.division);
    if (!leagues.length) return '<p class="muted">Nenhum campeonato em andamento. As temporadas começam no início do ano esportivo de cada modalidade.</p>';
    return leagues.map((l) => {
      const played = l.fixtures.filter((f) => f.score).length;
      const rows = standings(l).map((i, pos) => {
        const t = l.table[i];
        const mine = l.teams[i].club !== undefined;
        const zone = pos < SPORTS.up && l.division < SPORTS.divisions.length - 1 ? 'good' : pos >= l.teams.length - SPORTS.down && l.division > 0 ? 'bad' : '';
        const cells = individual(l)
          ? `<td>${t.pts}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td>`
          : `<td>${t.pts}</td><td>${t.w + t.d + t.l}</td><td>${t.w}-${t.d}-${t.l}</td><td>${t.f - t.a > 0 ? '+' : ''}${t.f - t.a}</td>`;
        return `<tr class="${zone}${mine ? ' mine' : ''}"><td>${pos + 1}</td><td>${esc(teamName(state, l.teams[i]))}</td>${cells}</tr>`;
      }).join('');
      const head = individual(l) ? '<th>P</th><th>Ouro</th><th>Prata</th><th>Bronze</th>' : '<th>P</th><th>J</th><th>V-E-D</th><th>S</th>';
      return `<h4>${sportName(l.sport)} · campeonato ${divName(l.division).toLowerCase()} <small class="muted">ano ${l.season}${l.done ? ', encerrado' : `, ${played} de ${l.fixtures.length} ${individual(l) ? 'etapas' : 'jogos'}`}</small></h4>
        <table class="history league"><thead><tr><th>#</th><th>Time</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }).join('') + `<p class="small muted">Verde: sobe de divisão. Vermelho: cai.</p>`;
  }

  #fixtures(state) {
    const out = [];
    for (const l of state.sports.leagues) {
      for (const fx of l.fixtures) {
        const home = l.teams[fx.home];
        const away = fx.away === null ? null : l.teams[fx.away];
        // Etapas individuais: todos competem; jogos: só os da cidade.
        if (away && home.club === undefined && away.club === undefined) continue;
        out.push({ l, fx, home, away });
      }
    }
    return out;
  }

  #games(state) {
    const all = this.#fixtures(state);
    const now = today(state);
    const meet = (l, fx, home) => {
      const mine = fx.score ? fx.score.findIndex((i) => l.teams[i].club !== undefined) : -1;
      return `Etapa ${fx.round + 1} · sede: ${esc(teamName(state, home))}${mine >= 0 ? ` · <b>${mine + 1}º lugar</b>` : ''}`;
    };
    const line = ({ l, fx, home, away }) => `<li><span><small class="muted">${dayLabel(fx.day)} · ${sportName(l.sport)}</small><br>
      ${away === null ? meet(l, fx, home) : `${esc(teamName(state, home))} ${fx.score ? `<b>${score(l.sport, fx.score)}</b>` : '×'} ${esc(teamName(state, away))}`}</span>
      ${fx.attendance ? `<small class="muted">${num(fx.attendance)} torcedores</small>` : ''}</li>`;
    const next = all.filter((x) => !x.fx.score && x.fx.day >= now).sort((a, b) => a.fx.day - b.fx.day || a.fx.id - b.fx.id).slice(0, 8);
    const past = all.filter((x) => x.fx.score).sort((a, b) => b.fx.day - a.fx.day || b.fx.id - a.fx.id).slice(0, 10);
    if (!next.length && !past.length) return '<p class="muted">Nenhum jogo ainda. Funde um clube na aba <b>Clubes</b>.</p>';
    return `<h4>Próximos jogos</h4><ul class="works games">${next.map(line).join('') || '<li class="muted">Nenhum jogo marcado.</li>'}</ul>
      <h4>Resultados</h4><ul class="works games">${past.map(line).join('') || '<li class="muted">Nenhum jogo ainda.</li>'}</ul>`;
  }

  #squads(state, rt) {
    const clubs = activeClubs(state);
    if (!clubs.length) return '<p class="muted">A cidade ainda não tem clubes.</p>';
    return clubs.map((c) => {
      const players = squad(state, rt, c).sort((a, b) => b.skill - a.skill || a.id - b.id);
      return `<h4>${esc(c.name)} <small class="muted">${players.length} atletas</small></h4>
        <ul class="works">${players.map((p) => `<li><span><button class="link" data-citizen="${p.id}">${esc(p.name)}</button> <small class="muted">${p.age} anos${p.calling === 'esporte' ? ' · vocação' : ''}</small></span>
          <span class="fame">${pct(p.skill)} <span class="meter inline"><i style="width:${pct(p.skill)}"></i></span></span></li>`).join('')}</ul>`;
    }).join('');
  }

  #academy(state, rt) {
    const clubs = activeClubs(state);
    if (!clubs.length) return '<p class="muted">A cidade ainda não tem clubes.</p>';
    const intro = `<p class="muted small">A escolinha treina crianças e adolescentes da cidade no contraturno da escola (eles continuam estudando).
      Cada nível abre uma categoria: ${SPORTS.academy.categories.map((x) => `${x.name} (${x.ages[0]} a ${x.ages[1]} anos)`).join(', ')}.
      Aos 18 anos, quem é melhor que o pior do elenco sobe ao time principal.</p>`;
    return intro + clubs.map((c) => {
      if (!c.academy) return `<h4>${esc(c.name)}</h4><p class="small muted">Escolinha fechada: abra a Sub-17 na aba Clubes (${money(SPORTS.academy.cost[0])}).</p>`;
      const kids = academyKids(state, rt, c);
      const soon = kids.filter((k) => k.age >= 17).length;
      const cats = SPORTS.academy.categories.slice(0, c.academy).map((cat) => {
        const list = kids.filter((k) => youthCategory(k.age, c.academy) === cat).sort((a, b) => b.skill - a.skill || a.id - b.id);
        return `<h4>${cat.name} <small class="muted">${list.length} de ${SPORTS.academy.seats}</small></h4>
          <ul class="works">${list.map((k) => `<li><span><button class="link" data-citizen="${k.id}">${esc(k.name)}</button> <small class="muted">${k.age} anos${k.calling === 'esporte' ? ' · vocação' : ''}</small></span>
            <span class="fame">${pct(k.skill)} <span class="meter inline"><i style="width:${pct(k.skill)}"></i></span>${k.age >= 16 ? ` <button data-promote="${c.id}:${k.id}">Subir</button>` : ''}</span></li>`).join('') || '<li class="muted">Ninguém na faixa de idade.</li>'}</ul>`;
      }).join('');
      return `<h4>${esc(c.name)} <small class="muted">${kids.length} alunos${soon ? ` · ${soon} sobem em janeiro` : ''}</small></h4>${cats}`;
    }).join('') + '<p class="small" data-error></p>';
  }

  #market(state, rt) {
    const s = state.sports;
    const clubs = activeClubs(state);
    if (!clubs.length) return '<p class="muted">A cidade ainda não tem clubes.</p>';
    const open = s.offers.filter((o) => o.status === 'aberta');
    const club = (id) => s.clubs.find((c) => c.id === id);
    const offers = open.map((o) => {
      const p = rt.citizenById.get(o.player);
      return `<li>
        <div><b>${esc(o.buyer)}</b> quer <button class="link" data-citizen="${o.player}">${esc(o.name)}</button> <small class="muted">${esc(club(o.club)?.name ?? '')}</small></div>
        <div class="small">${money(o.value)} · ${p ? `${p.age} anos, habilidade ${pct(p.skill)}` : ''} · vale até ${dayLabel(Math.floor(o.until / TICKS_PER_DAY))}</div>
        <div class="small muted">Vendendo, o clube fica com ${money(o.value * (1 - SPORTS.cityShare))} (${pct(SPORTS.cityShare)} vão para a prefeitura) e o atleta se muda com a família.</div>
        <div class="row"><button class="primary" data-accept="${o.id}">Vender</button><button data-reject="${o.id}">Recusar</button></div>
      </li>`;
    }).join('');
    const stars = clubs.map((c) => `${esc(c.name)}: craque a partir de ${pct(starSkill(c))} de habilidade`).join(' · ');
    const sales = [...s.sales].reverse().map((v) => `<tr><td>${esc(v.name)}<br><small class="muted">${esc(v.clubName)} → ${esc(v.buyer)}</small></td><td>${money(v.value)}<br><small class="muted">${dayLabel(v.day)}</small></td></tr>`).join('');
    return `<p class="muted small">Clubes grandes de fora fazem propostas pelos craques. ${stars}.</p>
      <h4>Propostas</h4>${open.length ? `<ul class="events">${offers}</ul>` : '<p class="small muted">Nenhuma proposta no momento.</p>'}
      <p class="small" data-error></p>
      <h4>Vendas</h4>${sales ? `<table class="history"><tbody>${sales}</tbody></table>` : '<p class="small muted">Nenhuma venda ainda.</p>'}`;
  }

  #races(state, rt) {
    const R = SPORTS.race;
    const races = state.sports.races;
    const next = races.filter((r) => r.status === 'agendada').sort((a, b) => a.day - b.day);
    const done = races.filter((r) => r.status === 'realizada').sort((a, b) => b.day - a.day);
    const intro = `<p class="muted small">Use a ferramenta <b>Corrida de rua</b> (menu Lazer) e arraste da largada até a chegada: o percurso segue as ruas.
      No dia, o percurso fica fechado para os carros das ${R.closed[0]}h às ${R.closed[1]}h (o trânsito desvia) e a largada é às ${R.start}h.
      Custa ${money(R.base)} mais ${money(R.perTile)} por trecho de rua; cada corredor paga ${money(R.fee)} de inscrição para a prefeitura.</p>`;
    const scheduled = next.map((r) => `<li>
      <div><b>${esc(r.name)}</b> <small class="muted">${r.km.toLocaleString('pt-BR')} km · ${r.route.length} trechos fechados</small></div>
      <div class="small">${dayLabel(r.day)} · previsão de ${num(expectedRunners(state, rt, r))} corredores · custo ${money(r.cost)}</div>
      <div class="form">
        <label>Propaganda <input type="number" min="${r.marketing}" max="1000000" step="1000" value="${r.marketing}" data-race-marketing="${r.id}"></label>
        <label><input type="checkbox" data-race-annual="${r.id}" ${r.annual ? 'checked' : ''}> Repetir todo ano</label>
      </div>
      <div class="row"><button data-cancel-race="${r.id}">Cancelar (devolve ${money(r.cost / 2)})</button></div>
    </li>`).join('');
    const results = done.map((r) => `<tr><td>${esc(r.name)}<br><small class="muted">${dayLabel(r.day)} · ${r.km.toLocaleString('pt-BR')} km</small></td>
      <td>${num(r.runners)} corredores<br><small class="muted">${esc(r.winner ?? '')}${r.local ? ' (da cidade)' : ''}</small></td></tr>`).join('');
    return `${intro}<h4>Agendadas</h4>${scheduled ? `<ul class="events">${scheduled}</ul>` : '<p class="small muted">Nenhuma corrida marcada.</p>'}
      <p class="small" data-error></p>
      <h4>Realizadas</h4>${results ? `<table class="history"><tbody>${results}</tbody></table>` : '<p class="small muted">Nenhuma corrida ainda.</p>'}`;
  }

  #history(state) {
    const list = [...state.sports.history].reverse();
    if (!list.length) return '<p class="muted">Nenhuma temporada encerrada ainda.</p>';
    return `<table class="history"><thead><tr><th>Ano</th><th>Clube</th><th>Resultado</th></tr></thead><tbody>${list.map((h) => `
      <tr class="${h.position === 1 || h.promoted ? 'good' : h.relegated ? 'bad' : ''}"><td>${h.season}</td>
        <td>${esc(h.name)}<br><small class="muted">${sportName(h.sport)} · ${divName(h.division).toLowerCase()}</small></td>
        <td>${h.position}º de ${h.teams}${h.position === 1 ? ' · campeão' : ''}${h.promoted ? ' · subiu' : ''}${h.relegated ? ' · caiu' : ''}${h.prize ? `<br><small class="muted">prêmio ${money(h.prize)}</small>` : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  // --- Ações ------------------------------------------------------------------

  #error(text) {
    const el = this.el.querySelector('[data-error]');
    if (el) {
      el.textContent = text;
      el.className = 'small error';
    }
  }

  #redraw() {
    this.key = '';
    this.render(this.state, this.rt);
  }

  #change(e) {
    const t = e.target;
    if (t.dataset.f) {
      this.form[t.dataset.f] = t.value;
      if (t.dataset.f === 'sport') this.#redraw();
      return;
    }
    let cmd = null;
    if (t.dataset.training) cmd = { type: 'clubBudget', id: Number(t.dataset.training), training: Number(t.value) };
    else if (t.dataset.subsidy) cmd = { type: 'clubBudget', id: Number(t.dataset.subsidy), subsidy: Number(t.value) };
    else if (t.dataset.reinvest) cmd = { type: 'clubBudget', id: Number(t.dataset.reinvest), reinvest: t.checked };
    else if (t.dataset.raceMarketing) cmd = { type: 'raceOptions', id: Number(t.dataset.raceMarketing), marketing: Number(t.value) };
    else if (t.dataset.raceAnnual) cmd = { type: 'raceOptions', id: Number(t.dataset.raceAnnual), annual: t.checked };
    else if (t.dataset.youthBudget) cmd = { type: 'clubBudget', id: Number(t.dataset.youthBudget), youthBudget: Number(t.value) };
    if (!cmd) return;
    const result = this.act(cmd);
    this.#redraw();
    if (!result.ok) this.#error(result.reason);
  }

  #click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if ('close' in t.dataset) return this.toggle(false);
    if (t.dataset.tab) {
      this.tab = t.dataset.tab;
      return this.#redraw();
    }
    if (t.dataset.citizen) return this.inspect?.(Number(t.dataset.citizen));
    let result = null;
    if ('found' in t.dataset) {
      const f = this.form;
      result = this.act({ type: 'club', sport: f.sport, home: Number(f.home), name: f.name });
      if (result.ok) f.name = '';
    } else if (t.dataset.cancelRace) {
      result = this.act({ type: 'cancelRace', id: Number(t.dataset.cancelRace) });
    } else if (t.dataset.academy) {
      result = this.act({ type: 'clubAcademy', id: Number(t.dataset.academy) });
    } else if (t.dataset.promote) {
      const [id, player] = t.dataset.promote.split(':').map(Number);
      result = this.act({ type: 'promoteYouth', id, player });
    } else if (t.dataset.accept) {
      if (!confirm('Vender o atleta? Ele se muda da cidade com a família.')) return;
      result = this.act({ type: 'acceptOffer', id: Number(t.dataset.accept) });
    } else if (t.dataset.reject) {
      result = this.act({ type: 'rejectOffer', id: Number(t.dataset.reject) });
    } else if (t.dataset.ct) {
      result = this.act({ type: 'clubCt', id: Number(t.dataset.ct) });
    } else if (t.dataset.closeClub) {
      if (!confirm('Fechar o clube? Os atletas voltam a procurar emprego.')) return;
      result = this.act({ type: 'closeClub', id: Number(t.dataset.closeClub) });
    }
    if (!result) return;
    this.#redraw();
    if (!result.ok) this.#error(result.reason);
  }
}
