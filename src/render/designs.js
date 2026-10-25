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
//     floors: {count, h} | null   (andares de verdade: uma fileira de
//                                  janelas por andar, de altura h),
//     windows: {cols, style: 'grid'|'bands'|'shop'} | null,
//     bands: [{at, thick, color}], doors: {count, color} | null,
//     sign: {color} | null }
//   { kind: 'cylinder', cx, cy, r, lift, h, color, top }
//   { kind: 'antenna', cx, cy, lift, h }
//   { kind: 'slab', box, color, lines }      (chão: estacionamento, pátio)

import { BUILDINGS, ZONE, buildingFloors, floorsOf } from '../world/catalog.js';
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

/** Projeto do prédio `b` (um dos VARIANTS do tipo dele, com os andares dele). */
export function designFor(b) {
  return design(b.type, Math.floor(hash2(b.id, 13) * VARIANTS), buildingFloors(b));
}

/**
 * Projeto `index` do tipo, com `floors` andares (padrão: os do tipo). O
 * sorteio depende só do tipo e do índice: um prédio que ganha andares
 * continua com a mesma forma e as mesmas cores, só mais alto.
 */
export function design(type, index, floors = floorsOf(BUILDINGS[type])) {
  const key = `${type}:${index}:${floors}`;
  let d = cache.get(key);
  if (!d) {
    const info = BUILDINGS[type];
    const rng = createRng(hashString(`${type}:${index}`) ^ 0x9e3779b9);
    const r = makeRandom(rng);
    const parts = info.utility ? UTILITY_GENERATORS[type](r) : GENERATORS[info.zone](info, r, floors);
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
    floors: opts.floors ?? null,
    windows: opts.windows ?? null,
    bands: opts.bands ?? [],
    doors: opts.doors ?? null,
    sign: opts.sign ?? null,
  };
}

// Altura de um andar, em unidades de meio tile, e o que sobra acima do último
// andar: platibanda nas lajes planas, um respiro sob o telhado inclinado.
const RES_FLOOR = 9 / 32;
const OFFICE_FLOOR = 0.34;
const SHOP_FLOOR = 0.45;
const MALL_FLOOR = 0.55;
// Galpão: pé-direito alto, para máquinas e estantes.
const HALL_FLOOR = 0.6;
const PARAPET = 0.1;
const EAVES = 0.03;

/**
 * Bloco com `n` andares de altura `fh` a partir de `lift` (em andares, a
 * altura sai deles). Com telhado inclinado, sem platibanda.
 */
