/**
 * ordineGiocatori.js — Ordine di gioco casuale.
 *
 * Il primo giocatore a muoversi in una manche è scelto **a caso** (non è più
 * sempre il creatore della partita). La funzione è pura e accetta un RNG
 * iniettabile, così è verificabile in modo deterministico.
 *
 * @module backend/src/utils/ordineGiocatori
 */

/**
 * Ritorna una COPIA dell'array con i giocatori in ordine casuale (Fisher-Yates).
 * L'array di input NON viene modificato.
 *
 * @param {string[]} giocatori
 * @param {() => number} [rng=Math.random] - generatore uniforme in [0, 1)
 * @returns {string[]} nuova lista in ordine casuale
 */
export function ordineCasuale(giocatori, rng = Math.random) {
  const out = Array.isArray(giocatori) ? [...giocatori] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
