/**
 * normalizza.js — Funzioni di normalizzazione e validazione stringhe/parole
 *
 * Usato dal Validator per preparare la parola prima della validazione.
 * - lowercase + trim
 * - charset italiano (lettere a-z esclusa jkwxy, accentate, apostrofo)
 * - lunghezza entro range
 *
 * @module backend/src/utils/normalizza
 */

/**
 * Espressione regolare per lettere italiane.
 * - Lettere base: a-z
 * - Escluse lettere straniere comuni: j, k, w, x, y (rarissime/assenti in italiano)
 * - Accenti italiani: à, è, é, ì, ò, ù
 */
const RE_CHARSET_ITALIANO = /^[a-zàèéìòù]+$/;

/**
 * Espressione regolare per lettere italiane con apostrofo opzionale.
 * Accettiamo l'apostrofo per casi tipo "c'e'" (rari).
 */
const RE_CHARSET_CON_APOSTROFO = /^[a-zàèéìòù']+$/;

/**
 * Lettere straniere da rifiutare (non appartengono all'italiano standard).
 */
const RE_LETTERE_STRANIERE = /[jkwxy]/;

/**
 * Normalizza una stringa di input: lowercase, trim, no caratteri strani.
 *
 * @param {string} input - input utente grezzo
 * @returns {string} input normalizzato
 */
export function normalizzaBase(input) {
  if (typeof input !== 'string') return '';
  return input.toLowerCase().trim();
}

/**
 * Verifica se una parola è valida per il gioco:
 * - Solo lettere italiane (a-z + accenti) o lettere + apostrofo
 * - Esclude lettere straniere (j, k, w, x, y)
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

  // Rifiuta lettere straniere (j, k, w, x, y) prima del check charset generico
  if (RE_LETTERE_STRANIERE.test(normalizzata)) {
    return { valida: false, motivo: 'caratteri_non_validi', normalizzata };
  }

  if (!RE_CHARSET_ITALIANO.test(normalizzata) && !RE_CHARSET_CON_APOSTROFO.test(normalizzata)) {
    return { valida: false, motivo: 'caratteri_non_validi', normalizzata };
  }

  return { valida: true, motivo: null, normalizzata };
}
