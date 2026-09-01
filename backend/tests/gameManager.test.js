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
  for (const id of [...gameManager.matches.keys()]) {
    const p = gameManager.matches.get(id);
    if (p?.turnManager) p.turnManager.stop();
    gameManager.matches.delete(id);
    gameManager.socketsPerMatch.delete(id);
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
async function creaMatchAvviata(gamesToWin = 2) {
  const c = await gameManager.creaMatch({ creator: 'Alice', gamesToWin });
  assert.equal(c.ok, true);
  const gid = c.match.id;
  assert.equal(gameManager.uniscitiAMatch(gid, 'Bob').ok, true);
  assert.equal(gameManager.setReady(gid, 'Alice', true).ok, true);
  assert.equal(gameManager.setReady(gid, 'Bob', true).ok, true);
  const avvio = await gameManager.avviaMatch(gid);
  assert.equal(avvio.ok, true);
  return { gid, partita: avvio.match };
}

test.beforeEach(resetGameManager);
test.afterEach(resetGameManager);

// ============================================================
// Creazione e validazioni (nessun DB necessario)
// ============================================================

test('creaMatch: creator vuoto → rifiutata', async () => {
  const r = await gameManager.creaMatch({ creator: '   ' });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'creator_non_valido');
});

test('creaMatch: maxPlayers fuori range → rifiutata', async () => {
  const r = await gameManager.creaMatch({ creator: 'Alice', maxPlayers: 9 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'max_players_non_valido');
});

test('creaMatch: turnSeconds fuori range → rifiutata', async () => {
  const r = await gameManager.creaMatch({ creator: 'Alice', turnSeconds: 61 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'turn_seconds_non_valido');
});

test('creaMatch: gamesToWin fuori range → rifiutata (F4)', async () => {
  const r = await gameManager.creaMatch({ creator: 'Alice', gamesToWin: 9 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'games_to_win_non_valido');
});

test('creaMatch: initialLength non valido (min>max) → rifiutata (F4)', async () => {
  const r = await gameManager.creaMatch({ creator: 'Alice', initialLengthMin: 8, initialLengthMax: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'initial_length_non_valido');
});

test('creaMatch: validazione ok → partita in stato waiting', async () => {
  const r = await gameManager.creaMatch({ creator: 'Alice' });
  assert.equal(r.ok, true);
  assert.equal(r.match.state, 'waiting');
  assert.equal(r.match.giocatori.length, 1);
  assert.equal(r.match.params.games_to_win, 2);
});

test('setReady: ready non booleano → rifiutato (F4)', async () => {
  const c = await gameManager.creaMatch({ creator: 'Alice' });
  assert.equal(c.ok, true);
  const r = gameManager.setReady(c.match.id, 'Alice', 'si');
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'ready_non_valido');
});

// ============================================================
// Ciclo di vita (richiede DB per la parola iniziale)
// ============================================================

test('avvio partita: join + tutti pronti → running (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { partita } = await creaMatchAvviata();
  assert.equal(partita.state, 'running');
  assert.ok(partita.currentWord.length >= 3 && partita.currentWord.length <= 10);
  assert.equal(partita.turnManager.giocatoreCorrente(), 'Alice');
});

test('submitParola: giocatore non di turno → rifiutato senza toccare DB', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid } = await creaMatchAvviata();
  const r = await gameManager.submitParola(gid, 'Bob', 'qualunque');
  assert.equal(r.valida, false);
  assert.equal(r.motivo, 'non_sei_di_turno');
});

test('abbandono in 2 giocatori, gamesToWin=1 → l\'altro vince subito (fine partita) (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid, partita } = await creaMatchAvviata(1);
  assert.equal(partita.state, 'running');
  const r = gameManager.abbandonaGiocatore(gid, 'Alice');
  assert.equal(r.ok, true);
  const dopo = await aspettaFinche(() => {
    const p = gameManager.getMatch(gid);
    return p && p.state === 'finished' ? p : null;
  });
  assert.ok(dopo, 'deve terminare la partita (gamesToWin=1)');
  assert.equal(dopo.vincitore, 'Bob');
});

test('abbandono in 2 giocatori (gamesToWin=2) → resta 1 solo non-abbandonato, partita termina (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid } = await creaMatchAvviata(2);
  assert.equal(gameManager.abbandonaGiocatore(gid, 'Alice').ok, true);
  const dopo = await aspettaFinche(() => {
    const p = gameManager.getMatch(gid);
    return p && p.state === 'finished' ? p : null;
  });
  assert.ok(dopo, 'senza avversari la partita deve terminare (non una nuova manche)');
  assert.equal(dopo.vincitore, 'Bob');
});