function storeys(box, lift, n, fh, wallColors, opts = {}) {
  const h = n * fh + (opts.roof ? EAVES : PARAPET);
  return block(box, lift, h, wallColors, { ...opts, floors: { count: n, h: fh } });
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

// Sacadas: uma laje saliente entre cada par de andares.
const balconies = (n, fh, color) => {
  const bands = [];
  for (let k = 1; k < n; k++) bands.push({ at: k * fh - 0.025, thick: 0.05, color });
  return bands;
};

const GENERATORS = {
  [ZONE.RESIDENTIAL](info, r, n) {
    const size = info.size;
    const fh = RES_FLOOR;
    const w = r.pick(RES_WALLS);
    const roofColor = r.pick(ROOFS);
    const i = r.range(0.08, 0.2) * (size === 1 ? 1 : 0.8);

    if (info.level <= 2) {
      const cols = info.level === 1 ? 2 : r.pick([2, 3]);
      const parts = [];
      const annex = r.chance(0.4);
      // Com anexo, a casa principal fica no fundo e o anexo (garagem, varanda) na frente.
      const mainBox = annex ? [i, i, 1 - i, 0.62] : [i, i, 1 - i, 1 - i];
      const bands = n > 1 && r.chance(0.5) ? [{ at: fh - 0.03, thick: 0.06, color: '#f4f1ea' }] : [];
      const main = storeys(mainBox, 0, n, fh, w, { roof: pitchedRoof(r, roofColor), windows: { cols, style: 'grid' }, bands });
      parts.push(main);
      const h = main.h;
      // A chaminé fica no fundo do telhado: vem antes do anexo, que está na frente.
      if (r.chance(0.45)) parts.push(chimney(r, mainBox[0] + 0.12, mainBox[1] + 0.1, h, r.range(0.25, 0.4)));
      if (annex) {
        const right = r.chance(0.5);
        const box = right ? [0.45, 0.62, 1 - i, 1 - i] : [i, 0.62, 0.6, 1 - i];
        const flat = r.chance(0.5);
        // Garagem ou varanda: mais baixa que um andar da casa.
        parts.push(block(box, 0, fh * r.range(0.7, 0.9), r.chance(0.6) ? w : r.pick(RES_WALLS), {
          roof: flat ? null : pitchedRoof(r, roofColor, ['gable-x', 'gable-y']),
          doors: r.chance(0.5) ? { count: 1, color: '#5a4636' } : null,
        }));
      }
      return parts;
    }

    // Prédios de apartamentos (1x1) e condomínios (2x2): n andares no total,
    // repartidos entre as partes conforme a forma.
    const form = r.pick(size === 1 ? ['box', 'tiers', 'podium', 'slab', 'box'] : ['tower', 'twin', 'podium', 'tiers', 'slab']);
    const balcColor = r.chance(0.45) ? mixHex(w.left, '#ffffff', 0.55) : null;
    const balc = (k) => (balcColor ? balconies(k, fh, balcColor) : []);
    const win = { cols: r.pick([3, 4]), style: 'grid' };
    const roofOptions = ['tank', 'ac', 'garden', 'antenna', 'solar', 'none'].concat(size > 1 ? ['helipad', 'crown'] : []);
    const S = size;
    const parts = [];
    if (form === 'box' || form === 'tower') {
      const m = form === 'tower' ? S * r.range(0.18, 0.28) : i;
      parts.push(storeys([m, m, S - m, S - m], 0, n, fh, w, { windows: win, bands: balc(n) }));
    } else if (form === 'tiers') {
      // Base mais larga com a maior parte dos andares; o recuo no alto.
      const n1 = Math.max(1, Math.min(n - 1, Math.round(n * r.range(0.5, 0.7))));
      const base = storeys([i, i, S - i, S - i], 0, n1, fh, w, { windows: win, bands: balc(n1) });
      parts.push(base);
      const m = i + S * 0.15;
      parts.push(storeys([m, m, S - m, S - m], n1 * fh, n - n1, fh, w, { windows: win }));
    } else if (form === 'podium') {
      // Térreo comercial mais largo e os apartamentos em cima.
      const pod = storeys([i * 0.6, i * 0.6, S - i * 0.6, S - i * 0.6], 0, 1, SHOP_FLOOR, r.pick(COM_WALLS), {
        windows: { cols: 3 * S, style: 'shop' }, bands: [{ at: SHOP_FLOOR - 0.04, thick: 0.08, color: r.pick(ACCENTS) }],
      });
      parts.push(pod);
      const m = S * r.range(0.22, 0.3);
      parts.push(storeys([m, m, S - m, S - m], SHOP_FLOOR, Math.max(1, n - 1), fh, w, { windows: win, bands: balc(n - 1) }));
    } else if (form === 'slab') {
      // Lâmina: estreita, então precisa de um andar a mais.
      const alongX = r.chance(0.5);
      const box = alongX ? [i, S * 0.28, S - i, S * 0.72] : [S * 0.28, i, S * 0.72, S - i];
      parts.push(storeys(box, 0, n + 1, fh, w, { windows: win, bands: balc(n + 1) }));
    } else if (form === 'twin') {
      // Duas torres estreitas: cada uma com os n andares (ou um a menos).
      const nb = n - (r.chance(0.5) ? 1 : 0);
      parts.push(storeys([0.15, 0.15, 0.9, 0.9], 0, n, fh, w, { windows: win, bands: balc(n) }));
      parts.push(storeys([1.1, 1.1, 1.85, 1.85], 0, nb, fh, r.chance(0.5) ? w : r.pick(RES_WALLS), { windows: win, bands: balc(nb) }));
    }
    // Itens do telhado logo depois da parte em que estão (antes das partes da frente).
    const topPart = parts.reduce((a, p) => (p.lift + p.h > a.lift + a.h ? p : a));
    parts.splice(parts.indexOf(topPart) + 1, 0, ...rooftop(r, topPart, roofOptions));
    return parts;
  },

  [ZONE.COMMERCIAL](info, r, n) {
    const S = info.size;
    const i = r.range(0.08, 0.18);
    const accent = r.pick(ACCENTS);
    const parts = [];

    if (S === 1 && info.level <= 2) {
      // Loja e mercado: térreo de vitrine alto e, no mercado, um andar em cima.
      const w = r.pick(COM_WALLS);
      const parking = info.level === 2 && r.chance(0.45);
      const box = parking ? (r.chance(0.5) ? [i, i, 1 - i, 0.6] : [i, i, 0.6, 1 - i]) : [i, i, 1 - i, 1 - i];
      if (parking) parts.push({ kind: 'slab', box: [0.04, 0.04, 0.96, 0.96], color: '#6b6e75', lines: true, lift: 0 });
      const main = storeys(box, 0, n, SHOP_FLOOR, w, {
        windows: { cols: 3, style: 'shop' },
        bands: info.level === 2 || r.chance(0.7) ? [{ at: SHOP_FLOOR - 0.06, thick: 0.08, color: accent }] : [],
        sign: info.level === 2 || r.chance(0.6) ? { color: r.pick(ACCENTS) } : null,
      });
      parts.push(main);
      parts.push(...rooftop(r, main, info.level === 1 ? ['ac', 'none', 'tank'] : ['ac', 'solar', 'none']));
      return parts;
    }

    if (S === 1) {
      // Escritórios: prédios de vidro com os andares que as vagas pedem.
      const w = r.pick(GLASS);
      const style = r.pick(['bands', 'grid', 'bands']);
      const form = r.pick(['box', 'tiers', 'podium', 'box']);
      if (form === 'box') {
        parts.push(storeys([i, i, 1 - i, 1 - i], 0, n, OFFICE_FLOOR, w, { windows: { cols: 3, style } }));
      } else if (form === 'tiers') {
        const n1 = Math.max(1, n - r.pick([1, 1, 2]));
        parts.push(storeys([i, i, 1 - i, 1 - i], 0, n1, OFFICE_FLOOR, w, { windows: { cols: 3, style } }));
        parts.push(storeys([i + 0.12, i + 0.12, 1 - i - 0.12, 1 - i - 0.12], n1 * OFFICE_FLOOR, Math.max(1, n - n1), OFFICE_FLOOR, w, { windows: { cols: 2, style } }));
      } else {
        // Térreo de lojas e os escritórios em cima.
        parts.push(storeys([0.06, 0.06, 0.94, 0.94], 0, 1, SHOP_FLOOR, r.pick(COM_WALLS), { windows: { cols: 3, style: 'shop' } }));
        parts.push(storeys([0.2, 0.2, 0.8, 0.8], SHOP_FLOOR, n, OFFICE_FLOOR, w, { windows: { cols: 3, style } }));
      }
      parts.push(...rooftop(r, parts.at(-1), ['antenna', 'crown', 'ac', 'helipad', 'none']));
      return parts;
    }

    // Shopping 2x2: bloco largo, átrio de vidro e estacionamento.
    const w = r.pick(COM_WALLS.slice(0, 5));
    const layout = r.pick(['front', 'side', 'full']);
    if (layout !== 'full') parts.push({ kind: 'slab', box: [0.05, 0.05, 1.95, 1.95], color: '#6b6e75', lines: true, lift: 0 });
    const box = layout === 'front' ? [0.15, 0.15, 1.85, 1.2] : layout === 'side' ? [0.15, 0.15, 1.2, 1.85] : [0.12, 0.12, 1.88, 1.88];
    const main = storeys(box, 0, n, MALL_FLOOR, w, {
      windows: { cols: 5, style: 'shop' },
      bands: [{ at: n * MALL_FLOOR - 0.04, thick: 0.1, color: accent }, { at: MALL_FLOOR - 0.04, thick: 0.06, color: accent }],
      sign: { color: r.pick(ACCENTS) },
    });
    parts.push(main);
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;
    parts.push(block([cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3], main.h, r.range(0.3, 0.5), r.pick(GLASS), { windows: { cols: 2, style: 'bands' } }));
    if (r.chance(0.5)) parts.push(...rooftop(r, main, ['ac', 'solar']));
    return parts;
  },

  [ZONE.INDUSTRIAL](info, r, n) {
    const S = info.size;
    const w = r.pick(IND_WALLS);
    const stripe = r.pick(STRIPES);
    const i = r.range(0.06, 0.15);
    const parts = [];

    if (S === 1) {
      const roofKind = r.pick(['flat', 'sawtooth', 'gable', 'flat']);
      const withSilos = info.level >= 2 && r.chance(0.55);
      const mainBox = withSilos ? [i, i, 0.62, 1 - i] : [i, i, 1 - i, 1 - i];
      const main = storeys(mainBox, 0, n, HALL_FLOOR, w, {
        windows: info.level >= 3 || r.chance(0.3) ? { cols: 3, style: 'grid' } : null,
        bands: info.level >= 2 || r.chance(0.4) ? [{ at: n * HALL_FLOOR * 0.8, thick: 0.08, color: stripe }] : [],
        doors: { count: r.pick([1, 2]), color: '#4a4d52' },
        roof: roofKind === 'gable' ? { kind: r.pick(['gable-x', 'gable-y']), color: mixHex(w.right, '#000000', 0.15), rise: 0.35 } : null,
      });
      const h = main.h;
      parts.push(main);
      if (roofKind === 'sawtooth') parts.push(...sawtooth(mainBox, h, w, r.chance(0.5)));
      // Chaminés no fundo do telhado, antes dos silos e do anexo, que ficam na frente.
      const chimneys = info.level === 1 ? r.pick([0, 1, 1, 2]) : r.pick([1, 2, 2, 3]);
      for (let k = 0; k < chimneys; k++) parts.push(chimney(r, mainBox[0] + 0.08 + k * 0.17, mainBox[1] + 0.1, h, r.range(0.4, 0.75) * (1 + info.level * 0.15)));
      if (withSilos) {
        const n = r.pick([1, 2, 2, 3]);
        for (let k = 0; k < n; k++) {
          parts.push({ kind: 'cylinder', cx: 0.8, cy: 0.22 + k * (0.6 / Math.max(1, n - 1 || 1)), r: 0.12, lift: 0, h: h * r.range(0.9, 1.5), color: r.pick(['#d6d8dc', '#c9b79c', '#a7b4c2']), top: '#eceef0' });
        }
      }
      if (info.level >= 3 && !withSilos) {
        // Escritório da fábrica, na frente: um andar acima do galpão.
        const floors = Math.ceil((n * HALL_FLOOR) / RES_FLOOR) + 1;
        parts.push(storeys([0.55, 0.55, 0.92, 0.92], 0, floors, RES_FLOOR, r.pick(IND_WALLS), { windows: { cols: 2, style: 'grid' } }));
      }
      return parts;
    }

    // Galpão logístico 2x2: armazém comprido, docas e pátio.
    const alongX = r.chance(0.5);
    parts.push({ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#7a7d84', lines: r.chance(0.5), lift: 0 });
    const box = alongX ? [0.12, 0.12, 1.88, 1.25] : [0.12, 0.12, 1.25, 1.88];
    const roof = r.pick(['flat', 'gable', 'gable']);
    const roofDef = roof === 'gable' ? { kind: alongX ? 'gable-x' : 'gable-y', color: mixHex(w.left, '#000000', 0.1), rise: 0.4 } : null;
    const hall = storeys(box, 0, n, HALL_FLOOR * 1.4, w, { roof: roofDef, doors: { count: r.pick([3, 4, 5]), color: '#3e4145' } });
    const h = hall.h;
    hall.bands.push({ at: h * 0.85, thick: 0.08, color: stripe });
    parts.push(hall);
    if (roof === 'flat') parts.push(...rooftop(r, parts.at(-1), ['solar', 'ac']));
    if (r.chance(0.6)) {
      const ob = alongX ? [1.45, 1.4, 1.85, 1.85] : [1.4, 1.45, 1.85, 1.85];
      // Escritório da logística: dois andares baixos ao lado das docas.
      parts.push(storeys(ob, 0, 2, RES_FLOOR, r.pick(IND_WALLS), { windows: { cols: 2, style: 'grid' } }));
    }
    return parts;
  },
};

// Fazendas: lavoura em faixas, celeiro, silos e (nas maiores) galpão de máquinas.
const CROPS = ['#c9b456', '#9cbf5a', '#6f9a3f', '#d9c27a', '#8fae4a', '#b58a4a', '#7fa55a', '#c4a24a'];
const BARNS = [wall('#a5402d', '#86321f'), wall('#c9b79c', '#ab9a80'), wall('#e6e2da', '#c9c4ba'), wall('#8a5a3a', '#6f472e')];

GENERATORS[ZONE.RURAL] = (info, r) => {
  const S = info.size;
  const parts = [{ kind: 'slab', box: [0.03, 0.03, S - 0.03, S - 0.03], color: r.pick(['#8a7a4a', '#7c6f45', '#93834f']), lift: 0 }];
  // Faixas de lavoura, cada uma com uma cultura.
  const strips = S === 1 ? r.pick([2, 3]) : r.pick([3, 4, 5]);
  const alongX = r.chance(0.5);
  const field = S === 1 ? [0.06, 0.06, 0.94, 0.55] : [0.06, 0.06, 1.94, 1.2];
  const len = (alongX ? field[3] - field[1] : field[2] - field[0]) / strips;
  for (let k = 0; k < strips; k++) {
    const a = (alongX ? field[1] : field[0]) + k * len;
    const box = alongX ? [field[0], a + 0.01, field[2], a + len - 0.01] : [a + 0.01, field[1], a + len - 0.01, field[3]];
    parts.push({ kind: 'slab', box, color: r.pick(CROPS), lines: true, lift: 0.01 });
  }
  // Celeiro com telhado de duas águas.
  const barn = r.pick(BARNS);
  const bx = r.range(0.06, S === 1 ? 0.18 : 0.3);
  const bw = S === 1 ? r.range(0.38, 0.5) : r.range(0.6, 0.8);
  const by = S === 1 ? 0.6 : 1.3;
  parts.push(block([bx, by, bx + bw, S - 0.08], 0, r.range(0.3, 0.45) * (1 + (info.level - 1) * 0.2), barn, {
    roof: { kind: r.pick(['gable-x', 'gable-y']), color: r.pick(['#6f5b4b', '#5b5f66', '#8a3b2c']), rise: r.range(0.2, 0.35) },
    doors: { count: 1, color: '#4a3a2a' },
  }));
  // Silos: um no sítio, mais nas fazendas maiores.
  const silos = info.level === 1 ? r.pick([0, 1]) : info.level === 2 ? r.pick([1, 2]) : r.pick([2, 3]);
  for (let k = 0; k < silos; k++) {
    parts.push({
      kind: 'cylinder', cx: S - 0.18 - k * 0.2, cy: S === 1 ? 0.78 : 1.6, r: 0.08 + (S - 1) * 0.04,
      lift: 0, h: r.range(0.5, 0.8) * (1 + (S - 1) * 0.5), color: r.pick(['#d6d8dc', '#c9b79c', '#a7b4c2']), top: '#eceef0',
    });
  }
  if (S > 1) {
    // Agroindústria: galpão de beneficiamento.
    const w = r.pick(IND_WALLS);
    parts.push(block([1.0, 1.3, 1.45, 1.9], 0, r.range(0.55, 0.75), w, { doors: { count: 2, color: '#3e4145' }, bands: [{ at: 0.4, thick: 0.06, color: r.pick(STRIPES) }] }));
  } else if (info.level >= 3) {
    // Trator no pátio.
    const tx = r.range(0.55, 0.62);
    parts.push(block([tx, 0.62, tx + 0.16, 0.72], 0, 0.1, wall(r.pick(['#3d8f5a', '#c23b3b', '#e8b931']), '#2c3e50'), { top: '#4a4d52' }));
  }
  return parts;
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

  usina_gas(r) {
    const w = r.pick([wall('#b5b0a6', '#98938a'), wall('#9fb7cf', '#8299b2'), wall('#e6e2da', '#c9c4ba')]);
    const h = r.range(1, 1.2);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#6d6f73', lift: 0 }];
    parts.push(block([0.12, 0.12, 1.3, 1.1], 0, h, w, {
      windows: { cols: 3, style: 'bands' },
      bands: [{ at: h * 0.8, thick: 0.06, color: r.pick(STRIPES) }],
      doors: { count: 2, color: '#3e4145' },
    }));
    // Duas chaminés finas de exaustão e os tanques de gás.
    for (const cx of [0.35, 0.7]) parts.push({ kind: 'cylinder', cx, cy: 0.35, r: 0.08, lift: h, h: r.range(1.4, 1.8), color: '#c8ccd2', top: '#5b5f66' });
    for (const cy of [1.4, 1.75]) parts.push({ kind: 'cylinder', cx: 1.5, cy, r: 0.17, lift: 0, h: 0.4, color: '#e6e2da', top: '#c9c4ba' });
    return parts;
  },

  hidreletrica(r) {
    const concrete = wall('#c9c6bd', '#a9a69d');
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8a8f86', lift: 0 }];
    // Barragem em degraus e a casa de força.
    parts.push(block([0.1, 0.1, 1.9, 0.55], 0, r.range(1.3, 1.6), concrete, { bands: [{ at: 0.4, thick: 0.05, color: '#8d9093' }] }));
    parts.push(block([0.3, 0.75, 1.5, 1.55], 0, 0.7, wall('#e6e2da', '#c9c4ba'), {
      windows: { cols: 4, style: 'grid' }, doors: { count: 3, color: '#3f6fc0' },
    }));
    // Comportas: faixas azuis de água descendo.
    for (const x of [0.45, 0.9, 1.35]) parts.push(block([x, 0.56, x + 0.2, 0.74], 0, 0.15, wall('#5aa0d0', '#4a88b4'), { top: '#8cc4e8' }));
    return parts;
  },

  usina_eolica(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: r.pick(['#8fae7d', '#9ab486']), lift: 0 }];
    for (const [cx, cy] of [[0.5, 0.5], [1.5, 0.6], [0.6, 1.5], [1.45, 1.45]]) {
      const h = r.range(2.6, 3.2);
      parts.push({ kind: 'cylinder', cx, cy, r: 0.05, lift: 0, h, color: '#eef0f2', top: '#d6d9dd' });
      // Pás: três hastes finas no alto.
      parts.push(block([cx - 0.35, cy - 0.02, cx + 0.35, cy + 0.02], h, 0.05, wall('#f4f5f6', '#dfe2e5'), { top: '#ffffff' }));
      parts.push(block([cx - 0.02, cy - 0.02, cx + 0.02, cy + 0.02], h - 0.3, 0.6, wall('#f4f5f6', '#dfe2e5'), { top: '#ffffff' }));
    }
    return parts;
  },

  usina_hidrogenio(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#9aa3ad', lift: 0 }];
    parts.push(block([0.12, 0.12, 1.1, 1.0], 0, 0.9, wall('#e9edf2', '#c8ced6'), {
      windows: { cols: 3, style: 'bands' }, bands: [{ at: 0.75, thick: 0.06, color: '#16a085' }],
    }));
    // Tanques esféricos (aqui, cilindros baixos) e eletrolisadores.
    for (const [cx, cy] of [[1.45, 0.45], [1.45, 1.0]]) parts.push({ kind: 'cylinder', cx, cy, r: 0.24, lift: 0, h: 0.6, color: '#f4f5f6', top: '#16a085' });
    for (let k = 0; k < 3; k++) parts.push(block([0.2 + k * 0.45, 1.3, 0.55 + k * 0.45, 1.85], 0, 0.4, METAL, { top: '#d6d8dc' }));
    return parts;
  },

  refinaria(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#5f5d58', lift: 0 }];
    // Torres de destilação de alturas diferentes.
    for (const [cx, cy, h] of [[0.35, 0.35, 2.8], [0.7, 0.35, 2.2], [0.35, 0.75, 1.8]]) {
      parts.push({ kind: 'cylinder', cx, cy, r: 0.12, lift: 0, h: h * r.range(0.9, 1.1), color: '#c8ccd2', top: '#8d949b' });
    }
    // Tanques de armazenamento.
    for (const [cx, cy] of [[1.3, 0.45], [1.7, 0.45], [1.3, 0.95], [1.7, 0.95]]) {
      parts.push({ kind: 'cylinder', cx, cy, r: 0.2, lift: 0, h: 0.45, color: r.pick(['#e6e2da', '#f0e6d2']), top: '#b5b0a6' });
    }
    parts.push(block([0.15, 1.3, 1.85, 1.85], 0, 0.55, r.pick(IND_WALLS), {
      windows: { cols: 4, style: 'grid' }, doors: { count: 2, color: '#3e4145' },
      bands: [{ at: 0.45, thick: 0.05, color: '#e8b931' }],
    }));
    parts.push({ kind: 'antenna', cx: 0.7, cy: 0.75, lift: 0, h: 3.2 });
    return parts;
  },

  fabrica_cimento(r) {
    const dust = wall('#cfc9b8', '#b0aa99');
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#a7a397', lift: 0 }];
    // Forno rotativo comprido, silos e a chaminé.
    parts.push(block([0.15, 1.35, 1.85, 1.65], 0.2, 0.3, wall('#b08260', '#94694b'), { top: '#c49a78' }));
    for (const cx of [0.4, 0.8, 1.2]) parts.push({ kind: 'cylinder', cx, cy: 0.5, r: 0.18, lift: 0, h: r.range(1.6, 2), color: '#dcd8cc', top: '#b0aa99' });
    parts.push(block([1.4, 0.15, 1.85, 1.0], 0, 1.4, dust, { windows: { cols: 2, style: 'grid' } }));
    parts.push({ kind: 'cylinder', cx: 1.62, cy: 0.58, r: 0.07, lift: 1.4, h: 1.6, color: '#b5b0a6', top: '#5b5f66' });
    return parts;
  },

  usina_etanol(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#7d8a5c', lift: 0 }];
    parts.push(block([0.12, 0.12, 1.2, 0.95], 0, 1.1, r.pick(IND_WALLS), {
      windows: { cols: 3, style: 'grid' }, bands: [{ at: 0.9, thick: 0.06, color: '#3d8f5a' }], doors: { count: 2, color: '#3e4145' },
    }));
    // Tanques de fermentação e a pilha de bagaço.
    for (const [cx, cy] of [[1.5, 0.35], [1.5, 0.8]]) parts.push({ kind: 'cylinder', cx, cy, r: 0.2, lift: 0, h: 0.9, color: '#d9dde2', top: '#9fa6ad' });
    parts.push(block([0.2, 1.3, 1.1, 1.85], 0, 0.25, wall('#c9b27a', '#a99260'), { top: '#d9c08a' }));
    parts.push({ kind: 'cylinder', cx: 0.35, cy: 0.35, r: 0.07, lift: 1.1, h: 1.2, color: '#c8ccd2', top: '#5b5f66' });
    return parts;
  },

  instituto_pesquisa(r) {
    const w = r.pick([wall('#e9edf2', '#c8ced6'), wall('#e6e2da', '#c9c4ba'), wall('#d9c39a', '#bfa57a')]);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8fae7d', lift: 0 }];
    const h = r.range(1.2, 1.6);
    parts.push(block([0.15, 0.15, 1.85, 0.9], 0, h, w, {
      windows: { cols: 5, style: 'grid' }, doors: { count: 1, color: '#3f6fc0' },
      bands: [{ at: h * 0.92, thick: 0.05, color: '#3f6fc0' }],
    }));
    parts.push(block([0.15, 1.05, 0.95, 1.85], 0, h * 0.7, w, { windows: { cols: 3, style: 'bands' } }));
    // Observatório: cúpula branca sobre um tambor.
    parts.push({ kind: 'cylinder', cx: 1.4, cy: 1.45, r: 0.3, lift: 0, h: 0.6, color: '#f4f5f6', top: '#dfe2e5' });
    parts.push({ kind: 'cylinder', cx: 1.4, cy: 1.45, r: 0.2, lift: 0.6, h: 0.25, color: '#cfd5dc', top: '#eef0f2' });
    parts.push({ kind: 'antenna', cx: 0.4, cy: 0.4, lift: h, h: 0.9 });
    return parts;
  },

  petroquimica(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#5f5d58', lift: 0 }];
    // Malha de torres e esferas de armazenamento (cilindros baixos), e uma chama.
    for (const [cx, cy, h] of [[0.3, 0.3, 3.2], [0.6, 0.3, 2.6], [0.3, 0.62, 2.2], [0.62, 0.62, 2.9]]) {
      parts.push({ kind: 'cylinder', cx, cy, r: 0.1, lift: 0, h: h * r.range(0.9, 1.1), color: '#d0d3d8', top: '#8d949b' });
    }
    for (const [cx, cy] of [[1.25, 0.4], [1.65, 0.4], [1.25, 0.85], [1.65, 0.85]]) {
      parts.push({ kind: 'cylinder', cx, cy, r: 0.18, lift: 0, h: 0.35, color: '#f4f5f6', top: '#c9c4ba' });
    }
    parts.push(block([0.15, 1.2, 1.85, 1.85], 0, 0.6, r.pick(IND_WALLS), {
      windows: { cols: 5, style: 'grid' }, doors: { count: 3, color: '#3e4145' },
      bands: [{ at: 0.5, thick: 0.05, color: '#ef8a2d' }],
    }));
    parts.push({ kind: 'cylinder', cx: 0.95, cy: 0.25, r: 0.05, lift: 0, h: 3.6, color: '#b5b0a6', top: '#ef8a2d' });
    return parts;
  },

  biotecnologia(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8fae7d', lift: 0 }];
    const w = r.pick([wall('#e9edf2', '#c8ced6'), wall('#e6e2da', '#c9c4ba')]);
    parts.push(block([0.12, 0.12, 1.3, 1.0], 0, 1.3, w, {
      windows: { cols: 4, style: 'bands' }, bands: [{ at: 1.15, thick: 0.06, color: '#16a085' }],
      doors: { count: 1, color: '#16a085' },
    }));
    parts.push(block([0.15, 1.2, 1.0, 1.85], 0, 0.8, r.pick(GLASS), { windows: { cols: 3, style: 'bands' } }));
    // Biorreatores: cilindros de aço.
    for (const [cx, cy] of [[1.5, 1.3], [1.5, 1.7], [1.62, 0.4]]) {
      parts.push({ kind: 'cylinder', cx, cy, r: 0.16, lift: 0, h: 0.7, color: '#d9dde2', top: '#9fa6ad' });
    }
    return parts;
  },

  torre_celular() {
    const steel = wall('#c0c4c9', '#a3a7ad');
    const parts = [{ kind: 'slab', box: [0.2, 0.2, 0.8, 0.8], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.45, 0.45, 0.55, 0.55], 0, 3.4, steel, { top: '#d6d9dd' }));
    // Antenas no alto.
    for (const [x, y] of [[0.38, 0.45], [0.55, 0.38], [0.45, 0.55]]) {
      parts.push(block([x, y, x + 0.07, y + 0.07], 2.9, 0.4, wall('#e9edf2', '#c8ced6'), { top: '#ffffff' }));
    }
    parts.push(block([0.22, 0.65, 0.4, 0.78], 0, 0.25, wall('#e6e2da', '#c9c4ba'), { top: '#bfb8a8' }));
    return parts;
  },

  creche(r) {
    const w = r.pick([wall('#f2c6b4', '#d8a995'), wall('#c5e3b8', '#a8c79b'), wall('#f7e3a1', '#dcc684')]);
    const parts = [{ kind: 'slab', box: [0.08, 0.08, 0.92, 0.92], color: '#9ab486', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.7, 0.62], 0, 0.6, w, {
      roof: { kind: 'gable-x', color: r.pick(['#d9534f', '#3f6fc0', '#e8b931']), rise: 0.35 },
      windows: { cols: 2, style: 'grid' }, doors: { count: 1, color: '#3f6fc0' },
    }));
    // Parquinho: escorregador e caixa de areia.
    parts.push(block([0.72, 0.7, 0.86, 0.84], 0, 0.04, wall('#e3d3a1', '#cdbd8b'), { top: '#efe0b0' }));
    parts.push(block([0.2, 0.74, 0.3, 0.88], 0, 0.25, wall('#e05a47', '#c0392b'), { top: '#f1c40f' }));
    return parts;
  },

  escola(r) {
    const w = r.pick([wall('#e6d1a8', '#c9b48b'), wall('#e9edf2', '#c8ced6'), wall('#d9c39a', '#bfa57a')]);
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.1, 0.1, 0.9, 0.5], 0, 0.95, w, {
      windows: { cols: 4, style: 'grid' }, doors: { count: 1, color: '#3d8f5a' },
      bands: [{ at: 0.45, thick: 0.05, color: '#3d8f5a' }],
    }));
    // Quadra no pátio.
    parts.push({ kind: 'slab', box: [0.14, 0.58, 0.86, 0.9], color: '#c0703f', lines: true, lift: 0.01 });
    parts.push({ kind: 'antenna', cx: 0.16, cy: 0.16, lift: 0.95, h: 0.5 });
    return parts;
  },

  escola_media(r) {
    const w = r.pick([wall('#e6d1a8', '#c9b48b'), wall('#e9edf2', '#c8ced6'), wall('#c98262', '#ab6a4d')]);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.12, 0.12, 1.88, 0.75], 0, 1.4, w, {
      windows: { cols: 7, style: 'grid' }, doors: { count: 2, color: '#3f6fc0' },
      bands: [{ at: 0.7, thick: 0.05, color: '#3f6fc0' }],
    }));
    parts.push(block([0.12, 0.85, 0.7, 1.88], 0, 1.0, w, { windows: { cols: 3, style: 'grid' } }));
    parts.push({ kind: 'slab', box: [0.85, 0.95, 1.88, 1.88], color: '#c0703f', lines: true, lift: 0.01 });
    return parts;
  },

  escola_tecnica(r) {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#8a8f86', lift: 0 }];
    parts.push(block([0.1, 0.1, 0.9, 0.55], 0, 1.0, wall('#e6e2da', '#c9c4ba'), {
      windows: { cols: 4, style: 'grid' }, doors: { count: 1, color: '#e8b931' },
      bands: [{ at: 0.9, thick: 0.06, color: '#e8b931' }],
    }));
    // Oficina com telhado dente de serra.
    parts.push(block([0.1, 0.6, 0.9, 0.9], 0, 0.55, r.pick(IND_WALLS), { doors: { count: 2, color: '#3e4145' } }));
    parts.push(...sawtooth([0.1, 0.6, 0.9, 0.9], 0.55, r.pick(IND_WALLS), true));
    return parts;
  },

  senai(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8a8f86', lift: 0 }];
    parts.push(block([0.12, 0.12, 1.2, 0.9], 0, 1.2, wall('#e9edf2', '#c8ced6'), {
      windows: { cols: 4, style: 'bands' }, bands: [{ at: 1.05, thick: 0.08, color: '#c23b3b' }],
      doors: { count: 1, color: '#c23b3b' },
    }));
    const w = r.pick(IND_WALLS);
    parts.push(block([0.12, 1.05, 1.88, 1.88], 0, 0.8, w, { doors: { count: 3, color: '#3e4145' } }));
    parts.push(...sawtooth([0.12, 1.05, 1.88, 1.88], 0.8, w, false));
    parts.push({ kind: 'cylinder', cx: 1.55, cy: 0.45, r: 0.2, lift: 0, h: 0.8, color: '#d9dde2', top: '#9fa6ad' });
    return parts;
  },

  universidade(r) {
    const stone = r.pick([wall('#e6d1a8', '#c9b48b'), wall('#d9c39a', '#bfa57a'), wall('#e9e4da', '#cdc6b8')]);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#7fa86e', lift: 0 }];
    // Prédio principal com cúpula, duas alas e o gramado no meio.
    parts.push(block([0.12, 0.12, 1.88, 0.62], 0, 1.5, stone, {
      windows: { cols: 7, style: 'grid' }, doors: { count: 1, color: '#7a4b3a' },
      bands: [{ at: 1.4, thick: 0.08, color: mixHex(stone.left, '#000000', 0.2) }],
    }));
    parts.push({ kind: 'cylinder', cx: 1.0, cy: 0.37, r: 0.22, lift: 1.5, h: 0.45, color: '#e9e4da', top: '#6f8fae' });
    parts.push(block([0.12, 0.72, 0.55, 1.88], 0, 1.1, stone, { windows: { cols: 3, style: 'grid' } }));
    parts.push(block([1.45, 0.72, 1.88, 1.88], 0, 1.1, stone, { windows: { cols: 3, style: 'grid' } }));
    parts.push({ kind: 'antenna', cx: 1.0, cy: 0.37, lift: 1.95, h: 0.5 });
    return parts;
  },

  biblioteca(r) {
    const stone = r.pick([wall('#e9e4da', '#cdc6b8'), wall('#d9c39a', '#bfa57a')]);
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.12, 0.2, 0.88, 0.8], 0, 0.95, stone, {
      windows: { cols: 3, style: 'bands' }, doors: { count: 1, color: '#7a4b3a' },
      roof: { kind: 'gable-y', color: '#6f5b4b', rise: 0.3 },
    }));
    // Colunas na frente.
    for (const x of [0.2, 0.4, 0.6, 0.8]) parts.push({ kind: 'cylinder', cx: x, cy: 0.86, r: 0.035, lift: 0, h: 0.85, color: '#f4f1ea', top: '#f4f1ea' });
    return parts;
  },

  hospital(r) {
    const w = r.pick([wall('#f4f5f6', '#d6d9dd'), wall('#e9edf2', '#c8ced6')]);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#9a9a8a', lift: 0 }];
    const h = r.range(2.2, 2.8);
    parts.push(block([0.15, 0.15, 1.85, 0.95], 0, h, w, {
      windows: { cols: 6, style: 'grid' }, bands: [{ at: h * 0.94, thick: 0.06, color: '#c23b3b' }],
    }));
    parts.push(block([0.15, 1.05, 1.1, 1.85], 0, 1.0, w, { windows: { cols: 3, style: 'grid' }, doors: { count: 2, color: '#c23b3b' } }));
    // Cruz vermelha no telhado e heliponto.
    parts.push(block([0.85, 0.45, 1.15, 0.65], h, 0.04, wall('#c23b3b', '#a03024'), { top: '#e05a47' }));
    parts.push(block([0.9, 0.35, 1.1, 0.75], h, 0.04, wall('#c23b3b', '#a03024'), { top: '#e05a47' }));
    parts.push({ kind: 'slab', box: [1.25, 1.2, 1.85, 1.8], color: '#5b5f66', lines: true, lift: 0.01 });
    return parts;
  },

  posto_saude() {
    const parts = [{ kind: 'slab', box: [0.1, 0.1, 0.9, 0.9], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.15, 0.2, 0.85, 0.75], 0, 0.6, wall('#f4f5f6', '#d6d9dd'), {
      windows: { cols: 3, style: 'grid' }, doors: { count: 1, color: '#3f6fc0' }, bands: [{ at: 0.5, thick: 0.06, color: '#3f6fc0' }],
    }));
    parts.push(block([0.42, 0.4, 0.58, 0.55], 0.6, 0.03, wall('#3f6fc0', '#2f5aa0'), { top: '#4f8ff7' }));
    return parts;
  },

  clinica(r) {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.12, 0.15, 0.88, 0.8], 0, 0.95, r.pick([wall('#f4f5f6', '#d6d9dd'), wall('#e6f0e3', '#c7d6c3')]), {
      windows: { cols: 3, style: 'grid' }, doors: { count: 1, color: '#3d8f5a' }, bands: [{ at: 0.85, thick: 0.06, color: '#3d8f5a' }],
    }));
    parts.push(block([0.4, 0.42, 0.6, 0.53], 0.95, 0.03, wall('#3d8f5a', '#2f7148'), { top: '#51cf66' }));
    return parts;
  },

  caps(r) {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#9ab486', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.75, 0.6], 0, 0.7, r.pick([wall('#f2d7b4', '#d8bc97'), wall('#d7e3f2', '#bac8d8')]), {
      roof: { kind: 'hip', color: '#8a5a3a', rise: 0.35 }, windows: { cols: 2, style: 'grid' }, doors: { count: 1, color: '#8e44ad' },
    }));
    for (const [x, y] of [[0.8, 0.3], [0.3, 0.8], [0.75, 0.78]]) parts.push({ kind: 'cylinder', cx: x, cy: y, r: 0.08, lift: 0, h: 0.35, color: '#4f8a3a', top: '#6fb04f' });
    return parts;
  },

  delegacia() {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#7a7d84', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.88, 0.6], 0, 1.0, wall('#d9dde2', '#b9bec7'), {
      windows: { cols: 4, style: 'grid' }, doors: { count: 1, color: '#2c3e50' }, bands: [{ at: 0.85, thick: 0.08, color: '#2c3e50' }],
    }));
    // Viaturas no pátio.
    for (const x of [0.2, 0.55]) parts.push(block([x, 0.7, x + 0.25, 0.85], 0, 0.12, wall('#f4f5f6', '#2c3e50'), { top: '#3f6fc0' }));
    parts.push({ kind: 'antenna', cx: 0.8, cy: 0.2, lift: 1.0, h: 0.7 });
    return parts;
  },

  guarda_municipal() {
    const parts = [{ kind: 'slab', box: [0.1, 0.1, 0.9, 0.9], color: '#8a8f86', lift: 0 }];
    parts.push(block([0.15, 0.2, 0.85, 0.7], 0, 0.6, wall('#e6e2da', '#c9c4ba'), {
      windows: { cols: 3, style: 'grid' }, doors: { count: 1, color: '#16a085' }, bands: [{ at: 0.52, thick: 0.06, color: '#16a085' }],
    }));
    parts.push(block([0.3, 0.75, 0.55, 0.88], 0, 0.12, wall('#f4f5f6', '#16a085'), { top: '#16a085' }));
    return parts;
  },

  central_cameras() {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#5b5f66', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.88, 0.75], 0, 1.2, wall('#5b7fa8', '#486889'), { windows: { cols: 4, style: 'bands' }, doors: { count: 1, color: '#2c3e50' } }));
    parts.push({ kind: 'antenna', cx: 0.3, cy: 0.3, lift: 1.2, h: 1.0 });
    parts.push({ kind: 'antenna', cx: 0.7, cy: 0.5, lift: 1.2, h: 0.7 });
    return parts;
  },

  quartel_bombeiros() {
    const red = wall('#c0392b', '#a03024');
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#7a7d84', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.88, 0.7], 0, 0.85, red, { doors: { count: 3, color: '#e6e2da' }, windows: { cols: 3, style: 'grid' } }));
    // Torre de treino.
    parts.push(block([0.7, 0.72, 0.88, 0.9], 0, 1.8, wall('#b5b0a6', '#98938a'), { windows: { cols: 1, style: 'grid' } }));
    parts.push(block([0.2, 0.75, 0.55, 0.9], 0, 0.15, red, { top: '#e05a47' }));
    return parts;
  },

  parque(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 0.96, 0.96], color: '#7fb069', lift: 0 }];
    // Caminhos, árvores e um coreto.
    parts.push({ kind: 'slab', box: [0.44, 0.04, 0.56, 0.96], color: '#d9c79a', lift: 0.01 });
    parts.push({ kind: 'slab', box: [0.04, 0.44, 0.96, 0.56], color: '#d9c79a', lift: 0.01 });
    for (const [x, y] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) {
      parts.push({ kind: 'cylinder', cx: x, cy: y, r: 0.03, lift: 0, h: 0.25, color: '#6f4e37', top: '#6f4e37' });
      parts.push({ kind: 'cylinder', cx: x, cy: y, r: r.range(0.12, 0.16), lift: 0.25, h: 0.3, color: '#3d7a35', top: '#5aa04a' });
    }
    parts.push({ kind: 'cylinder', cx: 0.5, cy: 0.5, r: 0.1, lift: 0, h: 0.3, color: '#f4f1ea', top: '#c0392b' });
    return parts;
  },

  cinema(r) {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#7a7d84', lift: 0 }];
    const w = r.pick([wall('#8e44ad', '#73378c'), wall('#2c3e50', '#22303e'), wall('#c0392b', '#a03024')]);
    parts.push(block([0.12, 0.12, 0.88, 0.85], 0, 1.1, w, { doors: { count: 2, color: '#f1c40f' }, sign: { color: '#f1c40f' } }));
    parts.push(block([0.1, 0.8, 0.9, 0.9], 0.75, 0.12, wall('#f1c40f', '#d4a90d'), { top: '#f7dc6f' }));
    return parts;
  },

  ginasio(r) {
    const w = r.pick([wall('#e6e2da', '#c9c4ba'), wall('#d9dde2', '#b9bec7')]);
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.15, 0.15, 1.85, 1.3], 0, 1.0, w, {
      roof: { kind: 'gable-x', color: '#3f6fc0', rise: 0.45 }, windows: { cols: 5, style: 'bands' }, doors: { count: 2, color: '#3f6fc0' },
    }));
    parts.push({ kind: 'slab', box: [0.2, 1.42, 1.8, 1.88], color: '#c0703f', lines: true, lift: 0.01 });
    return parts;
  },

  parque_tecnologico(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8fae7d', lift: 0 }];
    // Prédios de vidro baixos e um mais alto, com um pátio verde no meio.
    parts.push(block([0.12, 0.12, 0.85, 0.85], 0, r.range(2.2, 2.8), r.pick(GLASS), { windows: { cols: 3, style: 'bands' } }));
    parts.push(block([1.1, 0.15, 1.85, 0.75], 0, 1.1, r.pick(GLASS), { windows: { cols: 3, style: 'bands' } }));
    parts.push(block([0.15, 1.15, 0.85, 1.85], 0, 0.9, r.pick(GLASS), { windows: { cols: 3, style: 'bands' } }));
    parts.push(block([1.1, 1.1, 1.85, 1.85], 0, 1.4, r.pick(GLASS), { windows: { cols: 3, style: 'grid' } }));
    parts.push({ kind: 'antenna', cx: 0.5, cy: 0.5, lift: 2.5, h: 0.8 });
    return parts;
  },

  base_samu() {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#7a7d84', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.88, 0.55], 0, 0.7, wall('#f4f5f6', '#d6d9dd'), {
      doors: { count: 2, color: '#c23b3b' }, windows: { cols: 3, style: 'grid' }, bands: [{ at: 0.6, thick: 0.06, color: '#c23b3b' }],
    }));
    // Ambulâncias no pátio.
    for (const x of [0.18, 0.55]) parts.push(block([x, 0.66, x + 0.28, 0.86], 0, 0.18, wall('#f4f5f6', '#e6e2da'), { top: '#e05a47' }));
    return parts;
  },

  ponto_onibus(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 0.96, 0.96], color: '#5b5f66', lines: true, lift: 0 }];
    // Garagem com ônibus estacionados.
    parts.push(block([0.1, 0.1, 0.9, 0.4], 0, 0.6, wall('#d9dde2', '#b9bec7'), { doors: { count: 3, color: '#2c3e50' } }));
    const color = r.pick(['#e8b931', '#3f6fc0', '#3d8f5a', '#c23b3b']);
    for (const x of [0.12, 0.42, 0.72]) parts.push(block([x, 0.5, x + 0.18, 0.9], 0, 0.22, wall(color, mixHex(color, '#000000', 0.2)), { top: '#e6e2da' }));
    return parts;
  },

  estacao_brt() {
    const parts = [{ kind: 'slab', box: [0.04, 0.3, 0.96, 0.7], color: '#c0703f', lift: 0 }];
    // Estação-tubo de vidro sobre a plataforma.
    parts.push(block([0.1, 0.38, 0.9, 0.62], 0.05, 0.4, wall('#9fc3e0', '#7ea3c2'), { top: '#3d8f5a', windows: { cols: 5, style: 'bands' } }));
    return parts;
  },

  estacao_vlt() {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 0.96, 0.96], color: '#9a9a8a', lift: 0 }];
    // Trilhos, plataforma coberta e o bonde.
    parts.push({ kind: 'slab', box: [0.04, 0.42, 0.96, 0.58], color: '#6b5a4a', lines: true, lift: 0.01 });
    parts.push(block([0.1, 0.12, 0.9, 0.32], 0, 0.06, wall('#d9dde2', '#b9bec7')));
    parts.push(block([0.12, 0.14, 0.88, 0.3], 0.45, 0.04, wall('#3f6fc0', '#2f5aa0'), { top: '#4f8ff7' }));
    for (const x of [0.15, 0.85]) parts.push({ kind: 'cylinder', cx: x, cy: 0.22, r: 0.025, lift: 0.06, h: 0.39, color: '#5b5f66', top: '#5b5f66' });
    parts.push(block([0.08, 0.44, 0.92, 0.56], 0.02, 0.24, wall('#f4f5f6', '#c23b3b'), { top: '#e6e2da', windows: { cols: 6, style: 'bands' } }));
    return parts;
  },

  estacao_metro() {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#b5b0a6', lift: 0 }];
    // Só o acesso aparece: a estação fica embaixo.
    parts.push(block([0.2, 0.2, 0.8, 0.6], 0, 0.45, wall('#9fc3e0', '#7ea3c2'), { top: '#5b7fa8', doors: { count: 1, color: '#2c3e50' } }));
    parts.push(block([0.62, 0.68, 0.78, 0.84], 0, 0.9, wall('#c23b3b', '#a03024'), { top: '#f4f5f6' }));
    return parts;
  },

  patio_ferroviario(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8a826f', lift: 0 }];
    for (const y of [0.25, 0.65, 1.05]) parts.push({ kind: 'slab', box: [0.04, y, 1.96, y + 0.16], color: '#6b5a4a', lines: true, lift: 0.01 });
    // Vagões de carga nos trilhos e um armazém.
    for (const [x, y] of [[0.15, 0.25], [0.75, 0.25], [0.4, 0.65], [1.3, 1.05]]) {
      const c = r.pick(IND_WALLS);
      parts.push(block([x, y + 0.01, x + 0.5, y + 0.15], 0.02, 0.22, c));
    }
    parts.push(block([0.2, 1.35, 1.8, 1.85], 0, 0.8, r.pick(IND_WALLS), { roof: { kind: 'gable-x', color: '#6f5b4b', rise: 0.3 }, doors: { count: 3, color: '#5c5f68' } }));
    return parts;
  },

  porto(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#8c8f94', lift: 0 }];
    // Pilhas de contêineres e um guindaste.
    const colors = ['#c23b3b', '#3f6fc0', '#d9822b', '#3d8f5a', '#e8b931'];
    for (let i = 0; i < 6; i++) {
      const x = 0.15 + (i % 3) * 0.45;
      const y = 0.2 + Math.floor(i / 3) * 0.4;
      const c = r.pick(colors);
      parts.push(block([x, y, x + 0.38, y + 0.3], 0, 0.2 * (1 + Math.floor(r.range(0, 3))), wall(c, mixHex(c, '#000000', 0.2))));
    }
    parts.push(block([1.55, 0.2, 1.65, 0.3], 0, 2.0, wall('#e8b931', '#c9a020')));
    parts.push(block([1.55, 1.1, 1.65, 1.2], 0, 2.0, wall('#e8b931', '#c9a020')));
    parts.push(block([1.5, 0.15, 1.7, 1.25], 2.0, 0.12, wall('#e8b931', '#c9a020')));
    parts.push(block([0.15, 1.35, 1.2, 1.85], 0, 0.6, r.pick(IND_WALLS), { doors: { count: 2, color: '#5c5f68' } }));
    return parts;
  },

  mercado_municipal(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 0.96, 0.96], color: '#b5b0a6', lift: 0 }];
    // Galpão com telhado alto e bancas coloridas na frente.
    parts.push(block([0.1, 0.1, 0.9, 0.62], 0, 0.7, r.pick([wall('#e9d48a', '#cdb86e'), wall('#e6e2da', '#c9c4ba')]), {
      roof: { kind: 'gable-x', color: '#9c4a3a', rise: 0.3 }, doors: { count: 3, color: '#6f4e37' }, windows: { cols: 3, style: 'grid' },
    }));
    for (const [x, c] of [[0.12, '#c23b3b'], [0.4, '#3d8f5a'], [0.68, '#e8b931']]) {
      parts.push(block([x, 0.72, x + 0.2, 0.9], 0.22, 0.03, wall(c, mixHex(c, '#000000', 0.2)), { top: c }));
    }
    return parts;
  },

  restaurante_popular() {
    const parts = [{ kind: 'slab', box: [0.06, 0.06, 0.94, 0.94], color: '#9a9a8a', lift: 0 }];
    parts.push(block([0.12, 0.12, 0.88, 0.75], 0, 0.75, wall('#f2d7b4', '#d8bc97'), {
      windows: { cols: 4, style: 'grid' }, doors: { count: 2, color: '#d9822b' }, bands: [{ at: 0.6, thick: 0.08, color: '#d9822b' }],
    }));
    return parts;
  },

  ceasa(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#7a7d84', lines: true, lift: 0 }];
    // Pavilhões compridos com cobertura em arco e caminhões de hortifrúti.
    for (const y of [0.12, 0.72]) {
      parts.push(block([0.12, y, 1.88, y + 0.45], 0, 0.55, r.pick([wall('#e6e2da', '#c9c4ba'), wall('#cfc9b8', '#b0aa99')]), {
        roof: { kind: 'gable-x', color: '#5b5f66', rise: 0.25 }, doors: { count: 5, color: '#3e4145' },
      }));
    }
    for (const x of [0.25, 0.75, 1.25]) {
      parts.push(block([x, 1.4, x + 0.25, 1.85], 0, 0.28, wall('#f4f5f6', '#d6d9dd')));
      parts.push(block([x, 1.32, x + 0.25, 1.42], 0, 0.2, wall('#3d8f5a', '#2f7148')));
    }
    return parts;
  },

  centro_distribuicao(r) {
    const parts = [{ kind: 'slab', box: [0.04, 0.04, 1.96, 1.96], color: '#5b5f66', lines: true, lift: 0 }];
    parts.push(block([0.12, 0.12, 1.88, 1.25], 0, 1.0, r.pick([wall('#e9edf2', '#c8ced6'), wall('#cfc9b8', '#b0aa99')]), {
      doors: { count: 6, color: '#5c5f68' }, bands: [{ at: 0.9, thick: 0.08, color: r.pick(STRIPES) }],
    }));
    // Caminhões nas docas.
    for (const x of [0.2, 0.7, 1.2]) {
      parts.push(block([x, 1.4, x + 0.25, 1.85], 0, 0.3, wall('#f4f5f6', '#d6d9dd')));
      parts.push(block([x, 1.32, x + 0.25, 1.42], 0, 0.22, wall('#3f6fc0', '#2f5aa0')));
    }
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
