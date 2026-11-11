/**
 * statsRows.js — Costruzione delle righe di statistica (funzioni PURE)
 *
 * Separate dalla scrittura su DB (`statsQueries.js`) per due motivi:
 * 1. testabili senza database (vedi `backend/tests/statsRows.test.js`);
 * 2. le regole di PRIVACY stanno in un punto solo: la parola viene salvata
 *    solo se è arrivata al percorso AI, mai per le mosse normali.
 *
 * @module backend/src/db/statsRows
 */

/**
 * Motivi per cui la parola è "interessante" per il dizionario: il verdetto
 * non è arrivato da DB né da morfologia, quindi è un candidato AI.
 * @type {Set<string>}
 */
export const MOTIVI_CON_PAROLA = new Set(['ai_rifiutata', 'ai_errore', 'rate_limit']);

/**
 * Righe per la tabella `games` (ciclo di vita di una partita).
 *
 * @param {object} match - oggetto partita in RAM (GameManager)
 * @param {'waiting'|'running'|'finished'|'cancelled'} state
 * @returns {object} riga pronta per l'UPSERT
 */
export function costruisciRigaPartita(match, state) {
  // Elenco giocatori: quello iniziale (tutti quelli entrati) è il più
  // significativo per le statistiche; gli abbandoni non devono "sparire".
  const players = Array.isArray(match.giocatoriIniziali) && match.giocatoriIniziali.length > 0
    ? [...match.giocatoriIniziali]
    : Array.isArray(match.giocatoriOriginali) && match.giocatoriOriginali.length > 0
      ? [...match.giocatoriOriginali]
      : [...(match.giocatori ?? [])];

  return {
    id: match.id,
    state,
    params: match.params ?? {},
    players,
    winnerName: match.vincitore ?? null,
    gamesWon: match.punteggio ?? {},
    createdAt: match.createdAt ?? new Date(),
    startedAt: match.startedAt ?? null,
    endedAt: match.endedAt ?? null,
    abandonments: Number.isInteger(match.abbandoni) ? match.abbandoni : 0,
  };
}

/**
 * Riga per la tabella `moves` (un tentativo di parola).
 *
 * `parola` viene conservata SOLO se:
 * - il verdetto è arrivato (anche solo in parte) dall'AI (`aiUsata`), oppure
 * - il motivo indica che il percorso AI è stato interrotto (`rate_limit`).
 * In tutti gli altri casi resta `null`: sono mosse normali, il cui testo non
 * serve alle statistiche e non va persistito.
 *
 * @param {object} info
 * @param {string} info.gameId
 * @param {number} info.manche
 * @param {number} info.turno
 * @param {string} info.giocatore
 * @param {boolean} info.valida
 * @param {string|null} [info.motivo]
 * @param {'DB'|'MORF'|'AI'|null} [info.source]
 * @param {boolean} [info.aiUsata]
 * @param {number|null} [info.aiDurataMs]
 * @param {number|null} [info.tentativo]
 * @param {string} [info.parola]
 * @returns {object} riga pronta per l'INSERT
 */
export function costruisciRigaMossa(info) {
  const aiUsata = info.aiUsata === true;
  const conservaParola = aiUsata || MOTIVI_CON_PAROLA.has(info.motivo);

  return {
    gameId: info.gameId,
    manche: Number.isInteger(info.manche) ? info.manche : 1,
    turno: Number.isInteger(info.turno) ? info.turno : 0,
    giocatore: info.giocatore,
    valida: info.valida === true,
    motivo: info.motivo ?? null,
    source: info.source ?? null,
    aiUsata,
    aiDurataMs: Number.isFinite(info.aiDurataMs) ? info.aiDurataMs : null,
    tentativo: Number.isInteger(info.tentativo) ? info.tentativo : null,
    parola: conservaParola ? (info.parola ?? null) : null,
  };
}
