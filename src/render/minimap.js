// Minimapa: o mapa inteiro, 1 pixel por tile, girado para ficar no mesmo
// ângulo da vista isométrica. Mostra o retângulo da câmera e permite clicar
// para ir até um ponto.

import { TERRAIN, ZONE_INFO } from '../world/catalog.js';
import { screenToWorld } from './camera.js';
import { designFor } from './designs.js';

const TERRAIN_RGB = {
  [TERRAIN.GRASS]: [122, 175, 93],
  [TERRAIN.WATER]: [63, 127, 196],
  [TERRAIN.FOREST]: [55, 110, 52],
  [TERRAIN.SAND]: [217, 201, 143],
};
const ROAD_RGB = [70, 72, 80];

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.source = document.createElement('canvas');
    this.version = -1;
  }

  render(state, rt, cam) {
    const { width, height } = state.map;
    if (this.version !== rt.mapVersion || this.source.width !== width) {
      this.version = rt.mapVersion;
      this.#paintSource(state, rt);
    }

    const ctx = this.ctx;
    const size = this.canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, this.canvas.height);
    this.#applyTransform(width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.source, 0, 0);

    // Área visível: os quatro cantos da tela projetados no mapa.
    const corners = [[0, 0], [cam.viewW, 0], [cam.viewW, cam.viewH], [0, cam.viewH]]
      .map(([sx, sy]) => screenToWorld(cam, sx, sy));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / this.scale;
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }

  /** Converte um clique no minimapa em coordenadas de tile. */
  toWorld(px, py, state) {
    const { width, height } = state.map;
    this.#applyTransform(width, height);
    const inv = this.ctx.getTransform().invertSelf();
    const p = new DOMPoint(px, py).matrixTransform(inv);
    return [p.x, p.y];
  }

  // Losango: gira 45° e achata pela metade, como a vista isométrica.
  #applyTransform(width, height) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.scale = Math.min(w / (width + height), (2 * h) / (width + height)) * Math.SQRT2 * 0.98;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2, (h - ((width + height) * this.scale) / (2 * Math.SQRT2)) / 2);
    ctx.scale(1, 0.5);
    ctx.rotate(Math.PI / 4);
    ctx.scale(this.scale, this.scale);
  }

  #paintSource(state, rt) {
    const { width, height, terrain, road, zone } = state.map;
    this.source.width = width;
    this.source.height = height;
    const sctx = this.source.getContext('2d');
    const image = sctx.createImageData(width, height);
    const px = image.data;
    for (let i = 0; i < width * height; i++) {
      let rgb = TERRAIN_RGB[terrain[i]];
      if (road[i]) rgb = ROAD_RGB;
      else if (rt.buildingAt[i]) rgb = hexToRgb(designFor(rt.buildingById.get(rt.buildingAt[i])).color);
      else if (zone[i]) rgb = hexToRgb(ZONE_INFO[zone[i]].color).map((v, k) => (v + TERRAIN_RGB[0][k]) / 2);
      px[i * 4] = rgb[0];
      px[i * 4 + 1] = rgb[1];
      px[i * 4 + 2] = rgb[2];
      px[i * 4 + 3] = 255;
    }
    sctx.putImageData(image, 0, 0);
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
