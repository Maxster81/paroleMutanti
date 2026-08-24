/**
 * Test di integrazione GameManager.
 *
 * Verifica il ciclo di vita di una partita: creazione (con validazioni),
 * join, ready, avvio, gestione turni, pareggio, eliminazione e fine partita.
 * Usa il DB reale (parola iniziale dal dizionario); se il DB non è
 * raggiungibile i test che lo richiedono vengono SKIPPATI (non falliscono).
 *
 * Esegue con: node --test backend/tests/gameManager.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { pool } from '../src/db/pool.js';
import { gameManager } from '../src/game/GameManager.js';

let dbDisponibile = false;

before(async () => {
  try {
    await pool.query('SELECT 1');
    dbDisponibile = true;
  } catch (err) {
    dbDisponibile = false;
    console.warn('[gameManager.test] DB non disponibile, skip test che lo richiedono:', err.message);
  }
});

after(async () => {
  try { await pool.end(); } catch { /* noop */ }
});

/** Svuota lo stato del singleton GameManager tra un test e l'altro. */
function resetGameManager() {
  for (const id of [...gameManager.partite.keys()]) {
    const p = gameManager.partite.get(id);
    if (p?.turnManager) p.turnManager.stop();
    gameManager.partite.delete(id);
    gameManager.socketsPerPartita.delete(id);
  }
}

/** Polling helper per attese async (es. _gestisciFineTurno che attende il DB). */
function aspettaFinche(fn, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const inizio = Date.now();
    const iv = setInterval(() => {
      const v = fn();
      if (v || Date.now() - inizio > timeoutMs) {
        clearInterval(iv);
        resolve(v);
      }
    }, 20);
  });
}

/** Crea una partita a 2 giocatori (Alice creator, Bob join) tutti pronti e avviata. */
async function creaPartitaAvviata() {
  const c = await gameManager.creaPartita({ creator: 'Alice' });
  assert.equal(c.ok, true);
  const gid = c.partita.id;
  assert.equal(gameManager.uniscitiAPartita(gid, 'Bob').ok, true);
  assert.equal(gameManager.setReady(gid, 'Alice', true).ok, true);
  assert.equal(gameManager.setReady(gid, 'Bob', true).ok, true);
  const avvio = await gameManager.avviaPartita(gid);
  assert.equal(avvio.ok, true);
  return { gid, partita: avvio.partita };
}

test.beforeEach(resetGameManager);
test.afterEach(resetGameManager);

// ============================================================
// Creazione e validazioni (nessun DB necessario)
// ============================================================

test('creaPartita: creator vuoto → rifiutata', async () => {
  const r = await gameManager.creaPartita({ creator: '   ' });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'creator_non_valido');
});

test('creaPartita: maxPlayers fuori range → rifiutata', async () => {
  const r = await gameManager.creaPartita({ creator: 'Alice', maxPlayers: 9 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'max_players_non_valido');
});

test('creaPartita: turnSeconds fuori range → rifiutata', async () => {
  const r = await gameManager.creaPartita({ creator: 'Alice', turnSeconds: 61 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'turn_seconds_non_valido');
});

test('creaPartita: gamesToWin fuori range → rifiutata (F4)', async () => {
  const r = await gameManager.creaPartita({ creator: 'Alice', gamesToWin: 9 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'games_to_win_non_valido');
});

test('creaPartita: initialLength non valido (min>max) → rifiutata (F4)', async () => {
  const r = await gameManager.creaPartita({ creator: 'Alice', initialLengthMin: 8, initialLengthMax: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'initial_length_non_valido');
});

test('creaPartita: validazione ok → partita in stato waiting', async () => {
  const r = await gameManager.creaPartita({ creator: 'Alice' });
  assert.equal(r.ok, true);
  assert.equal(r.partita.state, 'waiting');
  assert.equal(r.partita.giocatori.length, 1);
  assert.equal(r.partita.params.games_to_win, 2);
});

test('setReady: ready non booleano → rifiutato (F4)', async () => {
  const c = await gameManager.creaPartita({ creator: 'Alice' });
  assert.equal(c.ok, true);
  const r = gameManager.setReady(c.partita.id, 'Alice', 'si');
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'ready_non_valido');
});

// ============================================================
// Ciclo di vita (richiede DB per la parola iniziale)
// ============================================================

test('avvio partita: join + tutti pronti → running (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { partita } = await creaPartitaAvviata();
  assert.equal(partita.state, 'running');
  assert.ok(partita.currentWord.length >= 3 && partita.currentWord.length <= 10);
  assert.equal(partita.turnManager.giocatoreCorrente(), 'Alice');
});

test('submitParola: giocatore non di turno → rifiutato senza toccare DB', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid } = await creaPartitaAvviata();
  const r = await gameManager.submitParola(gid, 'Bob', 'qualunque');
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'non_sei_di_turno');
});

test('abbandono in 2 giocatori → l\'altro vince (fine partita) (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid, partita } = await creaPartitaAvviata();
  assert.equal(partita.state, 'running');
  const r = gameManager.abbandonaGiocatore(gid, 'Alice');
  assert.equal(r.ok, true);
  const dopo = gameManager.getPartita(gid);
  assert.equal(dopo.state, 'finished');
  assert.equal(dopo.vincitore, 'Bob');
});

test('doppio passaggio di turno → pareggio, tutti restano in gioco (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid, partita } = await creaPartitaAvviata();
  const tm = partita.turnManager;
  // Round 1: Alice passa (limbo)
  assert.equal(tm.giocatoreCorrente(), 'Alice');
  assert.equal(gameManager.passaTurno(gid, 'Alice').ok, true);
  // Round 2: Bob passa (limbo) → fine turno → pareggio
  assert.equal(tm.giocatoreCorrente(), 'Bob');
  assert.equal(gameManager.passaTurno(gid, 'Bob').ok, true);
  // _gestisciFineTurno è async (attende la nuova parola dal DB): attendi
  // che il turno sia avanzato a 2 prima di asserire.
  const dopo = await aspettaFinche(() => {
    const p = gameManager.getPartita(gid);
    return p && p.turnManager && p.turnManager.turno === 2 ? p : null;
  });
  assert.ok(dopo, 'il pareggio deve aver avviato il turno 2');
  assert.equal(dopo.state, 'running');
  assert.equal(dopo.giocatori.length, 2);
  assert.equal(dopo.turnManager.turno, 2);
  assert.equal(dopo.turnManager.attivo, true);
});

