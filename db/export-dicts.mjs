/**
 * export-dicts.mjs — Costruisce l'artefatto del dizionario per l'immagine Docker
 *
 * Scarica le due fonti validate (LibreOffice `it_IT.dic` e Hugging Face
 * `dictionary_sorted.json`), applica i filtri del gioco (lunghezza 3-10 lettere,
 * charset italiano), deduplica e scrive UN SOLO file compresso con una riga per
 * parola: `<parola>\t<source>`.
 *
 * Perché esiste: nella build Docker questo script gira nella STAGE `builder`
 * (dove la rete è disponibile) e il risultato (~2 MB) viene copiato
 * nell'immagine finale. Al primo avvio del container `db/seed-words.mjs` popola
 * la tabella `words` leggendo l'artefatto LOCALE: nessuna rete richiesta al
 * server, tempi bassi e risultato riproducibile.
 *
 * Uso:
 *   node db/export-dicts.mjs --out=dict/words.tsv.gz
 *   node db/export-dicts.mjs --sources=lo          # solo LibreOffice
 *
 * Variabili d'ambiente (alternative agli argomenti):
 *   DICT_OUT=dict/words.tsv.gz     percorso dell'artefatto
 *   DICT_SOURCES=lo,hf             fonti da usare
 *   DICT_MIN_LENGTH=3              lunghezza minima
 *   DICT_MAX_LENGTH=10             lunghezza massima
 *
 * Se una fonte fallisce viene loggato un WARNING e si prosegue con l'altra:
 * l'uscita è in errore solo se NESSUNA fonte produce parole.
 *
 * @module db/export-dicts
 */

import { writeFile, mkdir, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gzipAsync = promisify(gzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Fonti ufficiali (le stesse usate da db/import-lo-dict.mjs e db/import-hf-dict.mjs)
const LO_URL =
  'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/it_IT/it_IT.dic';
const HF_URL =
  'https://huggingface.co/datasets/mik3ml/italian-dictionary/resolve/main/dictionary_sorted.json';

// Charset: lettere italiane + prestiti consolidati (wifi, weekend, jazz, kiwi, yogurt)
const RE_CHARSET = /^[a-zàèéìòùjkwxy']+$/;

/** Parsing argomenti CLI nella forma --chiave=valore. */
const argomenti = {};
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.+)$/);
  if (match) argomenti[match[1]] = match[2];
}

const OUT = resolve(ROOT, argomenti.out || process.env.DICT_OUT || 'dict/words.tsv.gz');
const SORGENTI = String(argomenti.sources || process.env.DICT_SOURCES || 'lo,hf')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const MIN = parseInt(argomenti.min || process.env.DICT_MIN_LENGTH || '3', 10);
const MAX = parseInt(argomenti.max || process.env.DICT_MAX_LENGTH || '10', 10);

/**
 * Normalizza e filtra una parola grezza.
 *
 * @param {string} grezza - parola candidata
 * @returns {string|null} parola valida (lowercase) oppure null se scartata
 */
function valida(grezza) {
  if (!grezza || typeof grezza !== 'string') return null;
  const parola = grezza.toLowerCase().trim();
  if (parola.length < MIN || parola.length > MAX) return null;
  if (!RE_CHARSET.test(parola)) return null;
  return parola;
}

/**
 * Scarica un URL e ritorna il corpo come Buffer.
 *
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function scarica(url) {
  console.log(`[export-dicts] Download: ${url}`);
  const inizio = Date.now();
  const risposta = await fetch(url);
  if (!risposta.ok) {
    throw new Error(`HTTP ${risposta.status} ${risposta.statusText}`);
  }
  const buffer = Buffer.from(await risposta.arrayBuffer());
  const durata = ((Date.now() - inizio) / 1000).toFixed(1);
  console.log(
    `[export-dicts] Scaricati ${(buffer.length / 1024 / 1024).toFixed(2)} MB in ${durata}s`
  );
  return buffer;
}

/**
 * Estrae le parole dal dizionario LibreOffice (formato Hunspell/Myspell).
 * Le righe di commento iniziano con `/`; le flag morfologiche seguono
 * `parola/FLAG`.
 *
 * @returns {Promise<Set<string>>}
 */
