// Painel das notícias: o que a imprensa publicou, do mais novo ao mais velho,
// com filtros por tipo, e os veículos da cidade com os jornalistas de cada um
// (ver systems/news.js). Boatos só aparecem como falsos depois da checagem.

import { NEWS, SECTORS } from '../world/catalog.js';
import { formatDate } from '../core/time.js';
import { mediaEra, outlets } from '../systems/news.js';
import { icon } from './icons.js';

const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Tipos de notícia: nome no selo e filtro em que aparecem.
const CATS = {
  alerta: ['Alerta', 'alertas'], resolvido: ['Cidade', 'cidade'], cidade: ['Cidade', 'cidade'],
  tecnologia: ['Tecnologia', 'ciencia'], mundo: ['Mundo', 'ciencia'], evento: ['Eventos', 'cidade'],
  cultura: ['Cultura', 'fofoca'], economia: ['Economia', 'alertas'], imprensa: ['Imprensa', 'cidade'],
  fofoca: ['Fofoca', 'fofoca'], critica: ['Opinião', 'opiniao'], boato: ['Exclusivo', 'boato'],
  checagem: ['Checagem', 'boato'],
};
const FILTERS = [
  ['todas', 'Todas'], ['alertas', 'Alertas'], ['cidade', 'Cidade'], ['ciencia', 'Ciência'],
  ['opiniao', 'Opinião'], ['fofoca', 'Fofoca'], ['boato', 'Boatos e checagem'],
];

/** Ícone do veículo (jornal, rádio, TV, portal ou redes sociais), em SVG. */
export const mediumIcon = (medium) => icon(NEWS.media[medium]?.icon ?? 'news');

export class NewsPanel {
  constructor(el) {
    this.el = el;
    this.key = '';
    this.filter = 'todas';
    this.seen = 0; // última notícia vista (para o contador no botão)
    this.el.innerHTML = `
      <button class="close" data-close title="Fechar">×</button>
      <h3>Notícias <small class="muted" data-era></small></h3>
      <p class="muted small">A imprensa conta o que acontece na cidade: problemas, descobertas, eventos,
        críticas ao governo, fofocas e, às vezes, boatos. Desconfie das manchetes até a checagem.</p>
      <div class="news-filters" data-filters>${FILTERS.map(([id, name]) => `<button data-filter="${id}">${name}</button>`).join('')}</div>
      <ol class="news-list" data-list></ol>
      <h4>Imprensa da cidade</h4>
      <ul class="outlets" data-outlets></ul>`;
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
      const f = e.target.closest('[data-filter]');
      if (f) {
        this.filter = f.dataset.filter;
        this.key = '';
      }
    });
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    this.key = '';
  }

  /** Notícias publicadas que o jogador ainda não viu no painel. */
  unread(state) {
    const items = state.news?.items ?? [];
    return items.filter((i) => i.id > this.seen).length;
  }

  /** Marca tudo como visto (cidade recém-carregada ou painel aberto). */
  markSeen(state) {
    this.seen = state.news?.nextId - 1 || 0;
  }

  render(state, rt) {
    if (!this.open || !state.news) return;
    this.markSeen(state);
    const news = state.news;
    const key = `${news.nextId}:${this.filter}:${news.items.filter((i) => i.debunked).length}:${state.companies.length}`;
    if (key === this.key) return;
    this.key = key;
    const q = (sel) => this.el.querySelector(sel);
    const era = mediaEra(rt);
    q('[data-era]').innerHTML = `${mediumIcon(era)} ${NEWS.media[era].era}`;
    for (const b of this.el.querySelectorAll('[data-filter]')) b.classList.toggle('active', b.dataset.filter === this.filter);

    const list = news.items.filter((i) => this.filter === 'todas' || CATS[i.cat]?.[1] === this.filter).slice(-60).reverse();
    q('[data-list]').innerHTML = list.map((i) => this.item(i)).join('')
      || '<li class="muted">Nenhuma notícia por aqui ainda.</li>';

    const local = outlets(state);
    q('[data-outlets]').innerHTML = local.length
      ? local.map((co) => {
        const sector = SECTORS[co.sector];
        const staff = rt.companyWorkers.get(co.id)?.size ?? 0;
        return `<li><span>${mediumIcon(sector.medium)} <b>${esc(co.name)}</b> <small class="muted">${esc(sector.name)}</small></span>
          <small>${staff} ${staff === 1 ? 'jornalista' : 'jornalistas'}</small></li>`;
      }).join('')
      : `<li class="muted small">A cidade ainda não tem imprensa própria: as notícias vêm de ${esc(NEWS.regional[era])}.
        A primeira redação abre num andar comercial quando a cidade passa de ${SECTORS.jornal.minPop} moradores.</li>`;
  }

  item(i) {
    const [label] = CATS[i.cat] ?? ['Notícia'];
    const fake = i.fake && i.debunked;
    const classes = ['news', `m-${i.medium}`, i.alert ? 'alert' : '', fake ? 'fake' : ''].filter(Boolean).join(' ');
    const likes = i.likes ? ` · ❤ ${i.likes.toLocaleString('pt-BR')}` : '';
    return `<li class="${classes}">
      <div class="news-meta"><span>${mediumIcon(i.medium)} <b>${esc(i.outlet)}</b></span>
        <span class="tag t-${esc(i.cat)}">${fake ? 'Falso' : esc(label)}</span></div>
      <p class="headline">${esc(i.headline)}</p>
      <p class="body">${esc(i.body)}</p>
      <p class="byline">${i.medium === 'social' || i.author === 'Da redação' ? '' : 'Por '}${esc(i.author)} · ${esc(formatDate(i.tick).replace(/^\d\d:\d\d · /, ''))}${likes}</p>
    </li>`;
  }
}
