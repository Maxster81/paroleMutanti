# =============================================================================
# Parole Mutanti — immagine Docker multi-stage (node:24-alpine)
# =============================================================================
# Build (dalla ROOT del repo: il context è il repository intero):
#   docker build -f deploy/Dockerfile -t parolemutanti:latest .
#
# Run manuale (con un PostgreSQL raggiungibile):
#   docker run -d --name parolemutanti-app -p 127.0.0.1:8081:8081 \
#     --env-file .env --init parolemutanti:latest
#
# In produzione si usa Docker Compose (vedi docker-compose.yml + docs/DEPLOY.md).
#
# NOTE DI PROGETTO
# - L'app NON ha uno step di build: Node esegue direttamente i sorgenti
#   (`node backend/src/server.js`). Quindi lo stage `builder` serve a due cose:
#     1. installare le dipendenze di PRODUZIONE (npm ci --omit=dev)
#     2. costruire l'artefatto del DIZIONARIO (~185k parole, ~0.5 MB) con rete
#        disponibile, così il primo avvio del container non deve scaricare nulla
#        (vedi db/export-dicts.mjs → db/seed-words.mjs)
# - Il frontend è servito dallo STESSO processo Express, quindi non serve nginx
#   o un container statico: un solo container applicativo + un container `db`.
# - Nel container il bind DEVE essere 0.0.0.0 (HOST): Docker pubblica la porta
#   solo con `-p`/`ports:`. In `.env` HOST=127.0.0.1 (giusto per il bare-metal
#   dietro Caddy) e il compose lo sovrascrive a 0.0.0.0.
# - `.dockerignore` (root) esclude dal context il contesto di sviluppo
#   (.clinerules, .memory-bank, test, e2e, docs, .env...): nell'immagine entra
#   solo ciò che serve a runtime.
# =============================================================================

# -----------------------------------------------------------------------------
# STAGE 1 — builder: dipendenze di produzione + artefatto del dizionario
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Layer di cache: si invalida solo se cambiano i manifest, non quando cambia il codice.
COPY package.json package-lock.json ./

# `npm ci` (non `install`): installazione riproducibile dal lockfile.
# --omit=dev: nell'immagine finale non servono nodemon/playwright/socket.io-client.
RUN npm ci --omit=dev --no-audit --no-fund

# Copiamo SOLO lo script dell'artefatto: modificare il resto di db/ o il codice
# dell'app non invalida il layer (pesante) del download dei dizionari.
COPY db/export-dicts.mjs ./db/export-dicts.mjs

# Il parse del JSON Hugging Face (~90 MB, 313k record) richiede RAM: diamo a
# Node un heap esplicito così la build non dipende dall'euristica del container.
# Se una fonte fallisce lo script prosegue con l'altra; fallisce solo se NON
# raccoglie nessuna parola (build rotta = meglio saperlo subito).
RUN node --max-old-space-size=1024 db/export-dicts.mjs --out=/app/dict/words.tsv.gz

# -----------------------------------------------------------------------------
# STAGE 2 — runtime: artefatti + dipendenze di produzione, utente non root
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runtime

# dumb-init come PID 1: un processo Node avviato come PID 1 non riceve i signal
# dal kernel, quindi `docker stop` non farebbe il graceful shutdown (chiusura
# pool pg + socket). ALTERNATIVA: `init: true` nel compose / `docker run --init`
# (usato comunque, per abbondanza: è innocuo).
# È nel repository principale di Alpine → installazione affidabile.
RUN apk add --no-cache dumb-init

# --- Utente non root con UID/GID FISSI ---------------------------------------
# UID/GID fissi (10001) e non automatici: i permessi restano prevedibili anche
# se in futuro si monta un volume scrivibile.
RUN addgroup -S -g 10001 parolemutanti \
    && adduser -S -D -H -u 10001 -G parolemutanti parolemutanti

WORKDIR /app

# Default sicuri per il container (il compose li rende espliciti).
# NODE_ENV=production attiva i controlli di config.js (SESSION_SECRET >= 32 char).
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8081

# Dipendenze di produzione dello stage builder (già pruned).
COPY --from=builder --chown=parolemutanti:parolemutanti /app/node_modules ./node_modules

# package.json serve a runtime: server.js legge la versione da lì (/health).
COPY --chown=parolemutanti:parolemutanti package.json ./
COPY --chown=parolemutanti:parolemutanti backend ./backend
COPY --chown=parolemutanti:parolemutanti frontend ./frontend
# db/ contiene anche gli script di import/update dei dizionari: non servono a
# runtime ma restano utili per manutenzione manuale nel container
# (es. `docker compose exec app npm run db:update`).
COPY --chown=parolemutanti:parolemutanti db ./db
# Artefatto del dizionario generato nello stage builder.
COPY --from=builder --chown=parolemutanti:parolemutanti /app/dict ./dict
COPY --chown=parolemutanti:parolemutanti deploy/docker-entrypoint.sh ./deploy/docker-entrypoint.sh

USER parolemutanti

# Solo documentazione: la pubblicazione reale la decide il compose (`ports:`),
# e la mappa su 127.0.0.1 è imposta lì.
EXPOSE 8081

# Healthcheck "docker nativo": /health risponde 503 se il DB non risponde.
# `wget` c'è in Alpine (busybox). Il compose ridefinisce l'healthcheck con
# start_period più generoso (il primo avvio può includere il seed del dizionario).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=180s \
    CMD wget -q -O /dev/null http://127.0.0.1:8081/health || exit 1

ENTRYPOINT ["/sbin/dumb-init", "--", "/app/deploy/docker-entrypoint.sh"]
CMD ["node", "backend/src/server.js"]