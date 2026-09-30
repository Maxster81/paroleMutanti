# Tech Context — Stack e Setup

## 🐳 Deploy (Docker — primario, da M7)

- **Immagine**: `deploy/Dockerfile` multi-stage su **`node:24-alpine`** (stessa major
  del dev), utente non root `uid 10001`, `dumb-init`, `EXPOSE 8081`.
- **Orchestrazione**: `docker-compose.yml` nella root → servizi `app` + `db`
  (`postgres:16-alpine`) + volume `parolemutanti-pgdata`.
- **Reverse proxy**: **Caddy sull'host** (systemd) → `reverse_proxy 127.0.0.1:8081`.
- **Cartella server**: `/srv/apps/parolemutanti` (clone = runtime).
- **Porta**: 8081 (container e host-loopback). 8080 = BingWLP, 8090 = vecchio
  servizio systemd di Parole Mutanti.
- **Bootstrap container** (`deploy/docker-entrypoint.sh`): `wait-for-db` →
  `init-db` (schema idempotente) → `seed-words` (dizionario cotto in immagine) →
  `node backend/src/server.js`.
- **Backup**: `deploy/backup-docker.sh` (pg_dump dal container `db`, rotazione 7).
- **Guida**: `docs/DEPLOY.md`; storia e motivazioni: `.memory-bank/M7-docker-migration.md`.
- **Bare-metal (alternativa secondaria)**: `deploy/deploy.sh` + systemd
  (`deploy/README.md`), PostgreSQL dell'host, porta 8090.

## 🛠️ Stack Tecnologico

### Backend
- **Runtime**: Node.js 24.21 (dev WSL, e container `node:24-alpine`) / 20+ target minimo
- **Module system**: ES modules (`"type": "module"` in package.json)
- **Framework HTTP**: Express 4.21
- **WebSocket**: Socket.io 4.8
- **DB Driver**: `pg` 8.13 (node-postgres)
- **Validazione**: built-in + eventuale `zod` (da valutare in M2)
- **Logger**: `console` strutturato JSON (no libreria pesante in M1)
- **Test runner**: `node --test` (built-in, no dipendenze extra)

### Database
- **PostgreSQL 16** — in Docker: container `postgres:16-alpine` (volume dedicato,
  nessuna porta pubblicata); bare-metal/dev: 16.14 sull'host
- **Connessione**: `pg.Pool` con max 10 connessioni (configurabile via `DB_POOL_MAX`)
- **URL**: da `DATABASE_URL` (in Docker la costruisce il compose da `POSTGRES_*`)
- **Indici**: B-tree su `length`, composti `(length, source)`, parziale su `winner_name`
- **Estensioni**: `pgcrypto` (per `gen_random_bytes`)

### Frontend
- **Zero framework**: vanilla JS con moduli ES6
- **CSS**: puro, variabili CSS in `:root`
- **Layout**: CSS Grid + Flexbox
- **Audio**: Web Audio API (OscillatorNode)
- **No build step**: il browser esegue i moduli ES6 direttamente; gli statici sono
  serviti dallo stesso processo Express
- **Target viewport**: 360x800 px (mobile portrait)

## 📦 Dipendenze npm
```json
{
  "production": [
    "express",      // HTTP server
    "socket.io",    // WebSocket
    "pg",           // PostgreSQL client
    "uuid",         // gameId generation
    "levenshtein",  // distanza edit parole
    "dotenv"        // env loader
  ],
  "development": [
    "nodemon"       // auto-restart dev (opzionale, preferiamo node --watch)
  ]
}
```

## 🔧 Setup Dev Environment

### Prerequisiti installati
- ✅ Node.js 24.21 (`node --version`)
- ✅ npm 11.19 (`npm --version`)
- ✅ Git 2.43 (`git --version`)
- ✅ PostgreSQL 16.14 (`psql --version`) — solo per dev/bare-metal: il deploy Docker
  usa il PostgreSQL in container
- ✅ Caddy 2.11.4 (predisposto, NON toccato in dev)
- ✅ Docker + plugin Compose (produzione; **non** disponibile nella sandbox dev)
- ❌ Python venv (NON usato, Node only)

### Comandi npm principali
```bash
npm run dev            # avvia backend con --watch (dev WSL)
npm start              # avvia backend (no watch)
npm test               # test runner built-in (richiede DATABASE_URL)
npm run db:init        # inizializza schema
npm run db:import      # scarica e importa dizionario (dev/bare-metal, richiede rete)
npm run db:export-dicts# costruisce dict/words.tsv.gz (usato nella build Docker)
npm run db:seed        # popola `words` dall'artefatto locale (primo avvio container)
npm run db:wait        # attende che PostgreSQL risponda
npm run db:check       # verifica stato DB
npm run db:reset       # DROP + ricrea schema (ATTENZIONE)
```

