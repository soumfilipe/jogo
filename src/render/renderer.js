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
import { MINUTES_PER_DAY } from '../core/time.js';
import { frontTile } from '../world/runtime.js';
import { visibleRange, worldToScreen } from './camera.js';
import { addSilhouette, buildingGeometry, drawBuilding, windowSize } from './buildings.js';
import { addCar, carColor, moverPose } from './movers.js';
import { LIGHT_COLORS, darkness, isWindowLit } from './lights.js';

// As luzes são redesenhadas a cada tantos minutos de jogo (e quando a câmera
// ou o mapa mudam), não a cada quadro.
const LIGHTS_EVERY_MINUTES = 15;
// ...mas no máximo uma vez a cada tanto tempo real, nas velocidades altas.
const LIGHTS_MIN_INTERVAL_MS = 300;
const LIGHTS_MIN_ZOOM = 0.15;
const NIGHT_TINT = 'rgba(10, 18, 48, 0.55)';

// As camadas estática e de luzes são desenhadas maiores que a tela, com esta
// margem (fração do maior lado) em volta. Ao arrastar a câmera, a imagem
// pronta só é deslocada; ela é redesenhada quando a margem acaba.
const CACHE_MARGIN = 0.3;
// Durante o zoom, a imagem pronta é escalada e só é redesenhada quando a
// roda do mouse para por este tempo.
const ZOOM_SETTLE_MS = 160;
// Mudanças no mapa feitas pela simulação (prédios crescendo) são mostradas
// com no máximo este atraso; as do jogador, na hora (ver invalidate()).
const MAP_REDRAW_MIN_MS = 400;

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
    // Camada de luzes das janelas, por cima da escuridão da noite.
    this.lightsCanvas = document.createElement('canvas');
    this.lightsCtx = this.lightsCanvas.getContext('2d');
    this.lightsKey = '';
    // Camada dos cidadãos andando, refeita a cada quadro.
    this.moversCanvas = document.createElement('canvas');
    this.moversCtx = this.moversCanvas.getContext('2d');
    // Contornos dos prédios visíveis, agrupados pela diagonal (x+y) do tile da
    // frente. Montados junto com a camada estática.
    this.occluders = new Map();
    // Câmera com que a camada estática foi desenhada (ver #cacheTransform).
    this.cacheCam = null;
    this.margin = 0;
    this.lastZoom = 0;
    this.lightsDrawnAt = 0;
    this.staticDrawnAt = 0;
    this.drawnMapVersion = -1;
    this.forceRedraw = false;
    this.zoomChangedAt = 0;
    this.dpr = 1;
  }

  resize(cam) {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.margin = Math.round(Math.max(w, h) * CACHE_MARGIN);
    for (const c of [this.canvas, this.moversCanvas]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    for (const c of [this.staticCanvas, this.lightsCanvas]) {
      c.width = Math.round((w + 2 * this.margin) * this.dpr);
      c.height = Math.round((h + 2 * this.margin) * this.dpr);
    }
    this.cacheCam = null;
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
    const now = performance.now();
    if (cam.zoom !== this.lastZoom) {
      this.lastZoom = cam.zoom;
      this.zoomChangedAt = now;
    }
    const key = [this.canvas.width, this.canvas.height, overlay.mapMode, mode ? rt.landValueVersion : 0].join(':');
    let view = this.cacheCam && this.#cacheTransform(cam);
    const zooming = now - this.zoomChangedAt < ZOOM_SETTLE_MS;
    const outOfCache = view && (view.k !== 1 ? !zooming : Math.abs(view.tx + this.margin) > this.margin || Math.abs(view.ty + this.margin) > this.margin);
    const mapChanged = rt.mapVersion !== this.drawnMapVersion &&
      (this.forceRedraw || now - this.staticDrawnAt >= MAP_REDRAW_MIN_MS);
    if (key !== this.staticBaseKey || !view || outOfCache || mapChanged) {
      this.staticBaseKey = key;
      // Identifica o desenho atual do cache (as luzes dependem dele).
      this.staticKey = `${key}:${rt.mapVersion}:${now}`;
      this.drawnMapVersion = rt.mapVersion;
      this.staticDrawnAt = now;
      this.forceRedraw = false;
      this.cacheCam = { ...cam, viewW: cam.viewW + 2 * this.margin, viewH: cam.viewH + 2 * this.margin };
      this.#drawStatic(state, rt, this.cacheCam, mode);
      this.lightsKey = '';
      view = this.#cacheTransform(cam);
    }
    this.view = view;

    const ctx = this.ctx;
    const d = this.dpr;
    // Imagem pronta na posição (e escala) da câmera atual.
    const placeCache = () => ctx.setTransform(view.k, 0, 0, view.k, view.tx * d, view.ty * d);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b2a3a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    placeCache();
    ctx.drawImage(this.staticCanvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Noite: escurece tudo e acende as janelas por cima. Os cidadãos andando
    // vêm depois, então à noite parecem faróis nas ruas.
    const minute = state.time.tick % MINUTES_PER_DAY;
    const dark = mode ? 0 : darkness(minute);
    if (dark > 0) {
      ctx.globalAlpha = dark;
      ctx.fillStyle = NIGHT_TINT;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      if (cam.zoom >= LIGHTS_MIN_ZOOM) {
        const lightsKey = [this.staticKey, Math.floor(state.time.tick / LIGHTS_EVERY_MINUTES)].join(':');
        // Cache novo: redesenha já. Só o horário mudou: respeita o intervalo mínimo.
        const cacheChanged = !this.lightsKey.startsWith(`${this.staticKey}:`);
        if (lightsKey !== this.lightsKey && (cacheChanged || now - this.lightsDrawnAt >= LIGHTS_MIN_INTERVAL_MS)) {
          this.lightsKey = lightsKey;
          this.lightsDrawnAt = now;
          this.#drawLights(state, rt, this.cacheCam, minute);
        }
        ctx.globalAlpha = Math.min(1, dark * 1.6);
        placeCache();
        ctx.drawImage(this.lightsCanvas, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (overlay.preview) this.#drawTiles(ctx, state, cam, overlay.preview.tiles, overlay.preview.color);
    const selectedBuilding = overlay.selected?.building;
    if (selectedBuilding) {
      const size = BUILDINGS[selectedBuilding.type].size;
      this.#outlineTile(ctx, state, cam, selectedBuilding.tile, '#ffffff', 2, size);
    }
    this.#drawMovers(ctx, state, rt, cam, overlay.selected?.citizen, !mode);
    if (overlay.hover) {
      this.#outlineTile(ctx, state, cam, overlay.hover.y * state.map.width + overlay.hover.x, 'rgba(255,255,255,0.8)', 1.5);
    }
  }

  /** Redesenha o mapa no próximo quadro (depois de uma ação do jogador). */
  invalidate() {
    this.forceRedraw = true;
  }

  /**
   * Como levar a imagem em cache (desenhada com this.cacheCam) para a câmera
   * atual: ponto na tela = ponto no cache * k + (tx, ty), em pixels CSS.
   */
  #cacheTransform(cam) {
    const c = this.cacheCam;
    if (!c) return null;
    const k = cam.zoom / c.zoom;
    return {
      k,
      tx: ((-c.viewW / 2) / c.zoom + c.cx - cam.cx) * cam.zoom + cam.viewW / 2,
      ty: ((-c.viewH / 2) / c.zoom + c.cy - cam.cy) * cam.zoom + cam.viewH / 2,
    };
  }

  // Desenha as janelas acesas, prédio a prédio de trás para frente. Antes das
  // janelas de cada prédio, o contorno dele é recortado da camada: assim as
  // luzes dos prédios de trás ficam escondidas atrás dos da frente.
  #drawLights(state, rt, cam, minute) {
    const ctx = this.lightsCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.lightsCanvas.width, this.lightsCanvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const width = state.map.width;
    const range = visibleRange(cam);
    const [w, wh] = windowSize(cam.zoom);
    for (let d = range.x0 + range.y0; d <= range.x1 + range.y1; d++) {
      const xStart = Math.max(range.x0, d - range.y1);
      const xEnd = Math.min(range.x1, d - range.y0);
      for (let x = xStart; x <= xEnd; x++) {
        const tile = (d - x) * width + x;
        const id = rt.buildingAt[tile];
        if (!id) continue;
        const b = rt.buildingById.get(id);
        if (tile !== frontTile(state, b)) continue;

        const g = buildingGeometry(cam, b.tile % width, Math.floor(b.tile / width), b);
        const outline = new Path2D();
        addSilhouette(outline, g);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fill(outline);
        ctx.globalCompositeOperation = 'source-over';
        if (g.windows.length === 0) continue;

        const occupancy = buildingOccupancy(rt, b, g.info);
        if (occupancy <= 0) continue;
        const lit = new Path2D();
        const glow = new Path2D();
        g.windows.forEach(([wx, wy], k) => {
          if (!isWindowLit(b, g.info, k, minute, occupancy)) return;
          lit.rect(wx - w / 2, wy - wh / 2, w, wh);
          glow.rect(wx - w, wy - wh, w * 2, wh * 2);
        });
        ctx.fillStyle = LIGHT_COLORS[g.info.zone];
        ctx.globalAlpha = 0.18;
        ctx.fill(glow);
        ctx.globalAlpha = 1;
        ctx.fill(lit);
      }
    }
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
    this.occluders.clear();
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
        // Sem closePath: com dezenas de milhares de losangos no mesmo caminho,
        // closePath fica lento no Chromium; o fill fecha cada contorno sozinho.

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
          if (tile === frontTile(state, b)) {
            const bx = b.tile % width;
            const by = Math.floor(b.tile / width);
            const g = drawBuilding(ctx, cam, bx, by, b);
            let outline = this.occluders.get(d);
            if (!outline) this.occluders.set(d, (outline = new Path2D()));
            addSilhouette(outline, g);
          }
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
    path.closePath(); // contorno: o traço precisa do lado final
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke(path);
  }

  // Cidadãos andando, como carrinhos coloridos na mão direita da rua. São
  // desenhados de trás para frente numa camada própria: ao passar por cada
  // diagonal do mapa, os prédios dela recortam os carros já desenhados atrás
  // deles. Assim um carro atrás de um prédio fica escondido.
  #drawMovers(ctx, state, rt, cam, selected, occlude) {
    const byDepth = new Map();
    const margin = 20;
    for (const id of rt.movers) {
      const c = rt.citizenById.get(id);
      const pose = moverPose(state, c);
      if (!pose) continue;
      const [sx, sy] = worldToScreen(cam, pose.x, pose.y);
      if (sx < -margin || sy < -margin || sx > cam.viewW + margin || sy > cam.viewH + margin) continue;
      let cars = byDepth.get(pose.depth);
      if (!cars) byDepth.set(pose.depth, (cars = new Map()));
      const color = carColor(c);
      let path = cars.get(color);
      if (!path) cars.set(color, (path = new Path2D()));
      addCar(path, cam, pose);
    }

    if (byDepth.size > 0) {
      const mctx = this.moversCtx;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, this.moversCanvas.width, this.moversCanvas.height);
      mctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      mctx.fillStyle = '#000';

      const depths = new Set(byDepth.keys());
      if (occlude) for (const d of this.occluders.keys()) depths.add(d);
      const firstCar = Math.min(...byDepth.keys());
      for (const d of [...depths].sort((a, b) => a - b)) {
        if (occlude && d > firstCar && this.occluders.has(d)) {
          // Os contornos estão nas coordenadas do cache: aplica o mesmo deslocamento.
          const { k, tx, ty } = this.view;
          mctx.setTransform(k * this.dpr, 0, 0, k * this.dpr, tx * this.dpr, ty * this.dpr);
          mctx.globalCompositeOperation = 'destination-out';
          mctx.fill(this.occluders.get(d));
          mctx.globalCompositeOperation = 'source-over';
          mctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }
        const cars = byDepth.get(d);
        if (!cars) continue;
        for (const [color, path] of cars) {
          mctx.fillStyle = color;
          mctx.fill(path);
        }
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.moversCanvas, 0, 0);
      ctx.restore();
    }

    const pose = selected && rt.citizenById.has(selected.id) && selected.state === 'viajando'
      ? moverPose(state, selected)
      : null;
    if (pose) {
      const [sx, sy] = worldToScreen(cam, pose.x, pose.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - 2 * cam.zoom, Math.max(8, 14 * cam.zoom), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

}

// ---------------------------------------------------------------------------

// Fração de gente no prédio: moradores em casa, ou se tem alguém trabalhando.
function buildingOccupancy(rt, b, info) {
  if (info.residents) {
    let home = 0;
    for (const id of rt.residents.get(b.id)) if (rt.citizenById.get(id).state === 'casa') home++;
    return home / info.residents;
  }
  return rt.workers.get(b.id).size > 0 ? 0.9 : 0;
}

function diamond(path, cam, x, y, inset, size = 1) {
  const [tx, ty] = worldToScreen(cam, x + inset, y + inset);
  const [rx, ry] = worldToScreen(cam, x + size - inset, y + inset);
  const [bx, by] = worldToScreen(cam, x + size - inset, y + size - inset);
  const [lx, ly] = worldToScreen(cam, x + inset, y + size - inset);
  path.moveTo(tx, ty);
  path.lineTo(rx, ry);
  path.lineTo(bx, by);
  path.lineTo(lx, ly);
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
