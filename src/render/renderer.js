// Renderizador isométrico em Canvas 2D.
//
// Duas camadas:
// - estática (terreno, estradas, zonas, árvores, prédios): desenhada num
//   canvas fora da tela e só refeita quando a câmera ou o mapa mudam;
// - dinâmica (cidadãos andando, cursor, prévia da ferramenta, noite):
//   desenhada a cada quadro por cima da estática.
//
// Para ficar rápido, tiles da mesma cor são agrupados num único Path2D.

import { BUILDINGS, TERRAIN, ZONE, ZONE_INFO } from '../world/catalog.js';
import { hash2 } from '../core/rng.js';
import { calendar } from '../core/time.js';
import { frontTile } from '../world/runtime.js';
import { visibleRange, worldToScreen } from './camera.js';
import { drawBuilding } from './buildings.js';

const GRASS = ['#7db460', '#7ab15d', '#80b763'];
const WATER = ['#3f7fc4', '#3b79bd'];
const SAND = '#d9c98f';
const FOREST_GROUND = '#5f9a4c';
const ROAD = '#5c5f68';
const ROAD_LINE = 'rgba(255, 255, 255, 0.35)';
const ZONE_TINT = {
  [ZONE.RESIDENTIAL]: mix(GRASS[0], ZONE_INFO[ZONE.RESIDENTIAL].color, 0.45),
  [ZONE.COMMERCIAL]: mix(GRASS[0], ZONE_INFO[ZONE.COMMERCIAL].color, 0.45),
  [ZONE.INDUSTRIAL]: mix(GRASS[0], ZONE_INFO[ZONE.INDUSTRIAL].color, 0.45),
};
const MOVER_COLORS = { trabalho: '#ffd84d', casa: '#8fe0ff' };

