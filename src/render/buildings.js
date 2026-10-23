// Desenho dos prédios a partir do projeto de cada um (ver designs.js). Cada
// parte do projeto é desenhada na ordem em que aparece nele (o gerador já
// coloca as partes de trás para frente e de baixo para cima).

import { BUILDINGS } from '../world/catalog.js';
import { TILE_H, TILE_W } from './iso.js';
import { worldToScreen } from './camera.js';
import { designFor, mixHex } from './designs.js';

// Altura de uma fileira de janelas, em "andares".
const WINDOW_ROW = 9 / 32;
const DAY_GLASS = 'rgba(255, 255, 255, 0.38)';

/**
 * Geometria do prédio na tela: as partes projetadas, o centro de cada janela
 * (na ordem fixa usada para sortear as luzes) e os contornos das partes.
 */
export function buildingGeometry(cam, x, y, b) {
  const info = BUILDINGS[b.type];
  const design = designFor(b);
  const z = cam.zoom;
  const P = (wx, wy, floors) => {
    const [sx, sy] = worldToScreen(cam, x + wx, y + wy);
    return [sx, sy - floors * TILE_H * z];
  };
  const parts = design.parts.map((part) => project(part, P, z));
  const windows = [];
  for (const p of parts) if (p.windows) windows.push(...p.windows.centers);
  return { info, design, parts, windows, z };
}

/** Desenha o prédio `b` cujo canto superior está no tile (x, y). */
export function drawBuilding(ctx, cam, x, y, b) {
  const g = buildingGeometry(cam, x, y, b);
  for (const p of g.parts) DRAW[p.kind](ctx, p, g.z);
  return g;
}

/**
 * Adiciona ao `path` o contorno de cada parte do prédio. As camadas de luzes
 * e de cidadãos "recortam" esses contornos para esconder o que fica atrás.
 */
export function addSilhouette(path, g) {
  for (const p of g.parts) {
    if (!p.hull) continue;
    path.moveTo(p.hull[0][0], p.hull[0][1]);
    // Sem closePath: o fill fecha sozinho, e closePath em caminhos com muitos
    // contornos fica lento no Chromium.
    for (let i = 1; i < p.hull.length; i++) path.lineTo(p.hull[i][0], p.hull[i][1]);
  }
}

export function windowSize(z) {
  return [Math.max(1, 4.5 * z), Math.max(1, 3 * z)];
}

// --- Projeção das partes --------------------------------------------------------

function project(part, P, z) {
  if (part.kind === 'block') return projectBlock(part, P);
  if (part.kind === 'cylinder') {
    const [sx, sy] = P(part.cx, part.cy, part.lift);
    const top = P(part.cx, part.cy, part.lift + part.h)[1];
    const rx = part.r * (TILE_W / 2) * Math.SQRT2 * z;
    const ry = rx / 2;
    return {
      ...part, sx, bottom: sy, top, rx, ry,
      hull: [[sx - rx, top], [sx, top - ry], [sx + rx, top], [sx + rx, sy], [sx, sy + ry], [sx - rx, sy]],
    };
  }
  if (part.kind === 'antenna') {
    return { ...part, from: P(part.cx, part.cy, part.lift), to: P(part.cx, part.cy, part.lift + part.h) };
  }
  // slab: no chão (ou numa laje), sem altura.
  const [x0, y0, x1, y1] = part.box;
  const l = part.lift || 0;
  return {
    ...part, P,
    corners: [P(x0, y0, l), P(x1, y0, l), P(x1, y1, l), P(x0, y1, l)],
    center: P((x0 + x1) / 2, (y0 + y1) / 2, l),
  };
}

