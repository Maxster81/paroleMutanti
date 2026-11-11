/**
 * stats.js — Statistiche di gioco e di validazione (dal DB)
 *
 * Legge le tabelle alimentate dal GameManager:
 * - `games`  → ciclo di vita delle partite (finite, annullate, durata, abbandoni)
 * - `moves`  → tentativi di parola e fonte del verdetto (DB / MORF / AI)
 *
 * Uso:
 *   node db/stats.js                 # ultimi 14 giorni
 *   node db/stats.js --days=30
 *   node db/stats.js --json
 *   node db/stats.js --words=30      # quante parole "AI" elencare (default 20)
 *
 * Nel container:
 *   docker compose exec app npm run db:stats
 *
 * @module db/stats
 */

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

// --- Argomenti ---------------------------------------------------------------
const args = process.argv.slice(2);
const argMap = {};
for (const arg of args) {
  const m = arg.match(/^--([^=]+)=(.+)$/);
  if (m) argMap[m[1]] = m[2];
}
const GIORNI = Math.max(1, Math.min(365, parseInt(argMap.days ?? '14', 10) || 14));
const MAX_PAROLE = Math.max(1, Math.min(200, parseInt(argMap.words ?? '20', 10) || 20));
const JSON_OUT = args.includes('--json');

/** Formatta una percentuale (0-100) con una cifra decimale. */
function pct(parte, totale) {
  if (!totale) return '0.0%';
  return `${((parte / totale) * 100).toFixed(1)}%`;
}

/** Numero intero con separatore delle migliaia. */
function num(n) {
  return Number(n ?? 0).toLocaleString('it-IT');
}

/** Durata in secondi → "12,3 s" oppure "3m 12s". */
function secondi(s) {
  if (s === null || s === undefined) return 'n/a';
  const v = Number(s);
  if (v < 60) return `${v.toFixed(1)} s`;
  return `${Math.floor(v / 60)}m ${Math.round(v % 60)}s`;
}

const INTERVALLO = 'now() - make_interval(days => $1)';

/** Esegue le query e ritorna l'oggetto statistiche. */
async function raccogli(client) {
  const [partite, durate, mosse, durateAi, motivi, partiteGiorno, mosseGiorno, paroleAi] =
    await Promise.all([
      client.query(
        `SELECT count(*)::int AS totali,
                count(*) FILTER (WHERE state = 'waiting')::int   AS in_attesa,
                count(*) FILTER (WHERE state = 'running')::int   AS in_corso,
                count(*) FILTER (WHERE state = 'finished')::int  AS finite,
                count(*) FILTER (WHERE state = 'cancelled')::int AS annullate,
                COALESCE(sum(abandonments), 0)::int              AS abbandoni
         FROM games
         WHERE created_at >= ${INTERVALLO}`,
        [GIORNI],
      ),
      client.query(
        `SELECT avg(extract(epoch FROM (ended_at - started_at))) AS durata_media_s,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (ended_at - started_at))) AS durata_mediana_s,
                avg(jsonb_array_length(players)) AS giocatori_medi
         FROM games
         WHERE state = 'finished' AND started_at IS NOT NULL AND ended_at IS NOT NULL
           AND created_at >= ${INTERVALLO}`,
        [GIORNI],
      ),
      client.query(
        `SELECT count(*)::int AS totali,
                count(*) FILTER (WHERE valida)::int                              AS valide,
                count(*) FILTER (WHERE NOT valida)::int                          AS rifiutate,
                count(*) FILTER (WHERE source = 'DB')::int                       AS via_db,
                count(*) FILTER (WHERE source = 'MORF')::int                     AS via_morf,
                count(*) FILTER (WHERE source = 'AI')::int                       AS via_ai,
                count(*) FILTER (WHERE ai_usata)::int                            AS ai_consultata,
                count(*) FILTER (WHERE ai_usata AND NOT valida)::int             AS ai_rifiutate,
                count(*) FILTER (WHERE motivo = 'ai_errore')::int                AS ai_errori,
                count(*) FILTER (WHERE motivo = 'rate_limit')::int               AS rate_limit
         FROM moves
         WHERE created_at >= ${INTERVALLO}`,
        [GIORNI],
      ),
      client.query(
        `SELECT avg(ai_durata_ms) AS media_ms,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY ai_durata_ms) AS p95_ms,
                count(*)::int AS chiamate
         FROM moves
         WHERE ai_durata_ms IS NOT NULL AND created_at >= ${INTERVALLO}`,
        [GIORNI],
      ),
      client.query(
        `SELECT motivo, count(*)::int AS n
         FROM moves
         WHERE NOT valida AND created_at >= ${INTERVALLO}
         GROUP BY motivo
         ORDER BY n DESC
         LIMIT 10`,
        [GIORNI],
      ),
      client.query(
        `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS giorno,
                count(*) FILTER (WHERE state = 'finished')::int  AS finite,
                count(*) FILTER (WHERE state = 'cancelled')::int AS annullate
         FROM games
         WHERE created_at >= ${INTERVALLO}
         GROUP BY 1`,
        [GIORNI],
      ),
      client.query(
        `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS giorno,
                count(*)::int                      AS mosse,
                count(*) FILTER (WHERE ai_usata)::int AS ai
         FROM moves
         WHERE created_at >= ${INTERVALLO}
         GROUP BY 1`,
        [GIORNI],
      ),
      client.query(
        `SELECT parola, count(*)::int AS volte, max(created_at) AS ultima
         FROM moves
         WHERE parola IS NOT NULL
         GROUP BY parola
         ORDER BY volte DESC, ultima DESC
         LIMIT $1`,
        [MAX_PAROLE],
      ),
    ]);

  // Unisce le due serie giornaliere su una mappa giorno → dati.
  const giorni = new Map();
  for (const r of partiteGiorno.rows) {
    giorni.set(r.giorno, { giorno: r.giorno, finite: r.finite, annullate: r.annullate, mosse: 0, ai: 0 });
  }
  for (const r of mosseGiorno.rows) {
    const voce = giorni.get(r.giorno) ?? { giorno: r.giorno, finite: 0, annullate: 0, mosse: 0, ai: 0 };
    voce.mosse = r.mosse;
    voce.ai = r.ai;
    giorni.set(r.giorno, voce);
  }

  return {
    giorni: GIORNI,
    partite: partite.rows[0],
    durate: durate.rows[0],
    mosse: mosse.rows[0],
    ai_durate: durateAi.rows[0],
    motivi_rifiuto: motivi.rows,
    serie_giornaliera: [...giorni.values()].sort((a, b) => (a.giorno < b.giorno ? 1 : -1)),
    parole_ai: paroleAi.rows,
  };
}

