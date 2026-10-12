/**
 * Test e2e via Socket.io contro un server in esecuzione.
 *
 * Verifica il flusso completo: crea → join → ready → avvio automatico →
 * abbandono in 2 giocatori → game_over con vincitore. Se il server non è
 * raggiungibile il test viene SKIPPATO (non fallisce).
 *
 * Esegue con:
 *   E2E_URL=http://localhost:8090 node --test backend/tests/e2e-socket.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const BASE = process.env.E2E_URL || 'http://localhost:8090';

/** Connette un client; ritorna null se il server non risponde. */
function connect() {
  return new Promise((resolve) => {
    const socket = io(BASE, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    const cleanup = () => { socket.close(); resolve(null); };
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', cleanup);
    setTimeout(() => { if (!socket.connected) cleanup(); }, 4000);
  });
}

/** Emette un evento con ack e risolve con la risposta (timeout 5s). */
function emitAck(socket, evento, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ack ${evento}`)), 5000);
    socket.emit(evento, payload, (resp) => {
      clearTimeout(timer);
      resolve(resp);
    });
  });
}

test('e2e: crea → join → ready → avvio → abbandono → game_over', async (t) => {
  const alice = await connect();
  const bob = await connect();
  if (!alice || !bob) {
    if (alice) alice.close();
    if (bob) bob.close();
    return t.skip(`Server non raggiungibile su ${BASE}`);
  }

  try {
    // 1. Alice crea la partita
    // maxPlayers=2: lobby completa con 2 pronti → avvio immediato (niente countdown).
    const creata = await emitAck(alice, 'create_game', { nome: 'Alice', maxPlayers: 2 });
    assert.equal(creata.ok, true, 'create_game deve avere ok=true');
    const gid = creata.partita.id;

    // 2. Bob entra
    const join = await emitAck(bob, 'join_game', { gameId: gid, nome: 'Bob' });
    assert.equal(join.ok, true, 'join_game deve avere ok=true');

    // 3. Ascolto "partita_avviata" PRIMA di rendere tutti pronti
    const avviate = [
      new Promise((r) => alice.once('partita_avviata', r)),
      new Promise((r) => bob.once('partita_avviata', r)),
    ];

    // 4. Entrambi pronti → auto-avvio
    await emitAck(alice, 'set_ready', { nome: 'Alice', ready: true });
    const respBob = await emitAck(bob, 'set_ready', { nome: 'Bob', ready: true });
    assert.equal(respBob.ok, true);
    assert.equal(respBob.tuttiProni, true, 'dopo il secondo ready tutti devono essere pronti');

    const [avvioA, avvioB] = await Promise.all(avviate);
    assert.equal(avvioA.gameId, gid);
    assert.equal(avvioB.gameId, gid);
    assert.ok(['Alice', 'Bob'].includes(avvioA.giocatoreCorrente), 'il primo turno tocca a uno dei giocatori (ordine casuale)');

    // 5. Alice abbandona durante la partita → in 2 giocatori Bob vince subito
    const fineA = new Promise((r) => alice.once('game_over', r));
    const fineB = new Promise((r) => bob.once('game_over', r));
    await emitAck(alice, 'leave_game', { nome: 'Alice' });

    const [ga, gb] = await Promise.all([fineA, fineB]);
    assert.equal(ga.vincitore, 'Bob');
    assert.equal(gb.vincitore, 'Bob');
  } finally {
    alice.close();
    bob.close();
  }
});

/**
 * Attende un singolo evento dal socket, con timeout: senza di esso un evento
 * che non arriva bloccherebbe il test (e la CI) all'infinito.
 */
function once(socket, evento, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout in attesa di "${evento}"`)), timeoutMs);
    socket.once(evento, (data) => { clearTimeout(t); resolve(data); });
  });
}

/** Risolve con `fallback` se la promise non si risolve entro timeoutMs. */
function conTimeout(promise, timeoutMs, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

/** Crea una partita a 2 giocatori già avviata; ritorna { alice, bob, gid }. */
async function partitaAvviata() {
  const alice = await connect();
  const bob = await connect();
  if (!alice || !bob) return null;
  // maxPlayers=2: lobby completa con 2 pronti → avvio immediato (niente countdown).
  const creata = await emitAck(alice, 'create_game', { nome: 'Alice', maxPlayers: 2 });
  const gid = creata.partita.id;
  await emitAck(bob, 'join_game', { gameId: gid, nome: 'Bob' });
  const avviate = [once(alice, 'partita_avviata'), once(bob, 'partita_avviata')];
  await emitAck(alice, 'set_ready', { nome: 'Alice', ready: true });
  await emitAck(bob, 'set_ready', { nome: 'Bob', ready: true });
  await Promise.all(avviate);
  return { alice, bob, gid };
}

// Fix B: leave_game deve funzionare anche se la mappa socketId→gameId del server
// non ha quel socket (es. dopo riconnessione), usando il gameId nel payload.
test('e2e: leave_game con gameId esplicito (fallback) chiude la partita', async (t) => {
  const estraneo = await connect();
  const setup = await partitaAvviata();
  if (!setup || !estraneo) {
    if (setup) { setup.alice.close(); setup.bob.close(); }
    if (estraneo) estraneo.close();
    return t.skip('Server non raggiungibile');
  }
  const { alice, bob, gid } = setup;
  try {
    const fineAlice = once(alice, 'game_over');
    // `estraneo` non è mai entrato nella partita → il server NON lo conosce in
    // socketToGame. Senza il fallback su payload.gameId risponderebbe ok:false.
    const resp = await emitAck(estraneo, 'leave_game', { gameId: gid, nome: 'Bob' });
    assert.equal(resp.ok, true, 'leave_game deve avere ok=true');
    assert.equal(resp.abbandono?.ok, true, 'Bob deve risultare abbandonato');
    const fine = await conTimeout(fineAlice, 5000);
    assert.ok(fine, 'atteso game_over su Alice');
    assert.equal(fine.vincitore, 'Alice');
  } finally {
    alice.close(); bob.close(); estraneo.close();
  }
});

// Fix C: un giocatore che si disconnette durante la partita viene rimosso
// (e l'avversario avvisato) dopo il grace, se non rientra.
test('e2e: giocatore disconnesso → abbandono dopo il grace', async (t) => {
  const grace = parseInt(process.env.DISCONNECT_GRACE_SECONDS || '60', 10);
  if (!Number.isFinite(grace) || grace <= 0 || grace > 15) {
    return t.skip(`grace=${grace}s: per eseguire questo test avvia il server con DISCONNECT_GRACE_SECONDS<=15`);
  }
  const setup = await partitaAvviata();
  if (!setup) return t.skip('Server non raggiungibile');
  const { alice, bob } = setup;
  try {
    const fineAlice = once(alice, 'game_over');
    bob.close(); // simula standby/chiusura: nessun leave_game
    const fine = await conTimeout(fineAlice, grace * 1000 + 5000);
    assert.ok(fine, 'atteso game_over dopo il grace');
    assert.equal(fine.vincitore, 'Alice');
  } finally {
    alice.close();
    try { bob.close(); } catch { /* già chiuso */ }
  }
});
