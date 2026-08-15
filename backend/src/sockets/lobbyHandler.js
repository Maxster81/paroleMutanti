/**
 * lobbyHandler.js — Handler eventi Socket.io per la lobby
 *
 * Eventi gestiti (wire → handler):
 * - 'create_game' → handleCreateGame
 * - 'join_game' → handleJoinGame
 * - 'leave_game' → handleLeaveGame
 * - 'set_ready' → handleSetReady
 * - 'list_games' → handleListGames
 *
 * Pattern: ogni handler riceve (socket, payload, ack) e usa ack({ok, ...}) per rispondere.
 *
 * @module backend/src/sockets/lobbyHandler
 */

import { gameManager } from '../game/GameManager.js';
import { logger } from '../logger.js';
import { creaRateLimiter } from '../utils/rateLimiter.js';

/**
 * Rate limiter per eventi lobby (max 10/sec per socket, anti-spam join/leave).
 */
const rateLimiterLobby = creaRateLimiter({ max: 10, windowMs: 1000 });

/**
 * Helper: associa mappa socketId → gameId per tracking veloce.
 */
const socketToGame = new Map();

/**
 * Broadcast helper: invia evento a tutti i socket presenti in una partita.
 * I socket sono associati alla partita tramite socketToGame.
 *
 * @param {import('socket.io').Server} io
 * @param {string} gameId
 * @param {string} evento
 * @param {object} payload
 */
export function broadcastAPartita(io, gameId, evento, payload) {
  for (const [socketId, gid] of socketToGame.entries()) {
    if (gid === gameId) {
      io.to(socketId).emit(evento, payload);
    }
  }
}

