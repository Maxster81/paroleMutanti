/**
 * experiment-logprobs.mjs — Esperimento: confidenza del verdetto via `logprobs`
 *
 * Domanda: la distribuzione del PRIMO token generato (logprobs/top_logprobs)
 * separa i casi "sicuro" dai casi "incerto" abbastanza da giustificare una
 * soglia di confidenza nel fallback AI?
 *
 * Metodo:
 *   1. per ogni parola di un dataset etichettato (valida / non valida) fa UNA
 *      chiamata con `max_tokens: 1`, `temperature: 0`, `logprobs: true` e
 *      `top_logprobs: 20` — stesso prompt e stesso `thinking: disabled` del
 *      client di gioco;
 *   2. legge P(YES), P(NO), P(altro) dai top token e il verdetto effettivo;
 *   3. misura la **consistenza**: N chiamate a `temperature: 1` e confronto con
 *      il verdetto deterministico (se il modello è incerto, a temp 1 "flippa");
 *   4. stampa tabella, accuratezza e la soglia che meglio separa i corretti
 *      dagli scorretti; salva tutto in `backend/scripts/logprobs-result.json`.
 *
 * Uso (nel container, così non serve Node né .env sull'host):
 *   docker compose exec app node backend/scripts/experiment-logprobs.mjs
 *   docker compose exec app node backend/scripts/experiment-logprobs.mjs --samples=3 --debug
 *
 * Opzioni:
 *   --samples=N   chiamate extra a temperature 1 per la consistenza (default 2, 0 = salta)
 *   --debug       stampa i top token grezzi (utile per capire la tokenizzazione di YES/NO)
 *   --no-save     non scrive il JSON dei risultati
 *
 * Costo: ~26 parole × (1 + samples) chiamate, output 1 token → frazioni di centesimo.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Argomenti CLI -----------------------------------------------------------
const args = process.argv.slice(2);
const argMap = {};
for (const arg of args) {
  const m = arg.match(/^--([^=]+)=(.+)$/);
  if (m) argMap[m[1]] = m[2];
}
const SAMPLES = Math.max(0, parseInt(argMap.samples ?? '2', 10) || 0);
const DEBUG = args.includes('--debug');
const SALVA = !args.includes('--no-save');

// --- Configurazione ----------------------------------------------------------
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const MODELLO_RICHIESTO = (process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim().toLowerCase();

// Allineato a backend/src/config.js: gli alias ritirati sono rimappati.
const ALIAS = { 'deepseek-chat': 'deepseek-flash', 'deepseek-reasoner': 'deepseek-flash' };
const MODEL = ALIAS[MODELLO_RICHIESTO] ?? MODELLO_RICHIESTO;

const TIMEOUT_MS = 5000; // l'esperimento non ha bisogno del timeout di gioco
const TOP_LOGPROBS = 20;

// --- Dataset etichettato -----------------------------------------------------
// `atteso`: 'valida' | 'non_valida'
// Le parole "difficili" sono forme flesse/derivate reali che un LLM tende a
// sbagliare (è il caso storico `oziata`/`oziati`): se la confidenza funziona,
// dovrebbero avere margine basso e finire in "zona incerta", non essere decise.
const DATASET = [
  // Chiaramente valide
  { parola: 'cane', atteso: 'valida' },
  { parola: 'casa', atteso: 'valida' },
  { parola: 'libro', atteso: 'valida' },
  { parola: 'mangiare', atteso: 'valida' },
  { parola: 'veloce', atteso: 'valida' },
  { parola: 'montagna', atteso: 'valida' },
  { parola: 'bicchiere', atteso: 'valida' },
  { parola: 'speranza', atteso: 'valida' },

  // Valide ma "difficili" (forme flesse/derivate rare)
  { parola: 'oziata', atteso: 'valida', nota: 'caso storico falso negativo' },
  { parola: 'oziati', atteso: 'valida', nota: 'caso storico falso negativo' },
  { parola: 'abbrustolita', atteso: 'valida' },
  { parola: 'innaffiata', atteso: 'valida' },
  { parola: 'sopravvissuta', atteso: 'valida' },
  { parola: 'rintontita', atteso: 'valida' },
  { parola: 'scalcagnata', atteso: 'valida' },

  // Non valide (mutazioni plausibili / refusi / non-italiane)
  { parola: 'xyzqwe', atteso: 'non_valida' },
  { parola: 'casaz', atteso: 'non_valida' },
  { parola: 'libroo', atteso: 'non_valida' },
  { parola: 'libru', atteso: 'non_valida' },
  { parola: 'mangiaree', atteso: 'non_valida' },
  { parola: 'montagnya', atteso: 'non_valida' },
  { parola: 'bicchierr', atteso: 'non_valida' },
  { parola: 'speranzza', atteso: 'non_valida' },
  { parola: 'libbro', atteso: 'non_valida', nota: 'refuso comune di libro' },
  { parola: 'oziatoq', atteso: 'non_valida' },
];

// --- Prompt identico al client di gioco --------------------------------------
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

/** Chiamata con timeout → { ok, status, json, testo }. */
async function richiesta(parola, temperatura) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildPrompt(parola),
        thinking: { type: 'disabled' },
        // 1 token: la distribuzione del PRIMO token è dove sta YES/NO.
        max_tokens: 1,
        temperature: temperatura,
        logprobs: true,
        top_logprobs: TOP_LOGPROBS,
        stream: false,
      }),
      signal: controller.signal,
    });
    const testo = await response.text().catch(() => '');
    let json = null;
    try {
      json = JSON.parse(testo);
    } catch {
      // non JSON
    }
    return { ok: response.ok, status: response.status, json, testo };
  } finally {
    clearTimeout(timer);
  }
}

