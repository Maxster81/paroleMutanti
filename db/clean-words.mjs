/**
 * clean-words.mjs — Rimuove dal dizionario le voci NON giocabili
 *
 * Elimina (o segnala: il default è dry-run) le parole che non rispettano il
 * charset di gioco: SOLO lettere (a-z + accentate àèéìòù + prestiti j,k,w,x,y).
 * Esempi di voci rimosse: "tutt'e", "l'amico", "po'", "d'accordo", "week-end".
 *
 * Perché serve: una parola "sporca" scelta come parola base rende la partita
 * impossibile (la catena di mutazioni a distanza 1 non è percorribile).
 * Il gioco le esclude già in selezione (WordPicker → wordQueries), quindi questo
 * script è di igiene dei DATI per un DB già popolato.
 *
 * Uso:
 *   node db/clean-words.mjs            # dry-run: mostra quante/quali verrebbero rimosse
 *   node db/clean-words.mjs --apply    # esegue la DELETE
 *
 * @module db/clean-words
 */

import { query, pool } from '../backend/src/db/pool.js';
import { PATTERN_SQL_SOLO_LETTERE } from '../backend/src/utils/normalizza.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const totale = (await query('SELECT COUNT(*)::int AS n FROM words')).rows[0].n;
  const sporche = (
    await query('SELECT COUNT(*)::int AS n FROM words WHERE word !~ $1', [PATTERN_SQL_SOLO_LETTERE])
  ).rows[0].n;

  console.log(`[clean-words] Parole nel dizionario: ${totale}`);
  console.log(`[clean-words] Non giocabili (caratteri speciali): ${sporche}`);

  if (sporche === 0) {
    console.log('[clean-words] Niente da fare. ✅');
    return;
  }

  const esempi = (
    await query('SELECT word FROM words WHERE word !~ $1 ORDER BY random() LIMIT 20', [
      PATTERN_SQL_SOLO_LETTERE,
    ])
  ).rows.map((r) => r.word);
  console.log(`[clean-words] Esempi: ${esempi.join(', ')}`);

  if (!APPLY) {
    console.log('[clean-words] DRY-RUN: nessuna modifica. Rilancia con --apply per eliminarle.');
    return;
  }

  const esito = await query('DELETE FROM words WHERE word !~ $1', [PATTERN_SQL_SOLO_LETTERE]);
  const dopo = (await query('SELECT COUNT(*)::int AS n FROM words')).rows[0].n;
  console.log(`[clean-words] ✅ Rimosse ${esito.rowCount} parole non giocabili.`);
  console.log(`[clean-words] Parole rimaste: ${dopo}`);
}

main()
  .catch((errore) => {
    console.error(`[clean-words] ❌ Errore: ${errore.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
