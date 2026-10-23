// Como os cidadãos em viagem aparecem na tela: carrinhos coloridos andando
// pela mão direita da rua. É só desenho: a posição simulada (c.x, c.y) fica
// no meio da rua e não muda.

import { hash2 } from '../core/rng.js';
import { worldToScreen } from './camera.js';

export const CAR_COLORS = [
  '#d64541', '#e8eaed', '#b8bcc4', '#3b3f46', '#2f6fd1', '#f2c230',
  '#3e9a5b', '#ef8a2d', '#8d5bc7', '#7a1f2b', '#5fb7d8', '#f4f1e8',
];

// Distância do meio da rua até o centro do carro (em tiles).
const LANE_OFFSET = 0.2;
const CAR_LENGTH = 0.26;
const CAR_WIDTH = 0.14;

export function carColor(c) {
  return CAR_COLORS[Math.floor(hash2(c.id, 5) * CAR_COLORS.length)];
}

/**
 * Posição de desenho e direção do cidadão em viagem, ou null quando ele está
 * dentro de um lote (saindo de casa ou chegando ao trabalho): aí não aparece.
 */
export function moverPose(state, c) {
  const { width, road } = state.map;
  const tx = Math.floor(c.x);
  const ty = Math.floor(c.y);
  if (!road[ty * width + tx]) return null;

  const next = c.path[Math.min(c.step + 1, c.path.length - 1)];
  const nx = (next % width) + 0.5;
  const ny = Math.floor(next / width) + 0.5;
  let dx = nx - c.x;
  let dy = ny - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    // Exatamente no centro do próximo tile: usa a direção de onde veio.
    const prev = c.path[Math.max(c.step - 1, 0)];
    dx = c.x - ((prev % width) + 0.5);
    dy = c.y - (Math.floor(prev / width) + 0.5);
  }
  const norm = Math.hypot(dx, dy) || 1;
  dx /= norm;
  dy /= norm;
  // Com y crescendo "para baixo", a direita de (dx, dy) é (-dy, dx).
  return { x: c.x - dy * LANE_OFFSET, y: c.y + dx * LANE_OFFSET, dx, dy, depth: tx + ty };
}

/** Adiciona ao `path` o carrinho (um retângulo no chão, alinhado à rua). */
export function addCar(path, cam, pose) {
  const { x, y, dx, dy } = pose;
  const lx = dx * CAR_LENGTH / 2;
  const ly = dy * CAR_LENGTH / 2;
  const wx = -dy * CAR_WIDTH / 2;
  const wy = dx * CAR_WIDTH / 2;
  const corners = [
    worldToScreen(cam, x + lx + wx, y + ly + wy),
    worldToScreen(cam, x + lx - wx, y + ly - wy),
    worldToScreen(cam, x - lx - wx, y - ly - wy),
    worldToScreen(cam, x - lx + wx, y - ly + wy),
  ];
  // Levanta um pouco do chão para parecer ter volume.
  const lift = 2 * cam.zoom;
  path.moveTo(corners[0][0], corners[0][1] - lift);
  for (let i = 1; i < 4; i++) path.lineTo(corners[i][0], corners[i][1] - lift);
}