/** Classifica un token (anche con spazi/punteggiatura) in yes/no/altro. */
function classificaToken(token) {
  const t = String(token ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '');
  if (['yes', 'sì', 'si'].includes(t)) return 'yes';
  if (t === 'no') return 'no';
  return 'altro';
}

/**
 * Estrae la distribuzione del primo token.
 * @returns {{verdetto:'yes'|'no'|'altro', pYes:number|null, pNo:number|null,
 *            pAltro:number, token:string, top:Array<{token:string,p:number}>} | null}
 */
function leggiDistribuzione(json) {
  const choice = json?.choices?.[0];
  const voce = choice?.logprobs?.content?.[0];
  if (!voce) return null;

  const top = (voce.top_logprobs ?? []).map((c) => ({
    token: c.token,
    p: Math.exp(c.logprob),
  }));

  let pYes = 0;
  let pNo = 0;
  let pAltro = 0;
  for (const c of top) {
    const classe = classificaToken(c.token);
    if (classe === 'yes') pYes += c.p;
    else if (classe === 'no') pNo += c.p;
    else pAltro += c.p;
  }

  // Normalizza tra YES e NO: la massa "altro" (token di preambolo) non deve
  // falsare la lettura, ma la riportiamo a parte.
  const denom = pYes + pNo;
  const pYesN = denom > 0 ? pYes / denom : null;
  const pNoN = denom > 0 ? pNo / denom : null;

  return {
    verdetto: classificaToken(voce.token),
    token: voce.token,
    pYes: pYesN,
    pNo: pNoN,
    pAltro,
    margine: denom > 0 ? Math.abs(pYesN - pNoN) : null,
    top,
  };
}

async function analizza(parola) {
  const r = await richiesta(parola, 0);
  if (!r.ok) return { errore: `HTTP ${r.status}: ${r.testo.slice(0, 200)}` };

  const dist = leggiDistribuzione(r.json);
  if (!dist) return { errore: 'logprobs assenti nella risposta' };

  // Consistenza: N campioni a temperature 1, conto i verdetti uguali a quello a temp 0.
  let accordi = 0;
  const campioni = [];
  for (let i = 0; i < SAMPLES; i++) {
    const s = await richiesta(parola, 1);
    if (!s.ok) continue;
    const d = leggiDistribuzione(s.json);
    if (!d) continue;
    campioni.push(classificaToken(d.token));
    if (campioni[campioni.length - 1] === dist.verdetto) accordi++;
  }

  return {
    ...dist,
    campioni,
    accordo: campioni.length > 0 ? accordi / campioni.length : null,
  };
}