function projectBlock(part, P) {
  const [x0, y0, x1, y1] = part.box;
  const a = part.lift;
  const t = part.lift + part.h;
  const g = {
    ...part, P,
    T: P(x0, y0, a), R: P(x1, y0, a), B: P(x1, y1, a), L: P(x0, y1, a),
    tT: P(x0, y0, t), tR: P(x1, y0, t), tB: P(x1, y1, t), tL: P(x0, y1, t),
  };
  const points = [g.T, g.R, g.B, g.L, g.tT, g.tR, g.tB, g.tL];

  if (part.roof) {
    const w = x1 - x0;
    const d = y1 - y0;
    const { kind, rise } = part.roof;
    if (kind === 'hip') {
      g.peak = P((x0 + x1) / 2, (y0 + y1) / 2, t + rise * Math.min(w, d));
      points.push(g.peak);
    } else if (kind === 'gable-x') {
      const ym = (y0 + y1) / 2;
      g.r1 = P(x0, ym, t + rise * d);
      g.r2 = P(x1, ym, t + rise * d);
      points.push(g.r1, g.r2);
    } else {
      const xm = (x0 + x1) / 2;
      g.r1 = P(xm, y0, t + rise * w);
      g.r2 = P(xm, y1, t + rise * w);
      points.push(g.r1, g.r2);
    }
  }

  if (part.windows && part.h >= 0.2) {
    const usable = part.h - (part.roof ? 0.04 : 0.12);
    const rows = Math.max(1, Math.floor(usable / WINDOW_ROW));
    const cols = part.windows.cols;
    const centers = [];
    const rowLift = (r) => a + (r + 0.5) * (usable / rows);
    // Face esquerda: de (x0, y1) a (x1, y1). Face direita: de (x1, y1) a (x1, y0).
    for (const face of [0, 1]) {
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const u = (k + 0.5) / cols;
          centers.push(face === 0 ? P(x0 + (x1 - x0) * u, y1, rowLift(r)) : P(x1, y1 - (y1 - y0) * u, rowLift(r)));
        }
      }
    }
    g.windows = { ...part.windows, rows, centers, rowLift };
  }

  g.hull = convexHull(points);
  return g;
}

// --- Desenho -----------------------------------------------------------------------

