# M7 — Dockerizzazione (dismissione del modello a due repository)

> **Stato**: completata lato repository (2026-09-30, versione `1.6.0`).
> **Verifica sul server**: a cura dell'utente (Docker non disponibile nelle sandbox
> di sviluppo); la guida operativa copia-incollabile è `docs/DEPLOY.md`.
> **Verifica funzionale nel sandbox**: eseguita con PostgreSQL 16.14 reale (vedi §6).

## 1. Perché

Il server di produzione è stato riorganizzato: **tutte le web app girano in Docker**,
con **Caddy sull'host** come reverse proxy (HTTPS automatico Let's Encrypt). Un'altra
app (`BingWLP`) è già dockerizzata e ha fornito il modello di struttura e convenzioni
(`deploy/Dockerfile`, `docker-compose.yml`, `.env.example`, `docs/DEPLOY.md`).

Il modello precedente — **due repository** (sviluppo + `paroleMutanti_prod`) con uno
script `sync-to-prod.sh` che copiava una whitelist di file nel repo di produzione — con
Docker **non serve più**: la selezione di cosa entra nell'artefatto la fanno
`deploy/Dockerfile` e `.dockerignore`. Questo milestone lo ha dismesso.

## 2. Cosa è cambiato

| Aspetto | Prima (M6) | Ora (M7) |
|---|---|---|
| Repository | due (dev + `paroleMutanti_prod`) con `sync-to-prod.sh` | **uno solo** (`paroleMutanti`) |
| Deploy | systemd + `deploy/deploy.sh` (rsync in `/opt/paroleMutanti`) | **Docker Compose** (`git pull` + `docker compose up -d --build`) |
| Cartella sul server | clone in `/tmp` o home + runtime in `/opt/paroleMutanti` | **`/srv/apps/parolemutanti`** (clone = runtime) |
| DB | PostgreSQL 16 dell'host (`parole_user`/`parole_mutanti`) | **container `postgres:16-alpine`** + volume `parolemutanti-pgdata` |
| Porta | 8090 su loopback | **8081 su loopback** (8080 = altra app, 8090 = vecchio servizio) |
| Segreti | `/etc/parole-mutanti/.env` (systemd `EnvironmentFile=`) | `.env` nella root del progetto (`env_file:` in Compose, `600`) |
| Dizionario | scaricato e importato sul server (`npm run db:import`) | **cotto nell'immagine in build**, importato al primo avvio del container |
| Aggiornamento | `sudo ./deploy/deploy.sh --update` | `git pull && docker compose up -d --build` |

## 3. Artefatti

**Aggiunti**

- `deploy/Dockerfile` — immagine multi-stage `node:24-alpine`: stage `builder`
  (`npm ci --omit=dev` + artefatto dizionario) e stage `runtime` (dumb-init, utente
  non root uid 10001, `EXPOSE 8081`, `HEALTHCHECK` su `/health`).
- `docker-compose.yml` (root) — servizi `app` + `db`, `container_name`,
  `restart: unless-stopped`, `init: true`, `env_file: .env`, `depends_on:
  service_healthy`, healthcheck (app e db), logging json-file `10m`×`5`,
  `ports: "127.0.0.1:8081:8081"`, volume nominato per il DB.
- `.dockerignore` (root) — esclude segreti (`.env`), `.git`, `node_modules`,
  contesto di sviluppo (`.clinerules/`, `.memory-bank/`, `docs/`, `e2e/`,
  `backend/tests/`, `*.md`) e i file bare-metal.
- `deploy/docker-entrypoint.sh` — bootstrap del container: attesa DB → schema
  idempotente → seed del dizionario → avvio del server (`exec`).
- `db/export-dicts.mjs` — costruisce l'artefatto `dict/words.tsv.gz` (build).
- `db/seed-words.mjs` — importa l'artefatto in `words` (primo avvio; salta se popolata).
- `db/wait-for-db.mjs` — attesa di PostgreSQL (`DB_WAIT_SECONDS`, default 60s).
- `deploy/backup-docker.sh` — `pg_dump` dal container `db` + rotazione ultimi 7.
- `docs/DEPLOY.md` — guida Docker + migrazione dal vecchio systemd + pulizia.
- Script npm: `db:export-dicts`, `db:seed`, `db:wait`, `db:bootstrap`.

**Rimossi / modificati**

- ❌ `sync-to-prod.sh` (eliminato) e ogni riferimento al repo di produzione in
  `README.md`, `deploy/README.md`, `.clinerules/*`, `.memory-bank/*`.
- ❌ riga `.last-sync-dev-commit` da `.gitignore`; aggiunta `dict/`.
- `README.md`: sezione «Deploy con Docker» (primaria) + «Deploy bare-metal»
  (alternativa); struttura repo e istruzioni test aggiornate.
- `deploy/README.md`: da guida di produzione a **guida bare-metal secondaria**.
- `.env.example`: `PORT=8081`, sezione `POSTGRES_*` (Docker) + `DATABASE_URL`
  commentata (dev/bare-metal), `SESSION_SECRET`/`POSTGRES_PASSWORD` vuoti con
  fail-fast di Compose, blocco bootstrap avanzato.
- `deploy/deploy.sh`: resta per il bare-metal, senza riferimenti allo script di sync.
- Versione: `1.5.0` → **`1.6.0`** (`package.json` + `VERSION`).

## 4. Scelte tecniche e motivazioni

