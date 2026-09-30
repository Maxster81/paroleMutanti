#!/bin/sh
# =============================================================================
# docker-entrypoint.sh — Bootstrap del container "app" di Parole Mutanti
# =============================================================================
# Sequenza:
#   1. attende che PostgreSQL sia raggiungibile (rete di sicurezza, vedi
#      db/wait-for-db.mjs)
#   2. applica lo schema: db/init-db.js → db/init-db.sql (IDEMPOTENTE, quindi
#      sicuro a ogni avvio e dopo ogni aggiornamento dell'app)
#   3. popola la tabella `words` dall'artefatto COTTO nell'immagine, solo se è
#      vuota (db/seed-words.mjs): nessuna rete richiesta al primo avvio
#   4. esegue il comando del container (default: node backend/src/server.js)
#
# Variabili:
#   SKIP_DB_BOOTSTRAP=1   salta i passi 1-3 (DB gestito a mano)
#   SEED_WORDS=0          salta solo il seed del dizionario
#   DB_WAIT_SECONDS=60    timeout attesa DB
#
# Nota: i passi 1-3 girano come utente non-root (vedi Dockerfile).
# Se l'attesa del DB va in timeout l'entrypoint esce con errore: il container
# viene riavviato da `restart: unless-stopped` quando il DB torna disponibile.
# =============================================================================
set -e

cd /app

if [ "${SKIP_DB_BOOTSTRAP:-0}" = "1" ]; then
  echo "[entrypoint] SKIP_DB_BOOTSTRAP=1: salto attesa DB, schema e seed."
  exec "$@"
fi

echo "[entrypoint] Attesa di PostgreSQL (timeout ${DB_WAIT_SECONDS:-60}s)..."
node db/wait-for-db.mjs

echo "[entrypoint] Applico lo schema (idempotente)..."
node db/init-db.js

if [ "${SEED_WORDS:-1}" = "1" ]; then
  echo "[entrypoint] Verifico il dizionario delle parole..."
  # Un seed fallito non deve impedire l'avvio del server: l'app resta
  # raggiungibile (e /health diagnostica il DB) e il seed si può riprovare con
  #   docker compose exec app node db/seed-words.mjs
  if ! node db/seed-words.mjs; then
    echo "[entrypoint] ATTENZIONE: seed del dizionario FALLITO. Il server parte comunque;"
    echo "[entrypoint] esegui 'docker compose exec app node db/seed-words.mjs' per riprovare."
  fi
else
  echo "[entrypoint] SEED_WORDS != 1: salto il seed del dizionario."
fi

echo "[entrypoint] Avvio: $*"
exec "$@"