/**
 * Attacca gli handler lobby a un socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function attachLobbyHandlers(io, socket) {
  // ============================================================
  // create_game
  // ============================================================
  socket.on('create_game', async (payload, ack) => {
    if (!rateLimiterLobby.check(socket.id)) {
      return ack?.({ ok: false, errore: 'rate_limit', messaggio: 'Troppe richieste, riprova tra poco.' });
    }

    const { nome, maxPlayers, turnSeconds, gamesToWin, initialLengthMin, initialLengthMax } = payload || {};

    const risultato = await gameManager.creaPartita({
      creator: nome,
      maxPlayers,
      turnSeconds,
      gamesToWin,
      initialLengthMin,
      initialLengthMax,
    });

    if (!risultato.ok) {
      logger.warn('create_game_rifiutato', { socketId: socket.id, errore: risultato.errore });
      return ack?.({ ok: false, errore: risultato.errore });
    }

    socketToGame.set(socket.id, risultato.partita.id);
    socket.join(`lobby:${risultato.partita.id}`);

    logger.info('socket_in_partita', { socketId: socket.id, gameId: risultato.partita.id, nome });
    ack?.({ ok: true, partita: serializzaPartita(risultato.partita) });
  });

  // ============================================================
  // join_game
  // ============================================================
  socket.on('join_game', (payload, ack) => {
    if (!rateLimiterLobby.check(socket.id)) {
      return ack?.({ ok: false, errore: 'rate_limit' });
    }

    const { gameId, nome } = payload || {};
    if (!gameId || !nome) {
      return ack?.({ ok: false, errore: 'parametri_mancanti' });
    }

    const risultato = gameManager.uniscitiAPartita(gameId, nome);
    if (!risultato.ok) {
      return ack?.({ ok: false, errore: risultato.errore });
    }

    socketToGame.set(socket.id, gameId);
    socket.join(`lobby:${gameId}`);

    // Notifica tutti nella lobby
    broadcastAPartita(io, gameId, 'lobby_updated', {
      gameId,
      giocatori: risultato.partita.giocatori,
      ready: risultato.partita.ready,
      state: risultato.partita.state,
    });

    logger.info('socket_join', { socketId: socket.id, gameId, nome });
    ack?.({ ok: true, partita: serializzaPartita(risultato.partita) });
  });

  // ============================================================
  // leave_game
  // ============================================================
  socket.on('leave_game', (payload, ack) => {
    const gameId = socketToGame.get(socket.id);
    if (!gameId) return ack?.({ ok: false, errore: 'non_in_partita' });

    const partita = gameManager.getPartita(gameId);
    if (!partita) {
      socketToGame.delete(socket.id);
      return ack?.({ ok: false, errore: 'partita_non_trovata' });
    }

    // Se in waiting: rimuovi il giocatore
    if (partita.state === 'waiting') {
      const idx = partita.giocatori.findIndex((g) => g === payload?.nome);
      if (idx !== -1) {
        partita.giocatori.splice(idx, 1);
        partita.ready.splice(idx, 1);
        if (partita.giocatori.length === 0) {
          gameManager.rimuoviPartita(gameId);
        } else {
          broadcastAPartita(io, gameId, 'lobby_updated', {
            gameId,
            giocatori: partita.giocatori,
            ready: partita.ready,
            state: partita.state,
          });
        }
      }
    }

    socketToGame.delete(socket.id);
    socket.leave(`lobby:${gameId}`);
    logger.info('socket_leave', { socketId: socket.id, gameId });
    ack?.({ ok: true });
  });

  // ============================================================
  // set_ready
  // ============================================================
  socket.on('set_ready', async (payload, ack) => {
    const gameId = socketToGame.get(socket.id);
    if (!gameId) return ack?.({ ok: false, errore: 'non_in_partita' });

    const { nome, ready } = payload || {};
    const risultato = gameManager.setReady(gameId, nome, ready);
    if (!risultato.ok) {
      return ack?.({ ok: false, errore: risultato.errore });
    }

    broadcastAPartita(io, gameId, 'lobby_updated', {
      gameId,
      giocatori: risultato.partita.giocatori,
      ready: risultato.partita.ready,
      state: risultato.partita.state,
    });

    ack?.({ ok: true, tuttiProni: risultato.tuttiProni });

    // Auto-avvio se tutti pronti
    if (risultato.tuttiProni) {
      const avvio = await gameManager.avviaPartita(gameId);
      if (avvio.ok) {
        // Switch socket dalla lobby alla game room
        const partita = avvio.partita;
        const io_ = io;
        for (const [sid, gid] of socketToGame.entries()) {
          if (gid === gameId) {
            const s = io_.sockets.sockets.get(sid);
            if (s) {
              s.leave(`lobby:${gameId}`);
              s.join(`game:${gameId}`);
              s.emit('partita_avviata', {
                gameId,
                parolaIniziale: partita.currentWord,
                giocatoreCorrente: partita.turnManager.giocatoreCorrente(),
                timeLeft: partita.turnManager.timeLeft,
                timeLimit: partita.params.turn_seconds,
                giocatori: partita.giocatori,
              });
            }
          }
        }
        logger.info('partita_avviata_broadcast', { gameId });
      } else {
        logger.error('avvio_automatico_fallito', { gameId, errore: avvio.errore });
        broadcastAPartita(io, gameId, 'errore', { messaggio: `Impossibile avviare: ${avvio.errore}` });
      }
    }
  });

  // ============================================================
  // list_games
  // ============================================================
  socket.on('list_games', (payload, ack) => {
    const partite = gameManager.listaPartiteAperte().map(serializzaPartita);
    ack?.({ ok: true, partite });
  });

  // ============================================================
  // Disconnect: cleanup
  // ============================================================
  socket.on('disconnect', () => {
    const gameId = socketToGame.get(socket.id);
    if (gameId) {
      const partita = gameManager.getPartita(gameId);
      if (partita && partita.state === 'waiting') {
        // Rimuovi socket dalla mappa ma lascia partita
        broadcastAPartita(io, gameId, 'lobby_updated', {
          gameId,
          giocatori: partita.giocatori,
          ready: partita.ready,
          state: partita.state,
        });
      }
      socketToGame.delete(socket.id);
    }
    logger.info('socket_disconnect', { socketId: socket.id, gameId });
  });
}

/**
 * Serializza una partita per il client (rimuove oggetti interni).
 *
 * @param {object} partita
 * @returns {object}
 */
function serializzaPartita(partita) {
  return {
    id: partita.id,
    creator: partita.creator,
    giocatori: partita.giocatori,
    ready: partita.ready,
    state: partita.state,
    params: partita.params,
    currentWord: partita.currentWord,
    vincitore: partita.vincitore,
    createdAt: partita.createdAt,
    startedAt: partita.startedAt,
    endedAt: partita.endedAt,
  };
}
