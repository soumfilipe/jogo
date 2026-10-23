// Tempo do jogo. Um tick = 1 minuto de jogo; o estado guarda só o número do
// tick (state.time.tick) e o resto é derivado daqui.

export const MINUTES_PER_DAY = 24 * 60;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_DAY = MINUTES_PER_DAY;
export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH;

// Ticks por segundo real em cada velocidade (índice 0 = pausado).
export const SPEEDS = [0, 20, 60, 180];

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function calendar(tick) {
  const minuteOfDay = tick % MINUTES_PER_DAY;
  const totalDays = Math.floor(tick / TICKS_PER_DAY);
  return {
    minuteOfDay,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    day: (totalDays % DAYS_PER_MONTH) + 1,
    month: (Math.floor(totalDays / DAYS_PER_MONTH) % MONTHS_PER_YEAR) + 1,
    year: Math.floor(totalDays / (DAYS_PER_MONTH * MONTHS_PER_YEAR)) + 1,
  };
}

export function formatClock(minuteOfDay) {
  const h = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const m = String(minuteOfDay % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDate(tick) {
  const c = calendar(tick);
  return `${formatClock(c.minuteOfDay)} · ${c.day} ${MONTH_NAMES[c.month - 1]}, ano ${c.year}`;
}
