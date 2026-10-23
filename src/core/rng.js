// Gerador de números aleatórios com semente (mulberry32).
//
// O estado do gerador fica dentro do estado do jogo (state.rng), então ele é
// salvo junto: carregar um save reproduz exatamente o mesmo "futuro". Toda a
// simulação deve usar só este gerador, nunca Math.random().

export function createRng(seed) {
  return { s: seed >>> 0 };
}

/** Número em [0, 1). */
export function random(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Inteiro em [min, max]. */
export function randomInt(rng, min, max) {
  return min + Math.floor(random(rng) * (max - min + 1));
}

export function pick(rng, list) {
  return list[Math.floor(random(rng) * list.length)];
}

export function chance(rng, probability) {
  return random(rng) < probability;
}

/** Hash inteiro estável, para variações visuais que não devem gastar o RNG. */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
