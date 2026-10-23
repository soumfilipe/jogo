// Projetos de prédios: para cada tipo do catálogo (zona + nível + tamanho)
// são gerados VARIANTS projetos diferentes, combinando forma, telhado,
// fachada, detalhes e cores. Cada prédio usa um deles, sorteado pelo id.
//
// É só aparência: o projeto é derivado do tipo e do id, nada vai para o save.
//
// Um projeto é uma lista de partes, em coordenadas relativas ao canto do
// lote (0 a `size` em x e y) e alturas em "andares" (1 = TILE_H pixels no
// zoom 1):
//   { kind: 'block', box: [x0, y0, x1, y1], lift, h, wall: {left, right},
//     top, roof: {kind: 'hip'|'gable-x'|'gable-y', color, rise} | null,
//     windows: {cols, style: 'grid'|'bands'|'shop'} | null,
//     bands: [{at, thick, color}], doors: {count, color} | null,
//     sign: {color} | null }
//   { kind: 'cylinder', cx, cy, r, lift, h, color, top }
//   { kind: 'antenna', cx, cy, lift, h }
//   { kind: 'slab', box, color, lines }      (chão: estacionamento, pátio)

import { BUILDINGS, ZONE } from '../world/catalog.js';
import { createRng, hash2, random } from '../core/rng.js';

export const VARIANTS = 20;

// --- Cores ------------------------------------------------------------------

const wall = (left, right) => ({ left, right });

const RES_WALLS = [
  wall('#d9c39a', '#bfa57a'), wall('#e6e2da', '#c9c4ba'), wall('#c98262', '#ab6a4d'),
  wall('#9fb7cf', '#8299b2'), wall('#a9c4a0', '#8ea886'), wall('#e3b5ae', '#c9968f'),
  wall('#e9d48a', '#cdb86e'), wall('#c4c4c4', '#a6a6a6'), wall('#c97b5a', '#a96244'),
  wall('#c3b3d6', '#a595ba'), wall('#f0e6d2', '#d4c8b0'), wall('#8fb3a8', '#74968c'),
];
const ROOFS = ['#b5523b', '#7a4b3a', '#9c4a3a', '#6f5b4b', '#4a4f5a', '#8a3b2c', '#5b3a29', '#3f5a6b', '#a0603a'];
const GLASS = [
  wall('#7fa6d6', '#5f86b8'), wall('#5b7fa8', '#486889'), wall('#7fbfb0', '#5e9f90'),
  wall('#c9b27a', '#a99260'), wall('#8aa0b8', '#6d8299'), wall('#9fc3e0', '#7ea3c2'),
];
const COM_WALLS = [
  wall('#e6e2da', '#c9c4ba'), wall('#d9c39a', '#bfa57a'), wall('#b5b0a6', '#98938a'),
  wall('#e9edf2', '#c8ced6'), wall('#c98262', '#ab6a4d'), ...GLASS,
];
const ACCENTS = ['#e05a47', '#3d8f5a', '#3f6fc0', '#d9822b', '#c23b3b', '#8e44ad', '#16a085', '#f1c40f', '#2c3e50'];
const IND_WALLS = [
  wall('#a89f8a', '#8a826f'), wall('#b08260', '#94694b'), wall('#b5b0a6', '#98938a'),
  wall('#6f8fae', '#57728e'), wall('#7d9a76', '#637d5d'), wall('#c98262', '#ab6a4d'),
  wall('#cfc9b8', '#b0aa99'), wall('#8c8f94', '#717479'),
];
const STRIPES = ['#e8b931', '#5c5f68', '#3f6fc0', '#c23b3b', '#3d8f5a', '#ef8a2d'];
const CHIMNEY = wall('#8d6e5a', '#74584a');
const METAL = wall('#b9bcc2', '#9a9da3');

// --- Gerador ------------------------------------------------------------------

const cache = new Map();

/** Projeto do prédio `b` (um dos VARIANTS do tipo dele). */
export function designFor(b) {
  return design(b.type, Math.floor(hash2(b.id, 13) * VARIANTS));
}

