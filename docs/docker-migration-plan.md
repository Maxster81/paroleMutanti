# Migrazione a Docker — piano di lavoro (bozza)

> **Stato: BOZZA in attesa di conferma.** Questo file è il piano operativo della
> dockerizzazione di Parole Mutanti (Docker = deploy primario, dismissione del
> modello a due repository dev→prod). Verrà sostituito/assorbito da
> `docs/DEPLOY.md` a fine lavoro.

## 1. Ricognizione del repo (stato attuale)

| Aspetto | Valore |
|---|---|
| Linguaggio / runtime | Node.js 20+ (dev: v24.21), ES modules, nessun transpiler |
| Backend | Express 4 + Socket.io 4 (un solo processo) |
| Frontend | HTML/CSS/JS vanilla **servito dallo stesso processo Express** (`frontend/`) |
| DB | PostgreSQL 16 (`pg` pool) — tabelle `words`, `games`, `game_logs`, `feedback` |
| Entry point | `backend/src/server.js` (`npm start` / `npm run dev`) |
| Build | **Nessuno step di build**: `npm ci` e si esegue il sorgente così com'è |
| Porta | `PORT` (default 8090), `HOST` default `0.0.0.0` in dev e `127.0.0.1` in prod |
| Health check | `GET /health` (JSON: stato, DB, uptime, versione) |
| Dizionario | `words` ~185k voci, rigenerabile: `npm run db:init` + `npm run db:import` (LO + HF) |
| Test | `npm test` = `node --test backend/tests/*.test.js` (unit; e2e socket si auto-skip senza server) |

### Variabili d'ambiente

Obbligatorie:
- `DATABASE_URL` — senza questa la config esce con errore (`config.js` fail-fast).
- `SESSION_SECRET` (≥32 caratteri) — obbligatoria con `NODE_ENV=production`.

Opzionali (default nel codice): `PORT`, `HOST`, `NODE_ENV`, `DB_POOL_MAX`,
`DEEPSEEK_API_KEY` (vuota = fallback AI disattivato), `DEEPSEEK_*`, `MAX_PLAYERS`,
`MIN_PLAYERS`, `DEFAULT_GAMES_TO_WIN`, `DEFAULT_TURN_SECONDS`,
`INITIAL_WORD_MIN_LENGTH`, `INITIAL_WORD_MAX_LENGTH`, `LOBBY_TIMER_SECONDS`,
`DEFAULT_PUBLIC`, `CORS_ORIGIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`LOG_LEVEL`, `PUBLIC_BASE_PATH`.

### Come nasce il DB delle parole

1. `db/init-db.js` → esegue `db/init-db.sql` (idempotente): tabelle, indici, vista.
2. `npm run db:import` → `db/import-lo-dict.mjs` (scarica `it_IT.dic`, ~1,3 MB da
   GitHub, source `LO`) + `db/import-hf-dict.mjs` (scarica ~95 MB di JSON da
   Hugging Face, source `HF`), filtro 3-10 lettere + charset italiano, bulk insert.
3. A runtime il DB si auto-arricchisce con le parole validate dall'AI (`source='AI'`).

Il gioco **non parte** con `words` vuota: `WordPicker.scegliParolaIniziale()` solleva
`nessuna parola disponibile`. Quindi la rigenerazione del dizionario è un requisito
funzionale del primo avvio, non un extra.

## 2. Cosa dismettere (modello a due repo)

- `sync-to-prod.sh` (root) → **da rimuovere**, con i riferimenti in `README.md`,
  `deploy/README.md` e la riga `.last-sync-dev-commit` in `.gitignore`.
- Riferimenti al repo `paroleMutanti_prod` in `README.md` / `deploy/README.md`.
- Il repo di produzione **non viene toccato** (archiviazione a cura dell'utente).
- I file di contesto di sviluppo (`.clinerules/`, `.memory-bank/`, test, `e2e/`) non
  vengono modificati: restano nel repo dev ed escono dall'immagine via `.dockerignore`.

## 3. Da produrre (Docker-ready)

- `deploy/Dockerfile` multi-stage (builder `npm ci --omit=dev` + runtime non-root).
- `.dockerignore` completo (esclude `.clinerules/`, `.memory-bank/`, test, `e2e/`,
  `deploy/*.service`, ecc.).
- `deploy/docker-compose.yml`: `app` + `db` (postgres:16-alpine), `container_name`,
  `restart: unless-stopped`, `env_file`, `healthcheck`, `logging` json-file 10m/5,
  `init: true`, porta pubblicata **solo su loopback**.
- `.env.example` aggiornato/documentato per il flusso Docker.
- Sezione README «Deploy con Docker» copia-incollabile.
- `docs/DEPLOY.md` con: architettura, primo deploy, verifica DB, aggiornamenti,
  backup, migrazione dal vecchio servizio systemd, blocco Caddy.

## 4. Punti aperti (in attesa di conferma)

1. **DB**: container `postgres:16-alpine` dedicato con volume (proposto) oppure
   riuso del PostgreSQL dell'host?
2. **Dizionario**: cotto nell'immagine in build (proposto: veloce, funziona senza
   rete al primo avvio) oppure scaricato al primo avvio del container?
3. **Bare-metal**: mantenere `deploy/deploy.sh` + unit systemd come alternativa
   secondaria (proposto) oppure rimuovere tutto e lasciare solo Docker?
4. **Porta host**: candidata `8091` (loopback), da confermare con `ss -tlnp` sul server.
