/**
 * Test unit per il fallback morfologico (Fase 2).
 *
 * Verifica che `candidatiFormeBase` derivi correttamente i lemmi candidati da
 * forme flesse regolari italiane (femminile, plurale, participio). Nessun DB.
 *
 * Esegue con: node --test backend/tests/morfologia.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatiFormeBase } from '../src/utils/morfologia.js';

test('candidatiFormeBase: femminile singolare → maschile singolare', () => {
  assert.ok(candidatiFormeBase('oziata').includes('oziato'));
});

test('candidatiFormeBase: plurale → singolare maschile', () => {
  assert.ok(candidatiFormeBase('oziati').includes('oziato'));
});

test('candidatiFormeBase: participio → infinito -are', () => {
  assert.ok(candidatiFormeBase('oziata').includes('oziare'));
  assert.ok(candidatiFormeBase('oziati').includes('oziare'));
});

test('candidatiFormeBase: gibberish senza regole → nessun candidato', () => {
  // 'asdfqwer' finisce in 'r': nessuna regola genere/numero né participio/gerundio
  assert.equal(candidatiFormeBase('asdfqwer').length, 0);
});

test('candidatiFormeBase: parola accentata non toccata (nessuna regola)', () => {
  // 'città' finisce in 'à' (non -a ASCII): nessuna regola applicabile
  assert.equal(candidatiFormeBase('città').length, 0);
});

test('candidatiFormeBase: rimuove la parola stessa (no-op)', () => {
  assert.ok(!candidatiFormeBase('oziato').includes('oziato'));
});

test('candidatiFormeBase: input non stringa → array vuoto', () => {
  assert.deepEqual(candidatiFormeBase(null), []);
  assert.deepEqual(candidatiFormeBase(undefined), []);
});
