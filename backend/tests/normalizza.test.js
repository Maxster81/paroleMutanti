/**
 * Test unit per le funzioni di normalizzazione e validazione parole.
 *
 * Esegue con: node --test backend/tests/normalizza.test.js
 *
 * Note M4b-fix: dal dizionario ibrido (LO+HF), lettere j, k, w, x, y sono
 * ammesse perché fanno parte di prestiti consolidati (wifi, weekend, jazz, kiwi, yogurt).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizzaBase, validaParola, soloLettere, RE_SOLO_LETTERE, PATTERN_SQL_SOLO_LETTERE } from '../src/utils/normalizza.js';

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
  assert.equal(validaParola('città', 3, 10).valida, true);
  assert.equal(validaParola('perché', 3, 10).valida, true);
  assert.equal(validaParola('gioì', 3, 10).valida, true);
});

test('validaParola: apostrofo RIFIUTATO (charset di gioco: solo lettere)', () => {
  const r = validaParola("c'e'", 3, 10);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'caratteri_non_validi');
  // Le voci "sporche" del dizionario non devono mai entrare in partita.
  assert.equal(validaParola("tutt'e", 3, 10).valida, false);
  assert.equal(validaParola("po'", 3, 10).valida, false);
  assert.equal(validaParola("l'amico", 3, 10).valida, false);
});

// === M4b-fix: prestiti consolidati con lettere straniere sono accettati ===
test('validaParola: M4b-fix - parole con lettere straniere comuni accettate', () => {
  // Wifi, weekend, jazz, kiwi, yogurt, etc. sono ormai nell'italiano comune
  assert.equal(validaParola('wifi', 3, 10).valida, true);
  assert.equal(validaParola('wifi', 3, 10).motivo, null);
  assert.equal(validaParola('weekend', 3, 10).valida, true);
  assert.equal(validaParola('jazz', 3, 10).valida, true);
  assert.equal(validaParola('kiwi', 3, 10).valida, true);
  assert.equal(validaParola('yogurt', 3, 10).valida, true);
  assert.equal(validaParola('kimono', 3, 10).valida, true);
  assert.equal(validaParola('jeans', 3, 10).valida, true);
  assert.equal(validaParola('web', 3, 10).valida, true);
  assert.equal(validaParola('xilofono', 3, 10).valida, true);
  // Anche combinate
  assert.equal(validaParola('selfie', 3, 10).valida, true);  // già esistente
  assert.equal(validaParola('smartphone', 3, 10).valida, true);  // già esistente
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

// === Charset di gioco: solo lettere (niente apostrofi/spazi/cifre) ===

test('soloLettere: accetta lettere (anche accentate e prestiti), rifiuta il resto', () => {
  for (const ok of ['casa', 'città', 'perché', 'weekend', 'yogurt', 'xilofono']) {
    assert.equal(soloLettere(ok), true, ok);
  }
  for (const ko of ["tutt'e", "po'", "l'amico", 'week-end', 'casa2', 'casa mia', '', 'casa!']) {
    assert.equal(soloLettere(ko), false, ko);
  }
  assert.equal(soloLettere(null), false);
});

test('PATTERN_SQL_SOLO_LETTERE: stessa regola di RE_SOLO_LETTERE (per le query DB)', () => {
  assert.equal(PATTERN_SQL_SOLO_LETTERE, RE_SOLO_LETTERE.source);
  const re = new RegExp(PATTERN_SQL_SOLO_LETTERE);
  assert.equal(re.test('casa'), true);
  assert.equal(re.test("tutt'e"), false);
});

test('charset: la regex di db/export-dicts.mjs è allineata al backend', () => {
  const sorgente = readFileSync(new URL('../../db/export-dicts.mjs', import.meta.url), 'utf8');
  const m = sorgente.match(/const RE_CHARSET = (\/.*\/);/);
  assert.ok(m, 'RE_CHARSET non trovata in db/export-dicts.mjs');
  assert.equal(m[1], String(RE_SOLO_LETTERE), 'la regex del build deve coincidere con RE_SOLO_LETTERE');
});
