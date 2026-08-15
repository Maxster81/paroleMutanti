# 02 — Database Rules (PostgreSQL 16)

## Tecnologia
- **DB**: PostgreSQL 16, connessione via `pg` (node-postgres), MAI altri ORM per la prima versione.
- **Pool**: SEMPRE `pg.Pool` con limit (default 10 connessioni).
- **Transazioni**: `BEGIN`/`COMMIT`/`ROLLBACK` espliciti per operazioni multi-statement.

## Connessione
- **URL**: letto da `process.env.DATABASE_URL` (mai hardcodato).
- **SSL**: disattivato in dev, attivato in produzione con `sslmode=require`.
- **Timeout connessione**: 5s per query brevi, 30s per import massivo.

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
- Per la prima versione: `db/init-db.sql` eseguito all'avvio se tabelle mancanti.
- Script idempotenti: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Per evoluzioni future: considerare strumenti come `node-pg-migrate` o `knex migrate`.

## Query
- **Parametrizzazione**: MAI concatenazione, SEMPRE `$1, $2, ...`.
- **Prepared statements**: usare per query ripetute (performance).
- **Logging**: loggare query lente (>500ms) con `EXPLAIN ANALYZE`.

## Sicurezza
- **User DB dedicato** (`parole_user`) con permessi SOLO sul DB `parole_mutanti`.
- **NO** `superuser` per l'app.
- **NO** accesso da rete in produzione se non necessario (bind localhost).
- **Backup**: predisporre `pg_dump` script in `deploy/backup.sh`.