async function paroleLibreOffice() {
  const buffer = await scarica(LO_URL);
  const set = new Set();
  let scartate = 0;
  for (const riga of buffer.toString('utf8').split('\n')) {
    const trimmed = riga.trim();
    if (!trimmed || trimmed.startsWith('/')) continue;
    const taglio = trimmed.indexOf('/');
    const senzaFlag = taglio === -1 ? trimmed : trimmed.substring(0, taglio);
    const parola = valida(senzaFlag);
    if (parola) set.add(parola);
    else scartate++;
  }
  console.log(`[export-dicts] LO: ${set.size} parole valide, ${scartate} scartate`);
  return set;
}

/**
 * Estrae le parole dal dataset Hugging Face (array JSON di `{word, ...}`).
 * NOTA: il file è ~95 MB, il parse JSON richiede RAM (in build usare
 * `node --max-old-space-size=1024`).
 *
 * @returns {Promise<Set<string>>}
 */
async function paroleHuggingFace() {
  const buffer = await scarica(HF_URL);
  console.log('[export-dicts] HF: parsing JSON (~95 MB, può richiedere ~30s)...');
  const inizio = Date.now();
  const dati = JSON.parse(buffer.toString('utf8'));
  console.log(
    `[export-dicts] HF: JSON parsato in ${((Date.now() - inizio) / 1000).toFixed(1)}s, ${
      dati.length
    } record`
  );
  const set = new Set();
  let scartate = 0;
  for (const record of dati) {
    const parola = valida(record && record.word);
    if (parola) set.add(parola);
    else scartate++;
  }
  console.log(`[export-dicts] HF: ${set.size} parole valide, ${scartate} scartate`);
  return set;
}

const FONTI = {
  lo: { nome: 'LO', carica: paroleLibreOffice },
  hf: { nome: 'HF', carica: paroleHuggingFace },
};

/**
 * Costruisce l'artefatto: raccoglie le parole di tutte le fonti richieste,
 * deduplica (vince la PRIMA fonte che contiene la parola) e scrive il file
 * gzip con righe `<parola>\t<source>\n`.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log('[export-dicts] Configurazione:');
  console.log(`  - Uscita:    ${OUT}`);
  console.log(`  - Fonti:     ${SORGENTI.join(', ')}`);
  console.log(`  - Lunghezza: ${MIN}-${MAX} lettere`);

  if (SORGENTI.length === 0) {
    throw new Error('Nessuna fonte richiesta (usa --sources=lo,hf)');
  }

  /** @type {Map<string, string>} parola -> source */
  const parole = new Map();
  const fallite = [];

  for (const chiave of SORGENTI) {
    const fonte = FONTI[chiave];
    if (!fonte) {
      console.warn(`[export-dicts] WARNING: fonte sconosciuta "${chiave}", ignorata`);
      continue;
    }
    try {
      const set = await fonte.carica();
      let nuove = 0;
      for (const parola of set) {
        if (parole.has(parola)) continue;
        parole.set(parola, fonte.nome);
        nuove++;
      }
      console.log(`[export-dicts] ${fonte.nome}: ${nuove} parole nuove nell'artefatto`);
    } catch (errore) {
      fallite.push(`${fonte.nome}: ${errore.message}`);
      console.warn(`[export-dicts] WARNING: fonte ${fonte.nome} fallita (${errore.message})`);
    }
  }

  if (parole.size === 0) {
    throw new Error(
      `Nessuna parola raccolta. Errori: ${fallite.join(' | ') || 'nessuno'}`
    );
  }

  // Formato minimale e stabile: una riga per parola, TAB, source.
  const righe = [];
  const conteggi = {};
  for (const [parola, source] of parole) {
    righe.push(`${parola}\t${source}\n`);
    conteggi[source] = (conteggi[source] || 0) + 1;
  }

  const buffer = await gzipAsync(Buffer.from(righe.join(''), 'utf8'), { level: 9 });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, buffer);

  const info = await stat(OUT);
  console.log('[export-dicts] Riepilogo:');
  for (const [source, n] of Object.entries(conteggi)) {
    console.log(`  - ${source}: ${n}`);
  }
  console.log(`  - Totale: ${parole.size} parole`);
  console.log(`  - File:   ${OUT} (${(info.size / 1024 / 1024).toFixed(2)} MB)`);
  if (fallite.length > 0) {
    console.warn(
      `[export-dicts] Fonti fallite (artefatto comunque valido): ${fallite.join(' | ')}`
    );
  }
  console.log('[export-dicts] FATTO.');
}

main().catch((errore) => {
  console.error(`[export-dicts] ERRORE: ${errore.message}`);
  process.exit(1);
});