| Scelta | Perché |
|---|---|
| **Dizionario cotto in build** | al primo avvio del container non serve rete (il server può non avere uscita HTTP libera) e il seed dura ~2 s; il file è piccolo (0,5 MB gzip) |
| **PostgreSQL in container** | nessun conflitto con il Postgres dell'host né con altre app; DB isolato, teardown pulito; nessuna porta pubblicata |
| **Compose nella root** | `docker compose up -d --build` funziona senza `-f`, `.env` è unico per dev e prod, e Compose legge i `${...}` proprio da quel `.env` |
| **Un solo container applicativo** | il backend Node serve già il frontend statico: nginx/container statico sarebbero hop in più senza vantaggi |
| **Porta 8081** | 8080 occupata da BingWLP, 8090 dal vecchio servizio systemd; 8081 era libera |
| **`init: true` + dumb-init nell'immagine** | l'entrypoint fa `exec node`, quindi Node diventa PID 1: senza init i signal di `docker stop` non arrivano (niente graceful shutdown di pool pg/socket) |
| **`environment:` oltre a `env_file:`** | `HOST=0.0.0.0` (nel container serve il bind su tutte le interfacce), `PORT=8081`, `NODE_ENV=production` e `DATABASE_URL` con host `db` devono vincere sui valori del `.env` pensati per dev |
| **`${VAR:?}` su `POSTGRES_PASSWORD`/`SESSION_SECRET`** | fail-fast con messaggio esplicito invece di stack avviato e poi in restart loop |
| **Bare-metal mantenuto** | su server senza Docker resta una via d'uscita, ma è secondaria e non dipende da altri repo |

## 5. Flusso operativo (nuovo)

```
                     INTERNET
                         │  https://parolemutanti.maxster.top
                         ▼
        Caddy (HOST, systemd) — TLS Let's Encrypt
        encode zstd gzip · reverse_proxy 127.0.0.1:8081
                         │
                         ▼
    container parolemutanti-app (node:24-alpine, uid 10001, non root)
      Express + Socket.io + frontend statico
      entrypoint: wait-for-db → init-db (schema) → seed-words → node server.js
                         │  rete interna Compose (host `db`)
                         ▼
    container parolemutanti-db (postgres:16-alpine) + volume parolemutanti-pgdata
```

- Server: `/srv/apps/parolemutanti` (clone del repo = runtime).
- Aggiornamento: `git pull && docker compose up -d --build`.
- Log: `docker compose logs -f app` (json-file, rotazione 10m × 5).
- Backup: `./deploy/backup-docker.sh` (rotazione 7).

## 6. Verifiche eseguite (evidence)

Il sandbox di sviluppo **non ha Docker**: l'immagine/compose non sono stati eseguiti
qui. Sono stati invece verificati **tutti i passi di bootstrap e di gioco** con un
**PostgreSQL 16.14 reale** (stessa major della produzione) avviato come utente non
root nella sandbox, replicando la sequenza dell'entrypoint:

| Verifica | Esito |
|---|---|
| `db/export-dicts.mjs` (build) | **185.723 parole** (LO 59.537 + HF 126.186), artefatto `words.tsv.gz` da **0,48 MB** |
| `db/wait-for-db.mjs` | DB raggiungibile al primo tentativo |
| `db/init-db.js` | schema applicato, tabelle `feedback, game_logs, games, words` + vista; **idempotente** (eseguito più volte) |
| `db/seed-words.mjs` (DB con `words` vuota) | **185.723 parole inserite in 2,0 s** |
| `db/seed-words.mjs` (secondo avvio) | rileva 185.723 parole già presenti → **nessuna azione** |
| entrypoint adattato + `node backend/src/server.js` | attesa → schema → seed → `server_avviato` |
| `GET /health` | `{"status":"ok","database":"ok","version":"1.5.0","env":"production"}` |
| `GET /` (frontend) | HTTP 200 |
| Test di gioco end-to-end (socket) | **11/11**: create → join → ready → parola iniziale dal dizionario → `submit_word` valido (`source=LO`) → parola inventata respinta (`ai_errore`, nessuna chiave DeepSeek) → parola identica respinta (`parola_gia_usata`) |
| `npm test` (unit + e2e socket contro server reale) | **64/64 pass**, 0 fail, 0 skip |

Da verificare sul server (a cura dell'utente): `docker compose up -d --build`,
stato `healthy` dei due container, `curl http://127.0.0.1:8081/health`, Caddy su
`https://parolemutanti.maxster.top`, partita reale dal browser. Passi e pulizia
del vecchio servizio in `docs/DEPLOY.md` §3, §4, §8, §9.

## 7. Trappole e manutenzione

- **Porta in tre punti**: cambiandola, aggiornare `app.environment.PORT`,
  `app.healthcheck` e `app.ports` in `docker-compose.yml` + blocco Caddy.
- **`.dockerignore` = contratto**: se il Dockerfile copia un percorso nuovo, quel
  percorso non deve essere escluso (e viceversa: il contesto di sviluppo non deve
  entrare nell'immagine).
- **Seed**: un seed fallito non blocca l'avvio (il server parte e `/health`
  diagnostica); si riprova con `docker compose exec app node db/seed-words.mjs`.
- **Memoria in build**: il parse del JSON Hugging Face (~90 MB) richiede RAM; la
  build lo lancia con `--max-old-space-size=1024`.
- **Nessun dato di gioco da migrare**: le partite vivono in RAM. Nel DB restano il
  dizionario (rigenerabile) e i feedback; il volume va conservato.
- **Non reintrodurre** script di sync tra repository: Docker fa già la selezione.