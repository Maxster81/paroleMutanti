# 02 — Database Rules (PostgreSQL 16)

## Tecnologia
- **DB**: PostgreSQL 16, connessione via `pg` (node-postgres), MAI altri ORM per la prima versione.
- **Pool**: SEMPRE `pg.Pool` con limit (default 10 connessioni).
- **Transazioni**: `BEGIN`/`COMMIT`/`ROLLBACK` espliciti per operazioni multi-statement.

## Connessione
- **URL**: letto da `process.env.DATABASE_URL` (mai hardcodato).
- **Docker (deploy primario)**: `DATABASE_URL` è **costruita dal compose** a partire
  da `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` del `.env`, con host `db`
  (nome del servizio nella rete interna di Compose). Nel `.env` l'URL non va scritto.
- **Dev/bare-metal**: `DATABASE_URL` nel `.env` (PostgreSQL dell'host).
- **SSL**: non serve: il traffico app↔DB non esce mai dalla rete di Compose né dal loopback.
- **Timeout connessione**: 5s per query brevi, 30s per import massivo.
  All'avvio del container `db/wait-for-db.mjs` attende il DB (`DB_WAIT_SECONDS`, default 60s).

## Schema e Tabelle
Vedi `db/init-db.sql` per il DDL canonico.

Regole:
- **Naming**: snake_case per tabelle/colonne.
- **PK**: `SERIAL` o `UUID` (generato app-level con `uuid` lib).
- **Indici**:
  - SEMPRE su colonne usate in `WHERE`/`ORDER BY` frequenti.
  - `words.length` (per query random per lunghezza).
  - `words.word` (già PK).
  - `games.state`, `games.created_at`.
- **Tipi nativi**: preferire `TEXT`, `INTEGER`, `TIMESTAMPTZ`, `JSONB`, `UUID`.

## Migrazioni
- **Schema**: `db/init-db.sql`, applicato da `db/init-db.js`.
  - Docker: lo esegue `deploy/docker-entrypoint.sh` a **ogni avvio** del container
    (è idempotente: crea le tabelle mancanti senza toccare i dati).
  - Bare-metal: `deploy/deploy.sh --update` (stesso script).
- Script idempotenti: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Per evoluzioni future: considerare strumenti come `node-pg-migrate` o `knex migrate`.

## Dizionario (`words`) — rigenerazione
- **Docker**: l'artefatto (`dict/words.tsv.gz`, ~185k parole) è costruito in build da
  `db/export-dicts.mjs` e importato al primo avvio da `db/seed-words.mjs` (salta se
  la tabella è già popolata). Comandi: `npm run db:export-dicts`, `npm run db:seed`.
- **Bare-metal/dev**: `npm run db:init` + `npm run db:import` (LO + HF dalla rete).
- Il gioco **non parte** con `words` vuota: qualunque modifica al dizionario va
  verificata con `npm run db:check` e con una partita di prova.

## Query
- **Parametrizzazione**: MAI concatenazione, SEMPRE `$1, $2, ...`.
- **Prepared statements**: usare per query ripetute (performance).
- **Logging**: loggare query lente (>500ms) con `EXPLAIN ANALYZE`.

## Sicurezza
- **User DB dedicato** (`parole_user`): in Docker è il `POSTGRES_USER` del container,
  non è un superuser.
- **NO** accesso da rete: il container `db` **non pubblica porte** sull'host; si entra
  solo dalla rete di Compose (`docker compose exec db psql ...`).
- **Backup**: `deploy/backup-docker.sh` (Docker) o `deploy/backup.sh` (bare-metal).
