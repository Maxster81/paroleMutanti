/**
 * normalizza.js — Funzioni di normalizzazione e validazione stringhe/parole
 *
 * Usato dal Validator per preparare la parola prima della validazione.
 * - lowercase + trim
 * - charset italiano: SOLO lettere (a-z, accentate àèéìòù) + prestiti
 *   consolidati (j, k, w, x, y)
 * - lunghezza entro range
 *
 * ⚠️ CHARSET UFFICIALE DEL GIOCO: niente apostrofi, spazi, trattini o cifre.
 * Le voci di dizionario che li contengono (es. "tutt'e", "l'amico", "po'")
 * sono ESCLUSE dal gioco: non vengono mai scelte come parola base né accettate
 * come mosse. Motivo: la catena di mutazioni (distanza 1) non funziona con
 * parole "sporche" e la partita si blocca.
 * La stessa regola è applicata in db/export-dicts.mjs, db/import-*-dict.mjs e
 * nelle query di selezione (backend/src/db/wordQueries.js).
 *
 * @module backend/src/utils/normalizza
 */

/**
 * Espressione regolare del charset di gioco: SOLO lettere.
 * Include a-z, le accentate italiane (àèéìòù) e i prestiti consolidati
 * (j, k, w, x, y: wifi, weekend, jazz, kiwi, yogurt, xilofono...).
 * NON ammette apostrofi, spazi, trattini, cifre o altri simboli.
 */
export const RE_SOLO_LETTERE = /^[a-zàèéìòùjkwxy]+$/;

/**
 * La stessa regola di {@link RE_SOLO_LETTERE} come STRINGA, per l'operatore
 * regex di PostgreSQL (`word ~ $1`) usato nelle query di selezione.
 * Va tenuta allineata a RE_SOLO_LETTERE (c'è un test che lo verifica).
 */
export const PATTERN_SQL_SOLO_LETTERE = '^[a-zàèéìòùjkwxy]+$';

/**
 * Normalizza una stringa di input: lowercase + trim.
 *
 * @param {string} input - input utente grezzo
 * @returns {string} input normalizzato
 */
export function normalizzaBase(input) {
  if (typeof input !== 'string') return '';
  return input.toLowerCase().trim();
}

/**
 * true se la stringa contiene SOLO lettere ammesse dal gioco
 * (niente apostrofi, spazi, cifre o simboli).
 *
 * @param {string} parola
 * @returns {boolean}
 */
export function soloLettere(parola) {
  return typeof parola === 'string' && RE_SOLO_LETTERE.test(parola);
}

/**
 * Verifica se una parola è valida per il gioco:
 * - Solo lettere italiane (a-z + accenti + prestiti j, k, w, x, y)
 * - Lunghezza entro [min, max]
 *
 * Ritorna un oggetto con:
 *   - valida: boolean
 *   - motivo: string|null (motivo di rifiuto, null se valida)
 *   - normalizzata: string (versione normalizzata)
 *
 * @param {string} input - parola da validare
 * @param {number} min - lunghezza minima (inclusa)
 * @param {number} max - lunghezza massima (inclusa)
 * @returns {{valida: boolean, motivo: string|null, normalizzata: string}}
 */
export function validaParola(input, min, max) {
  const normalizzata = normalizzaBase(input);

  if (!normalizzata) {
    return { valida: false, motivo: 'parola_vuota', normalizzata: '' };
  }

  if (normalizzata.length < min) {
    return { valida: false, motivo: 'troppo_corta', normalizzata };
  }

  if (normalizzata.length > max) {
    return { valida: false, motivo: 'troppo_lunga', normalizzata };
  }

  if (!RE_SOLO_LETTERE.test(normalizzata)) {
    return { valida: false, motivo: 'caratteri_non_validi', normalizzata };
  }

  return { valida: true, motivo: null, normalizzata };
}
