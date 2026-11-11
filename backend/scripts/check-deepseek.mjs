/**
 * check-deepseek.mjs — Verifica la configurazione DeepSeek del fallback AI
 *
 * Fa due cose, in ordine:
 *   1. `GET /v1/models`: elenca i modelli disponibili per la chiave e controlla
 *      se `DEEPSEEK_MODEL` è un nome valido.
 *   2. (solo con `--live`) due chiamate reali con lo STESSO body usato da
 *      `backend/src/ai/deepseekClient.js` (thinking disabilitato, stop, ecc.):
 *      una parola italiana valida e una senza senso, per vedere `content`,
 *      `finish_reason`, latenza e token.
 *
 * Perché serve: un errore HTTP sul fallback AI viene interpretato dal gioco come
 * "parola non valida" (Validator → `ai_errore`), quindi un modello ritirato o un
 * body non più valido degrada il gioco in modo silenzioso.
 *
 * Uso (in locale, con `.env` valorizzato):
 *   node backend/scripts/check-deepseek.mjs
 *   node backend/scripts/check-deepseek.mjs --live
 *
 * Uso nel container (dove ci sono le dipendenze di produzione):
 *   docker compose exec app node backend/scripts/check-deepseek.mjs --live
 *
 * Exit code: 0 = ok, 1 = configurazione/chiave/API non utilizzabile.
 */

import 'dotenv/config';

const LIVE = process.argv.slice(2).includes('--live');

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const MODELLO_RICHIESTO = (process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim().toLowerCase();

// Deve restare allineato a `backend/src/config.js` (MODELLI_DEEPSEEK_VALIDI +
// ALIAS_MODELLI_DEEPSEEK). Qui NON rimappiamo: vogliamo verificare anche il
// nome grezzo scritto nel `.env`.
const MODELLI_VALIDI = ['deepseek-flash', 'deepseek-v4-pro'];
const ALIAS_RITIRATI = {
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-flash',
};

// Stessi parametri del client di gioco.
const TIMEOUT_MS = 1500;
const MAX_TOKENS = 8;
const STOP_SEQUENCES = ['\n', '.', ',', ';'];

const SISTEMA = 'Sei un lessicografo italiano. Rispondi solo "YES" o "NO" in maiuscolo, senza altre parole.';

if (!API_KEY || API_KEY.startsWith('sk-INSERISCI')) {
  console.error('❌ DEEPSEEK_API_KEY mancante o placeholder: il fallback AI è disattivato.');
  process.exit(1);
}

const ORIGIN = new URL(API_URL).origin;

/** Chiamata HTTP con timeout → { status, ok, json, testo }. */
async function richiesta(url, opzioni = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...opzioni, signal: controller.signal });
    const testo = await response.text().catch(() => '');
    let json = null;
    try {
      json = JSON.parse(testo);
    } catch {
      // risposta non JSON: resta disponibile il testo
    }
    return { status: response.status, ok: response.ok, json, testo };
  } finally {
    clearTimeout(timer);
  }
}

