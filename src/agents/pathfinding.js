// A* sobre os tiles de estrada (4 vizinhos). Os buffers são reaproveitados
// entre buscas para não gerar lixo; cada busca usa um "carimbo" para saber
// quais posições já foram tocadas nela.
//
// O custo de passar por um tile é o inverso da velocidade do tipo de rua
// (ROAD_TYPES): avenidas e vias expressas atraem os caminhos. Usa só a
// velocidade do catálogo (sem modificadores nem trânsito), para que uma rota
// guardada no cache continue certa até as ruas mudarem.

import { ROAD_TYPES } from '../world/catalog.js';

const STEP_COST = [Infinity];
for (const [value, type] of Object.entries(ROAD_TYPES)) STEP_COST[Number(value)] = 1 / type.speed;
const MIN_COST = Math.min(...STEP_COST);

let buffers = null;

function getBuffers(size) {
  if (!buffers || buffers.size !== size) {
    buffers = {
      size,
      stamp: 0,
      seen: new Uint32Array(size),
      closed: new Uint32Array(size),
      g: new Float64Array(size),
      parent: new Int32Array(size),
      heap: new MinHeap(),
    };
  }
  return buffers;
}

/**
 * Caminho de estrada de `from` até `to` (inclusive), ou null. `blocked`
 * (opcional): tiles fechados (corrida de rua), que não são atravessados, a
 * não ser que sejam a origem ou o destino.
 */
export function findRoadPath(map, from, to, blocked = null) {
  const { width, height, road } = map;
  if (!road[from] || !road[to]) return null;
  if (from === to) return [from];

  const buf = getBuffers(width * height);
  const stamp = ++buf.stamp;
  const { seen, closed, g, parent, heap } = buf;
  heap.clear();

  const tx = to % width;
  const ty = (to - tx) / width;

  seen[from] = stamp;
  g[from] = 0;
  parent[from] = -1;
  heap.push(from, (Math.abs((from % width) - tx) + Math.abs(Math.floor(from / width) - ty)) * MIN_COST);

  while (heap.size > 0) {
    const current = heap.pop();
    if (closed[current] === stamp) continue;
    if (current === to) return rebuild(parent, to);
    closed[current] = stamp;

    const x = current % width;
    const y = (current - x) / width;
    const base = g[current];
    // Ordem fixa de vizinhos (cima, direita, baixo, esquerda): mantém o
    // resultado determinístico.
    for (let k = 0; k < 4; k++) {
      let n;
      if (k === 0) {
        if (y === 0) continue;
        n = current - width;
      } else if (k === 1) {
        if (x === width - 1) continue;
        n = current + 1;
      } else if (k === 2) {
        if (y === height - 1) continue;
        n = current + width;
      } else {
        if (x === 0) continue;
        n = current - 1;
      }
      const type = road[n];
      if (!type || closed[n] === stamp || (blocked !== null && blocked[n] && n !== to)) continue;
      const cost = base + (STEP_COST[type] ?? 1);
      if (seen[n] !== stamp || cost < g[n]) {
        seen[n] = stamp;
        g[n] = cost;
        parent[n] = current;
        const nx = n % width;
        heap.push(n, cost + (Math.abs(nx - tx) + Math.abs((n - nx) / width - ty)) * MIN_COST);
      }
    }
  }
  return null;
}

/**
 * Rota em array tipado, para o cache: Uint16 (metade da memória) quando os
 * índices dos tiles cabem nele, senão Int32.
 */
export function packRoute(map, route) {
  return map.width * map.height <= 0x10000 ? Uint16Array.from(route) : Int32Array.from(route);
}

function rebuild(parent, to) {
  const path = [];
  for (let t = to; t !== -1; t = parent[t]) path.push(t);
  return path.reverse();
}

// Heap binária de mínimo em arrays tipados (sem gerar lixo). Desempata pela
// ordem de inserção para que o resultado não dependa de detalhes de
// implementação.
class MinHeap {
  constructor() {
    this.capacity = 1024;
    this.items = new Int32Array(this.capacity);
    this.priorities = new Float64Array(this.capacity);
    this.order = new Uint32Array(this.capacity);
    this.size = 0;
    this.counter = 0;
  }

  clear() {
    this.size = 0;
    this.counter = 0;
  }

  #grow() {
    this.capacity *= 2;
    const items = new Int32Array(this.capacity);
    const priorities = new Float64Array(this.capacity);
    const order = new Uint32Array(this.capacity);
    items.set(this.items);
    priorities.set(this.priorities);
    order.set(this.order);
    this.items = items;
    this.priorities = priorities;
    this.order = order;
  }

  push(item, priority) {
    if (this.size === this.capacity) this.#grow();
    const { items, priorities, order } = this;
    const ord = this.counter++;
    let i = this.size++;
    // Sobe "abrindo espaço": desce os pais maiores até achar a posição.
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pp = priorities[p];
      if (pp < priority || (pp === priority && order[p] < ord)) break;
      items[i] = items[p];
      priorities[i] = pp;
      order[i] = order[p];
      i = p;
    }
    items[i] = item;
    priorities[i] = priority;
    order[i] = ord;
  }

  pop() {
    const { items, priorities, order } = this;
    const top = items[0];
    const n = --this.size;
    if (n === 0) return top;
    // O último desce a partir da raiz.
    const item = items[n];
    const pri = priorities[n];
    const ord = order[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      let m = l;
      if (r < n && (priorities[r] < priorities[l] || (priorities[r] === priorities[l] && order[r] < order[l]))) m = r;
      const pm = priorities[m];
      if (pri < pm || (pri === pm && ord < order[m])) break;
      items[i] = items[m];
      priorities[i] = pm;
      order[i] = order[m];
      i = m;
    }
    items[i] = item;
    priorities[i] = pri;
    order[i] = ord;
    return top;
  }
}