// Mapas (sobreposições): cor do chão conforme um valor de 0 a 1 do runtime.
// O valor é arredondado em faixas para manter o agrupamento por cor.
export const MAP_MODES = {
  valor: { name: 'Valor do terreno', layer: 'landValue', from: '#c0392b', mid: '#f1c40f', to: '#27ae60' },
  poluicao: { name: 'Poluição', layer: 'pollution', from: '#7db460', mid: '#c9a227', to: '#5b2a86' },
};
const MAP_STEPS = 10;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.staticCanvas = document.createElement('canvas');
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.staticKey = '';
    this.dpr = 1;
  }

  resize(cam) {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    for (const c of [this.canvas, this.staticCanvas]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    cam.viewW = w;
    cam.viewH = h;
    cam.version++;
  }

  /**
   * overlay: { hover: {x,y} | null, preview: { tiles, color } | null,
   *            selected: { citizen } | { building } | null,
   *            mapMode: chave de MAP_MODES | null }
   */
  render(state, rt, cam, overlay = {}) {
    const mode = overlay.mapMode ? MAP_MODES[overlay.mapMode] : null;
    const key = [
      cam.version, rt.mapVersion, this.canvas.width, this.canvas.height,
      overlay.mapMode, mode ? rt.landValueVersion : 0,
    ].join(':');
    if (key !== this.staticKey) {
      this.staticKey = key;
      this.#drawStatic(state, rt, cam, mode);
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticCanvas, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (overlay.preview) this.#drawTiles(ctx, state, cam, overlay.preview.tiles, overlay.preview.color);
    const selectedBuilding = overlay.selected?.building;
    if (selectedBuilding) {
      const size = BUILDINGS[selectedBuilding.type].size;
      this.#outlineTile(ctx, state, cam, selectedBuilding.tile, '#ffffff', 2, size);
    }
    this.#drawMovers(ctx, state, rt, cam, overlay.selected?.citizen);
    if (overlay.hover) {
      this.#outlineTile(ctx, state, cam, overlay.hover.y * state.map.width + overlay.hover.x, 'rgba(255,255,255,0.8)', 1.5);
    }
    this.#drawNight(ctx, state, cam);
  }

  // -------------------------------------------------------------------------

  #drawStatic(state, rt, cam, mode) {
    const ctx = this.staticCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b2a3a';
    ctx.fillRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const { width, terrain, road, zone } = state.map;
    const range = visibleRange(cam);
    const paths = new Map();
    const roadLines = new Path2D();
    const z = cam.zoom;
    // Pequena sobreposição evita frestas entre losangos vizinhos.
    const pad = 0.5;

    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const tile = y * width + x;
        let color;
        if (road[tile]) color = ROAD;
        else if (mode && terrain[tile] !== TERRAIN.WATER) color = mode.colors[Math.round(rt[mode.layer][tile] * MAP_STEPS)];
        else if (zone[tile] && !rt.buildingAt[tile]) color = ZONE_TINT[zone[tile]];
        else if (terrain[tile] === TERRAIN.WATER) color = WATER[hash2(x, y) < 0.5 ? 0 : 1];
        else if (terrain[tile] === TERRAIN.SAND) color = SAND;
        else if (terrain[tile] === TERRAIN.FOREST) color = FOREST_GROUND;
        else color = GRASS[Math.floor(hash2(x, y, 1) * GRASS.length)];

        let path = paths.get(color);
        if (!path) paths.set(color, (path = new Path2D()));
        const [tx, ty] = worldToScreen(cam, x, y);
        const hw = 32 * z + pad;
        const hh = 16 * z + pad / 2;
        path.moveTo(tx, ty - pad / 2);
        path.lineTo(tx + hw, ty + hh);
        path.lineTo(tx, ty + 2 * hh);
        path.lineTo(tx - hw, ty + hh);
        path.closePath();

        if (road[tile] && z >= 0.5) addRoadMarkings(roadLines, state, cam, x, y);
      }
    }
    for (const [color, path] of paths) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    if (z >= 0.5) {
      ctx.strokeStyle = ROAD_LINE;
      ctx.lineWidth = Math.max(1, z);
      ctx.setLineDash([4 * z, 4 * z]);
      ctx.stroke(roadLines);
      ctx.setLineDash([]);
    }

    // Objetos com altura, de trás para frente (soma x+y crescente). Prédios
    // grandes são desenhados quando o laço chega no tile da frente deles.
    // Nos mapas, ficam translúcidos para o mapa aparecer por baixo.
    ctx.globalAlpha = mode ? 0.3 : 1;
    for (let d = range.x0 + range.y0; d <= range.x1 + range.y1; d++) {
      const xStart = Math.max(range.x0, d - range.y1);
      const xEnd = Math.min(range.x1, d - range.y0);
      for (let x = xStart; x <= xEnd; x++) {
        const y = d - x;
        const tile = y * width + x;
        const id = rt.buildingAt[tile];
        if (id) {
          const b = rt.buildingById.get(id);
          if (tile === frontTile(state, b)) drawBuilding(ctx, cam, b.tile % width, Math.floor(b.tile / width), b);
        } else if (terrain[tile] === TERRAIN.FOREST && z >= 0.3 && !mode) {
          drawTree(ctx, cam, x, y);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  #drawTiles(ctx, state, cam, tiles, color) {
    const width = state.map.width;
    const path = new Path2D();
    for (const tile of tiles) diamond(path, cam, tile % width, Math.floor(tile / width), 0);
    ctx.fillStyle = color;
    ctx.fill(path);
  }

  #outlineTile(ctx, state, cam, tile, color, lineWidth, size = 1) {
    const path = new Path2D();
    diamond(path, cam, tile % state.map.width, Math.floor(tile / state.map.width), 0, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke(path);
  }

  #drawMovers(ctx, state, rt, cam, selected) {
    const size = Math.max(2, 5 * cam.zoom);
    const lift = 4 * cam.zoom;
    const batches = { trabalho: new Path2D(), casa: new Path2D() };
    for (const id of rt.movers) {
      const c = rt.citizenById.get(id);
      const [sx, sy] = worldToScreen(cam, c.x, c.y);
      if (sx < -10 || sy < -10 || sx > cam.viewW + 10 || sy > cam.viewH + 10) continue;
      batches[c.dest].rect(sx - size / 2, sy - size / 2 - lift, size, size);
    }
    for (const [dest, path] of Object.entries(batches)) {
      ctx.fillStyle = MOVER_COLORS[dest];
      ctx.fill(path);
    }

    if (selected && rt.citizenById.has(selected.id)) {
      const [sx, sy] = worldToScreen(cam, selected.x, selected.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - lift, size + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #drawNight(ctx, state, cam) {
    const hour = calendar(state.time.tick).minuteOfDay / 60;
    // 0 durante o dia, até 0.4 de madrugada, com transições ao amanhecer/anoitecer.
    let dark = 0;
    if (hour < 5 || hour >= 20) dark = 1;
    else if (hour < 7) dark = 1 - (hour - 5) / 2;
    else if (hour >= 18) dark = (hour - 18) / 2;
    if (dark <= 0) return;
    ctx.fillStyle = `rgba(10, 18, 48, ${0.4 * dark})`;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
  }
}

// ---------------------------------------------------------------------------

function diamond(path, cam, x, y, inset, size = 1) {
  const [tx, ty] = worldToScreen(cam, x + inset, y + inset);
  const [rx, ry] = worldToScreen(cam, x + size - inset, y + inset);
  const [bx, by] = worldToScreen(cam, x + size - inset, y + size - inset);
  const [lx, ly] = worldToScreen(cam, x + inset, y + size - inset);
  path.moveTo(tx, ty);
  path.lineTo(rx, ry);
  path.lineTo(bx, by);
  path.lineTo(lx, ly);
  path.closePath();
}

// Faixa tracejada no meio da estrada, ligando aos vizinhos que também são estrada.
function addRoadMarkings(path, state, cam, x, y) {
  const { width, height, road } = state.map;
  const [cx, cy] = worldToScreen(cam, x + 0.5, y + 0.5);
  const neighbors = [[1, 0], [0, 1]];
  for (const [dx, dy] of neighbors) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= width || ny >= height || !road[ny * width + nx]) continue;
    const [ex, ey] = worldToScreen(cam, nx + 0.5, ny + 0.5);
    path.moveTo(cx, cy);
    path.lineTo(ex, ey);
  }
}

function drawTree(ctx, cam, x, y) {
  const r = hash2(x, y, 3);
  const [cx, cy] = worldToScreen(cam, x + 0.3 + r * 0.4, y + 0.3 + hash2(x, y, 4) * 0.4);
  const z = cam.zoom;
  const h = (18 + r * 10) * z;
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(cx - 1.5 * z, cy - 5 * z, 3 * z, 5 * z);
  ctx.fillStyle = r < 0.5 ? '#2f6b34' : '#377a3b';
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + 8 * z, cy - 4 * z);
  ctx.lineTo(cx - 8 * z, cy - 4 * z);
  ctx.closePath();
  ctx.fill();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function gradient(from, mid, to, steps) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return t < 0.5 ? mix(from, mid, t * 2) : mix(mid, to, (t - 0.5) * 2);
  });
}

for (const mode of Object.values(MAP_MODES)) mode.colors = gradient(mode.from, mode.mid, mode.to, MAP_STEPS);
