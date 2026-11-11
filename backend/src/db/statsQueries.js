/**
 * statsQueries.js — Persistenza delle statistiche di gioco
 *
 * Scritture **fire-and-forget**: non devono mai rallentare né far fallire il
 * game loop. Un errore (es. DB non raggiungibile) viene loggato al massimo una
 * volta al minuto e ignorato.
 *
 * Tabelle alimentate:
 * - `games`  → ciclo di vita della partita (UPSERT, così l'ordine delle
 *              scritture non conta);
 * - `moves`  → un tentativo di parola con la sua fonte di validazione.
 *
 * Le regole di costruzione delle righe (e di privacy) stanno in `statsRows.js`.
 *
 * @module backend/src/db/statsQueries
 */

import { query } from './pool.js';
import { logger } from '../logger.js';
import { costruisciRigaPartita, costruisciRigaMossa } from './statsRows.js';

const INTERVALLO_AVVISO_MS = 60_000;
let ultimoAvviso = 0;

/**
 * Logga l'errore di una scrittura statistica al massimo una volta al minuto
 * (evita di riempire i log se il DB è giù o durante i test senza DB).
 *
 * @param {string} evento
 * @param {Error} errore
 */
function avvisaErrore(evento, errore) {
  const ora = Date.now();
  if (ora - ultimoAvviso < INTERVALLO_AVVISO_MS) return;
  ultimoAvviso = ora;
  logger.warn(evento, { errore: errore?.message ?? String(errore) });
}

const SQL_UPSERT_PARTITA = `
  INSERT INTO games (id, state, params, players, winner_name, games_won, created_at, started_at, ended_at, abandonments)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    state = EXCLUDED.state,
    params = EXCLUDED.params,
    players = EXCLUDED.players,
    winner_name = EXCLUDED.winner_name,
    games_won = EXCLUDED.games_won,
    started_at = COALESCE(EXCLUDED.started_at, games.started_at),
    ended_at = COALESCE(EXCLUDED.ended_at, games.ended_at),
    abandonments = EXCLUDED.abandonments
`;

/**
 * Registra lo stato corrente di una partita (creazione, avvio, fine, annullo).
 * Non attende la scrittura: è pensata per essere chiamata dal GameManager.
 *
 * @param {object} match - partita in RAM
 * @param {'waiting'|'running'|'finished'|'cancelled'} state
 */
export function registraPartita(match, state) {
  if (!match?.id) return;
  const riga = costruisciRigaPartita(match, state);
  query(SQL_UPSERT_PARTITA, [
    riga.id,
    riga.state,
    riga.params,
    JSON.stringify(riga.players),
    riga.winnerName,
    JSON.stringify(riga.gamesWon),
    riga.createdAt,
    riga.startedAt,
    riga.endedAt,
    riga.abandonments,
  ]).catch((errore) => avvisaErrore('stats_partita_fallita', errore));
}

const SQL_INSERT_MOSSA = `
  INSERT INTO moves (game_id, manche, turno, giocatore, valida, motivo, source, ai_usata, ai_durata_ms, tentativo, parola)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

/**
 * Registra un tentativo di parola e la fonte del verdetto.
 * Non attende la scrittura (fire-and-forget).
 *
 * @param {object} info - vedi `costruisciRigaMossa` in statsRows.js
 */
export function registraMossa(info) {
  if (!info?.gameId) return;
  const riga = costruisciRigaMossa(info);
  query(SQL_INSERT_MOSSA, [
    riga.gameId,
    riga.manche,
    riga.turno,
    riga.giocatore,
    riga.valida,
    riga.motivo,
    riga.source,
    riga.aiUsata,
    riga.aiDurataMs,
    riga.tentativo,
    riga.parola,
  ]).catch((errore) => avvisaErrore('stats_mossa_fallita', errore));
}
