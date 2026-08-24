/**
 * Test unit per il formatter del messaggio di feedback Telegram.
 * Funzione pura `buildFeedbackMessage` (nessuna rete, nessuna dipendenza).
 *
 * Esegue con: node --test backend/tests/telegram.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackMessage } from '../src/telegram/telegramClient.js';

test('buildFeedbackMessage: contiene tutti i campi', () => {
  const msg = buildFeedbackMessage({
    tipo: 'problema',
    sottocategoria: 'Bug / crash',
    testo: 'Il timer si ferma',
    nome: 'Alice',
  });
  assert.match(msg, /Nuovo feedback/);
  assert.match(msg, /Tipo: problema/);
  assert.match(msg, /Sottocategoria: Bug \/ crash/);
  assert.match(msg, /Da: Alice/);
  assert.match(msg, /Il timer si ferma/);
});

test('buildFeedbackMessage: campi mancanti → default', () => {
  const msg = buildFeedbackMessage({ testo: 'ciao' });
  assert.match(msg, /Tipo: altro/);
  assert.match(msg, /Sottocategoria: —/);
  assert.match(msg, /Da: anonimo/);
});

test('buildFeedbackMessage: testo vuoto → segnaposto', () => {
  const msg = buildFeedbackMessage({ testo: '' });
  assert.match(msg, /\(nessun testo\)/);
});