const DRAW = {
  block(ctx, p, z) {
    const { wall } = p;
    poly(ctx, wall.left, p.L, p.B, p.tB, p.tL);
    poly(ctx, wall.right, p.B, p.R, p.tR, p.tB);
    if (!p.roof && p.top) poly(ctx, p.top, p.tT, p.tR, p.tB, p.tL);

    if (p.windows && z >= 0.45) drawWindows(ctx, p, z);
    for (const band of p.bands) faceBand(ctx, p, band.at, band.thick, band.color, 0, 1);
    if (p.doors) drawDoors(ctx, p);
    if (p.sign && p.h > 0.45) faceBand(ctx, p, p.h * 0.55, 0.16, p.sign.color, 0.2, 0.8, 0);
    if (p.roof) drawRoof(ctx, p);
  },

  cylinder(ctx, p) {
    const { sx, bottom, top, rx, ry } = p;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(sx - rx, top);
    ctx.lineTo(sx - rx, bottom);
    ctx.ellipse(sx, bottom, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(sx + rx, top);
    ctx.closePath();
    ctx.fill();
    // Metade direita na sombra.
    ctx.fillStyle = shade(p.color, 0.85);
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx, bottom + ry);
    ctx.ellipse(sx, bottom, rx, ry, 0, Math.PI / 2, 0, true);
    ctx.lineTo(sx + rx, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.top;
    ctx.beginPath();
    ctx.ellipse(sx, top, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  antenna(ctx, p, z) {
    ctx.strokeStyle = '#4a4d52';
    ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.beginPath();
    ctx.moveTo(p.from[0], p.from[1]);
    ctx.lineTo(p.to[0], p.to[1]);
    ctx.stroke();
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(p.to[0] - z, p.to[1] - z, 2 * z, 2 * z);
  },

  slab(ctx, p, z) {
    if (p.ring) {
      // Heliponto: círculo amarelo sobre a laje.
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, 2 * z);
      const [cx, cy] = p.center;
      const rx = Math.abs(p.corners[1][0] - p.corners[3][0]) / 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    poly(ctx, p.color, ...p.corners);
    if (p.lines && z >= 0.5) {
      // Vagas de estacionamento: duas fileiras de riscos.
      const [x0, y0, x1, y1] = p.box;
      const l = p.lift || 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1, z);
      ctx.beginPath();
      const n = Math.max(3, Math.round((x1 - x0) * 7));
      for (let k = 1; k < n; k++) {
        const wx = x0 + ((x1 - x0) * k) / n;
        for (const [s, e] of [[0.08, 0.28], [0.72, 0.92]]) {
          const a = p.P(wx, y0 + (y1 - y0) * s, l);
          const b = p.P(wx, y0 + (y1 - y0) * e, l);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
      }
      ctx.stroke();
    }
  },
};

function drawWindows(ctx, p, z) {
  const { windows } = p;
  if (windows.style === 'bands') {
    // Faixas contínuas de vidro, uma por andar.
    for (let r = 0; r < windows.rows; r++) faceBand(ctx, p, windows.rowLift(r) - p.lift - 0.06, 0.12, DAY_GLASS, 0.05, 0.95);
    return;
  }
  const [w, wh] = windowSize(z);
  const perFace = windows.rows * windows.cols;
  // Todas as janelas da parte num só caminho: bem mais rápido que uma a uma.
  const glass = new Path2D();
  windows.centers.forEach(([wx, wy], i) => {
    const row = Math.floor((i % perFace) / windows.cols);
    if (windows.style === 'shop' && row === 0) return; // térreo é vitrine
    glass.rect(wx - w / 2, wy - wh / 2, w, wh);
  });
  ctx.fillStyle = DAY_GLASS;
  ctx.fill(glass);
  if (windows.style === 'shop') {
    const lift = windows.rowLift(0) - p.lift;
    faceBand(ctx, p, Math.max(0.03, lift - 0.13), 0.22, 'rgba(205, 230, 255, 0.55)', 0.08, 0.92);
  }
}

function drawDoors(ctx, p) {
  const { count, color } = p.doors;
  const height = Math.min(0.35, p.h * 0.6);
  const left = Math.ceil(count / 2);
  for (let k = 0; k < count; k++) {
    // Primeiro na face esquerda, o resto na direita.
    const onLeft = k < left;
    const slots = onLeft ? left : count - left;
    const slot = onLeft ? k : k - left;
    const u = (slot + 0.5) / slots;
    faceBand(ctx, p, 0, height, color, u - 0.09, u + 0.09, onLeft ? 0 : 1);
  }
}

/**
 * Faixa sobre as faces do bloco, de `at` a `at + thick` andares acima da base
 * da parte, entre as frações u0 e u1 de cada face. `only` limita a uma face
 * (0 = esquerda, 1 = direita).
 */
function faceBand(ctx, p, at, thick, color, u0, u1, only = null) {
  const [x0, y0, x1, y1] = p.box;
  const a = p.lift + at;
  const b = a + thick;
  for (const face of [0, 1]) {
    if (only !== null && only !== face) continue;
    const s = face === 0 ? [x0 + (x1 - x0) * u0, y1] : [x1, y1 - (y1 - y0) * u0];
    const e = face === 0 ? [x0 + (x1 - x0) * u1, y1] : [x1, y1 - (y1 - y0) * u1];
    poly(ctx, face === 0 ? color : shade(color, 0.82),
      p.P(s[0], s[1], a), p.P(e[0], e[1], a), p.P(e[0], e[1], b), p.P(s[0], s[1], b));
  }
}

function drawRoof(ctx, p) {
  const c = p.roof.color;
  if (p.roof.kind === 'hip') {
    poly(ctx, shade(c, 0.95), p.tT, p.tR, p.peak);
    poly(ctx, shade(c, 0.9), p.tL, p.tT, p.peak);
    poly(ctx, shade(c, 0.85), p.tL, p.tB, p.peak);
    poly(ctx, shade(c, 0.7), p.tB, p.tR, p.peak);
  } else if (p.roof.kind === 'gable-x') {
    poly(ctx, shade(c, 0.95), p.tT, p.tR, p.r2, p.r1);
    poly(ctx, p.wall.right, p.tR, p.tB, p.r2);
    poly(ctx, shade(c, 0.78), p.tL, p.tB, p.r2, p.r1);
  } else {
    poly(ctx, shade(c, 0.95), p.tT, p.tL, p.r2, p.r1);
    poly(ctx, p.wall.left, p.tL, p.tB, p.r2);
    poly(ctx, shade(c, 0.72), p.tR, p.tB, p.r2, p.r1);
  }
}

function poly(ctx, color, ...points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

export function shade(color, factor) {
  if (!color.startsWith('#')) return color;
  return mixHex(color, '#000000', 1 - factor);
}

// Envoltória convexa (cadeia monótona): contorno da parte na tela.
function convexHull(points) {
  const pts = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