export function design(type, index) {
  const key = `${type}:${index}`;
  let d = cache.get(key);
  if (!d) {
    const info = BUILDINGS[type];
    const rng = createRng(hashString(key) ^ 0x9e3779b9);
    const r = makeRandom(rng);
    const parts = info.utility ? UTILITY_GENERATORS[type](r) : GENERATORS[info.zone](info, r);
    d = { parts, color: parts.find((p) => p.wall)?.wall.left ?? '#999999' };
    cache.set(key, d);
  }
  return d;
}

function makeRandom(rng) {
  const r = () => random(rng);
  r.range = (a, b) => a + (b - a) * random(rng);
  r.pick = (list) => list[Math.floor(random(rng) * list.length)];
  r.chance = (p) => random(rng) < p;
  return r;
}

function block(box, lift, h, wallColors, opts = {}) {
  return {
    kind: 'block', box, lift, h, wall: wallColors,
    top: opts.top ?? mixHex(wallColors.left, '#ffffff', 0.35),
    roof: opts.roof ?? null,
    windows: opts.windows ?? null,
    bands: opts.bands ?? [],
    doors: opts.doors ?? null,
    sign: opts.sign ?? null,
  };
}

/** Telhado com caimento: quatro águas ou duas águas em um dos sentidos. */
function pitchedRoof(r, color, kinds = ['hip', 'gable-x', 'gable-y']) {
  return { kind: r.pick(kinds), color, rise: r.range(0.35, 0.6) };
}

/** Coisas em cima de lajes planas. */
function rooftop(r, part, options) {
  const [x0, y0, x1, y1] = part.box;
  const top = part.lift + part.h;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const d = y1 - y0;
  const out = [];
  switch (r.pick(options)) {
    case 'tank':
      out.push(block([cx - 0.12, cy - 0.12, cx + 0.1, cy + 0.1], top, 0.35, METAL, { top: '#d6d8dc' }));
      break;
    case 'ac':
      for (let i = 0; i < 3; i++) {
        const ax = x0 + w * r.range(0.15, 0.7);
        const ay = y0 + d * r.range(0.15, 0.7);
        out.push(block([ax, ay, ax + 0.12, ay + 0.1], top, 0.12, METAL, { top: '#cfd2d6' }));
      }
      break;
    case 'solar':
      out.push(block([x0 + w * 0.15, y0 + d * 0.15, x1 - w * 0.15, y1 - d * 0.15], top, 0.04,
        wall('#2b3d6b', '#22325a'), { top: '#34508f' }));
      break;
    case 'garden':
      part.top = '#6faa5a';
      out.push(block([cx - 0.1, cy - 0.1, cx + 0.1, cy + 0.1], top, 0.25, wall('#3f7f3b', '#336b30'), { top: '#4f9a48' }));
      break;
    case 'helipad':
      part.top = '#5a5d63';
      out.push({ kind: 'slab', box: [cx - w * 0.3, cy - d * 0.3, cx + w * 0.3, cy + d * 0.3], color: '#f1c40f', lift: top + 0.01, ring: true });
      break;
    case 'antenna':
      out.push({ kind: 'antenna', cx: cx + w * 0.2, cy: cy - d * 0.2, lift: top, h: r.range(0.8, 1.6) });
      break;
    case 'crown':
      out.push(block([x0 + w * 0.2, y0 + d * 0.2, x1 - w * 0.2, y1 - d * 0.2], top, r.range(0.3, 0.6), part.wall, {}));
      break;
    default:
      break;
  }
  return out;
}

function chimney(r, x, y, lift, h, color = CHIMNEY) {
  return block([x, y, x + 0.13, y + 0.13], lift, h, color, { top: '#3d3330' });
}

// Andares das janelas: altura de uma fileira em "andares".
const balconies = (h, color) => {
  const bands = [];
  for (let at = 0.32; at < h - 0.15; at += 0.32) bands.push({ at, thick: 0.05, color });
  return bands;
};

