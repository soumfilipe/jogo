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

/** Caminho de estrada de `from` até `to` (inclusive), ou null. */
export function findRoadPath(map, from, to) {
  const { width, height, road } = map;
  if (!road[from] || !road[to]) return null;
  if (from === to) return [from];

  const buf = getBuffers(width * height);
  const stamp = ++buf.stamp;
  const { seen, closed, g, parent, heap } = buf;
  heap.clear();

  const tx = to % width;
  const ty = (to - tx) / width;
  const h = (t) => {
    const x = t % width;
    return (Math.abs(x - tx) + Math.abs((t - x) / width - ty)) * MIN_COST;
  };

  seen[from] = stamp;
  g[from] = 0;
  parent[from] = -1;
  heap.push(from, h(from));

  while (heap.size) {
    const current = heap.pop();
    if (closed[current] === stamp) continue;
    if (current === to) return rebuild(parent, to);
    closed[current] = stamp;

    const x = current % width;
    const y = (current - x) / width;
    // Ordem fixa de vizinhos: mantém o resultado determinístico.
    if (y > 0) relax(current - width);
    if (x < width - 1) relax(current + 1);
    if (y < height - 1) relax(current + width);
    if (x > 0) relax(current - 1);

    function relax(n) {
      if (!road[n] || closed[n] === stamp) return;
      const cost = g[current] + (STEP_COST[road[n]] ?? 1);
      if (seen[n] !== stamp || cost < g[n]) {
        seen[n] = stamp;
        g[n] = cost;
        parent[n] = current;
        heap.push(n, cost + h(n));
      }
    }
  }
  return null;
}

function rebuild(parent, to) {
  const path = [];
  for (let t = to; t !== -1; t = parent[t]) path.push(t);
  return path.reverse();
}

// Heap binária de mínimo. Desempata pela ordem de inserção para que o
// resultado não dependa de detalhes de implementação.
class MinHeap {
  constructor() {
    this.items = [];
    this.priorities = [];
    this.order = [];
    this.counter = 0;
  }

  get size() {
    return this.items.length;
  }

  clear() {
    this.items.length = 0;
    this.priorities.length = 0;
    this.order.length = 0;
    this.counter = 0;
  }

  push(item, priority) {
    const { items, priorities, order } = this;
    let i = items.length;
    items.push(item);
    priorities.push(priority);
    order.push(this.counter++);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.#less(i, p)) break;
      this.#swap(i, p);
      i = p;
    }
  }

  pop() {
    const { items } = this;
    const top = items[0];
    const lastIndex = items.length - 1;
    this.#swap(0, lastIndex);
    items.pop();
    this.priorities.pop();
    this.order.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < items.length && this.#less(l, m)) m = l;
      if (r < items.length && this.#less(r, m)) m = r;
      if (m === i) break;
      this.#swap(i, m);
      i = m;
    }
    return top;
  }

  #less(a, b) {
    const pa = this.priorities[a];
    const pb = this.priorities[b];
    return pa < pb || (pa === pb && this.order[a] < this.order[b]);
  }

  #swap(a, b) {
    for (const arr of [this.items, this.priorities, this.order]) {
      const t = arr[a];
      arr[a] = arr[b];
      arr[b] = t;
    }
  }
}
