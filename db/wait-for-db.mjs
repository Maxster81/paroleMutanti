/**
 * wait-for-db.mjs — Attende che PostgreSQL sia raggiungibile
 *
 * Usato da `deploy/docker-entrypoint.sh` come rete di sicurezza: in Docker
 * Compose il container `app` parte già dopo `service_healthy` del container
 * `db`, ma questo script rende il bootstrap robusto anche con `docker run`
 * manuale o con un DB momentaneamente non disponibile.
 *
 * Uso:
 *   node db/wait-for-db.mjs
 *
 * Variabili d'ambiente:
 *   DATABASE_URL       (obbligatoria)
 *   DB_WAIT_SECONDS    timeout totale in secondi (default 60)
 *
 * Exit code: 0 = DB pronto, 1 = timeout.
 *
 * @module db/wait-for-db
 */

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const TIMEOUT_SECONDS = parseInt(process.env.DB_WAIT_SECONDS || '60', 10);
const INTERVALLO_MS = 1000;

/** Pausa asincrona. @param {number} ms */
function attendi(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tenta una connessione e un `SELECT 1`.
 *
 * @param {string} databaseUrl
 * @returns {Promise<{ok: boolean, errore: string|null}>}
 */
async function prova(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true, errore: null };
  } catch (errore) {
    return { ok: false, errore: errore.message };
  } finally {
    // La chiusura può fallire se la connessione non è mai stata stabilita.
    try {
      await client.end();
    } catch {
      /* ignora */
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[wait-for-db] ERRORE: DATABASE_URL mancante');
    process.exit(1);
  }

  const scadenza = Date.now() + TIMEOUT_SECONDS * 1000;
  let tentativi = 0;
  let ultimoErrore = null;

  while (Date.now() < scadenza) {
    tentativi++;
    const esito = await prova(databaseUrl);
    if (esito.ok) {
      console.log(`[wait-for-db] PostgreSQL raggiungibile (tentativo ${tentativi}).`);
      process.exit(0);
    }
    ultimoErrore = esito.errore;
    if (tentativi === 1 || tentativi % 5 === 0) {
      console.log(`[wait-for-db] In attesa di PostgreSQL... (${esito.errore})`);
    }
    await attendi(INTERVALLO_MS);
  }

  console.error(
    `[wait-for-db] ERRORE: PostgreSQL non raggiungibile dopo ${TIMEOUT_SECONDS}s (${ultimoErrore})`
  );
  process.exit(1);
}

main().catch((errore) => {
  console.error(`[wait-for-db] Errore fatale: ${errore.message}`);
  process.exit(1);
});