/**
 * Test unit per la funzione distanzaEdit e isDistanzaUno.
 *
 * Esegue con: node --test backend/tests/levenshtein.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanzaEdit, isDistanzaUno } from '../src/utils/levenshtein.js';

test('distanzaEdit: stringhe identiche ritorna 0', () => {
  assert.equal(distanzaEdit('banana', 'banana'), 0);
  assert.equal(distanzaEdit('', ''), 0);
});

test('distanzaEdit: una vuota, altra piena', () => {
  assert.equal(distanzaEdit('', 'ciao'), 4);
  assert.equal(distanzaEdit('ciao', ''), 4);
});

test('distanzaEdit: una sostituzione (es. BANANA → BANANE)', () => {
  assert.equal(distanzaEdit('banana', 'banane'), 1);
  assert.equal(distanzaEdit('casa', 'case'), 1);
  assert.equal(distanzaEdit('pane', 'cane'), 1);
});

test('distanzaEdit: una aggiunta (es. POTARE → PORTARE)', () => {
  assert.equal(distanzaEdit('potare', 'portare'), 1);
  assert.equal(distanzaEdit('casa', 'cassa'), 1);
});

test('distanzaEdit: una rimozione (es. CIAO → CIA)', () => {
  assert.equal(distanzaEdit('ciao', 'cia'), 1);
  assert.equal(distanzaEdit('parola', 'parol'), 1);
});

test('distanzaEdit: BARARE → BARRE è distanza 1 (sostituzione a→r)', () => {
  // b-a-r-a-r-e → b-a-r-r-e: una sostituzione a→r alla posizione 3
  assert.equal(distanzaEdit('barare', 'barre'), 1);
});

test('distanzaEdit: distanza 2 o più', () => {
  // banana (6) → ciliegia (8) = almeno |8-6|=2 + differenze contenuto
  assert.equal(distanzaEdit('banana', 'ciliegia'), 7);
  assert.equal(distanzaEdit('ciao', 'mondo'), 4);
  assert.equal(distanzaEdit('cane', 'gatto'), 4);
});

test('distanzaEdit: case sensitive (non normalizza)', () => {
  // La funzione NON normalizza, è solo distanza pura
  assert.equal(distanzaEdit('Banana', 'banana'), 1);
  assert.equal(distanzaEdit('CIAO', 'ciao'), 4);
});

test('isDistanzaUno: true per operazione singola', () => {
  assert.equal(isDistanzaUno('banana', 'banane'), true);
  assert.equal(isDistanzaUno('potare', 'portare'), true);
  assert.equal(isDistanzaUno('ciao', 'cia'), true);
});

test('isDistanzaUno: false per identiche', () => {
  assert.equal(isDistanzaUno('banana', 'banana'), false);
});

test('isDistanzaUno: false per distanza > 1', () => {
  assert.equal(isDistanzaUno('banana', 'ciliegia'), false);
  assert.equal(isDistanzaUno('ciao', 'mondo'), false);
});

test('isDistanzaUno: false per lunghezza molto diversa', () => {
  assert.equal(isDistanzaUno('a', 'abcdefghij'), false);
  assert.equal(isDistanzaUno('abcdefghij', 'a'), false);
});