### Variabili d'ambiente chiave
- `DATABASE_URL` — connessione PostgreSQL (dev/bare-metal). In Docker la costruisce
  il compose da `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (host `db`)
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — credenziali del container
  `db` (obbligatorie per lo stack Docker)
- `DEEPSEEK_API_KEY` — chiave API DeepSeek (vuota = fallback AI disattivato)
- `PORT` — porta backend (default 8081; in Docker imposta dal compose)
- `HOST` — bind (dev `0.0.0.0`; container `0.0.0.0`; bare-metal `127.0.0.1`)
- `NODE_ENV` — development | production (nel container forzato a `production`)
- `SESSION_SECRET` — obbligatorio ≥ 32 caratteri in produzione
- `SEED_WORDS`, `DB_WAIT_SECONDS`, `SKIP_DB_BOOTSTRAP` — bootstrap del container Docker
- Tutte elencate in `.env.example`

## 🌍 Differenze Dev vs Prod

| Aspetto | Dev (WSL) | Prod (Docker) |
|---|---|---|
| Porta | 8081 (diretta) | 8081 in loopback, pubblica via Caddy |
| Accesso | `http://localhost:8081` | `https://parolemutanti.maxster.top` |
| Caddy | NON usato | reverse proxy sull'host + TLS |
| Database | PostgreSQL dell'host (`localhost:5432`) | container `db` + volume `parolemutanti-pgdata` |
| User DB | `parole_user` | `parole_user` (POSTGRES_USER del container) |
| Env file | `./.env` (gitignored) | `./.env` in `/srv/apps/parolemutanti` (600) |
| Process | `npm run dev` | container `parolemutanti-app` |
| Logs | stdout (terminale) | `docker compose logs` (json-file 10m × 5) |
| Dizionario | `npm run db:import` | cotto in build + seed al primo avvio |
| SSL/TLS | no | sì (Let's Encrypt via Caddy) |
| Rate limit | disattivato | attivo |

## 🔐 Pattern d'Uso Tool

### execute_command
- Lettura: `requires_approval: false` (ls, cat, find, grep, psql, etc.)
- Modifica sistema: `requires_approval: true` (apt, sudo, systemctl)
- Sudo con password NON automatizzabile in Cline → utente lancia

### read_file / write_to_file / replace_in_file
- Tutti i file dentro `/home/death/paroleMutanti/` sono accessibili
- I file di sistema (`/etc/caddy/`, `/etc/postgresql/`) sono leggibili ma non scrivibili senza sudo
- Pattern: scrivi codice → utente esegue con sudo → verifico output

### MCP disponibili
- **filesystem** (limitato a `/home/death/paroleMutanti`)
- **memory** (knowledge graph, complementare al memory-bank file)
- **playwright** (test e2e browser, da usare in M4+)
- **context7** (docs aggiornate librerie, da usare in M2+)
- **postgres** (da installare per query DB dirette)
- **fetch** (da installare per chiamate HTTP esterne)

## 📐 Vincoli Tecnici Noti
- **No eval, no Function()** lato server
- **Payload Socket.io limit 100KB**
- **Rate limit submit**: 5/sec per socket
- **Rate limit DeepSeek**: 10/min per partita
- **Indici devono essere aggiunti esplicitamente** (no autoindex in M1)
- **Transazioni esplicite** con BEGIN/COMMIT/ROLLBACK
- **SSL DB**: non necessario (il traffico app↔DB resta nella rete di Compose o su loopback)
- **Build Docker**: la stage `builder` scarica ~90 MB di dizionario → la build richiede
  rete; il runtime no. Heap esplicito `--max-old-space-size=1024` per il parse JSON.

## 🚀 Prossimi Step Tecnici

Il progetto è **giocabile end-to-end e live in produzione**. Migliorie possibili:
- CI (⚠️ il token dell'infrastruttura non può creare file in `.github/workflows`:
  il workflow va parcheggiato altrove e caricato a mano);
- stage `test` nell'immagine (`docker build --target test`) per eseguire `npm test`
  in CI;
- `helmet` per gli header di sicurezza lato Express (oggi Caddy può aggiungerli);
- valutazione `node-pg-migrate` per migrazioni versionate.