function stampa(s) {
  const p = s.partite;
  const m = s.mosse;
  const d = s.durate;

  console.log('');
  console.log('📊  STATISTICHE PAROLE MUTANTI');
  console.log(`    Finestra: ultimi ${s.giorni} giorni`);
  console.log('='.repeat(64));

  console.log('');
  console.log('🎮  PARTITE');
  console.log(`    Totali:      ${num(p.totali)}`);
  console.log(`    Finite:      ${num(p.finite)}   Annullate: ${num(p.annullate)}   In corso: ${num(p.in_corso)}   In attesa: ${num(p.in_attesa)}`);
  console.log(`    Durata media (finite): ${secondi(d?.durata_media_s)} · mediana: ${secondi(d?.durata_mediana_s)}`);
  console.log(`    Giocatori medi: ${d?.giocatori_medi != null ? Number(d.giocatori_medi).toFixed(1) : 'n/a'}`);
  console.log(`    Abbandoni:   ${num(p.abbandoni)}`);

  console.log('');
  console.log('🔤  MOSSE E VALIDAZIONE');
  console.log(`    Tentativi:   ${num(m.totali)}  (valide ${num(m.valide)} · rifiutate ${num(m.rifiutate)} → ${pct(m.valide, m.totali)} ok)`);
  console.log('    Fonte del verdetto (sulle valide):');
  console.log(`      DB (dizionario):   ${num(m.via_db).padStart(8)}  ${pct(m.via_db, m.valide)}`);
  console.log(`      MORF (morfologia): ${num(m.via_morf).padStart(8)}  ${pct(m.via_morf, m.valide)}`);
  console.log(`      AI (fallback):     ${num(m.via_ai).padStart(8)}  ${pct(m.via_ai, m.valide)}`);
  console.log('');
  console.log(`    🤖 Fallback AI consultato: ${num(m.ai_consultata)} volte (${pct(m.ai_consultata, m.totali)} dei tentativi)`);
  console.log(`       Accettate ${num(m.via_ai)} · Rifiutate ${num(m.ai_rifiutate)} · Errori ${num(m.ai_errori)} · Rate limit ${num(m.rate_limit)}`);
  if (s.ai_durate?.chiamate > 0) {
    console.log(
      `       Latenza AI: media ${Math.round(Number(s.ai_durate.media_ms))} ms · p95 ${Math.round(Number(s.ai_durate.p95_ms))} ms (${num(s.ai_durate.chiamate)} chiamate)`,
    );
  }

  if (s.motivi_rifiuto.length > 0) {
    console.log('');
    console.log('    Motivi di rifiuto (top):');
    for (const r of s.motivi_rifiuto) {
      console.log(`      ${(r.motivo ?? '(nessuno)').padEnd(24)} ${num(r.n)}`);
    }
  }

  console.log('');
  console.log('📅  ULTIMI GIORNI (dal più recente)');
  if (s.serie_giornaliera.length === 0) {
    console.log('    Nessuna partita/mossa nel periodo.');
  } else {
    console.log('    giorno       finite  annullate  mosse   AI');
    for (const g of s.serie_giornaliera) {
      console.log(
        `    ${g.giorno}  ${String(g.finite).padStart(5)}  ${String(g.annullate).padStart(9)}  ${String(g.mosse).padStart(5)}  ${String(g.ai).padStart(4)}`,
      );
    }
  }

  console.log('');
  console.log('🧠  PAROLE CHE HANNO RAGGIUNTO L\'AI (candidati per il dizionario)');
  if (s.parole_ai.length === 0) {
    console.log('    Nessuna: il fallback AI non è mai stato necessario (finora).');
  } else {
    console.log('    parola'.padEnd(24) + 'volte   ultima volta');
    for (const r of s.parole_ai) {
      const ultima = r.ultima instanceof Date ? r.ultima.toISOString().slice(0, 16).replace('T', ' ') : String(r.ultima ?? '');
      console.log(`    ${String(r.parola).padEnd(24)}${String(r.volte).padStart(5)}   ${ultima}`);
    }
    console.log('');
    console.log('    → Se una parola valida compare qui, valutare di aggiungerla a `words`.');
  }

  console.log('');
  console.log('='.repeat(64));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Variabile DATABASE_URL mancante. Controlla il file .env');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const stats = await raccogli(client);
    if (JSON_OUT) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      stampa(stats);
    }
  } finally {
    await client.end();
  }
}

main().catch((errore) => {
  console.error('❌ Errore statistiche:', errore.message);
  process.exit(1);
});
