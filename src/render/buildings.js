// Desenho dos prédios a partir do `style` de cada tipo no catálogo. Tudo é
// montado com prismas (caixas isométricas): o bloco principal, chaminés,
// casas de máquinas no telhado.

import { BUILDINGS } from '../world/catalog.js';
import { hash2 } from '../core/rng.js';
import { TILE_H } from './iso.js';
import { worldToScreen } from './camera.js';

/**
 * Geometria de um prédio na tela: cantos do bloco, ponta do telhado e o
 * centro de cada janela. Usada tanto para desenhar o prédio (camada
 * estática) quanto para acender as janelas à noite (camada de luzes).
 */
export function buildingGeometry(cam, x, y, b) {
  const info = BUILDINGS[b.type];
  const { style, size } = info;
  const z = cam.zoom;
  const inset = size === 1 ? 0.12 : 0.18;
  // Pequena variação de altura por prédio, para a cidade não ficar uniforme.
  const h = style.height * TILE_H * z * (0.9 + hash2(b.id, 7) * 0.2);
  const box = [x + inset, y + inset, x + size - inset, y + size - inset];
  const faces = corners(cam, box, 0, h);
  let peak = null;
  if (style.roof === 'hip') {
    const [px, py] = worldToScreen(cam, x + size / 2, y + size / 2);
    peak = [px, py - h - TILE_H * 0.45 * z * size];
  }
  return { info, style, size, z, h, box, faces, peak, windows: style.windows ? windowCenters(z, faces, h, size, style) : [] };
}

/** Desenha o prédio `b` cujo canto superior está no tile (x, y). */
export function drawBuilding(ctx, cam, x, y, b) {
  const g = buildingGeometry(cam, x, y, b);
  const { style, size, z, h, faces } = g;
  const palette = style.palettes[Math.floor(hash2(b.id, 11) * style.palettes.length)];

  prism(ctx, cam, g.box, 0, h, palette, style.roof !== 'hip');

  if (g.windows.length && z >= 0.45) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    const [w, wh] = windowSize(z);
    for (const [wx, wy] of g.windows) ctx.fillRect(wx - w / 2, wy - wh / 2, w, wh);
  }
  if (style.awning) band(ctx, faces, h * 0.28, Math.max(2, 5 * z), palette.awning);
  if (style.stripes) band(ctx, faces, h * 0.82, Math.max(1.5, 4 * z), palette.stripe);

  if (g.peak) {
    // Telhado de quatro águas: pirâmide sobre o bloco.
    const { L, B, R } = faces.top;
    poly(ctx, shade(palette.roof, 0.85), L, B, g.peak);
    poly(ctx, shade(palette.roof, 0.7), B, R, g.peak);
  } else if (style.height >= 2.5) {
    // Casa de máquinas no telhado dos prédios altos.
    const c = size / 2;
    prism(ctx, cam, [x + c - 0.18, y + c - 0.12, x + c + 0.12, y + c + 0.18], h, 5 * z, {
      left: '#9a968e', right: '#827e77', top: '#b8b4ac',
    }, true);
  }

  if (style.chimney) {
    const ch = (0.9 + hash2(b.id, 3) * 0.4) * TILE_H * z;
    prism(ctx, cam, [x + 0.22, y + 0.22, x + 0.38, y + 0.38], h, ch, {
      left: '#8d6e5a', right: '#74584a', top: '#3d3330',
    }, true);
  }
}

/**
 * Contorno do prédio (sem chaminés): na camada de luzes ele é "recortado"
 * antes das janelas, para esconder as luzes dos prédios que ficam atrás.
 */
export function silhouette(ctx, g) {
  const { L, B, R, top } = g.faces;
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  for (const p of [B, R, top.R, g.peak || top.T, top.L]) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}

export function windowSize(z) {
  return [Math.max(1, 4.5 * z), Math.max(1, 3 * z)];
}

/**
 * Caixa isométrica sobre o retângulo de mundo `box` = [x0, y0, x1, y1],
 * começando `lift` pixels acima do chão, com altura `h`.
 */
function prism(ctx, cam, box, lift, h, colors, withTop) {
  const { L, B, R, top } = corners(cam, box, lift, h);
  poly(ctx, colors.left, L, B, top.B, top.L);
  poly(ctx, colors.right, B, R, top.R, top.B);
  if (withTop) poly(ctx, colors.top, top.T, top.R, top.B, top.L);
}

function corners(cam, [x0, y0, x1, y1], lift, h) {
  const up = ([sx, sy], dy) => [sx, sy - dy];
  const T = up(worldToScreen(cam, x0, y0), lift);
  const R = up(worldToScreen(cam, x1, y0), lift);
  const B = up(worldToScreen(cam, x1, y1), lift);
  const L = up(worldToScreen(cam, x0, y1), lift);
  return { T, L, B, R, top: { T: up(T, h), R: up(R, h), B: up(B, h), L: up(L, h) } };
}

// Centros das janelas nas duas faces visíveis, andar por andar. A ordem é
// fixa: o índice de cada janela é usado para sortear o horário da luz dela.
function windowCenters(z, { L, B, R }, h, size, style) {
  const floorH = 9 * z;
  const usable = style.roof === 'hip' ? h : h - 3 * z;
  const rows = Math.max(1, Math.floor(usable / floorH));
  const cols = (style.windowCols || 3) * size;
  const centers = [];
  for (const [a, b] of [[L, B], [B, R]]) {
    for (let r = 0; r < rows; r++) {
      const lift = (r + 0.5) * (usable / rows);
      for (let k = 0; k < cols; k++) {
        const u = (k + 0.5) / cols;
        centers.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - lift]);
      }
    }
  }
  return centers;
}

/** Faixa colorida contornando as duas faces visíveis (toldos, listras). */
function band(ctx, { L, B, R }, lift, thickness, color) {
  const at = ([sx, sy], dy) => [sx, sy - dy];
  poly(ctx, color, at(L, lift), at(B, lift), at(B, lift + thickness), at(L, lift + thickness));
  poly(ctx, shade(color, 0.82), at(B, lift), at(R, lift), at(R, lift + thickness), at(B, lift + thickness));
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
  const n = parseInt(color.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * factor);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
