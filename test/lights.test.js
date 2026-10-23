import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../src/world/catalog.js';
import { darkness, isWindowLit } from '../src/render/lights.js';

// Fração de janelas acesas numa amostra grande de prédios do tipo, no horário.
function litFraction(type, hour, occupancy = 1) {
  const info = BUILDINGS[type];
  let lit = 0;
  let total = 0;
  for (let id = 1; id <= 200; id++) {
    for (let k = 0; k < 24; k++) {
      total++;
      if (isWindowLit({ id }, info, k, Math.round(hour * 60) % 1440, occupancy)) lit++;
    }
  }
  return lit / total;
}

test('residências acendem ao anoitecer e vão apagando de madrugada', () => {
  assert.equal(litFraction('apartamentos', 12), 0, 'de dia, apagado');
  assert.ok(litFraction('apartamentos', 18) < litFraction('apartamentos', 21), 'acendendo ao anoitecer');
  assert.ok(litFraction('apartamentos', 21) > 0.9, 'noite: quase tudo aceso');
  assert.ok(litFraction('apartamentos', 23.5) < litFraction('apartamentos', 21), 'começa a apagar');
  const late = litFraction('apartamentos', 3);
  assert.ok(late > 0 && late < 0.12, `madrugada: poucos acordados (${late})`);
  const morning = litFraction('casa', 6.25);
  assert.ok(morning > 0.1 && morning < 0.45, `parte acorda cedo (${morning})`);
});

test('quantas janelas acendem depende de quantos moradores estão em casa', () => {
  assert.equal(litFraction('casa', 21, 0), 0, 'casa vazia fica apagada');
  const half = litFraction('casa', 21, 0.5);
  assert.ok(half > 0.35 && half < 0.6, `metade em casa: ${half}`);
});

test('comércio acende quando a noite chega e fecha entre 20h e 23h', () => {
  assert.equal(litFraction('loja', 14), 0);
  assert.ok(litFraction('loja', 19) > 0.6);
  assert.ok(litFraction('loja', 21.5) < litFraction('loja', 19));
  assert.equal(litFraction('loja', 23.5), 0, 'lojas fechadas');
  const offices = litFraction('escritorios', 0.5);
  assert.ok(offices > 0 && offices < 0.1, `alguns escritórios até tarde (${offices})`);
});

test('indústria tem turno da noite com poucas luzes', () => {
  assert.equal(litFraction('complexo', 12), 0);
  const night = litFraction('complexo', 2);
  assert.ok(night > 0.15 && night < 0.4, `turno da noite: ${night}`);
});

test('mesma janela, mesmo horário: sempre o mesmo resultado (sem piscar)', () => {
  const info = BUILDINGS.sobrado;
  for (let k = 0; k < 20; k++) {
    assert.equal(isWindowLit({ id: 42 }, info, k, 21 * 60, 1), isWindowLit({ id: 42 }, info, k, 21 * 60, 1));
  }
});

test('escuridão: dia claro, noite fechada e transições', () => {
  assert.equal(darkness(12 * 60), 0);
  assert.equal(darkness(23 * 60), 1);
  assert.equal(darkness(3 * 60), 1);
  const dusk = darkness(18.5 * 60);
  const dawn = darkness(5.75 * 60);
  assert.ok(dusk > 0 && dusk < 1);
  assert.ok(dawn > 0 && dawn < 1);
});
