#!/usr/bin/env bash
# =============================================================================
# backup-docker.sh — Backup PostgreSQL dello stack Docker di Parole Mutanti
# =============================================================================
# Esegue `pg_dump` DENTRO il container `db` e salva il dump compresso su host.
# Il dizionario delle parole è rigenerabile, ma il DB contiene anche i feedback
# degli utenti (tabella `feedback`), quindi conviene un backup periodico.
#
# Configurazione (via env, default sensati):
#   PAROLE_ENV_FILE          file env dello stack   (default <repo>/.env)
#   PAROLE_BACKUP_DIR        cartella dei backup    (default <repo>/backups)
#   PAROLE_BACKUP_RETENTION  quanti backup tenere   (default 7)
#
# Utilizzo:
#   ./deploy/backup-docker.sh
#   PAROLE_BACKUP_DIR=/srv/backups ./deploy/backup-docker.sh
#
# Cron suggerito (dalla root del repo, ogni notte alle 3:00):
#   0 3 * * * root /srv/apps/parolemutanti/deploy/backup-docker.sh >> /var/log/parolemutanti-backup.log 2>&1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${PAROLE_ENV_FILE:-$ROOT/.env}"
BACKUP_DIR="${PAROLE_BACKUP_DIR:-$ROOT/backups}"
RETENTION="${PAROLE_BACKUP_RETENTION:-7}"

if [ ! -f "$ENV_FILE" ]; then
    echo "[backup] ERRORE: env file $ENV_FILE non trovato" >&2
    exit 1
fi

# Sorgere l'intero file env (come fa docker compose): le password con caratteri
# speciali non vanno estratte con grep/cut.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:=parole_user}"
: "${POSTGRES_DB:=parole_mutanti}"
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "[backup] ERRORE: POSTGRES_PASSWORD mancante in $ENV_FILE" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/parole_mutanti-$TS.sql.gz"

cd "$ROOT"

echo "[backup] pg_dump del container 'db' ($POSTGRES_DB) → $OUT"
# -h 127.0.0.1 + PGPASSWORD: usa l'autenticazione TCP del container (l'utente
# di default di `docker compose exec` non è `postgres`, quindi evitiamo il peer auth)
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT"

chmod 600 "$OUT"

# Rotazione: mantiene solo gli ultimi RETENTION dump
ls -t "$BACKUP_DIR"/parole_mutanti-*.sql.gz 2>/dev/null \
    | tail -n +$((RETENTION + 1)) \
    | xargs -r rm -f

echo "[backup] FATTO: $OUT (rotazione $RETENTION)"