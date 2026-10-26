// Clima e tempo. O mapa tem um clima (state.weather.climate, ver CLIMATES no
// catálogo); o tempo de cada dia sai dele com um sorteio próprio da semente e
// do dia (sem mexer no state.rng). Assim a previsão é o tempo de verdade dos
// próximos dias, e carregar um save não muda nada.
//
// state.weather = { climate, today, rain: [mm dos últimos 30 dias], dry }
//   today: { day, kind: 'sol' | 'nublado' | 'chuva' | 'tempestade', mm, temp, hot, cold }
//   dry:   dias seguidos sem chuva
//
// Efeitos leves (por enquanto): calor e frio aumentam o consumo de energia
// (rt.weatherPower) e a chuva espanta parte dos turistas dos parques. As
// enchentes, secas e queimadas virão na etapa dos desastres.

import { CLIMATES, WEATHER } from '../world/catalog.js';
import { createRng, random } from '../core/rng.js';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../core/time.js';
import { mod } from './mods.js';

export const CLIMATE_IDS = Object.keys(CLIMATES);
export const RAIN_DAYS = 30;

export const KIND_NAMES = { sol: 'Sol', nublado: 'Nublado', chuva: 'Chuva', tempestade: 'Tempestade' };

export function createWeather(seed, climate = 'subtropical') {
  const weather = { climate: CLIMATES[climate] ? climate : 'subtropical', today: null, rain: [], dry: 0 };
  weather.today = dayWeather(seed, weather.climate, 0);
  return weather;
}

/** Tempo do dia `day` (contado do começo do jogo) no clima. Função pura. */
export function dayWeather(seed, climate, day) {
  const C = CLIMATES[climate];
  const month = Math.floor(day / DAYS_PER_MONTH) % MONTHS_PER_YEAR;
  const rng = createRng((Math.imul(day + 1, 2654435761) ^ seed ^ 0x77e71) >>> 0);
  const r = () => random(rng);
  const monthRain = C.rain[month];
  // Chance de chover no dia e chuva média de um dia chuvoso, para a soma do
  // mês dar a média do clima.
  const p = Math.min(0.6, Math.max(0.03, monthRain / 300));
  const mean = monthRain / (p * DAYS_PER_MONTH);
  const rainy = r() < p;
  // Cauda mais longa que a exponencial (dias de temporal), com a mesma média.
  const mm = rainy ? Math.round(((mean * (-Math.log(1 - r() * 0.999)) ** 1.4) / 1.24) * 10) / 10 : 0;
  const base = C.temp[month];
  const temp = Math.round(base + (r() - 0.5) * 8 - (mm > 5 ? 2 : 0));
  const cloudy = r() < 0.2 + p * 0.6;
  const kind = mm >= WEATHER.storm ? 'tempestade' : mm >= 1 ? 'chuva' : cloudy ? 'nublado' : 'sol';
  // Calor e frio: fora do normal do mês e do clima.
  return { day, kind, mm, temp, hot: temp >= Math.max(WEATHER.hot, base + 3), cold: temp <= Math.min(WEATHER.cold, base - 3) };
}

/** Previsão dos próximos dias: [{ day, kind, mm, temp, hot, cold }]. */
export function forecast(state, rt) {
  const days = WEATHER.forecast + mod(rt, 'forecastDays', 0);
  const today = Math.floor(state.time.tick / TICKS_PER_DAY);
  return Array.from({ length: days }, (_, i) => dayWeather(state.seed, state.weather.climate, today + i + 1));
}

/** Virada do dia: o tempo novo e o histórico de chuva. */
export function updateWeather(state, rt) {
  const w = state.weather;
  const day = Math.floor(state.time.tick / TICKS_PER_DAY);
  if (w.today?.day === day) return applyWeather(state, rt);
  // A chuva do dia que acabou entra no histórico.
  if (w.today) {
    w.rain.push(w.today.mm);
    if (w.rain.length > RAIN_DAYS) w.rain.shift();
    w.dry = w.today.mm >= 1 ? 0 : w.dry + 1;
  }
  w.today = dayWeather(state.seed, w.climate, day);
  applyWeather(state, rt);
}

/** Derivados do tempo de hoje no runtime. */
export function applyWeather(state, rt) {
  const t = state.weather?.today;
  rt.weatherPower = t && (t.hot || t.cold) ? WEATHER.hotPower : 1;
}

/**
 * Risco do mês (Ciência do clima): pela chuva média do mês comparada com a do
 * ano. { flood, drought }: 'baixo' | 'médio' | 'alto'.
 */
export function monthRisk(state) {
  const C = CLIMATES[state.weather.climate];
  const month = Math.floor(state.time.tick / TICKS_PER_DAY / DAYS_PER_MONTH) % MONTHS_PER_YEAR;
  const avg = C.rain.reduce((s, v) => s + v, 0) / 12;
  const r = C.rain[month] / avg;
  return {
    flood: r >= 1.4 ? 'alto' : r >= 1 ? 'médio' : 'baixo',
    drought: r <= 0.3 ? 'alto' : r <= 0.7 ? 'médio' : 'baixo',
  };
}

/** Chuva dos últimos 30 dias (mm). */
export const rain30 = (state) => (state.weather?.rain ?? []).reduce((s, v) => s + v, 0);

/** Fator dos turistas dos parques hoje (chuva espanta). */
export function touristWeather(state) {
  const kind = state.weather?.today?.kind;
  return kind === 'chuva' || kind === 'tempestade' ? WEATHER.rainTourists : 1;
}

/** Texto curto do tempo: "Chuva · 23°". */
export const weatherText = (t) => `${KIND_NAMES[t.kind]} · ${t.temp}°${t.mm >= 1 ? ` · ${Math.round(t.mm)} mm` : ''}`;
