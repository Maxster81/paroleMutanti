/**
 * state.js — State manager centrale del frontend
 *
 * Pattern: oggetto reattivo + update() + emit 'state-changed'.
 * Ogni view si iscrive e si re-renderizza quando lo state cambia.
 *
 * @module frontend/js/state
 */

class StateManager {
  constructor() {
    this.data = {
      connessione: 'offline',     // 'offline' | 'connecting' | 'online'
      tema: localStorage.getItem('pm-tema') || 'dark',
      audioAbilitato: localStorage.getItem('pm-audio') !== 'off',
      nome: localStorage.getItem('pm-nome') || '',
      gameId: null,                // partita corrente
      partita: null,               // oggetto partita dal server
      errore: null,                // errore corrente UI
      info: null,                  // notifica positiva
    };
    this.listeners = new Set();
  }

  /**
   * Aggiorna una porzione di state e notifica i listener.
   *
   * @param {object} partial - campi da aggiornare
   */
  update(partial) {
    const old = { ...this.data };
    this.data = { ...this.data, ...partial };
    for (const cb of this.listeners) {
      try {
        cb(this.data, old);
      } catch (err) {
        console.error('[state] listener error:', err);
      }
    }
  }

  /**
   * Ritorna lo state corrente (read-only snapshot).
   * @returns {object}
   */
  get() {
    return { ...this.data };
  }

  /**
   * Sottoscrivi ai cambi di state.
   *
   * @param {function} callback - fn(state, oldState) => void
   * @returns {function} unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Reset di alcune proprietà (es. errore/info dopo averle mostrate).
   */
  clearMessaggi() {
    this.update({ errore: null, info: null });
  }
}

export const state = new StateManager();
