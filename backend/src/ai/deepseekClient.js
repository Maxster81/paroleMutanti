/**
 * deepseekClient.js — Wrapper per l'API DeepSeek
 *
 * Espone `verificaParolaAI(parola)` che chiede a DeepSeek se una parola
 * è italiana valida. Risposta normalizzata: `YES` → valida, `NO` → non valida.
 *
 * Basato sul benchmark del 2026-08-15:
 * - Latenza media: ~343ms
 * - p95: ~980ms (prima chiamata cold start)
 * - Timeout: 1500ms (sicuro + margine)
 *
 * Allineato alla Chat Completions API DeepSeek (reference 2026-11):
 * - `thinking` è **attivo di default**: qui va disabilitato esplicitamente,
 *   altrimenti il budget di `max_tokens` finisce in catena di pensiero
 *   (`finish_reason: "length"`, `content` vuoto) e `temperature` è inefficace.
 * - `stop` chiude la generazione appena il modello risponde (meno token, meno
 *   rischio di preamboli).
 * - `finish_reason` diverso da `stop` NON è un "NO": è un errore transitorio.
 *
 * @module backend/src/ai/deepseekClient
 */

import { config } from '../config.js';
import { logger } from '../logger.js';

const TIMEOUT_MS = 1500; // basato su benchmark
const MAX_RETRIES = 1;

// YES/NO è 1 token: 8 lascia margine a eventuali prefissi senza rischiare il
// troncamento (con 4 un preambolo produce content vuoto / 'length').
const MAX_TOKENS = 8;
const STOP_SEQUENCES = ['\n', '.', ',', ';'];

const RISPOSTE_VALIDE = new Set(['yes', 'sì', 'si']);
const RISPOSTE_NON_VALIDE = new Set(['no']);

/**
 * Costruisce il prompt per chiedere se una parola è italiana valida.
 *
 * @param {string} parola
 * @returns {object[]} array messaggi OpenAI-compatibili
 */
function buildPrompt(parola) {
  return [
    {
      role: 'system',
      content: 'Sei un lessicografo italiano. Rispondi solo "YES" o "NO" in maiuscolo, senza altre parole.',
    },
    {
      role: 'user',
      content: `La parola "${parola}" esiste nella lingua italiana (come lemma o come forma flessa corretta)? Rispondi solo YES o NO.`,
    },
  ];
}

/**
 * Interpreta il testo restituito dal modello.
 *
 * Tollerante su punteggiatura e su un eventuale seguito ("Sì, esiste"): conta
 * la PRIMA parola. In questo modo non si rischia di rifiutare una parola valida
 * solo perché il modello ha aggiunto una virgola.
 *
 * @param {string|null|undefined} testo
 * @returns {boolean|null} true=valida, false=non valida, null=non interpretabile
 */
function interpretaRisposta(testo) {
  const primaParola = String(testo ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ') // punteggiatura/numeri → spazio (unicode-safe)
    .trim()
    .split(/\s+/)[0];

  if (!primaParola) return null;
  if (RISPOSTE_VALIDE.has(primaParola)) return true;
  if (RISPOSTE_NON_VALIDE.has(primaParola)) return false;
  return null;
}

/**
 * Esegue una singola chiamata API a DeepSeek.
 *
 * @param {string} parola
 * @returns {Promise<{valida: boolean, risposta: string, durataMs: number, tokens: object|null}>}
 */
async function chiamaDeepSeek(parola) {
  const inizio = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(config.deepseek.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: buildPrompt(parola),
        // Thinking mode OFF: risposta secca, latenza bassa, temperature efficace.
        thinking: { type: 'disabled' },
        max_tokens: MAX_TOKENS,
        temperature: 0,
        stop: STOP_SEQUENCES,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durataMs = Date.now() - inizio;

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0] ?? null;
    const finishReason = choice?.finish_reason ?? null;

    // Solo `stop` garantisce che il contenuto sia la risposta completa.
    // `length` (budget esaurito), `content_filter`, `insufficient_system_resource`
    // e `aborted` non significano "parola non valida": vanno trattati come
    // errore transitorio (e ritentati), mai come un NO silenzioso.
    if (finishReason !== 'stop') {
      throw new Error(`risposta_non_completa (finish_reason=${finishReason ?? 'assente'})`);
    }

    const testoRisposta = (choice?.message?.content ?? '').trim();
    const interpretazione = interpretaRisposta(testoRisposta);

    // Risposta illeggibile → errore esplicito, NON "parola non valida".
    if (interpretazione === null) {
      throw new Error(`risposta_non_riconosciuta: "${testoRisposta.slice(0, 40)}"`);
    }

    const usage = data.usage ?? {};

    return {
      valida: interpretazione,
      risposta: testoRisposta.toUpperCase(),
      durataMs,
      tokens: {
        prompt: usage.prompt_tokens ?? null,
        completion: usage.completion_tokens ?? null,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    const durataMs = Date.now() - inizio;
    if (err.name === 'AbortError') {
      throw new Error(`Timeout dopo ${TIMEOUT_MS}ms`);
    }
    throw new Error(`Errore DeepSeek: ${err.message} (durata ${durataMs}ms)`);
  }
}

/**
 * Verifica se una parola è italiana valida tramite DeepSeek.
 * Con retry 1 volta in caso di errore transitorio (timeout, 5xx, risposta incompleta).
 *
 * @param {string} parola - parola da verificare (già normalizzata lowercase)
 * @returns {Promise<{valida: boolean, risposta: string, durataMs: number, errore: string|null}>}
 */
export async function verificaParolaAI(parola) {
  if (!config.deepseek.enabled) {
    return { valida: false, risposta: '', durataMs: 0, errore: 'ai_disabilitata' };
  }
  if (!config.deepseek.apiKey || config.deepseek.apiKey.startsWith('sk-INSERISCI')) {
    logger.warn('ai_chiamata_skipped_no_api_key');
    return { valida: false, risposta: '', durataMs: 0, errore: 'no_api_key' };
  }

  let ultimoErrore = null;
  for (let tentativo = 0; tentativo <= MAX_RETRIES; tentativo++) {
    try {
      const r = await chiamaDeepSeek(parola);
      logger.info('ai_validation_completed', {
        durataMs: r.durataMs,
        valida: r.valida,
        tentativo: tentativo + 1,
        tokens_prompt: r.tokens?.prompt ?? null,
        tokens_completion: r.tokens?.completion ?? null,
      });
      return { valida: r.valida, risposta: r.risposta, durataMs: r.durataMs, errore: null };
    } catch (err) {
      ultimoErrore = err;
      logger.warn('ai_validation_failed', {
        errore: err.message,
        tentativo: tentativo + 1,
      });
      if (tentativo < MAX_RETRIES) {
        // Aspetta un po' prima del retry
        await new Promise((res) => setTimeout(res, 300));
      }
    }
  }

  return {
    valida: false,
    risposta: '',
    durataMs: 0,
    errore: ultimoErrore?.message ?? 'errore_sconosciuto',
  };
}
