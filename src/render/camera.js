// Câmera: centro (em pixels iso) e zoom. Converte entre tela e mundo.

import { TILE_H, isoToWorld, worldToIso } from './iso.js';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;

export function createCamera(mapWidth, mapHeight) {
  const [cx, cy] = worldToIso(mapWidth / 2, mapHeight / 2);
  return { cx, cy, zoom: 0.6, viewW: 1, viewH: 1, mapWidth, mapHeight, version: 0 };
}

export function worldToScreen(cam, x, y) {
  const [ix, iy] = worldToIso(x, y);
  return [(ix - cam.cx) * cam.zoom + cam.viewW / 2, (iy - cam.cy) * cam.zoom + cam.viewH / 2];
}

export function screenToWorld(cam, sx, sy) {
  return isoToWorld((sx - cam.viewW / 2) / cam.zoom + cam.cx, (sy - cam.viewH / 2) / cam.zoom + cam.cy);
}

export function screenToTile(cam, sx, sy) {
  const [x, y] = screenToWorld(cam, sx, sy);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= cam.mapWidth || ty >= cam.mapHeight) return null;
  return { x: tx, y: ty };
}

export function panBy(cam, dxScreen, dyScreen) {
  cam.cx -= dxScreen / cam.zoom;
  cam.cy -= dyScreen / cam.zoom;
  clamp(cam);
}

export function centerOn(cam, x, y) {
  [cam.cx, cam.cy] = worldToIso(x, y);
  clamp(cam);
}

/** Zoom mantendo fixo o ponto sob o cursor. */
export function zoomAt(cam, factor, sx, sy) {
  const [wx, wy] = screenToWorld(cam, sx, sy);
  cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
  const [ix, iy] = worldToIso(wx, wy);
  cam.cx = ix - (sx - cam.viewW / 2) / cam.zoom;
  cam.cy = iy - (sy - cam.viewH / 2) / cam.zoom;
  clamp(cam);
}

// Mantém o centro da câmera dentro do losango do mapa.
function clamp(cam) {
  let [x, y] = isoToWorld(cam.cx, cam.cy);
  x = Math.min(cam.mapWidth, Math.max(0, x));
  y = Math.min(cam.mapHeight, Math.max(0, y));
  [cam.cx, cam.cy] = worldToIso(x, y);
  cam.version++;
}

/** Faixa de tiles visíveis (com margem para prédios altos). */
export function visibleRange(cam) {
  const corners = [
    screenToWorld(cam, 0, 0),
    screenToWorld(cam, cam.viewW, 0),
    screenToWorld(cam, 0, cam.viewH + TILE_H * 3 * cam.zoom),
    screenToWorld(cam, cam.viewW, cam.viewH + TILE_H * 3 * cam.zoom),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs)) - 1),
    y0: Math.max(0, Math.floor(Math.min(...ys)) - 1),
    x1: Math.min(cam.mapWidth - 1, Math.ceil(Math.max(...xs)) + 1),
    y1: Math.min(cam.mapHeight - 1, Math.ceil(Math.max(...ys)) + 1),
  };
}
