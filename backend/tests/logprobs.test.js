/**
 * Test unit per il parsing dell'esperimento `logprobs`
 * (backend/scripts/experiment-logprobs.mjs).
 *
 * Non fa chiamate di rete: verifica solo la classificazione dei token e
 * l'estrazione di P(YES)/P(NO) dalla risposta della Chat Completions API.
 *
 * Esegue con: node --test backend/tests/logprobs.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classificaToken, leggiDistribuzione } from '../scripts/experiment-logprobs.mjs';

test('classificaToken: varianti di YES tollerate', () => {
  for (const token of ['YES', ' Yes', 'yes.', ' YES\n', 'SÌ', 'sì', 'SI', 'Si']) {
    assert.equal(classificaToken(token), 'yes', `token="${token}"`);
  }
});

test('classificaToken: varianti di NO tollerate', () => {
  for (const token of ['NO', ' No', 'no.', ' NO\n']) {
    assert.equal(classificaToken(token), 'no', `token="${token}"`);
  }
});

test('classificaToken: preamboli e token vuoti → altro', () => {
  for (const token of ['La', 'parola', 'MAYBE', 'Y', '', null, undefined]) {
    assert.equal(classificaToken(token), 'altro', `token="${token}"`);
  }
});

test('leggiDistribuzione: normalizza P(YES)/P(NO) sui top token', () => {
  const json = {
    choices: [
      {
        finish_reason: 'length',
        message: { content: 'YES' },
        logprobs: {
          content: [
            {
              token: 'YES',
              logprob: Math.log(0.9),
              top_logprobs: [
                { token: 'YES', logprob: Math.log(0.9) },
                { token: 'NO', logprob: Math.log(0.1) },
              ],
            },
          ],
        },
      },
    ],
  };

  const d = leggiDistribuzione(json);

  assert.equal(d.verdetto, 'yes');
  assert.equal(d.verdettoProb, 'yes');
  assert.equal(d.token, 'YES');
  assert.ok(Math.abs(d.pYes - 0.9) < 1e-9);
  assert.ok(Math.abs(d.pNo - 0.1) < 1e-9);
  assert.ok(Math.abs(d.margine - 0.8) < 1e-9);
});

test('leggiDistribuzione: somma le varianti di token e riporta la massa "altro"', () => {
  const json = {
    choices: [
      {
        logprobs: {
          content: [
            {
              token: 'Yes',
              top_logprobs: [
                { token: 'Yes', logprob: Math.log(0.5) },
                { token: ' NO', logprob: Math.log(0.3) },
                { token: ' Forse', logprob: Math.log(0.2) },
              ],
            },
          ],
        },
      },
    ],
  };

  const d = leggiDistribuzione(json);

  assert.ok(Math.abs(d.pYes - 0.5 / 0.8) < 1e-9);
  assert.ok(Math.abs(d.pNo - 0.3 / 0.8) < 1e-9);
  assert.ok(Math.abs(d.pAltro - 0.2) < 1e-9);
});

test('leggiDistribuzione: verdetto "altro" se il primo token non è YES/NO', () => {
  const json = {
    choices: [
      {
        logprobs: {
          content: [
            {
              token: 'La',
              top_logprobs: [
                { token: 'La', logprob: Math.log(0.6) },
                { token: 'YES', logprob: Math.log(0.4) },
              ],
            },
          ],
        },
      },
    ],
  };

  const d = leggiDistribuzione(json);

  assert.equal(d.verdetto, 'altro');
  assert.ok(Math.abs(d.pYes - 1) < 1e-9); // normalizzato tra YES e NO
});

test('leggiDistribuzione: verdettoProb segue la massa, non il token campionato', () => {
  // Caso reale del dataset (oziata): il modello è certo di NO, margine 1.
  const json = {
    choices: [
      {
        logprobs: {
          content: [
            {
              token: 'NO',
              top_logprobs: [
                { token: 'NO', logprob: 0 },
                { token: 'YES', logprob: -9999 },
              ],
            },
          ],
        },
      },
    ],
  };

  const d = leggiDistribuzione(json);
  assert.equal(d.verdettoProb, 'no');
  assert.equal(d.margine, 1);
});

test('leggiDistribuzione: nessuna massa YES/NO → verdettoProb "altro"', () => {
  const json = {
    choices: [
      {
        logprobs: {
          content: [
            {
              token: 'La',
              top_logprobs: [{ token: 'La', logprob: Math.log(0.9) }],
            },
          ],
        },
      },
    ],
  };

  const d = leggiDistribuzione(json);
  assert.equal(d.verdettoProb, 'altro');
  assert.equal(d.margine, null);
});

test('leggiDistribuzione: logprobs assenti → null', () => {
  assert.equal(leggiDistribuzione({ choices: [{ message: { content: 'YES' } }] }), null);
  assert.equal(leggiDistribuzione({}), null);
  assert.equal(leggiDistribuzione(null), null);
});