test('vittoria manche per gioco, gamesToWin=2 → nuova manche (best-of-N) (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid } = await creaMatchAvviata(2);
  // Simula la fine di una manche: vincitore Alice per GIoco (nessun abbandono,
  // quindi giocatoriOriginali = 2 → parte una nuova manche).
  await gameManager._fineManche(gid, 'Alice');
  const dopo = await aspettaFinche(() => {
    const p = gameManager.getMatch(gid);
    return p && p.mancheCorrente === 2 ? p : null;
  });
  assert.ok(dopo, 'deve partire una nuova manche');
  assert.equal(dopo.state, 'running');
  assert.equal(dopo.punteggio.Alice, 1);
  assert.equal(dopo.giocatori.length, 2, 'tutti tornano in gioco per la nuova manche');
});

test('doppio passaggio di turno → pareggio, tutti restano in gioco (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid, partita } = await creaMatchAvviata();
  const tm = partita.turnManager;
  const lastActivityPrima = partita.lastActivityAt;
  // Round 1: Alice passa (limbo)
  assert.equal(tm.giocatoreCorrente(), 'Alice');
  assert.equal(gameManager.passaTurno(gid, 'Alice').ok, true);
  // Round 2: Bob passa (limbo) → fine turno → pareggio
  assert.equal(tm.giocatoreCorrente(), 'Bob');
  assert.equal(gameManager.passaTurno(gid, 'Bob').ok, true);
  // _gestisciFineTurno è async (attende la nuova parola dal DB): attendi
  // che il turno sia avanzato a 2 prima di asserire.
  const dopo = await aspettaFinche(() => {
    const p = gameManager.getMatch(gid);
    return p && p.turnManager && p.turnManager.turno === 2 ? p : null;
  });
  assert.ok(dopo, 'il pareggio deve aver avviato il turno 2');
  assert.equal(dopo.state, 'running');
  assert.equal(dopo.giocatori.length, 2);
  assert.equal(dopo.turnManager.turno, 2);
  assert.equal(dopo.turnManager.attivo, true);
  // Il pareggio automatico (0 azioni reali) NON deve aggiornare lastActivityAt,
  // altrimenti lo sweeper non ripulisce mai una partita orfana bloccata.
  assert.equal(dopo.lastActivityAt, lastActivityPrima, 'il pareggio non deve aggiornare lastActivityAt');
});

test('3 tentativi falliti nella stessa mano → limbo, si passa al successivo (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { partita } = await creaMatchAvviata(2);
  const tm = partita.turnManager;
  assert.equal(tm.giocatoreCorrente(), 'Alice');
  // 3 mosse non valide (distanza != 1 dalla parola corrente).
  for (let i = 0; i < 3; i++) {
    const r = await gameManager.submitParola(partita.id, 'Alice', 'zzzzzzz');
    assert.equal(r.valida, false);
    assert.equal(r.limbo, i === 2, 'solo la 3ª mossa deve chiudere la mano in limbo');
  }
  assert.equal(tm.giocatoreCorrente(), 'Bob', 'dopo il 3° errore tocca a Bob');
});

test('abbandono a 3 giocatori (non di turno) → non salta il turnista, si prosegue (DB)', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const c = await gameManager.creaMatch({ creator: 'Alice' });
  const gid = c.match.id;
  assert.equal(gameManager.uniscitiAMatch(gid, 'Bob').ok, true);
  assert.equal(gameManager.uniscitiAMatch(gid, 'Charlie').ok, true);
  assert.equal(gameManager.setReady(gid, 'Alice', true).ok, true);
  assert.equal(gameManager.setReady(gid, 'Bob', true).ok, true);
  assert.equal(gameManager.setReady(gid, 'Charlie', true).ok, true);
  const avvio = await gameManager.avviaMatch(gid);
  const partita = avvio.match;
  assert.equal(partita.turnManager.giocatoreCorrente(), 'Alice');
  // Charlie (terzo, NON di turno) abbandona.
  assert.equal(gameManager.abbandonaGiocatore(gid, 'Charlie').ok, true);
  assert.equal(partita.state, 'running', 'con 2+ giocatori la partita prosegue');
  assert.equal(partita.giocatori.length, 2);
  assert.equal(partita.turnManager.giocatoreCorrente(), 'Alice', 'il turnista non deve cambiare');
});

test('sweeper: running con 0 socket e attività stantia → cancellata', async (t) => {
  if (!dbDisponibile) return t.skip('DB non disponibile');
  const { gid } = await creaMatchAvviata();
  const p = gameManager.getMatch(gid);
  // Simula partita orfana a 0 socket (nessun socket registrato → contaSocket=0)
  // con ultima attività reale >2min fa (TIMEOUT_RUNNING_SOLO_MS = 2 min).
  p.lastActivityAt = new Date(Date.now() - 3 * 60 * 1000);
  gameManager._sweepAbbandonate();
  const dopo = gameManager.getMatch(gid);
  assert.ok(dopo, 'la partita deve esistere ancora (cancellata, non ancora rimossa)');
  assert.equal(dopo.state, 'cancelled');
});