const GENERATORS = {
  [ZONE.RESIDENTIAL](info, r) {
    const size = info.size;
    const base = info.style.height;
    const w = r.pick(RES_WALLS);
    const roofColor = r.pick(ROOFS);
    const i = r.range(0.08, 0.2) * (size === 1 ? 1 : 0.8);

    if (info.level <= 2) {
      const h = base * r.range(0.85, 1.2);
      const cols = info.level === 1 ? 2 : r.pick([2, 3]);
      const parts = [];
      const annex = r.chance(0.4);
      // Com anexo, a casa principal fica no fundo e o anexo (garagem, varanda) na frente.
      const mainBox = annex ? [i, i, 1 - i, 0.62] : [i, i, 1 - i, 1 - i];
      const bands = info.level === 2 && r.chance(0.5) ? [{ at: h * 0.5, thick: 0.06, color: '#f4f1ea' }] : [];
      const main = block(mainBox, 0, h, w, { roof: pitchedRoof(r, roofColor), windows: { cols, style: 'grid' }, bands });
      parts.push(main);
      // A chaminé fica no fundo do telhado: vem antes do anexo, que está na frente.
      if (r.chance(0.45)) parts.push(chimney(r, mainBox[0] + 0.12, mainBox[1] + 0.1, h, r.range(0.4, 0.6)));
      if (annex) {
        const right = r.chance(0.5);
        const box = right ? [0.45, 0.62, 1 - i, 1 - i] : [i, 0.62, 0.6, 1 - i];
        const flat = r.chance(0.5);
        parts.push(block(box, 0, h * r.range(0.45, 0.65), r.chance(0.6) ? w : r.pick(RES_WALLS), {
          roof: flat ? null : pitchedRoof(r, roofColor, ['gable-x', 'gable-y']),
          doors: r.chance(0.5) ? { count: 1, color: '#5a4636' } : null,
        }));
      }
      return parts;
    }

    // Prédios de apartamentos (1x1) e condomínios (2x2).
    const h = base * r.range(0.8, 1.25);
    const form = r.pick(size === 1 ? ['box', 'tiers', 'podium', 'slab', 'box'] : ['tower', 'twin', 'podium', 'tiers', 'slab']);
    const balc = r.chance(0.45) ? balconies(h, mixHex(w.left, '#ffffff', 0.55)) : [];
    const win = { cols: r.pick([3, 4]), style: 'grid' };
    const roofOptions = ['tank', 'ac', 'garden', 'antenna', 'solar', 'none'].concat(size > 1 ? ['helipad', 'crown'] : []);
    const S = size;
    const parts = [];
    if (form === 'box' || form === 'tower') {
      const m = form === 'tower' ? S * r.range(0.18, 0.28) : i;
      parts.push(block([m, m, S - m, S - m], 0, h, w, { windows: win, bands: balc }));
    } else if (form === 'tiers') {
      const h1 = h * r.range(0.45, 0.6);
      parts.push(block([i, i, S - i, S - i], 0, h1, w, { windows: win, bands: balc }));
      const m = i + S * 0.15;
      parts.push(block([m, m, S - m, S - m], h1, h - h1, w, { windows: win }));
    } else if (form === 'podium') {
      const ph = r.range(0.5, 0.8);
      parts.push(block([i * 0.6, i * 0.6, S - i * 0.6, S - i * 0.6], 0, ph, r.pick(COM_WALLS), {
        windows: { cols: 3 * S, style: 'shop' }, bands: [{ at: ph - 0.08, thick: 0.08, color: r.pick(ACCENTS) }],
      }));
      const m = S * r.range(0.22, 0.3);
      parts.push(block([m, m, S - m, S - m], ph, h - ph, w, { windows: win, bands: balc }));
    } else if (form === 'slab') {
      const alongX = r.chance(0.5);
      const box = alongX ? [i, S * 0.28, S - i, S * 0.72] : [S * 0.28, i, S * 0.72, S - i];
      parts.push(block(box, 0, h * 0.9, w, { windows: win, bands: balc }));
    } else if (form === 'twin') {
      const ha = h * r.range(0.8, 1);
      const hb = h * r.range(0.6, 0.9);
      parts.push(block([0.15, 0.15, 0.9, 0.9], 0, ha, w, { windows: win, bands: balc }));
      parts.push(block([1.1, 1.1, 1.85, 1.85], 0, hb, r.chance(0.5) ? w : r.pick(RES_WALLS), { windows: win, bands: balc }));
    }
    // Itens do telhado logo depois da parte em que estão (antes das partes da frente).
    const topPart = parts.reduce((a, p) => (p.lift + p.h > a.lift + a.h ? p : a));
    parts.splice(parts.indexOf(topPart) + 1, 0, ...rooftop(r, topPart, roofOptions));
    return parts;
  },

  [ZONE.COMMERCIAL](info, r) {
    const S = info.size;
    const base = info.style.height;
    const i = r.range(0.08, 0.18);
    const accent = r.pick(ACCENTS);
    const parts = [];

    if (info.level === 1) {
      const w = r.pick(COM_WALLS);
      const h = base * r.range(0.8, 1.3);
      parts.push(block([i, i, 1 - i, 1 - i], 0, h, w, {
        windows: { cols: 3, style: 'shop' },
        bands: r.chance(0.7) ? [{ at: h * 0.32, thick: 0.1, color: accent }] : [],
        sign: r.chance(0.6) ? { color: r.pick(ACCENTS) } : null,
      }));
      parts.push(...rooftop(r, parts[0], ['ac', 'none', 'tank']));
      return parts;
    }

    if (info.level === 2 && S === 1) {
      const w = r.pick(COM_WALLS);
      const h = base * r.range(0.8, 1.2);
      const parking = r.chance(0.45);
      const box = parking ? (r.chance(0.5) ? [i, i, 1 - i, 0.6] : [i, i, 0.6, 1 - i]) : [i, i, 1 - i, 1 - i];
      if (parking) parts.push({ kind: 'slab', box: [0.04, 0.04, 0.96, 0.96], color: '#6b6e75', lines: true, lift: 0 });
      parts.push(block(box, 0, h, w, {
        windows: { cols: 3, style: 'shop' },
        bands: [{ at: h * 0.3, thick: 0.1, color: accent }],
        sign: { color: r.pick(ACCENTS) },
      }));
      parts.push(...rooftop(r, parts.at(-1), ['ac', 'solar', 'none']));
      return parts;
    }

    if (S === 1) {
      // Escritórios: torres de vidro.
      const w = r.pick(GLASS);
      const h = base * r.range(0.8, 1.3);
      const style = r.pick(['bands', 'grid', 'bands']);
      const form = r.pick(['box', 'tiers', 'podium', 'box']);
      if (form === 'box') {
        parts.push(block([i, i, 1 - i, 1 - i], 0, h, w, { windows: { cols: 3, style } }));
      } else if (form === 'tiers') {
        const h1 = h * r.range(0.5, 0.7);
        parts.push(block([i, i, 1 - i, 1 - i], 0, h1, w, { windows: { cols: 3, style } }));
        parts.push(block([i + 0.12, i + 0.12, 1 - i - 0.12, 1 - i - 0.12], h1, h - h1, w, { windows: { cols: 2, style } }));
      } else {
        const ph = r.range(0.5, 0.9);
        parts.push(block([0.06, 0.06, 0.94, 0.94], 0, ph, r.pick(COM_WALLS), { windows: { cols: 3, style: 'shop' } }));
        parts.push(block([0.2, 0.2, 0.8, 0.8], ph, h - ph, w, { windows: { cols: 3, style } }));
      }
      parts.push(...rooftop(r, parts.at(-1), ['antenna', 'crown', 'ac', 'helipad', 'none']));
      return parts;
    }

    // Shopping 2x2: bloco largo, átrio de vidro e estacionamento.
    const w = r.pick(COM_WALLS.slice(0, 5));
    const h = base * r.range(0.8, 1.2);
    const layout = r.pick(['front', 'side', 'full']);
    if (layout !== 'full') parts.push({ kind: 'slab', box: [0.05, 0.05, 1.95, 1.95], color: '#6b6e75', lines: true, lift: 0 });
    const box = layout === 'front' ? [0.15, 0.15, 1.85, 1.2] : layout === 'side' ? [0.15, 0.15, 1.2, 1.85] : [0.12, 0.12, 1.88, 1.88];
    const main = block(box, 0, h, w, {
      windows: { cols: 5, style: 'shop' },
      bands: [{ at: h * 0.85, thick: 0.1, color: accent }, { at: h * 0.35, thick: 0.06, color: accent }],
      sign: { color: r.pick(ACCENTS) },
    });
    parts.push(main);
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;
    parts.push(block([cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3], h, r.range(0.3, 0.6), r.pick(GLASS), { windows: { cols: 2, style: 'bands' } }));
    if (r.chance(0.5)) parts.push(...rooftop(r, main, ['ac', 'solar']));
    return parts;
  },

  [ZONE.INDUSTRIAL](info, r) {
    const S = info.size;
    const base = info.style.height;
    const w = r.pick(IND_WALLS);
    const stripe = r.pick(STRIPES);
    const i = r.range(0.06, 0.15);
    const parts = [];

    if (S === 1) {
      const h = base * r.range(0.8, 1.2);
      const roofKind = r.pick(['flat', 'sawtooth', 'gable', 'flat']);
      const withSilos = info.level >= 2 && r.chance(0.55);
      const mainBox = withSilos ? [i, i, 0.62, 1 - i] : [i, i, 1 - i, 1 - i];
      const main = block(mainBox, 0, h, w, {
        windows: info.level >= 3 || r.chance(0.3) ? { cols: 3, style: 'grid' } : null,
        bands: info.level >= 2 || r.chance(0.4) ? [{ at: h * 0.8, thick: 0.08, color: stripe }] : [],
        doors: { count: r.pick([1, 2]), color: '#4a4d52' },
        roof: roofKind === 'gable' ? { kind: r.pick(['gable-x', 'gable-y']), color: mixHex(w.right, '#000000', 0.15), rise: 0.35 } : null,
      });
      parts.push(main);
      if (roofKind === 'sawtooth') parts.push(...sawtooth(mainBox, h, w, r.chance(0.5)));
      // Chaminés no fundo do telhado, antes dos silos e do anexo, que ficam na frente.
      const chimneys = info.level === 1 ? r.pick([0, 1, 1, 2]) : r.pick([1, 2, 2, 3]);
      for (let k = 0; k < chimneys; k++) parts.push(chimney(r, mainBox[0] + 0.08 + k * 0.17, mainBox[1] + 0.1, h, r.range(0.9, 1.6) * (1 + info.level * 0.15)));
      if (withSilos) {
        const n = r.pick([1, 2, 2, 3]);
        for (let k = 0; k < n; k++) {
          parts.push({ kind: 'cylinder', cx: 0.8, cy: 0.22 + k * (0.6 / Math.max(1, n - 1 || 1)), r: 0.12, lift: 0, h: h * r.range(0.9, 1.5), color: r.pick(['#d6d8dc', '#c9b79c', '#a7b4c2']), top: '#eceef0' });
        }
      }
      if (info.level >= 3 && !withSilos) {
        parts.push(block([0.55, 0.55, 0.92, 0.92], 0, h * 1.5, r.pick(IND_WALLS), { windows: { cols: 2, style: 'grid' } }));
      }
      return parts;
    }

    // Galpão logístico 2x2: armazém comprido, docas e pátio.
    const h = base * r.range(0.8, 1.2);
    const alongX = r.chance(0.5);
    parts.push({ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#7a7d84', lines: r.chance(0.5), lift: 0 });
    const box = alongX ? [0.12, 0.12, 1.88, 1.25] : [0.12, 0.12, 1.25, 1.88];
    const roof = r.pick(['flat', 'gable', 'gable']);
    parts.push(block(box, 0, h, w, {
      bands: [{ at: h * 0.85, thick: 0.08, color: stripe }],
      doors: { count: r.pick([3, 4, 5]), color: '#3e4145' },
      roof: roof === 'gable' ? { kind: alongX ? 'gable-x' : 'gable-y', color: mixHex(w.left, '#000000', 0.1), rise: 0.4 } : null,
    }));
    if (roof === 'flat') parts.push(...rooftop(r, parts.at(-1), ['solar', 'ac']));
    if (r.chance(0.6)) {
      const ob = alongX ? [1.45, 1.4, 1.85, 1.85] : [1.4, 1.45, 1.85, 1.85];
      parts.push(block(ob, 0, h * 0.8, r.pick(IND_WALLS), { windows: { cols: 2, style: 'grid' } }));
    }
    return parts;
  },
};

// Serviços públicos: um desenho por tipo, com pequenas variações.
const UTILITY_GENERATORS = {
  usina_carvao(r) {
    const w = r.pick([wall('#b5b0a6', '#98938a'), wall('#a89f8a', '#8a826f'), wall('#c98262', '#ab6a4d')]);
    const h = r.range(1.1, 1.4);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#5f5d58', lift: 0 }];
    parts.push(block([0.12, 0.12, 1.15, 1.88], 0, h, w, {
      windows: { cols: 4, style: 'grid' },
      bands: [{ at: h * 0.85, thick: 0.08, color: r.pick(STRIPES) }],
      doors: { count: 2, color: '#3e4145' },
    }));
    // Chaminé alta, listrada de vermelho e branco.
    const ch = r.range(3.2, 4);
    for (let k = 0; k < 4; k++) {
      parts.push(block([0.3, 0.3, 0.5, 0.5], h + (ch * k) / 4, ch / 4, k % 2 ? wall('#e8e8e8', '#cfcfcf') : wall('#c0392b', '#a03024'), { top: '#3d3330' }));
    }
    // Torres de resfriamento.
    for (const cy of [0.55, 1.4]) {
      parts.push({ kind: 'cylinder', cx: 1.55, cy, r: 0.32, lift: 0, h: r.range(1.8, 2.3), color: '#cfd2d6', top: '#8d949b' });
    }
    // Pilha de carvão na frente.
    parts.push(block([0.3, 1.55, 0.9, 1.9], 0, 0.12, wall('#2b2b2b', '#1f1f1f'), { top: '#383838' }));
    return parts;
  },

  usina_solar(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: r.pick(['#a39f8e', '#9a9a8a', '#b0a98f']), lift: 0 }];
    const rows = r.pick([4, 5]);
    const panel = wall('#24365f', '#1c2b4d');
    for (let k = 0; k < rows; k++) {
      const y0 = 0.15 + (k * 1.45) / rows;
      parts.push(block([0.15, y0, 1.85, y0 + 1.45 / rows - 0.1], 0.05, 0.08, panel, { top: '#3d5c9e' }));
    }
    parts.push(block([1.45, 1.55, 1.88, 1.9], 0, 0.5, wall('#e6e2da', '#c9c4ba'), { windows: { cols: 2, style: 'grid' }, doors: { count: 1, color: '#5a5d63' } }));
    return parts;
  },

  bomba_agua(r) {
    const w = r.pick([wall('#9fb7cf', '#8299b2'), wall('#b5b0a6', '#98938a'), wall('#e6e2da', '#c9c4ba')]);
    const parts = [];
    parts.push(block([0.12, 0.12, 0.62, 0.7], 0, r.range(0.6, 0.8), w, {
      windows: { cols: 2, style: 'grid' },
      doors: { count: 1, color: '#3f6fc0' },
      bands: [{ at: 0.5, thick: 0.05, color: '#3f6fc0' }],
    }));
    parts.push({ kind: 'cylinder', cx: 0.72, cy: 0.72, r: 0.2, lift: 0, h: 0.35, color: '#c8ccd2', top: '#4f97c4' });
    return parts;
  },

  poco(r) {
    const legs = wall('#8a8f96', '#6f747a');
    const parts = [{ kind: 'slab', box: [0.15, 0.15, 0.85, 0.85], color: '#9a9a8a', lift: 0 }];
    for (const [x, y] of [[0.3, 0.3], [0.62, 0.3], [0.3, 0.62], [0.62, 0.62]]) {
      parts.push(block([x, y, x + 0.08, y + 0.08], 0, 0.95, legs, { top: '#9aa0a6' }));
    }
    parts.push({ kind: 'cylinder', cx: 0.5, cy: 0.5, r: 0.26, lift: 0.95, h: r.range(0.4, 0.55), color: r.pick(['#d9dde2', '#e3c66b', '#9fc3e0']), top: '#aeb4bb' });
    return parts;
  },
};

// Telhado dente de serra: várias águas estreitas em sequência.
function sawtooth([x0, y0, x1, y1], h, w, alongX) {
  const n = 3;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const box = alongX
      ? [x0, y0 + ((y1 - y0) * k) / n, x1, y0 + ((y1 - y0) * (k + 1)) / n]
      : [x0 + ((x1 - x0) * k) / n, y0, x0 + ((x1 - x0) * (k + 1)) / n, y1];
    parts.push(block(box, h, 0.01, w, {
      top: null,
      roof: { kind: alongX ? 'gable-x' : 'gable-y', color: mixHex(w.right, '#000000', 0.1), rise: 0.3 },
    }));
  }
  return parts;
}

// --- Utilidades ---------------------------------------------------------------

export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
