/**
 * Test unit per la regola anti-ripetizione in validaMossa.
 *
 * Verifica che una parola già usata nella stessa partita venga rifiutata con
 * motivo 'parola_gia_usata', PRIMA del check di distanza (e quindi senza
 * toccare DB/AI). Evita i loop infiniti del tipo ARIDO → ARIDI → ARIDO.
 *
 * Esegue con: node --test backend/tests/validator.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validaMossa } from '../src/game/Validator.js';

test('validaMossa: parola già usata (distanza 1) → parola_gia_usata', async () => {
  const r = await validaMossa({
    parolaPrecedente: 'aridi',
    parolaNuova: 'arido',
    paroleUsate: new Set(['arido', 'aridi']),
    lunghezzaMin: 3,
    lunghezzaMax: 10,
  });
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'parola_gia_usata');
  assert.equal(r.normalizzata, 'arido');
  assert.match(r.messaggio, /già stata usata/);
});

test('validaMossa: parola già usata ha priorità sul check di distanza', async () => {
  // 'casa' è già usata ma NON è a distanza 1 da 'aridi': conta comunque
  // "già usata" perché il check avviene PRIMA di quello di distanza.
  const r = await validaMossa({
    parolaPrecedente: 'aridi',
    parolaNuova: 'casa',
    paroleUsate: new Set(['casa']),
    lunghezzaMin: 3,
    lunghezzaMax: 10,
  });
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'parola_gia_usata');
});

test('validaMossa: senza paroleUsate il check non scatta (non blocca)', async () => {
  // Senza il set, la parola non è marcata come usata: si prosegue oltre
  // (qui fallisce il check di distanza PRIMA di toccare il DB).
  const r = await validaMossa({
    parolaPrecedente: 'aridi',
    parolaNuova: 'casa',
    paroleUsate: undefined,
    lunghezzaMin: 3,
    lunghezzaMax: 10,
  });
  assert.notEqual(r.motivo, 'parola_gia_usata');
});
