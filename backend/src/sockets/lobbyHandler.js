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
 * M5-bugfix2: socket tracking con registraSocket/rimuoviSocket per
 * permettere al sweeper di identificare partite "running con 0 socket".
 *
 * @module backend/src/sockets/lobbyHandler
 */

import { gameManager } from '../game/GameManager.js';
import { logger } from '../logger.js';
import { creaRateLimiter } from '../utils/rateLimiter.js';
import { config } from '../config.js';

/**
 * Rate limiter per eventi lobby (max 10/sec per socket, anti-spam join/leave).
 */
const rateLimiterLobby = creaRateLimiter({ max: 10, windowMs: 1000 });

/**
 * Helper: associa mappa socketId → gameId per tracking veloce.
 */
const socketToGame = new Map();

/**
 * Anti-fantasma: timer di grazia per i giocatori disconnessi durante una partita.
 * Chiave `${gameId}:${nome}` → handle di setTimeout. Se il giocatore rientra entro
 * il grace, il timer viene annullato; se non rientra, viene trattato come abbandono.
 */
const graceTimers = new Map();

/** Annulla il grace timer di un giocatore (se presente). */
function annullaGraceTimer(gameId, nome) {
  const key = `${gameId}:${nome}`;
  const t = graceTimers.get(key);
  if (t) {
    clearTimeout(t);
    graceTimers.delete(key);
  }
}

/**
 * Verifica se esiste ancora un socket CONNESSO, diverso da `socketEscluso`, che
 * appartiene allo stesso giocatore (stesso `socket.data.nome`) nella partita.
 * Serve a capire se un giocatore è "davvero" uscito o ha più connessioni aperte.
 *
 * @param {import('socket.io').Server} io
 * @param {string} gameId
 * @param {string} nome
 * @param {string|null} socketEscluso - socketId da ignorare (es. quello appena caduto)
 * @returns {boolean}
 */
function haAltriSocketConnessi(io, gameId, nome, socketEscluso = null) {
  const room = io.sockets.adapter.rooms.get(`game:${gameId}`);
  if (!room) return false;
  for (const sid of room) {
    if (sid === socketEscluso) continue;
    const s = io.sockets.sockets.get(sid);
    if (s && s.connected && s.data?.nome === nome) return true;
  }
  return false;
}

/**
 * Avvia il grace timer per un giocatore appena disconnesso durante una partita
 * `running`. Se entro `DISCONNECT_GRACE_SECONDS` non rientra nessun suo socket,
 * il giocatore viene trattato come abbandono (l'avversario riceve l'evento).
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket - socket appena disconnesso
 * @param {string} gameId
 * @param {string} nome
 */
function avviaGraceTimer(io, socket, gameId, nome) {
  const grace = config.game.disconnectGraceSeconds;
  if (!grace || grace <= 0) return;              // funzione disattivata
  if (!nome) return;                             // giocatore sconosciuto: niente da fare
  if (haAltriSocketConnessi(io, gameId, nome, socket.id)) return; // ha altre connessioni aperte

  annullaGraceTimer(gameId, nome);               // sostituisci eventuale timer precedente
  const key = `${gameId}:${nome}`;
  const timer = setTimeout(() => {
    graceTimers.delete(key);
    const match = gameManager.getMatch(gameId);
    if (!match || match.state !== 'running') return;
    // Doppio controllo: se nel frattempo è rientrato, non fare nulla.
    if (haAltriSocketConnessi(io, gameId, nome)) return;
    if (!match.giocatori.includes(nome)) return;  // già rimosso nel frattempo

    logger.info('abbandono_per_disconnessione', { gameId, nome, graceSeconds: grace });
    const esito = gameManager.abbandonaGiocatore(gameId, nome);
    if (!esito.ok) {
      logger.warn('abbandono_per_disconnessione_fallito', { gameId, nome, errore: esito.errore });
    }
  }, grace * 1000);
  // Non tenere vivo il processo solo per il timer (utile per test/shutdown pulito).
  if (typeof timer.unref === 'function') timer.unref();
  graceTimers.set(key, timer);
  logger.info('grace_timer_avviato', { gameId, nome, graceSeconds: grace });
}

/**
 * Fa "entrare" un socket in una partita esistente: lo registra nel tracking
 * socketToGame, lo unisce alla room lobby/game e lo segnala al GameManager.
 *
 * Usato sia da create_game/join_game sia da request_state (M5-bugfix3),
 * così dopo un refresh il nuovo socket torna a ricevere i broadcast.
 *
 * @param {import('socket.io').Socket} socket - socket del client
 * @param {string} gameId - id match
 * @param {object} match - oggetto match (per dedurre lo stato)
 * @param {string} [nome] - nome del giocatore (per il tracking/grace timer)
 */
export function registraSocketInPartita(socket, gameId, match, nome) {
  socketToGame.set(socket.id, gameId);
  if (nome) socket.data.nome = nome;
  const room = match && match.state === 'running' ? `game:${gameId}` : `lobby:${gameId}`;
  socket.join(room);
  gameManager.registraSocket(gameId, socket.id);
  // Se il giocatore era in attesa per un grace timer (disconnessione), è rientrato.
  if (nome) annullaGraceTimer(gameId, nome);
  logger.info('socket_riagganciato', { socketId: socket.id, gameId, room, state: match?.state, nome });
}

