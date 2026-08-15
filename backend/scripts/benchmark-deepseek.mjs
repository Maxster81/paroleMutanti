/**
 * benchmark-deepseek.mjs — Misura latenza reale delle chiamate DeepSeek
 *
 * Esegue N chiamate con prompt simile a quello di gioco e misura:
 * - media, mediana, min, max
 * - p50, p95, p99
 * - tassi di successo/errore/timeout
 *
 * Salva risultati in `backend/scripts/benchmark-result.json` per analisi.
 *
 * Uso: node backend/scripts/benchmark-deepseek.mjs [--n=50] [--word=parola]
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Argomenti CLI
const args = process.argv.slice(2);
const argMap = {};
for (const arg of args) {
  const match = arg.match(/^--([^=]+)=(.+)$/);
  if (match) argMap[match[1]] = match[2];
}

const N = parseInt(argMap.n || '50', 10);
const PAROLA_TEST = argMap.word || 'smartphone';
const TIMEOUT_MS = parseInt(argMap.timeout || '10000', 10);

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

if (!API_KEY || API_KEY.startsWith('sk-INSERISCI')) {
  console.error('❌ DEEPSEEK_API_KEY mancante o placeholder in .env');
  process.exit(1);
}

console.log(`🔬 Benchmark DeepSeek API`);
console.log(`   N chiamate: ${N}`);
console.log(`   Parola test: ${PAROLA_TEST}`);
console.log(`   Timeout per chiamata: ${TIMEOUT_MS}ms`);
console.log(`   URL: ${API_URL}`);
console.log(`   Modello: ${MODEL}`);
console.log('');

/**
 * Esegue una singola chiamata DeepSeek e misura il tempo.
 * Ritorna { durataMs, valida, errore }.
 */
async function singolaChiamata(parola) {
  const inizio = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'Sei un assistente che risponde solo YES o NO.',
          },
          {
            role: 'user',
            content: `La parola italiana "${parola}" esiste come parola di senso compiuto? Rispondi solo YES o NO.`,
          },
        ],
        max_tokens: 4,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durataMs = Date.now() - inizio;

    if (!response.ok) {
      return { durataMs, valida: null, errore: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const testoRisposta = data.choices?.[0]?.message?.content?.trim().toUpperCase() ?? '';
    const valida = testoRisposta === 'YES';

    return { durataMs, valida, errore: null, risposta: testoRisposta };
  } catch (err) {
    const durataMs = Date.now() - inizio;
    if (err.name === 'AbortError') {
      return { durataMs, valida: null, errore: 'timeout' };
    }
    return { durataMs, valida: null, errore: err.message };
  }
}

async function main() {
  const risultati = [];
  const inizio = Date.now();

  for (let i = 0; i < N; i++) {
    process.stdout.write(`\r[${i + 1}/${N}] Chiamata in corso...`);
    const r = await singolaChiamata(PAROLA_TEST);
    risultati.push(r);
    if (r.errore) {
      console.log(`\n[${i + 1}/${N}] ❌ ${r.errore} (${r.durataMs}ms)`);
    } else {
      const icona = r.valida ? '✅' : '❌';
      console.log(`[${i + 1}/${N}] ${icona} ${r.risposta} (${r.durataMs}ms)`);
    }
    // Pausa piccola per non sovraccaricare l'API
    if (i < N - 1) await new Promise((r) => setTimeout(r, 100));
  }

  const durataTotale = Date.now() - inizio;

  // Statistiche
  const ok = risultati.filter((r) => !r.errore);
  const errori = risultati.filter((r) => r.errore);
  const tempi = ok.map((r) => r.durataMs).sort((a, b) => a - b);

  const stat = {
    n_richieste: N,
    n_successi: ok.length,
    n_errori: errori.length,
    errori_dettaglio: errori.reduce((acc, r) => {
      acc[r.errore] = (acc[r.errore] || 0) + 1;
      return acc;
    }, {}),
    durata_totale_ms: durataTotale,
    parola_test: PAROLA_TEST,
    timeout_ms: TIMEOUT_MS,
    timestamp: new Date().toISOString(),
    latenze: tempi.length > 0 ? {
      min_ms: tempi[0],
      max_ms: tempi[tempi.length - 1],
      media_ms: Math.round(tempi.reduce((a, b) => a + b, 0) / tempi.length),
      mediana_ms: tempi[Math.floor(tempi.length / 2)],
      p95_ms: tempi[Math.floor(tempi.length * 0.95)] ?? tempi[tempi.length - 1],
      p99_ms: tempi[Math.floor(tempi.length * 0.99)] ?? tempi[tempi.length - 1],
    } : null,
    risultati_validita: ok.reduce((acc, r) => {
      const k = r.valida ? 'YES' : 'NO';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };

  // Stampa summary
  console.log('');
  console.log('='.repeat(60));
  console.log('📊 RISULTATI BENCHMARK');
  console.log('='.repeat(60));
  console.log(`Successi: ${stat.n_successi}/${stat.n_richieste}`);
  console.log(`Errori:   ${stat.n_errori} (${Object.entries(stat.errori_dettaglio).map(([k, v]) => `${k}=${v}`).join(', ') || 'nessuno'})`);
  if (stat.latenze) {
    console.log('');
    console.log('Latenze (ms):');
    console.log(`  min:    ${stat.latenze.min_ms}`);
    console.log(`  media:  ${stat.latenze.media_ms}`);
    console.log(`  median: ${stat.latenze.mediana_ms}`);
    console.log(`  p95:    ${stat.latenze.p95_ms}`);
    console.log(`  p99:    ${stat.latenze.p99_ms}`);
    console.log(`  max:    ${stat.latenze.max_ms}`);
  }
  console.log('');
  console.log('Risposte:', stat.risultati_validita);

  // Raccomandazione timeout
  if (stat.latenze) {
    const raccomandato = Math.max(
      Math.ceil(stat.latenze.p95 * 1.5),  // p95 con margine 50%
      1500,                                // minimo ragionevole
      Math.min(TIMEOUT_MS, stat.latenze.max_ms + 500)
    );
    console.log('');
    console.log(`💡 TIMEOUT RACCOMANDATO: ${raccomandato}ms`);
    console.log(`   (basato su p95=${stat.latenze.p95}ms × 1.5, minimo 1500ms)`);
  }

  // Salva JSON
  const outputPath = join(__dirname, 'benchmark-result.json');
  await writeFile(outputPath, JSON.stringify(stat, null, 2));
  console.log('');
  console.log(`📁 Risultati salvati in: ${outputPath}`);
}

main().catch((err) => {
  console.error('❌ Errore fatale:', err);
  process.exit(1);
});
