/**
 * Test unit: stacco dei socket di un giocatore espulso dalla lobby.
 *
 * Bug coperto: il giocatore espulso (non pronto allo scadere del timer lobby)
 * restava nella room e riceveva `partita_avviata`, rientrando in partita da
 * spettatore. Ora i suoi socket vengono staccati.
 *
 * Nessuna dipendenza dal DB.
 *
 * Esegue con: node --test backend/tests/lobbyEspulsione.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { gameManager } from '../src/game/GameManager.js';
import { registraSocketInPartita, espelliSocketDelGiocatore } from '../src/sockets/lobbyHandler.js';

/** Socket finto, sufficiente per tracking e gestione room. */
function fakeSocket(id, nome) {
  const rooms = new Set();
  return {
    id,
    data: { nome },
    connected: true,
    rooms,
    join: (r) => rooms.add(r),
    leave: (r) => rooms.delete(r),
    emit: () => {},
  };
}

/** io finto con la sola superficie usata dai socket. */
function fakeIo(sockets) {
  return {
    sockets: {
      sockets: new Map(sockets.map((s) => [s.id, s])),
      adapter: { rooms: new Map() },
    },
  };
}

function resetGameManager() {
  for (const id of [...gameManager.matches.keys()]) {
    const p = gameManager.matches.get(id);
    if (p?.turnManager) p.turnManager.stop();
    if (p?.lobbyTimer?.interval) clearInterval(p.lobbyTimer.interval);
    gameManager.matches.delete(id);
    gameManager.socketsPerMatch.delete(id);
  }
}

test('espelliSocketDelGiocatore: stacca solo il giocatore indicato', async () => {
  resetGameManager();
  const c = await gameManager.creaMatch({ creator: 'Alice', maxPlayers: 3 });
  const gid = c.match.id;
  const match = gameManager.getMatch(gid);

  const bob = fakeSocket('s-bob', 'Bob');
  const carla = fakeSocket('s-carla', 'Carla');
  const io = fakeIo([bob, carla]);

  registraSocketInPartita(bob, gid, match, 'Bob');
  registraSocketInPartita(carla, gid, match, 'Carla');

  assert.ok(bob.rooms.has(`lobby:${gid}`), 'Bob deve essere nella room lobby');
  assert.equal(gameManager.contaSocket(gid), 2);

  espelliSocketDelGiocatore(io, gid, 'Bob');

  assert.equal(bob.rooms.has(`lobby:${gid}`), false, 'Bob fuori dalla room lobby');
  assert.equal(bob.rooms.has(`game:${gid}`), false, 'Bob fuori dalla room di gioco');
  assert.equal(carla.rooms.has(`lobby:${gid}`), true, 'Carla deve restare in partita');
  assert.equal(gameManager.contaSocket(gid), 1, 'resta tracciato solo il socket di Carla');

  resetGameManager();
});
