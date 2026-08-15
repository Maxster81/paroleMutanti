/**
 * update-lo.mjs — Aggiorna dizionario LO con incrementale
 *
 * Strategia:
 *   1. Legge l'ETag locale da .last-etag-lo
 *   2. Scarica it_IT.dic (salva in /tmp)
 *   3. Parsing + filtro (come import-lo-dict.mjs)
 *   4. INSERT con ON CONFLICT DO NOTHING (solo parole nuove)
 *   5. Aggiorna .last-etag-lo
 *
 * Uso: node db/update-lo.mjs
 *
 * @module db/update-lo
 */

import { writeFile, readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query } from '../backend/src/db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ETAG_FILE = join(__dirname, '.last-etag-lo');

const DICT_URL = 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/it_IT/it_IT.dic';
const TMP_FILE = '/tmp/it_IT.dic';
const MIN_LENGTH = 3;
const MAX_LENGTH = 10;

const RE_LETTERE_STRANIERE = /[jkwxy]/;
const RE_CHARSET = /^[a-zàèéìòù']+$/;

function validaParola(parola) {
  if (!parola) return null;
  if (parola.length < MIN_LENGTH || parola.length > MAX_LENGTH) return null;
  if (RE_LETTERE_STRANIERE.test(parola)) return null;
  if (!RE_CHARSET.test(parola)) return null;
  return parola;
}

function parseLine(linea) {
  if (!linea) return null;
  const idx = linea.indexOf('/');
  return idx === -1 ? linea : linea.substring(0, idx);
}

async function getEtag(url) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) throw new Error(`HEAD fallito: ${response.status}`);
  return response.headers.get('etag');
}

async function main() {
  console.log('[update-lo] Controllo ETag remoto...');
  const etagRemoto = await getEtag(DICT_URL);
  console.log(`[update-lo] ETag remoto: ${etagRemoto}`);

  // Salva ETag
  await writeFile(ETAG_FILE, etagRemoto, 'utf-8');

  // Download
  console.log('[update-lo] Download dizionario...');
  const response = await fetch(DICT_URL);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(TMP_FILE, buffer);
  console.log(`[update-lo] Scaricato ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Parse
  const contenuto = await readFile(TMP_FILE, 'utf-8');
  const linee = contenuto.split('\n');
  const setParole = new Set();
  for (const linea of linee) {
    const trimmed = linea.trim();
    if (!trimmed || trimmed.startsWith('/')) continue;
    const parolaBase = parseLine(trimmed);
    const parolaNorm = parolaBase ? parolaBase.toLowerCase() : null;
    if (validaParola(parolaNorm)) setParole.add(parolaNorm);
  }

  console.log(`[update-lo] Parole valide da LO: ${setParole.size}`);

  // INSERT con ON CONFLICT (solo nuove)
  const BATCH = 500;
  const paroleArray = Array.from(setParole);
  let inserite = 0;
  for (let i = 0; i < paroleArray.length; i += BATCH) {
    const batch = paroleArray.slice(i, i + BATCH);
    const values = [];
    const placeholders = [];
    batch.forEach((p, j) => {
      placeholders.push(`($${j * 2 + 1}, $${j * 2 + 2}, 'LO')`);
      values.push(p, p.length);
    });
    const result = await query(
      `INSERT INTO words (word, length, source) VALUES ${placeholders.join(', ')} ON CONFLICT (word) DO NOTHING`,
      values
    );
    inserite += batch.length;
  }

  console.log(`[update-lo] ✅ Update completato. ${inserite} parole elaborate (alcune già presenti).`);

  const stats = await query(`SELECT source, COUNT(*) AS n FROM words GROUP BY source ORDER BY source`);
  console.log('[update-lo] Stato attuale DB:');
  for (const r of stats.rows) {
    console.log(`  ${r.source}: ${r.n}`);
  }

  try { await unlink(TMP_FILE); } catch {}
}

main().catch((err) => {
  console.error('[update-lo] ❌ Errore fatale:', err);
  process.exit(1);
});