/**
 * Broadcast helper: invia evento a tutti i socket presenti in una partita.
 * F5: usa le room (`lobby:gameId` e `game:gameId`) già joinate dai socket
 * (vedi registraSocketInPartita) invece di iterare manualmente la mappa
 * socketToGame (O(n) su tutti i socket). Più pulito e a lookup O(1).
 */
export function broadcastAPartita(io, gameId, evento, payload) {
  io.to(`lobby:${gameId}`).to(`game:${gameId}`).emit(evento, payload);
}

/**
 * Costruisce un payload completo per la lobby (include tutto il necessario
 * al frontend per renderizzare la lobby senza re-fetch).
 */
function partitaPerLobby(p) {
  return {
    id: p.id,
    gameId: p.id,
    creator: p.creator,
    giocatori: p.giocatori,
    ready: p.ready,
    state: p.state,
    vincitore: p.vincitore,
    params: p.params,
    currentWord: p.currentWord,         // M5-bugfix: era assente, ora c'è
    parolaIniziale: p.params.initial_length_min + '-' + p.params.initial_length_max, // placeholder
    timeLeft: p.turnManager ? Math.max(0, p.turnManager.timeLeft) : null,
    turno: p.turnManager ? p.turnManager.turno : null,
    // Best-of-N
    manche: p.mancheCorrente ?? 0,
    gamesToWin: p.gamesToWin ?? p.params?.games_to_win ?? 1,
    punteggio: p.punteggio ?? {},
    giocatoriOriginali: p.giocatoriOriginali ?? [],
    // Timer partenza lobby (non configurabile in UI)
    lobbyTimerAttivo: !!p.lobbyTimer,
    lobbyTimerTimeLeft: p.lobbyTimer?.timeLeft ?? null,
    lobbyTimerTot: p.lobbyTimer?.tot ?? p.lobbyTimerSecondi ?? 30,
    // Visibilità: pubblica (in home) o privata (solo via codice)
    pubblico: p.pubblico !== false,
  };
}

/**
 * Attacca gli handler lobby a un socket.
 */
