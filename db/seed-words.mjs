/**
 * seed-words.mjs — Popola la tabella `words` dall'artefatto locale del dizionario
 *
 * Legge il file gzip prodotto da `db/export-dicts.mjs` (una riga per parola,
 * formato `<parola>\t<source>`) e fa un bulk insert in `words` con
 * `ON CONFLICT DO NOTHING`.
 *
 * Perché esiste: nel container Docker il dizionario è COTTO nell'immagine, così
 * il primo avvio non dipende dalla rete. Lo chiama `deploy/docker-entrypoint.sh`
 * prima di avviare il server.
 *
 * Uso:
 *   node db/seed-words.mjs                  # salta se `words` è già popolata
 *   node db/seed-words.mjs --file=dict/words.tsv.gz
 *   node db/seed-words.mjs --force          # TRUNCATE + reimport (DISTRUTTIVO)
 *
 * Variabili d'ambiente:
 *   DATABASE_URL   (obbligatoria, come per gli altri script db/)
 *   DICT_FILE      percorso dell'artefatto (default `dict/words.tsv.gz`)
 *   SEED_FORCE=1   equivalente a --force
 *
 * @module db/seed-words
 */

import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Charset e lunghezze: devono restare allineati a db/export-dicts.mjs
const RE_CHARSET = /^[a-zàèéìòùjkwxy']+$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 10;
const BATCH = 500;

/** Argomenti CLI: --file=<path> e --force. */
const argomenti = {};
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.+)$/);
  if (match) argomenti[match[1]] = match[2];
}
const FORCE = argomenti.force !== undefined || process.argv.includes('--force') || process.env.SEED_FORCE === '1';
const FILE = resolve(ROOT, argomenti.file || process.env.DICT_FILE || 'dict/words.tsv.gz');

/**
 * Legge l'artefatto e ritorna la mappa parola -> source.
 * Ogni riga è `<parola>\t<source>`; le righe malformate vengono scartate.
 *
 * @returns {Promise<Map<string, string>>}
 */
async function leggiArtefatto() {
  let compresso;
  try {
    compresso = await readFile(FILE);
  } catch (errore) {
    throw new Error(
      `Impossibile leggere l'artefatto ${FILE} (${errore.message}). ` +
        'Genera il file con `npm run db:export-dicts` oppure popola il DB con `npm run db:import`.'
    );
  }

  const testo = gunzipSync(compresso).toString('utf8');
  const parole = new Map();
  let scartate = 0;

  for (const riga of testo.split('\n')) {
    if (!riga) continue;
    const [grezza, source] = riga.split('\t');
    const parola = grezza ? grezza.trim().toLowerCase() : '';
    if (
      !parola ||
      parola.length < MIN_LENGTH ||
      parola.length > MAX_LENGTH ||
      !RE_CHARSET.test(parola) ||
      !source
    ) {
      scartate++;
      continue;
    }
    if (!parole.has(parola)) parole.set(parola, source);
  }

  console.log(`[seed-words] Artefatto: ${FILE}`);
  console.log(`[seed-words] Parole uniche: ${parole.size} (righe scartate: ${scartate})`);
  return parole;
}

/**
 * Inserisce le parole in batch con `ON CONFLICT DO NOTHING`.
 *
 * @param {import('pg').Client} client
 * @param {Map<string, string>} parole
 * @returns {Promise<number>} righe effettivamente inserite
 */
async function inserisci(client, parole) {
  const elenco = Array.from(parole.entries());
  let inserite = 0;

  for (let i = 0; i < elenco.length; i += BATCH) {
    const batch = elenco.slice(i, i + BATCH);
    const valori = [];
    const segnaposto = [];
    batch.forEach(([parola, source], j) => {
      segnaposto.push(`($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`);
      valori.push(parola, parola.length, source);
    });
    const result = await client.query(
      `INSERT INTO words (word, length, source) VALUES ${segnaposto.join(', ')}
       ON CONFLICT (word) DO NOTHING`,
      valori
    );
    inserite += result.rowCount;
    const elaborate = Math.min(i + BATCH, elenco.length);
    if (elaborate % 25000 === 0 || elaborate === elenco.length) {
      console.log(`[seed-words] ${elaborate}/${elenco.length} parole elaborate...`);
    }
  }

  return inserite;
}

/**
 * Stampa le statistiche finali del dizionario.
 *
 * @param {import('pg').Client} client
 * @returns {Promise<void>}
 */
async function statistiche(client) {
  const totale = await client.query('SELECT COUNT(*) AS n FROM words');
  console.log(`[seed-words] Parole totali nel DB: ${totale.rows[0].n}`);

  const perSource = await client.query(
    'SELECT source, COUNT(*) AS n FROM words GROUP BY source ORDER BY source'
  );
  for (const riga of perSource.rows) {
    console.log(`[seed-words]   source ${riga.source}: ${riga.n}`);
  }

  const perLunghezza = await client.query(
    'SELECT length, count FROM words_count_by_length ORDER BY length'
  );
  for (const riga of perLunghezza.rows) {
    console.log(`[seed-words]   ${String(riga.length).padStart(2)} lettere: ${riga.count}`);
  }
}

/**
 * Entry point: verifica lo stato della tabella, importa solo se necessario.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Variabile DATABASE_URL mancante. Controlla il file .env');
  }

  const parole = await leggiArtefatto();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('[seed-words] Connesso al database.');

  try {
    const corrente = await client.query('SELECT COUNT(*) AS n FROM words');
    const presenti = parseInt(corrente.rows[0].n, 10);

    if (presenti > 0 && !FORCE) {
      console.log(
        `[seed-words] La tabella words contiene già ${presenti} parole: nessuna azione ` +
          '(usa --force per reimportare da zero).'
      );
      await statistiche(client);
      return;
    }

    if (presenti > 0 && FORCE) {
      console.log('[seed-words] --force: TRUNCATE della tabella words...');
      await client.query('TRUNCATE TABLE words RESTART IDENTITY');
    }

    const inizio = Date.now();
    const inserite = await inserisci(client, parole);
    const durata = ((Date.now() - inizio) / 1000).toFixed(1);
    console.log(`[seed-words] Inserite ${inserite} parole in ${durata}s`);
    await statistiche(client);
    console.log('[seed-words] FATTO.');
  } catch (errore) {
    console.error(`[seed-words] ERRORE: ${errore.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((errore) => {
  console.error(`[seed-words] Errore fatale: ${errore.message}`);
  process.exit(1);
});