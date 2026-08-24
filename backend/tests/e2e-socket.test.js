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
    const creata = await emitAck(alice, 'create_game', { nome: 'Alice' });
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
    assert.equal(avvioA.giocatoreCorrente, 'Alice', 'il primo turno tocca al creator');

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
