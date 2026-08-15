/**
 * GameManager.js — Gestione stato partite in RAM
 *
 * Singleton che tiene traccia di tutte le partite attive in memoria.
 * Ogni partita è identificata da un gameId (UUID).
 *
 * M5-bugfix2: include sweeper automatico per partite abbandonate:
 * - waiting >5min → cancellata
 * - running con 0 socket >2min → cancellata
 * - finished >1min → rimossa
 *
 * @module backend/src/game/GameManager
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { scegliParolaIniziale } from './WordPicker.js';
import { validaMossa } from './Validator.js';
import { TurnManager } from './TurnManager.js';

// Intervalli sweeper (ms)
const TIMEOUT_WAITING_MS = 5 * 60 * 1000;       // 5 min
const TIMEOUT_RUNNING_SOLO_MS = 2 * 60 * 1000;   // 2 min
const TIMEOUT_FINISHED_MS = 60 * 1000;             // 1 min
const SWEEPER_INTERVAL_MS = 60 * 1000;             // ogni 1 min

export class GameManager extends EventEmitter {
  constructor() {
    super();
    this.partite = new Map();
    // Traccia socket connessi per partita (per sweeper "running con 0 socket")
    this.socketsPerPartita = new Map(); // gameId → Set<socketId>

    // Sweeper automatico
    this.sweeperInterval = setInterval(() => this._sweepAbbandonate(), SWEEPER_INTERVAL_MS);
    this.sweeperInterval.unref(); // non blocca shutdown
  }

  // ============================================================
  // CRUD Partite
  // ============================================================

  async creaPartita(opzioni) {
    const {
      creator,
      maxPlayers = config.game.maxPlayers,
      turnSeconds = config.game.defaultTurnSeconds,
      gamesToWin = config.game.defaultGamesToWin,
      initialLengthMin = config.game.initialWordMinLength,
      initialLengthMax = config.game.initialWordMaxLength,
    } = opzioni;

    if (!creator || typeof creator !== 'string' || creator.trim().length < 1) {
      return { ok: false, errore: 'creator_non_valido' };
    }
    if (maxPlayers < config.game.minPlayers || maxPlayers > config.game.maxPlayers) {
      return { ok: false, errore: 'max_players_non_valido' };
    }
    if (turnSeconds < 5 || turnSeconds > 60) {
      return { ok: false, errore: 'turn_seconds_non_valido' };
    }

    const nome = creator.trim();
    for (const p of this.partite.values()) {
      if (p.state === 'waiting' && p.giocatori.includes(nome)) {
        return { ok: false, errore: 'gia_in_partita', partita: p };
      }
    }

    const id = randomUUID();
    const partita = {
      id,
      creator: nome,
      giocatori: [nome],
      ready: [false],
      state: 'waiting',
      params: { max_players: maxPlayers, turn_seconds: turnSeconds, games_to_win: gamesToWin, initial_length_min: initialLengthMin, initial_length_max: initialLengthMax },
      currentWord: null,
      currentPlayerIndex: 0,
      history: [],
      vincitore: null,
      turnManager: null,
      createdAt: new Date(),
      startedAt: null,
      endedAt: null,
      lastActivityAt: new Date(),
      aiValidationsCount: 0,
    };
    this.partite.set(id, partita);
    this.socketsPerPartita.set(id, new Set());
    logger.info('partita_creata', { id, creator: nome, maxPlayers, turnSeconds });
    this.emit('partita_creata', partita);
    return { ok: true, partita };
  }

  uniscitiAPartita(gameId, nome) {
    const partita = this.partite.get(gameId);
    if (!partita) return { ok: false, errore: 'partita_non_trovata' };
    if (partita.state !== 'waiting') return { ok: false, errore: 'partita_gia_iniziata' };
    if (partita.giocatori.length >= partita.params.max_players) return { ok: false, errore: 'partita_piena' };
    if (!nome || typeof nome !== 'string' || nome.trim().length < 1) {
      return { ok: false, errore: 'nome_non_valido' };
    }
    const nomePulito = nome.trim();
    if (partita.giocatori.includes(nomePulito)) {
      return { ok: false, errore: 'nome_gia_usato' };
    }
    partita.giocatori.push(nomePulito);
    partita.ready.push(false);
    partita.lastActivityAt = new Date();
    logger.info('giocatore_aggiunto', { gameId, nome: nomePulito, totale: partita.giocatori.length });
    this.emit('giocatore_aggiunto', partita);
    return { ok: true, partita };
  }

  setReady(gameId, nome, ready) {
    const partita = this.partite.get(gameId);
    if (!partita) return { ok: false, errore: 'partita_non_trovata' };
    if (partita.state !== 'waiting') return { ok: false, errore: 'partita_gia_iniziata' };
    const idx = partita.giocatori.indexOf(nome);
    if (idx === -1) return { ok: false, errore: 'giocatore_non_in_partita' };
    partita.ready[idx] = ready;
    partita.lastActivityAt = new Date();
    const tuttiProni = partita.ready.every((r) => r) && partita.giocatori.length >= 2;
    logger.info('ready_aggiornato', { gameId, nome, ready, tuttiProni });
    this.emit('ready_aggiornato', partita);
    return { ok: true, partita, tuttiProni };
  }

  getPartita(gameId) { return this.partite.get(gameId); }

  listaPartiteAperte() {
    return Array.from(this.partite.values()).filter((p) => p.state === 'waiting');
  }

  size() { return this.partite.size; }

  // ============================================================
  // Game Lifecycle
  // ============================================================

  async avviaPartita(gameId) {
    const partita = this.partite.get(gameId);
    if (!partita) return { ok: false, errore: 'partita_non_trovata' };
    if (partita.state !== 'waiting') return { ok: false, errore: 'stato_non_valido' };
    if (partita.giocatori.length < 2) return { ok: false, errore: 'servono_almeno_2_giocatori' };
    if (!partita.ready.every((r) => r)) return { ok: false, errore: 'non_tutti_pronti' };

    try {
      const parolaIniziale = await scegliParolaIniziale(
        partita.params.initial_length_min,
        partita.params.initial_length_max
      );

      partita.state = 'running';
      partita.currentWord = parolaIniziale;
      partita.startedAt = new Date();
      partita.currentPlayerIndex = 0;
      partita.history = [{ parola: parolaIniziale, giocatore: '(iniziale)', turno: 0, timestamp: Date.now() }];
      partita.lastActivityAt = new Date();

      const turnManager = new TurnManager({
        giocatori: [...partita.giocatori],
        secondiPerTurno: partita.params.turn_seconds,
        parolaIniziale,
        onTimeout: (idxGiocatore) => this._gestisciTimeout(gameId, idxGiocatore),
      });

      turnManager.on('turn_change', (stato) => this.emit('turn_change', { gameId, stato }));
      turnManager.on('tick', (data) => this.emit('tick', { gameId, ...data }));
      turnManager.on('beep', (data) => this.emit('beep', { gameId, ...data }));
      turnManager.on('timeout', (data) => this.emit('timeout', { gameId, ...data }));
      turnManager.on('paused', (data) => this.emit('paused', { gameId, ...data }));
      turnManager.on('resumed', (data) => this.emit('resumed', { gameId, ...data }));

      partita.turnManager = turnManager;
      turnManager.start();

      logger.info('partita_avviata', { gameId, parolaIniziale });
      this.emit('partita_avviata', partita);
      return { ok: true, partita };
    } catch (errore) {
      logger.error('avvio_partita_fallito', { gameId, errore: errore.message });
      return { ok: false, errore: errore.message };
    }
  }

  async submitParola(gameId, nomeGiocatore, parola) {
    const partita = this.partite.get(gameId);
    if (!partita) return { ok: false, valida: false, motivo: 'partita_non_trovata' };
    if (partita.state !== 'running') {
      return { ok: false, valida: false, motivo: 'partita_non_in_corso' };
    }
    if (partita.turnManager.giocatoreCorrente() !== nomeGiocatore) {
      return { ok: false, valida: false, motivo: 'non_sei_di_turno' };
    }

    const risultato = await validaMossa({
      parolaPrecedente: partita.currentWord,
      parolaNuova: parola,
      gameId,
      lunghezzaMin: 3,
      lunghezzaMax: 10,
    });

    if (risultato.valida) {
      partita.turnManager.submitMossa(risultato.normalizzata, nomeGiocatore);
      partita.currentWord = risultato.normalizzata;
      partita.history.push({
        parola: risultato.normalizzata,
        giocatore: nomeGiocatore,
        turno: partita.turnManager.turno,
        timestamp: Date.now(),
      });
      partita.lastActivityAt = new Date();
      if (risultato.source === 'AI') partita.aiValidationsCount += 1;
      this.emit('mossa_validata', { gameId, partita, parola: risultato.normalizzata, ai_usata: risultato.ai_usata || false });
      logger.info('mossa_validata', { gameId, giocatore: nomeGiocatore, source: risultato.source, ai_usata: !!risultato.ai_usata });
    } else {
      this.emit('mossa_rifiutata', { gameId, partita, parola, motivo: risultato.motivo });
      logger.info('mossa_rifiutata', { gameId, giocatore: nomeGiocatore, parola, motivo: risultato.motivo });
    }

    return {
      ok: true,
      valida: risultato.valida,
      motivo: risultato.motivo,
      messaggio: risultato.messaggio,
      source: risultato.source,
    };
  }

  passaTurno(gameId, nomeGiocatore) {
    const partita = this.partite.get(gameId);
    if (!partita) return { ok: false, errore: 'partita_non_trovata' };
    if (partita.state !== 'running') return { ok: false, errore: 'partita_non_in_corso' };
    if (partita.turnManager.giocatoreCorrente() !== nomeGiocatore) {
      return { ok: false, errore: 'non_sei_di_turno' };
    }
    partita.turnManager.passaTurno(nomeGiocatore);
    return { ok: true };
  }

  _gestisciTimeout(gameId, idxGiocatore) {
    const partita = this.partite.get(gameId);
    if (!partita || partita.state !== 'running') return;

    const nomeEliminato = partita.giocatori[idxGiocatore];
    logger.info('giocatore_eliminato_timeout', { gameId, nome: nomeEliminato });

    partita.giocatori.splice(idxGiocatore, 1);
    partita.turnManager.giocatori.splice(idxGiocatore, 1);

    this.emit('giocatore_eliminato', { gameId, nome: nomeEliminato, partita });

    if (partita.giocatori.length === 1) {
      this._finePartita(gameId, partita.giocatori[0]);
    } else if (partita.giocatori.length === 0) {
      this._cancellaPartita(gameId);
    } else {
      const nuovoIndice = idxGiocatore % partita.giocatori.length;
      partita.turnManager.currentPlayerIndex = nuovoIndice;
      partita.turnManager.timeLeft = partita.params.turn_seconds;
      partita.turnManager.turno += 1;
      partita.turnManager._avviaTimer();
      this.emit('turn_change', { gameId, stato: partita.turnManager.statoCorrente() });
    }
  }

  _finePartita(gameId, vincitore) {
    const partita = this.partite.get(gameId);
    if (!partita) return;
    partita.state = 'finished';
    partita.vincitore = vincitore;
    partita.endedAt = new Date();
    partita.lastActivityAt = new Date();
    if (partita.turnManager) partita.turnManager.stop();
    logger.info('partita_finita', { gameId, vincitore, durata_ms: partita.endedAt - partita.startedAt, aiValidations: partita.aiValidationsCount });
    this.emit('partita_finita', partita);
  }

  _cancellaPartita(gameId) {
    const partita = this.partite.get(gameId);
    if (!partita) return;
    partita.state = 'cancelled';
    partita.endedAt = new Date();
    if (partita.turnManager) partita.turnManager.stop();
    logger.info('partita_cancellata', { gameId });
    this.emit('partita_cancellata', partita);
  }

  // ============================================================
  // Socket tracking (per sweeper "running con 0 socket")
  // ============================================================

  registraSocket(gameId, socketId) {
    if (!this.socketsPerPartita.has(gameId)) {
      this.socketsPerPartita.set(gameId, new Set());
    }
    this.socketsPerPartita.get(gameId).add(socketId);
  }

  rimuoviSocket(gameId, socketId) {
    this.socketsPerPartita.get(gameId)?.delete(socketId);
  }

  contaSocket(gameId) {
    return this.socketsPerPartita.get(gameId)?.size ?? 0;
  }

  // ============================================================
  // Sweeper automatico
  // ============================================================

  /**
   * Pulisce partite abbandonate secondo regole:
   * - waiting >5min → cancellata
   * - running con 0 socket >2min → cancellata
   * - finished >1min → rimossa definitivamente
   */
  _sweepAbbandonate() {
    const ora = Date.now();
    for (const [gameId, p] of this.partite.entries()) {
      if (p.state === 'waiting') {
        const etaMs = ora - new Date(p.createdAt).getTime();
        if (etaMs > TIMEOUT_WAITING_MS) {
          logger.info('sweeper_cancella_waiting', { gameId, etaMin: Math.round(etaMs / 60000) });
          this._cancellaPartita(gameId);
        }
      } else if (p.state === 'running') {
        const etaSenzaAttivita = ora - new Date(p.lastActivityAt).getTime();
        const socketConnessi = this.contaSocket(gameId);
        if (socketConnessi === 0 && etaSenzaAttivita > TIMEOUT_RUNNING_SOLO_MS) {
          logger.info('sweeper_cancella_running_solo', { gameId, etaMin: Math.round(etaSenzaAttivita / 60000) });
          this._cancellaPartita(gameId);
        }
      } else if (p.state === 'finished' || p.state === 'cancelled') {
        const etaFine = ora - new Date(p.endedAt).getTime();
        if (etaFine > TIMEOUT_FINISHED_MS) {
          logger.info('sweeper_rimuove_finita', { gameId, etaSec: Math.round(etaFine / 1000) });
          this.rimuoviPartita(gameId);
        }
      }
    }
  }

  rimuoviPartita(gameId) {
    const partita = this.partite.get(gameId);
    if (!partita) return false;
    if (partita.state === 'running') return false;
    if (partita.turnManager) partita.turnManager.stop();
    this.partite.delete(gameId);
    this.socketsPerPartita.delete(gameId);
    logger.info('partita_rimossa', { gameId });
    this.emit('partita_rimossa', { id: gameId });
    return true;
  }
}

export const gameManager = new GameManager();
