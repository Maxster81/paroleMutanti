/**
 * Test unit per la costruzione delle righe di statistica (statsRows.js).
 *
 * Niente DB: verificano i campi e soprattutto la REGOLA DI PRIVACY
 * (la parola viene salvata solo se è arrivata al percorso AI).
 *
 * Esegue con: node --test backend/tests/statsRows.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { costruisciRigaPartita, costruisciRigaMossa } from '../src/db/statsRows.js';

const matchFinto = {
  id: '11111111-2222-3333-4444-555555555555',
  state: 'waiting',
  params: { max_players: 4, turn_seconds: 30, games_to_win: 2 },
  giocatori: ['Alice', 'Bob'],
  giocatoriOriginali: ['Alice', 'Bob'],
  giocatoriIniziali: [],
  punteggio: { Alice: 2, Bob: 1 },
  vincitore: 'Alice',
  createdAt: new Date('2026-11-11T10:00:00Z'),
  startedAt: new Date('2026-11-11T10:01:00Z'),
  endedAt: new Date('2026-11-11T10:05:00Z'),
  abbandoni: 1,
};

test('costruisciRigaPartita: mappa i campi e preferisce giocatoriIniziali', () => {
  const riga = costruisciRigaPartita({ ...matchFinto, giocatoriIniziali: ['Alice', 'Bob', 'Carlo'] }, 'finished');

  assert.equal(riga.id, matchFinto.id);
  assert.equal(riga.state, 'finished');
  assert.deepEqual(riga.params, matchFinto.params);
  assert.deepEqual(riga.players, ['Alice', 'Bob', 'Carlo']);
  assert.equal(riga.winnerName, 'Alice');
  assert.deepEqual(riga.gamesWon, { Alice: 2, Bob: 1 });
  assert.equal(riga.abandonments, 1);
  assert.equal(riga.startedAt, matchFinto.startedAt);
  assert.equal(riga.endedAt, matchFinto.endedAt);
});

test('costruisciRigaPartita: fallback su giocatoriOriginali / giocatori e default', () => {
  const senzaIniziali = costruisciRigaPartita({ ...matchFinto, giocatoriIniziali: [] }, 'cancelled');
  assert.deepEqual(senzaIniziali.players, ['Alice', 'Bob']);
  assert.equal(senzaIniziali.winnerName, 'Alice');

  const minimale = costruisciRigaPartita(
    { id: 'x', giocatori: ['Solo'], params: {} },
    'waiting',
  );
  assert.deepEqual(minimale.players, ['Solo']);
  assert.equal(minimale.winnerName, null);
  assert.equal(minimale.abandonments, 0);
  assert.equal(minimale.startedAt, null);
  assert.equal(minimale.endedAt, null);
});

test('costruisciRigaMossa: mossa normale (DB) → NESSUNA parola salvata', () => {
  const riga = costruisciRigaMossa({
    gameId: 'g1',
    manche: 1,
    turno: 2,
    giocatore: 'Alice',
    valida: true,
    motivo: null,
    source: 'DB',
    aiUsata: false,
    aiDurataMs: null,
    tentativo: 1,
    parola: 'casa',
  });

  assert.equal(riga.valida, true);
  assert.equal(riga.source, 'DB');
  assert.equal(riga.aiUsata, false);
  assert.equal(riga.parola, null, 'le mosse normali non salvano il testo');
});

test('costruisciRigaMossa: mossa MORF → NESSUNA parola salvata', () => {
  const riga = costruisciRigaMossa({
    gameId: 'g1',
    manche: 1,
    turno: 3,
    giocatore: 'Bob',
    valida: true,
    source: 'MORF',
    parola: 'oziati',
  });

  assert.equal(riga.source, 'MORF');
  assert.equal(riga.parola, null);
});

test('costruisciRigaMossa: AI rifiutata → parola conservata (candidato dizionario)', () => {
  const riga = costruisciRigaMossa({
    gameId: 'g1',
    manche: 2,
    turno: 5,
    giocatore: 'Alice',
    valida: false,
    motivo: 'ai_rifiutata',
    source: null,
    aiUsata: true,
    aiDurataMs: 420,
    tentativo: 2,
    parola: 'parolainventata',
  });

  assert.equal(riga.valida, false);
  assert.equal(riga.aiUsata, true);
  assert.equal(riga.aiDurataMs, 420);
  assert.equal(riga.parola, 'parolainventata');
});

test('costruisciRigaMossa: rate limit → parola conservata', () => {
  const riga = costruisciRigaMossa({
    gameId: 'g1',
    manche: 1,
    turno: 1,
    giocatore: 'Bob',
    valida: false,
    motivo: 'rate_limit',
    aiUsata: false,
    parola: 'candidato',
  });

  assert.equal(riga.parola, 'candidato');
});

test('costruisciRigaMossa: rifiuti "normali" (distanza/gia usata) → nessuna parola', () => {
  for (const motivo of ['distanza', 'parola_gia_usata', 'caratteri_non_validi']) {
    const riga = costruisciRigaMossa({
      gameId: 'g1',
      manche: 1,
      turno: 1,
      giocatore: 'Alice',
      valida: false,
      motivo,
      parola: 'qualcosa',
    });
    assert.equal(riga.parola, null, `motivo=${motivo}`);
  }
});

test('costruisciRigaMossa: valori mancanti/non numerici normalizzati', () => {
  const riga = costruisciRigaMossa({
    gameId: 'g1',
    giocatore: 'Alice',
    valida: false,
    aiDurataMs: NaN,
    manche: undefined,
    turno: undefined,
    tentativo: undefined,
  });

  assert.equal(riga.manche, 1);
  assert.equal(riga.turno, 0);
  assert.equal(riga.tentativo, null);
  assert.equal(riga.aiDurataMs, null);
  assert.equal(riga.source, null);
  assert.equal(riga.motivo, null);
  assert.equal(riga.parola, null);
});
