/**
 * Test unit della utility `ordineCasuale` (nessuna dipendenza da DB).
 *
 * Esegue con: node --test backend/tests/ordineGiocatori.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordineCasuale } from '../src/utils/ordineGiocatori.js';

test('ordineCasuale: stessa composizione e input non modificato', () => {
  const input = ['Alice', 'Bob', 'Carla'];
  const out = ordineCasuale(input);
  assert.deepEqual([...out].sort(), [...input].sort(), 'stessi elementi');
  assert.deepEqual(input, ['Alice', 'Bob', 'Carla'], 'l\'input non deve essere modificato');
  assert.notEqual(out, input, 'deve ritornare una nuova lista');
});

test('ordineCasuale: RNG deterministico (Fisher-Yates)', () => {
  // rng() = 0 → ad ogni passo scambia out[i] con out[0]
  assert.deepEqual(ordineCasuale(['A', 'B', 'C'], () => 0), ['B', 'C', 'A']);
});

test('ordineCasuale: liste vuote o con un solo elemento', () => {
  assert.deepEqual(ordineCasuale([]), []);
  assert.deepEqual(ordineCasuale(['Solo']), ['Solo']);
  assert.deepEqual(ordineCasuale(null), []);
});

test('ordineCasuale: il primo giocatore varia', () => {
  const primi = new Set();
  for (let i = 0; i < 60; i += 1) {
    primi.add(ordineCasuale(['A', 'B', 'C'])[0]);
  }
  assert.ok(primi.size >= 2, 'in 60 estrazioni il primo giocatore deve variare');
});