export function attachLobbyHandlers(io, socket) {
  // create_game
  socket.on('create_game', async (payload, ack) => {
    if (!rateLimiterLobby.check(socket.id)) {
      return ack?.({ ok: false, errore: 'rate_limit', messaggio: 'Troppe richieste, riprova tra poco.' });
    }

    const { nome, maxPlayers, turnSeconds, gamesToWin, initialLengthMin, initialLengthMax, pubblico } = payload || {};

    const risultato = await gameManager.creaMatch({
      creator: nome,
      maxPlayers,
      turnSeconds,
      gamesToWin,
      initialLengthMin,
      initialLengthMax,
      pubblico,
    });

    if (!risultato.ok) {
      logger.warn('create_game_rifiutato', { socketId: socket.id, errore: risultato.errore });
      return ack?.({ ok: false, errore: risultato.errore });
    }

    socketToGame.set(socket.id, risultato.match.id);
    socket.data.nome = nome;
    socket.join(`lobby:${risultato.match.id}`);
    gameManager.registraSocket(risultato.match.id, socket.id);
    annullaGraceTimer(risultato.match.id, nome);

    logger.info('socket_in_partita', { socketId: socket.id, gameId: risultato.match.id, nome });
    // Chiave wire `partita` (contratto col frontend); valore = oggetto match.
    ack?.({ ok: true, partita: partitaPerLobby(risultato.match) });
  });

  // join_game
  socket.on('join_game', (payload, ack) => {
    if (!rateLimiterLobby.check(socket.id)) {
      return ack?.({ ok: false, errore: 'rate_limit' });
    }

    const { gameId, nome } = payload || {};
    if (!gameId || !nome) {
      return ack?.({ ok: false, errore: 'parametri_mancanti' });
    }

    const risultato = gameManager.uniscitiAMatch(gameId, nome);
    if (!risultato.ok) {
      return ack?.({ ok: false, errore: risultato.errore });
    }

    socketToGame.set(socket.id, gameId);
    socket.data.nome = nome;
    socket.join(`lobby:${gameId}`);
    gameManager.registraSocket(gameId, socket.id);
    annullaGraceTimer(gameId, nome);

    // Notifica tutti nella lobby (incluso chi era già dentro)
    broadcastAPartita(io, gameId, 'lobby_updated', partitaPerLobby(risultato.match));

    logger.info('socket_join', { socketId: socket.id, gameId, nome });
    ack?.({ ok: true, partita: partitaPerLobby(risultato.match) });
  });

  // leave_game
  socket.on('leave_game', (payload, ack) => {
    // Fallback su payload.gameId: se la mappa socketToGame e' stantia (es. dopo
    // una riconnessione) il client puo' comunque indicare la partita da lasciare.
    const gameId = socketToGame.get(socket.id) || payload?.gameId;
    const nome = payload?.nome || socket.data?.nome;
    if (!gameId) return ack?.({ ok: false, errore: 'non_in_partita' });

    const match = gameManager.getMatch(gameId);
    if (!match) {
      socketToGame.delete(socket.id);
      return ack?.({ ok: false, errore: 'partita_non_trovata' });
    }

    let abbandono = { ok: false, errore: 'non_in_corso' };
    if (match.state === 'waiting') {
      const idx = match.giocatori.findIndex((g) => g === nome);
      if (idx !== -1) {
        match.giocatori.splice(idx, 1);
        match.ready.splice(idx, 1);
        if (match.giocatori.length === 0) {
          gameManager.rimuoviMatch(gameId);
        } else {
          broadcastAPartita(io, gameId, 'lobby_updated', partitaPerLobby(match));
        }
      }
      abbandono = { ok: true };
    } else if (match.state === 'running') {
      // Abbandono durante la partita: se resta 1 solo giocatore viene decretato
      // il vincitore (o la partita cancellata se nessuno); altrimenti il turno
      // passa correttamente al giocatore successivo.
      abbandono = gameManager.abbandonaGiocatore(gameId, nome);
      if (abbandono.ok) {
        logger.info('giocatore_abbandonato_in_partita', { socketId: socket.id, gameId, nome });
      } else {
        // Non silenziare: senza log e' impossibile capire perche' il giocatore
        // resta in partita mentre il client torna alla home.
        logger.warn('abbandono_non_riuscito', { socketId: socket.id, gameId, nome, errore: abbandono.errore });
      }
    }

    socketToGame.delete(socket.id);
    gameManager.rimuoviSocket(gameId, socket.id);
    if (nome) annullaGraceTimer(gameId, nome);
    // Il socket puo' trovarsi nella room lobby (in attesa) o game (in partita):
    // va lasciata quella corretta, altrimenti continuerebbe a ricevere i broadcast.
    socket.leave(`lobby:${gameId}`);
    socket.leave(`game:${gameId}`);
    logger.info('socket_leave', { socketId: socket.id, gameId, abbandono: abbandono.ok });
    ack?.({ ok: true, abbandono });
  });

  // set_ready
  socket.on('set_ready', async (payload, ack) => {
    const gameId = socketToGame.get(socket.id);
    if (!gameId) return ack?.({ ok: false, errore: 'non_in_partita' });

    const { nome, ready } = payload || {};
    const risultato = gameManager.setReady(gameId, nome, ready);
    if (!risultato.ok) {
      return ack?.({ ok: false, errore: risultato.errore });
    }

    broadcastAPartita(io, gameId, 'lobby_updated', partitaPerLobby(risultato.match));

    ack?.({ ok: true, tuttiProni: risultato.tuttiProni });

    // Auto-avvio se tutti pronti
    if (risultato.tuttiProni) {
      const avvio = await gameManager.avviaMatch(gameId);
      if (avvio.ok) {
        const match = avvio.match;
        for (const [sid, gid] of socketToGame.entries()) {
          if (gid === gameId) {
            const s = io.sockets.sockets.get(sid);
            if (s) {
              s.leave(`lobby:${gameId}`);
              s.join(`game:${gameId}`);
              s.emit('partita_avviata', {
                gameId,
                parolaIniziale: match.currentWord,
                giocatoreCorrente: match.turnManager.giocatoreCorrente(),
                timeLeft: match.turnManager.timeLeft,
                timeLimit: match.params.turn_seconds,
                giocatori: match.giocatori,
                // M5c: include la catena di parole già usate per la UI
                history: match.history,
                // Best-of-N
                manche: match.mancheCorrente,
                gamesToWin: match.gamesToWin,
                punteggio: match.punteggio,
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

  // list_games
  socket.on('list_games', (payload, ack) => {
    // In home mostriamo SOLO le partite pubbliche; le private si raggiungono
    // esclusivamente via codice (join_game).
    const partite = gameManager.listaMatchAperti(true).map(partitaPerLobby);
    ack?.({ ok: true, partite });
  });

  // Disconnect: cleanup
  socket.on('disconnect', () => {
    const gameId = socketToGame.get(socket.id);
    if (gameId) {
      const match = gameManager.getMatch(gameId);
      if (match && match.state === 'waiting') {
        broadcastAPartita(io, gameId, 'lobby_updated', partitaPerLobby(match));
      } else if (match && match.state === 'running') {
        // Anti-fantasma: la disconnessione non e' di per se' un abbandono (un
        // refresh non deve far vincere l'avversario). Avviamo un grace timer:
        // se il giocatore rientra entro N secondi il timer si annulla, altrimenti
        // viene trattato come abbandono e l'avversario viene avvisato.
        avviaGraceTimer(io, socket, gameId, socket.data?.nome);
      }
      gameManager.rimuoviSocket(gameId, socket.id);
      socketToGame.delete(socket.id);
    }
    logger.info('socket_disconnect', { socketId: socket.id, gameId });
  });
}