function formatP(x) {
  return x === null || x === undefined ? '  n/a' : x.toFixed(3);
}

async function main() {
  if (!API_KEY || API_KEY.startsWith('sk-INSERISCI')) {
    console.error('❌ DEEPSEEK_API_KEY mancante o placeholder.');
    process.exit(1);
  }

  // Preflight: senza chiave/saldo validi non ha senso fare 26+ chiamate.
  const preflight = await richiesta('cane', 0);
  if (!preflight.ok) {
    console.error(`❌ API non utilizzabile (HTTP ${preflight.status}): ${preflight.testo.slice(0, 300)}`);
    process.exit(1);
  }

  console.log('🧪 Esperimento logprobs — confidenza del verdetto DeepSeek');
  console.log(`   Modello: ${MODEL} (dal .env: ${MODELLO_RICHIESTO})`);
  console.log(`   Parole: ${DATASET.length} · campioni di consistenza per parola: ${SAMPLES}`);
  console.log(`   Body: thinking=disabled · max_tokens=1 · temperature=0 · top_logprobs=${TOP_LOGPROBS}`);
  console.log('');

  const risultati = [];
  for (let i = 0; i < DATASET.length; i++) {
    const { parola, atteso, nota } = DATASET[i];
    // Con --debug le righe di dettaglio romperebbero la barra di avanzamento.
    if (!DEBUG) process.stdout.write(`\r[${i + 1}/${DATASET.length}] ${parola}…`.padEnd(40));

    const a = await analizza(parola);
    if (a.errore) {
      console.log(`\n❌ ${parola}: ${a.errore}`);
      risultati.push({ parola, atteso, errore: a.errore });
      continue;
    }

    const verdettoValido = a.verdetto === 'yes';
    const corretto = a.verdetto === 'altro' ? null : verdettoValido === (atteso === 'valida');

    risultati.push({
      parola,
      atteso,
      nota: nota ?? null,
      verdetto: a.verdetto,
      token: a.token,
      p_yes: a.pYes,
      p_no: a.pNo,
      margine: a.margine,
      accordo: a.accordo,
      corretto,
    });

    if (DEBUG) {
      console.log('');
      console.log(`   ${parola} · token="${a.token}" · verdetto=${a.verdetto} · margine=${formatP(a.margine)}`);
      console.log(
        '   top: ' +
          a.top
            .slice(0, 8)
            .map((c) => `"${c.token}"=${c.p.toFixed(3)}`)
            .join('  '),
      );
    }
  }
  if (!DEBUG) console.log('\r' + ' '.repeat(40) + '\r');

  // --- Tabella ---------------------------------------------------------------
  console.log('📋 RISULTATI PER PAROLA');
  console.log(
    '   ' +
      'parola'.padEnd(15) +
      'atteso'.padEnd(12) +
      'verdetto'.padEnd(10) +
      'P(YES)'.padEnd(9) +
      'P(NO)'.padEnd(9) +
      'margine'.padEnd(9) +
      'accordo',
  );
  for (const r of risultati) {
    if (r.errore) {
      console.log(`   ${r.parola.padEnd(15)}ERRORE: ${r.errore}`);
      continue;
    }
    const icona = r.corretto === false ? '❌' : r.corretto === true ? '✅' : '❔';
    console.log(
      `   ${icona} ${r.parola.padEnd(13)}` +
        `${r.atteso.padEnd(12)}` +
        `${r.verdetto.padEnd(10)}` +
        `${formatP(r.p_yes).padEnd(9)}` +
        `${formatP(r.p_no).padEnd(9)}` +
        `${formatP(r.margine).padEnd(9)}` +
        `${r.accordo === null ? '  n/a' : r.accordo.toFixed(2)}`,
    );
  }

  // --- Statistiche -----------------------------------------------------------
  const ok = risultati.filter((r) => !r.errore && r.verdetto !== 'altro');
  const corretti = ok.filter((r) => r.corretto === true);
  const scorretti = ok.filter((r) => r.corretto === false);
  const conMargine = ok.filter((r) => r.margine !== null);

  const media = (arr) =>
    arr.length === 0 ? null : arr.reduce((s, r) => s + r.margine, 0) / arr.length;

  console.log('');
  console.log('📊 SINTESI');
  console.log(`   Verdetti leggibili: ${ok.length}/${risultati.length} (il resto: token di preambolo o errore)`);
  console.log(`   Corretti: ${corretti.length} · Scorretti: ${scorretti.length}`);
  console.log(
    `   Accuratezza: ${ok.length ? ((corretti.length / ok.length) * 100).toFixed(1) : 'n/a'}% (sul dataset, non è una misura di produzione)`,
  );
  console.log(`   Margine medio sui corretti:   ${formatP(media(corretti))}`);
  console.log(`   Margine medio sugli scorretti: ${formatP(media(scorretti))}`);

  // Soglia che massimizza (corretti sopra soglia) - (scorretti sopra soglia)
  let migliore = null;
  for (let t = 0.5; t <= 0.999; t += 0.01) {
    const correttiSopra = conMargine.filter((r) => r.corretto === true && r.margine >= t).length;
    const scorrettiSopra = conMargine.filter((r) => r.corretto === false && r.margine >= t).length;
    const punteggio = correttiSopra - scorrettiSopra;
    if (!migliore || punteggio > migliore.punteggio) {
      migliore = { soglia: t, punteggio, correttiSopra, scorrettiSopra };
    }
  }
  if (migliore) {
    console.log('');
    console.log(`💡 Miglior soglia di confidenza: margine ≥ ${migliore.soglia.toFixed(2)}`);
    console.log(
      `   → ${migliore.correttiSopra}/${corretti.length} corretti "sicuri", ` +
        `${migliore.scorrettiSopra}/${scorretti.length} scorretti "sicuri" (idealmente 0).`,
    );
    console.log('   Sotto soglia si può trattare il caso come incerto (messaggio diverso, retry, ecc.).');
  }

  // Consistenza: parole che a temp 1 cambiano verdetto → segnale di incertezza.
  const instabili = ok.filter((r) => r.accordo !== null && r.accordo < 1);
  if (SAMPLES > 0) {
    console.log('');
    console.log(`🔁 Consistenza (${SAMPLES} campioni a temperature 1)`);
    if (instabili.length === 0) {
      console.log('   Nessuna parola ha cambiato verdetto: il modello è stabile su questo dataset.');
    } else {
      for (const r of instabili) {
        console.log(
          `   ⚠️  ${r.parola}: accordo ${r.accordo.toFixed(2)} · verdetto=${r.verdetto} · margine=${formatP(r.margine)}`,
        );
      }
    }
  }

  // --- Salvataggio -----------------------------------------------------------
  if (SALVA) {
    const out = {
      timestamp: new Date().toISOString(),
      modello: MODEL,
      max_tokens: 1,
      top_logprobs: TOP_LOGPROBS,
      samples_consistenza: SAMPLES,
      sintesi: {
        verdetti_leggibili: ok.length,
        corretti: corretti.length,
        scorretti: scorretti.length,
        margine_medio_corretti: media(corretti),
        margine_medio_scorretti: media(scorretti),
        soglia_suggerita: migliore?.soglia ?? null,
        instabili: instabili.map((r) => r.parola),
      },
      risultati,
    };
    const path = join(__dirname, 'logprobs-result.json');
    await writeFile(path, JSON.stringify(out, null, 2));
    console.log('');
    console.log(`📁 Risultati salvati in: ${path}`);
  }
}

// Esportate per i test unit (backend/tests/logprobs.test.js).
export { classificaToken, leggiDistribuzione };

// Esegue main() solo se lo script è lanciato direttamente (non quando importato).
const avviatoDirettamente =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (avviatoDirettamente) {
  main().catch((err) => {
    console.error('❌ Errore fatale:', err);
    process.exit(1);
  });
}
