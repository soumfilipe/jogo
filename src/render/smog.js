// Smog: névoa sobre as áreas poluídas. Cada camada é uma imagem com 1 pixel
// por tile (a poluição vezes um ruído de nuvem), esticada sobre o mapa com a
// mesma projeção isométrica e levantada acima do chão. Duas camadas em alturas
// diferentes derivam devagar em sentidos opostos, então o smog parece mover.

import { TILE_H } from './iso.js';
import { smoothNoise } from './nature.js';

const LAYERS = [
  { lift: 0.8, drift: 1.6, speed: 0.045, noiseScale: 9, alpha: 0.58, color: [128, 112, 84] },
  { lift: 2.4, drift: 2.4, speed: -0.03, noiseScale: 5, alpha: 0.5, color: [150, 140, 118] },
];
// Abaixo disto a poluição não forma névoa visível.
const THRESHOLD = 0.12;

export class Smog {
  constructor() {
    this.layers = LAYERS.map(() => document.createElement('canvas'));
    this.key = '';
    this.any = false;
  }

  /** Refaz as imagens quando a poluição é recalculada. */
  update(state, rt) {
    const key = `${rt.landValueVersion || 0}:${state.map.width}:${state.seed}`;
    if (key === this.key && rt === this.rt) return;
    this.key = key;
    this.rt = rt;
    const { width, height } = state.map;
    this.any = false;
    LAYERS.forEach((layer, i) => {
      const canvas = this.layers[i];
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const image = ctx.createImageData(width, height);
      const px = image.data;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const t = y * width + x;
          const p = (rt.pollution[t] - THRESHOLD) / (1 - THRESHOLD);
          if (p <= 0) continue;
          const cloud = 0.2 + 0.8 * smoothNoise(x / layer.noiseScale, y / layer.noiseScale, state.seed + 101 + i * 17);
          const a = Math.min(0.9, Math.pow(p, 0.7) * cloud * 1.15);
          px[t * 4] = layer.color[0];
          px[t * 4 + 1] = layer.color[1];
          px[t * 4 + 2] = layer.color[2];
          px[t * 4 + 3] = Math.round(a * 255);
          this.any = true;
        }
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  /** Desenha as camadas para a câmera atual; `time` em segundos (tempo real). */
  draw(ctx, cam, dpr, time) {
    if (!this.any) return;
    const z = cam.zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    LAYERS.forEach((layer, i) => {
      // Deriva lenta em círculo, em tiles.
      const angle = time * layer.speed + i * 2;
      const dx = Math.cos(angle) * layer.drift;
      const dy = Math.sin(angle) * layer.drift;
      // Projeção isométrica como transformação afim: tile (x, y) -> tela.
      const e = (-cam.cx) * z + cam.viewW / 2;
      const f = (-cam.cy) * z + cam.viewH / 2 - layer.lift * TILE_H * z;
      ctx.setTransform(32 * z * dpr, 16 * z * dpr, -32 * z * dpr, 16 * z * dpr, e * dpr, f * dpr);
      ctx.globalAlpha = layer.alpha;
      ctx.drawImage(this.layers[i], dx, dy);
    });
    ctx.restore();
  }
}