/** GET dei modelli: prova /v1/models e, se 404, /models. */
async function listaModelli() {
  for (const path of ['/v1/models', '/models']) {
    const r = await richiesta(`${ORIGIN}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) {
      const ids = (r.json?.data ?? []).map((m) => m.id).filter(Boolean);
      return { ok: true, path, ids };
    }
    if (r.status !== 404) {
      return { ok: false, path, status: r.status, testo: r.testo };
    }
  }
  return { ok: false, path: null, status: 404, testo: 'nessun endpoint /models trovato' };
}

/** Una chiamata chat con il body del gioco, per un modello e una parola dati. */
async function chiamataLive(modello, parola) {
  const inizio = Date.now();
  const r = await richiesta(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: modello,
      messages: [
        { role: 'system', content: SISTEMA },
        {
          role: 'user',
          content: `La parola "${parola}" esiste nella lingua italiana (come lemma o come forma flessa corretta)? Rispondi solo YES o NO.`,
        },
      ],
      thinking: { type: 'disabled' },
      max_tokens: MAX_TOKENS,
      temperature: 0,
      stop: STOP_SEQUENCES,
      stream: false,
    }),
  });
  const durataMs = Date.now() - inizio;

  if (!r.ok) {
    return { ok: false, modello, parola, durataMs, status: r.status, errore: r.testo.slice(0, 300) };
  }

  const choice = r.json?.choices?.[0] ?? null;
  return {
    ok: true,
    modello,
    parola,
    durataMs,
    finish_reason: choice?.finish_reason ?? null,
    content: (choice?.message?.content ?? '').trim(),
    tokens_prompt: r.json?.usage?.prompt_tokens ?? null,
    tokens_completion: r.json?.usage?.completion_tokens ?? null,
  };
}

/** Stampa l'esito di una chiamata live e ritorna true se è pulito. */
function stampaEsito(esito) {
  if (!esito.ok) {
    console.log(`   ❌ [${esito.parola}] HTTP ${esito.status} (${esito.durataMs}ms): ${esito.errore}`);
    return false;
  }
  const problemi = [];
  if (esito.finish_reason !== 'stop') problemi.push(`finish_reason=${esito.finish_reason}`);
  if (!/^(yes|no|sì|si)$/i.test(esito.content)) problemi.push(`content non interpretabile ("${esito.content}")`);

  const icona = problemi.length === 0 ? '✅' : '⚠️';
  console.log(
    `   ${icona} [${esito.parola}] "${esito.content}" · finish_reason=${esito.finish_reason} · ` +
      `${esito.durataMs}ms · token in/out=${esito.tokens_prompt}/${esito.tokens_completion}`,
  );
  if (problemi.length > 0) console.log(`      ⚠️  ${problemi.join(' · ')}`);
  return problemi.length === 0;
}

async function main() {
  let problemi = 0;

  console.log('🔎 Verifica configurazione DeepSeek');
  console.log(`   Endpoint: ${API_URL}`);
  console.log(`   Modello nel .env: ${MODELLO_RICHIESTO}`);
  console.log(
    `   Body: thinking=disabled · max_tokens=${MAX_TOKENS} · temperature=0 · stop=${JSON.stringify(STOP_SEQUENCES)}`,
  );
  console.log('');

  // --- 1. Modelli disponibili -------------------------------------------------
  console.log('1️⃣  Modelli disponibili per questa chiave');

  let modelli;
  try {
    modelli = await listaModelli();
  } catch (err) {
    console.log(`   ❌ Richiesta fallita: ${err.message}`);
    process.exit(1);
  }

  if (!modelli.ok) {
    console.log(`   ❌ HTTP ${modelli.status} su ${modelli.path ?? '/models'}: ${modelli.testo.slice(0, 300)}`);
    console.log('   → Chiave non valida, saldo esaurito o endpoint errato.');
    process.exit(1);
  }

  console.log(`   Risposta da ${modelli.path}: ${modelli.ids.length} modelli`);
  for (const id of modelli.ids) console.log(`   - ${id}`);

  const alias = ALIAS_RITIRATI[MODELLO_RICHIESTO] ?? null;
  const modelloEffettivo = alias ?? MODELLO_RICHIESTO;

  if (modelli.ids.includes(MODELLO_RICHIESTO)) {
    console.log(`   ✅ "${MODELLO_RICHIESTO}" è tra i modelli disponibili`);
  } else if (alias) {
    console.log(
      `   ⚠️  "${MODELLO_RICHIESTO}" è un alias ritirato e non compare nella lista; ` +
        `config.js lo rimappa su "${alias}".`,
    );
    console.log(`      Aggiorna il .env → DEEPSEEK_MODEL=${alias}`);
    problemi++;
  } else {
    console.log(`   ⚠️  "${MODELLO_RICHIESTO}" NON compare nella lista: verifica il nome nel .env`);
    if (!MODELLI_VALIDI.includes(MODELLO_RICHIESTO)) problemi++;
  }

  console.log('');

  // --- 2. Chiamate reali (opzionale) -----------------------------------------
  if (!LIVE) {
    console.log('2️⃣  Chiamate reali: saltate (usa --live per eseguirle)');
    console.log('');
    console.log(problemi === 0 ? '✅ Configurazione coerente (senza chiamate live).' : `⚠️  ${problemi} avviso/i da sistemare.`);
    process.exit(problemi === 0 ? 0 : 1);
  }

  console.log('2️⃣  Chiamate reali con il body del gioco');
  try {
    console.log(`   Modello effettivo: ${modelloEffettivo}`);
    // Parola valida → attesa YES; parola senza senso → attesa NO.
    for (const parola of ['smartphone', 'xyzqwe']) {
      if (!stampaEsito(await chiamataLive(modelloEffettivo, parola))) problemi++;
    }

    // Se il .env contiene un alias ritirato, verifichiamo ANCHE quello: è la
    // domanda chiave ("l'alias funziona ancora?").
    if (alias) {
      console.log(`   Alias ritirato nel .env: ${MODELLO_RICHIESTO} (verifica di compatibilità)`);
      const esito = await chiamataLive(MODELLO_RICHIESTO, 'smartphone');
      if (stampaEsito(esito)) {
        console.log(`      ℹ️  L'alias risponde ancora, ma conviene passare a ${alias}.`);
      } else {
        console.log(
          `      ⚠️  L'alias NON è utilizzabile: senza la rimappatura di config.js il fallback AI fallirebbe.`,
        );
        problemi++;
      }
    }
  } catch (err) {
    console.log(`   ❌ Chiamata fallita: ${err.message}`);
    process.exit(1);
  }

  console.log('');
  console.log(
    problemi === 0
      ? '✅ Verifica completata: fallback AI operativo.'
      : `⚠️  Verifica completata con ${problemi} problema/i.`,
  );
  process.exit(problemi === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Errore fatale:', err);
  process.exit(1);
});
