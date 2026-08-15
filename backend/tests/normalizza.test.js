/**
 * Test unit per le funzioni di normalizzazione e validazione parole.
 *
 * Esegue con: node --test backend/tests/normalizza.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaBase, validaParola } from '../src/utils/normalizza.js';

test('normalizzaBase: lowercase + trim', () => {
  assert.equal(normalizzaBase('  BANANA  '), 'banana');
  assert.equal(normalizzaBase('Ciao'), 'ciao');
  assert.equal(normalizzaBase('POTARE'), 'potare');
});

test('normalizzaBase: input non stringa ritorna vuoto', () => {
  assert.equal(normalizzaBase(null), '');
  assert.equal(normalizzaBase(undefined), '');
  assert.equal(normalizzaBase(123), '');
  assert.equal(normalizzaBase({}), '');
});

test('normalizzaBase: vuoto rimane vuoto', () => {
  assert.equal(normalizzaBase(''), '');
  assert.equal(normalizzaBase('   '), '');
});

test('validaParola: parola valida (range OK, charset OK)', () => {
  const r = validaParola('banana', 3, 10);
  assert.equal(r.valida, true);
  assert.equal(r.motivo, null);
  assert.equal(r.normalizzata, 'banana');
});

test('validaParola: lowercase + trim automatici', () => {
  const r = validaParola('  POTARE  ', 3, 10);
  assert.equal(r.valida, true);
  assert.equal(r.normalizzata, 'potare');
});

test('validaParola: accenti italiani accettati', () => {
  const r1 = validaParola('città', 3, 10);
  assert.equal(r1.valida, true);
  const r2 = validaParola('perché', 3, 10);
  assert.equal(r2.valida, true);
  const r3 = validaParola('gioì', 3, 10);
  assert.equal(r3.valida, true);
});

test('validaParola: apostrofo accettato (raro ma valido)', () => {
  // Casi tipo "c'e'" sono rari ma possibili
  const r = validaParola("c'e'", 3, 10);
  assert.equal(r.valida, true);
});

test('validaParola: rifiutata se troppo corta', () => {
  const r = validaParola('cia', 5, 10);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'troppo_corta');
  assert.equal(r.normalizzata, 'cia');
});

test('validaParola: rifiutata se troppo lunga', () => {
  const r = validaParola('bananone', 3, 5);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'troppo_lunga');
  assert.equal(r.normalizzata, 'bananone');
});

test('validaParola: rifiutata se vuota', () => {
  const r1 = validaParola('', 3, 10);
  assert.equal(r1.valida, false);
  assert.equal(r1.motivo, 'parola_vuota');
  const r2 = validaParola('   ', 3, 10);
  assert.equal(r2.valida, false);
  assert.equal(r2.motivo, 'parola_vuota');
});

test('validaParola: rifiutata per caratteri non validi (numeri)', () => {
  const r = validaParola('c4sa', 3, 10);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'caratteri_non_validi');
  assert.equal(r.normalizzata, 'c4sa');
});

test('validaParola: rifiutata per caratteri non validi (simboli)', () => {
  const r = validaParola('ciao!', 3, 10);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'caratteri_non_validi');
});

test('validaParola: rifiutata per caratteri non validi (spazi interni)', () => {
  const r = validaParola('casa mia', 3, 10);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'caratteri_non_validi');
});

test('validaParola: rifiutata per caratteri non validi (lettere straniere)', () => {
  // 'w' non è in italiano
  const r = validaParola('wifi', 3, 10);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'caratteri_non_validi');
});

test('validaParola: lunghezza al boundary inferiore', () => {
  const r = validaParola('cia', 3, 10);
  assert.equal(r.valida, true);
  assert.equal(r.normalizzata, 'cia');
});

test('validaParola: lunghezza al boundary superiore', () => {
  const r = validaParola('bananone', 3, 8);
  assert.equal(r.valida, true);
  assert.equal(r.normalizzata, 'bananone');
});
