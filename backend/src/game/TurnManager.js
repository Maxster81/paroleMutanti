/**
 * TurnManager.js — Gestione turni e timer di una partita
 *
 * Responsabilità:
 * - Traccia il giocatore di turno corrente
 * - Gestisce il timer (countdown)
 * - Gestisce timeout (turno scaduto → passa al prossimo giocatore o fine)
 * - Supporta pause/resume per operazioni lunghe (es. validazione AI)
 * - Espone eventi (tick, timeout, changeTurn) tramite EventEmitter
 *
 * Approccio "ottimistico" (lockless): gli eventi arrivano in ordine,
 * non serve serializzazione. Se due submit arrivano contemporaneamente,
 * il primo elaborato vince (è OK per un gioco realtime).
 *
 * @module backend/src/game/TurnManager
 */

import { EventEmitter } from 'node:events';
import { logger } from '../logger.js';

/**
 * Costrutture del TurnManager.
 *
 * @typedef {object} TurnManagerOptions
 * @property {string[]} giocatori - lista nomi giocatori in ordine
 * @property {number} secondiPerTurno - durata di ogni turno (es. 30)
 * @property {string} parolaIniziale - parola di partenza
 * @property {function} onTimeout - callback (giocatoreIndex) chiamato a timeout
 */

export class TurnManager extends EventEmitter {
  /**
   * @param {TurnManagerOptions} opzioni
   */
  constructor(opzioni) {
    super();
    this.giocatori = opzioni.giocatori ?? [];
    this.secondiPerTurno = opzioni.secondiPerTurno ?? 30;
    this.parolaIniziale = opzioni.parolaIniziale ?? '';
    this.onTimeout = opzioni.onTimeout ?? (() => {});

    this.currentPlayerIndex = 0;
    this.currentWord = this.parolaIniziale;
    this.timeLeft = this.secondiPerTurno;
    this.turno = 0;
    this.history = [];
    this.timerInterval = null;
    this.attivo = false;
    this.inPausa = false;
  }

  /**
   * Avvia il primo turno e il timer.
   */
  start() {
    if (this.attivo) return;
    this.attivo = true;
    this.inPausa = false;
    this.turno = 1;
    this.timeLeft = this.secondiPerTurno;
    this.history.push({
      parola: this.parolaIniziale,
      giocatore: '(iniziale)',
      turno: 0,
      timestamp: Date.now(),
    });
    this._avviaTimer();
    this.emit('turn_start', this.statoCorrente());
    logger.info('turno_avviato', { turno: this.turno, giocatore: this.giocatoreCorrente() });
  }

  /**
   * Mette in pausa il timer (per operazioni lunghe come validazione AI).
   */
  pause() {
    if (!this.attivo || this.inPausa) return;
    this.inPausa = true;
    this._fermaTimer();
    this.emit('paused', { timeLeft: this.timeLeft, motivo: 'validazione_in_corso' });
    logger.debug('turno_in_pausa', { timeLeft: this.timeLeft });
  }

  /**
   * Riprende il timer dopo una pausa.
   */
  resume() {
    if (!this.attivo || !this.inPausa) return;
    this.inPausa = false;
    this._avviaTimer();
    this.emit('resumed', { timeLeft: this.timeLeft });
    logger.debug('turno_ripreso', { timeLeft: this.timeLeft });
  }

  /**
   * Registra una mossa valida e passa al turno successivo.
   */
  submitMossa(parola, giocatore) {
    if (!this.attivo) {
      logger.warn('submit_ignorato_turno_non_attivo', { parola });
      return;
    }

    this.history.push({
      parola,
      giocatore,
      turno: this.turno,
      timestamp: Date.now(),
    });
    this.currentWord = parola;
    this._prossimoTurno();
  }

  /**
   * Il giocatore corrente passa il turno volontariamente.
   */
  passaTurno(giocatore) {
    if (!this.attivo) return;
    if (this.inPausa) {
      logger.warn('passa_turno_in_pausa_ignorato');
      return;
    }
    const expected = this.giocatoreCorrente();
    if (giocatore !== expected) {
      logger.warn('passa_turno_non_corrente', { chi: giocatore, expected });
      return;
    }
    logger.info('turno_passato', { giocatore });
    this.timeLeft = 0;
    this._onTickTimeout();
  }

  /**
   * Ferma il timer e l'attività.
   */
  stop() {
    this.attivo = false;
    this._fermaTimer();
  }

  /**
   * Ritorna lo stato corrente (per broadcast via socket).
   */
  statoCorrente() {
    return {
      turno: this.turno,
      giocatore: this.giocatoreCorrente(),
      giocatoreIndex: this.currentPlayerIndex,
      parolaCorrente: this.currentWord,
      timeLeft: Math.max(0, this.timeLeft),
      timeLimit: this.secondiPerTurno,
      inPausa: this.inPausa,
      history: [...this.history],
    };
  }

  /**
   * Ritorna il nome del giocatore di turno corrente.
   */
  giocatoreCorrente() {
    return this.giocatori[this.currentPlayerIndex] ?? null;
  }

  /**
   * Ritorna l'indice del prossimo giocatore (ciclando).
   * @private
   */
  _prossimoIndice() {
    return (this.currentPlayerIndex + 1) % this.giocatori.length;
  }

  /**
   * Passa al turno successivo.
   * @private
   */
  _prossimoTurno() {
    this.currentPlayerIndex = this._prossimoIndice();
    this.turno += 1;
    this.timeLeft = this.secondiPerTurno;
    this._avviaTimer();
    this.emit('turn_change', this.statoCorrente());
    logger.info('turno_cambiato', {
      turno: this.turno,
      giocatore: this.giocatoreCorrente(),
    });
  }

  /**
   * Avvia (o riavvia) il timer.
   * @private
   */
  _avviaTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this._tick(), 1000);
  }

  /**
   * Tick del timer (chiamato ogni secondo).
   * @private
   */
  _tick() {
    if (!this.attivo) {
      this._fermaTimer();
      return;
    }
    if (this.inPausa) {
      // Non decrementare se in pausa
      return;
    }
    this.timeLeft -= 1;
    this.emit('tick', { timeLeft: this.timeLeft, turno: this.turno });

    if (this.timeLeft <= 10 && this.timeLeft > 0) {
      this.emit('beep', { timeLeft: this.timeLeft });
    }

    if (this.timeLeft <= 0) {
      this._onTickTimeout();
    }
  }

  /**
   * Gestione timeout timer scaduto.
   * @private
   */
  _onTickTimeout() {
    if (!this.attivo) return;
    logger.info('turno_scaduto', { giocatore: this.giocatoreCorrente() });
    this.emit('timeout', { giocatore: this.giocatoreCorrente() });
    this.onTimeout(this.currentPlayerIndex);
  }

  /**
   * Ferma solo il timer interval (mantiene stato).
   * @private
   */
  _fermaTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
