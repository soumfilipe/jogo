// Renderizador isométrico em Canvas 2D.
//
// Camadas, de baixo para cima:
// - estática (terreno, estradas, zonas, árvores, prédios): desenhada num
//   canvas fora da tela e só refeita quando a câmera ou o mapa mudam;
// - animações de ambiente a cada quadro: ondas e brilhos na água, smog;
// - noite e luzes das janelas;
// - cidadãos andando, cursor e prévia da ferramenta.
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
import { TRUNK, forestDensity, treesFor, waterDepth } from './nature.js';
import { Smog } from './smog.js';

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
// Ondas, brilhos e smog mudam devagar: a camada de ambiente é refeita só a
// cada tanto tempo, e entre uma e outra a imagem pronta é reaproveitada.
const AMBIENT_INTERVAL_MS = 80;
// ...e em resolução menor (smog e ondas são suaves; poupa muito preenchimento).
const AMBIENT_SCALE = 0.5;

const GRASS = ['#7db460', '#7ab15d', '#80b763'];
// Da margem (claro, esverdeado) para o fundo (escuro).
const WATER = ['#4f97c4', '#4387c0', '#3a78b8', '#336caf', '#2d61a3'];
const FOAM = 'rgba(255, 255, 255, 0.45)';
// Faixas de onda: grupos de tiles de água que clareiam em sequência.
const WAVE_GROUPS = 4;
// Chão da mata, de rala a fechada.
const FOREST_GROUNDS = ['#6aa452', '#609b4b', '#578f45', '#4e843f'];
const SAND = '#d9c98f';
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
  valor: { name: 'Valor do terreno', label: 'Valor', layer: 'landValue', from: '#c0392b', mid: '#f1c40f', to: '#27ae60' },
  poluicao: { name: 'Poluição', layer: 'pollution', from: '#7db460', mid: '#c9a227', to: '#5b2a86' },
  // Energia e água: prédios abastecidos (verde) ou não (vermelho) e as ruas
  // das redes com ou sem produção. O resto do mapa fica com a cor normal.
  energia: { name: 'Energia', layer: 'powerMap', from: '#d64541', mid: '#f1c40f', to: '#2ecc71' },
  agua: { name: 'Água', layer: 'waterMap', from: '#d64541', mid: '#f1c40f', to: '#3498db' },
};
const MAP_STEPS = 10;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.staticCanvas = document.createElement('canvas');
    // Opaco: colar uma imagem sem transparência na tela é bem mais rápido.
    this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false });
    this.staticKey = '';
    // Camada de luzes das janelas, por cima da escuridão da noite.
    this.lightsCanvas = document.createElement('canvas');
    this.lightsCtx = this.lightsCanvas.getContext('2d');
    this.lightsKey = '';
    // Camada dos cidadãos andando, refeita a cada quadro.
    this.moversCanvas = document.createElement('canvas');
    this.moversCtx = this.moversCanvas.getContext('2d');
    // Contornos dos prédios visíveis (para esconder carros atrás deles),
    // indexados por posição na tela. Montados junto com a camada estática.
    this.occluders = new OccluderGrid();
    // Água vista no cache: faixas de onda (Path2D) e posições para os brilhos.
    this.water = { waves: [], glints: [] };
    this.smog = new Smog();
    // Camada de ambiente (ondas, brilhos, smog), no mesmo espaço do cache.
    this.ambientCanvas = document.createElement('canvas');
    this.ambientCtx = this.ambientCanvas.getContext('2d');
    this.ambientKey = '';
    this.ambientAt = 0;
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
    // Até 2x: em telas 3x (celulares) o cache do mapa ficaria pesado demais
    // e a diferença quase não aparece.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
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
    this.ambientCanvas.width = Math.round((w + 2 * this.margin) * AMBIENT_SCALE);
    this.ambientCanvas.height = Math.round((h + 2 * this.margin) * AMBIENT_SCALE);
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
    // Sem zoom em andamento, desloca em pixels inteiros: evita reamostrar a imagem.
    const ox = view.k === 1 ? Math.round(view.tx * d) : view.tx * d;
    const oy = view.k === 1 ? Math.round(view.ty * d) : view.ty * d;
    const placeCache = () => ctx.setTransform(view.k, 0, 0, view.k, ox, oy);
    // Cola só o pedaço da camada (do tamanho do cache) que aparece na tela.
    const blit = (layer) => {
      const k = view.k;
      const full = this.staticCanvas;
      const r = layer.width / full.width;
      const qx0 = Math.max(0, Math.floor(-ox / k));
      const qy0 = Math.max(0, Math.floor(-oy / k));
      const qx1 = Math.min(full.width, Math.ceil((this.canvas.width - ox) / k));
      const qy1 = Math.min(full.height, Math.ceil((this.canvas.height - oy) / k));
      if (qx1 <= qx0 || qy1 <= qy0) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, qx0 * r, qy0 * r, (qx1 - qx0) * r, (qy1 - qy0) * r,
        qx0 * k + ox, qy0 * k + oy, (qx1 - qx0) * k, (qy1 - qy0) * k);
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (view.k < 1) {
      // Zoom afastando: o cache não cobre a tela toda até ser redesenhado.
      ctx.fillStyle = '#1b2a3a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    blit(this.staticCanvas);

    // Ambiente animado (em tempo real, mesmo com o jogo pausado).
    const minute = state.time.tick % MINUTES_PER_DAY;
    const dark = mode ? 0 : darkness(minute);
    if (this.ambientKey !== this.staticKey || now - this.ambientAt >= AMBIENT_INTERVAL_MS) {
      this.ambientKey = this.staticKey;
      this.ambientAt = now;
      this.#drawAmbient(state, rt, now / 1000, dark, !mode);
    }
    blit(this.ambientCanvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Noite: escurece tudo e acende as janelas por cima. Os cidadãos andando
    // vêm depois, então à noite parecem faróis nas ruas.
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
        blit(this.lightsCanvas);
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

    const { width, height, terrain, road, zone } = state.map;
    const range = visibleRange(cam);
    const paths = new Map();
    this.occluders.clear();
    const roadLines = new Path2D();
    const foam = new Path2D();
    const depth = waterDepth(state);
    const isWater = (tx, ty) => tx < 0 || ty < 0 || tx >= width || ty >= height || terrain[ty * width + tx] === TERRAIN.WATER;
    const waves = Array.from({ length: WAVE_GROUPS }, () => new Path2D());
    const glints = [];
    const z = cam.zoom;
    // Pequena sobreposição evita frestas entre losangos vizinhos.
    const pad = 0.5;

    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const tile = y * width + x;
        let color;
        if (road[tile]) color = ROAD;
        else if (mode && terrain[tile] !== TERRAIN.WATER && !Number.isNaN(rt[mode.layer][tile])) {
          color = mode.colors[Math.round(rt[mode.layer][tile] * MAP_STEPS)];
        }
        else if (zone[tile] && !rt.buildingAt[tile]) color = ZONE_TINT[zone[tile]];
        else if (terrain[tile] === TERRAIN.WATER) {
          color = WATER[Math.min(WATER.length - 1, Math.floor(Math.max(0, depth[tile]) * WATER.length + hash2(x, y) * 0.6))];
        } else if (terrain[tile] === TERRAIN.SAND) color = SAND;
        else if (terrain[tile] === TERRAIN.FOREST) {
          color = FOREST_GROUNDS[Math.min(3, Math.floor(forestDensity(x, y, state.seed) * 4))];
        }
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

        if (terrain[tile] === TERRAIN.WATER && !road[tile]) {
          // Espuma nas bordas que encostam em terra.
          const T = [tx, ty];
          const R = [tx + 32 * z, ty + 16 * z];
          const B = [tx, ty + 32 * z];
          const L = [tx - 32 * z, ty + 16 * z];
          for (const [nx, ny, a, b] of [[x, y - 1, T, R], [x + 1, y, R, B], [x, y + 1, B, L], [x - 1, y, L, T]]) {
            if (isWater(nx, ny)) continue;
            foam.moveTo(a[0], a[1]);
            foam.lineTo(b[0], b[1]);
          }
          // Ondas: faixas diagonais que clareiam em sequência (ver #drawWater).
          const group = Math.floor((x + y * 0.6) / 3 + hash2(x, y, 5) * 0.8) % WAVE_GROUPS;
          const wave = waves[group];
          wave.moveTo(tx, ty);
          wave.lineTo(tx + 32 * z, ty + 16 * z);
          wave.lineTo(tx, ty + 32 * z);
          wave.lineTo(tx - 32 * z, ty + 16 * z);
          if (glints.length < 6000) glints.push([tx, ty + 16 * z, hash2(x, y, 6), hash2(x, y, 7)]);
        }
      }
    }
    this.water = { waves, glints, zoom: z };
    for (const [color, path] of paths) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    ctx.strokeStyle = FOAM;
    ctx.lineWidth = Math.max(1, 2 * z);
    ctx.stroke(foam);
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
    const treesVisible = z >= 0.25 && !mode;
    for (let d = range.x0 + range.y0; d <= range.x1 + range.y1; d++) {
      const xStart = Math.max(range.x0, d - range.y1);
      const xEnd = Math.min(range.x1, d - range.y0);
      // Árvores da diagonal agrupadas por cor e desenhadas no fim dela.
      const trees = treesVisible ? new TreeBatch() : null;
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
            this.occluders.add(d, g);
            if (b.abandoned !== undefined) {
              // Abandonado: escurecido e sem cor.
              const outline = new Path2D();
              addSilhouette(outline, g);
              ctx.fillStyle = 'rgba(38, 34, 30, 0.6)';
              ctx.fill(outline);
            } else if (!mode) {
              const service = rt.service?.get(b.id);
              if (service && (!service.power || !service.water)) drawServiceBadges(ctx, g, service, z);
            }
          }
        } else if (trees && !road[tile] && terrain[tile] !== TERRAIN.WATER) {
          for (const tree of treesFor(state, x, y)) trees.add(cam, x, y, tree);
        }
      }
      if (trees) trees.flush(ctx);
    }
    ctx.globalAlpha = 1;
  }

  // Camada de ambiente, nas coordenadas do cache: ondas e brilhos na água
  // (geometria guardada no último desenho do cache) e smog.
  #drawAmbient(state, rt, time, dark, withSmog) {
    const ctx = this.ambientCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.ambientCanvas.width, this.ambientCanvas.height);
    ctx.setTransform(AMBIENT_SCALE, 0, 0, AMBIENT_SCALE, 0, 0);
    this.#drawWater(ctx, time, dark);
    if (withSmog) {
      this.smog.update(state, rt);
      this.smog.draw(ctx, this.cacheCam, AMBIENT_SCALE, time);
    }
  }

  // Ondas que atravessam a água e brilhos que piscam.
  #drawWater(ctx, time, dark) {
    const { waves, glints, zoom } = this.water;
    for (let g = 0; g < waves.length; g++) {
      const a = 0.08 * (1 + Math.sin(time * 1.3 - (g * Math.PI * 2) / waves.length));
      ctx.fillStyle = `rgba(210, 235, 255, ${a * (1 - dark * 0.6)})`;
      ctx.fill(waves[g]);
    }
    if (zoom < 0.35 || glints.length === 0) return;
    const sparkle = new Path2D();
    const len = 6 * zoom;
    for (const [sx, sy, h1, h2] of glints) {
      if (Math.sin(time * (1.2 + h1) + h2 * 40) < 0.82) continue;
      const ox = (h1 - 0.5) * 36 * zoom;
      const oy = (h2 - 0.5) * 18 * zoom;
      sparkle.moveTo(sx + ox - len / 2, sy + oy);
      sparkle.lineTo(sx + ox + len / 2, sy + oy);
    }
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * (1 - dark * 0.5)})`;
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    ctx.stroke(sparkle);
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
    const carBoxes = []; // [x, y, profundidade] de cada carro, na tela
    const margin = 20;
    for (const id of rt.movers) {
      const c = rt.citizenById.get(id);
      const pose = moverPose(state, c);
      if (!pose) continue;
      const [sx, sy] = worldToScreen(cam, pose.x, pose.y);
      if (sx < -margin || sy < -margin || sx > cam.viewW + margin || sy > cam.viewH + margin) continue;
      carBoxes.push([sx, sy, pose.depth]);
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

      // Só os prédios que encostam num carro que está atrás deles precisam
      // recortar a camada (os contornos estão nas coordenadas do cache).
      const { k, tx, ty } = this.view;
      const hiding = occlude ? this.occluders.hiding(carBoxes, (x) => (x - tx) / k, (y) => (y - ty) / k, 14 * cam.zoom / k) : new Map();
      const depths = new Set([...byDepth.keys(), ...hiding.keys()]);
      for (const d of [...depths].sort((a, b) => a - b)) {
        const outlines = hiding.get(d);
        if (outlines) {
          mctx.setTransform(k * this.dpr, 0, 0, k * this.dpr, tx * this.dpr, ty * this.dpr);
          mctx.globalCompositeOperation = 'destination-out';
          for (const outline of outlines) mctx.fill(outline);
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

// Ícones sobre prédios sem energia (raio amarelo) ou sem água (gota azul).
function drawServiceBadges(ctx, g, service, z) {
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const p of g.parts) {
    if (!p.hull) continue;
    for (const [x, y] of p.hull) {
      if (y < top) top = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (top === Infinity) return;
  const r = Math.max(5, 7 * z);
  const missing = [];
  if (!service.power) missing.push('power');
  if (!service.water) missing.push('water');
  missing.forEach((res, i) => {
    const cx = (left + right) / 2 + (i - (missing.length - 1) / 2) * r * 2.3;
    const cy = top - r * 1.4;
    ctx.fillStyle = res === 'power' ? '#f1c40f' : '#3498db';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, z);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = res === 'power' ? '#2b2b2b' : '#ffffff';
    ctx.beginPath();
    if (res === 'power') {
      // Raio.
      ctx.moveTo(cx + r * 0.15, cy - r * 0.75);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.02, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.2, cy + r * 0.75);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.02, cy - r * 0.15);
    } else {
      // Gota.
      ctx.moveTo(cx, cy - r * 0.7);
      ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.05, cx + r * 0.45, cy + r * 0.3);
      ctx.arc(cx, cy + r * 0.25, r * 0.45, 0, Math.PI);
      ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.05, cx, cy - r * 0.7);
    }
    ctx.fill();
  });
}

// Contornos dos prédios desenhados no cache, numa grade de células da tela
// para achar rápido quais encostam em cada carro.
const OCCLUDER_CELL = 64;

class OccluderGrid {
  constructor() {
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  /** Guarda o prédio de geometria `g`, desenhado na diagonal `depth`. */
  add(depth, g) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of g.parts) {
      if (!p.hull) continue;
      for (const [x, y] of p.hull) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x0 === Infinity) return;
    const path = new Path2D();
    addSilhouette(path, g);
    const entry = { depth, path, x0, y0, x1, y1 };
    for (let cx = Math.floor(x0 / OCCLUDER_CELL); cx <= Math.floor(x1 / OCCLUDER_CELL); cx++) {
      for (let cy = Math.floor(y0 / OCCLUDER_CELL); cy <= Math.floor(y1 / OCCLUDER_CELL); cy++) {
        const key = cx * 65536 + cy;
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(entry);
      }
    }
  }

  /**
   * Prédios que encostam em algum carro que está atrás deles, agrupados pela
   * diagonal: Map(profundidade -> [Path2D]). `toX`/`toY` levam a posição do
   * carro na tela para as coordenadas do cache; `r` é o raio do carro.
   */
  hiding(cars, toX, toY, r) {
    const found = new Set();
    for (const [sx, sy, depth] of cars) {
      const x = toX(sx);
      const y = toY(sy);
      // Todas as células que o carro toca.
      for (let cx = Math.floor((x - r) / OCCLUDER_CELL); cx <= Math.floor((x + r) / OCCLUDER_CELL); cx++) {
        for (let cy = Math.floor((y - r) / OCCLUDER_CELL); cy <= Math.floor((y + r) / OCCLUDER_CELL); cy++) {
          const list = this.cells.get(cx * 65536 + cy);
          if (!list) continue;
          for (const e of list) {
            if (e.depth > depth && x + r > e.x0 && x - r < e.x1 && y + r > e.y0 && y - r < e.y1) found.add(e);
          }
        }
      }
    }
    const byDepth = new Map();
    for (const e of found) {
      if (!byDepth.has(e.depth)) byDepth.set(e.depth, []);
      byDepth.get(e.depth).push(e.path);
    }
    return byDepth;
  }
}

// Árvores de uma diagonal do mapa, agrupadas por cor (troncos primeiro).
class TreeBatch {
  constructor() {
    this.trunks = new Path2D();
    this.byColor = new Map();
    this.any = false;
  }

  add(cam, x, y, tree) {
    const [cx, cy] = worldToScreen(cam, x + tree.u, y + tree.v);
    const z = cam.zoom * tree.size;
    let path = this.byColor.get(tree.color);
    if (!path) this.byColor.set(tree.color, (path = { body: new Path2D(), light: new Path2D(), base: tree.color }));
    this.any = true;
    if (tree.kind === 'pinheiro') {
      this.trunks.rect(cx - 1.2 * z, cy - 5 * z, 2.4 * z, 5 * z);
      // Dois andares de copa triangular.
      path.body.moveTo(cx, cy - 26 * z);
      path.body.lineTo(cx + 6 * z, cy - 13 * z);
      path.body.lineTo(cx - 6 * z, cy - 13 * z);
      path.body.moveTo(cx, cy - 19 * z);
      path.body.lineTo(cx + 8 * z, cy - 4 * z);
      path.body.lineTo(cx - 8 * z, cy - 4 * z);
      path.light.moveTo(cx, cy - 26 * z);
      path.light.lineTo(cx - 6 * z, cy - 13 * z);
      path.light.lineTo(cx - 1 * z, cy - 13 * z);
    } else if (tree.kind === 'copa') {
      this.trunks.rect(cx - 1.5 * z, cy - 8 * z, 3 * z, 8 * z);
      const r = 7 * z;
      path.body.moveTo(cx + r, cy - 13 * z);
      path.body.arc(cx, cy - 13 * z, r, 0, Math.PI * 2);
      path.light.moveTo(cx - 1.5 * z + r * 0.45, cy - 15.5 * z);
      path.light.arc(cx - 1.5 * z, cy - 15.5 * z, r * 0.45, 0, Math.PI * 2);
    } else {
      const r = 4.5 * z;
      path.body.moveTo(cx + r, cy - 3 * z);
      path.body.ellipse(cx, cy - 3 * z, r, r * 0.75, 0, 0, Math.PI * 2);
    }
  }

  flush(ctx) {
    if (!this.any) return;
    ctx.fillStyle = TRUNK;
    ctx.fill(this.trunks);
    for (const { body, light, base } of this.byColor.values()) {
      ctx.fillStyle = base;
      ctx.fill(body);
      ctx.fillStyle = mix(base, '#ffffff', 0.18);
      ctx.fill(light);
    }
  }
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
