# Tech Context — Stack e Setup

## 🛠️ Stack Tecnologico

### Backend
- **Runtime**: Node.js 24.19 (WSL dev) / 20+ (target minimo)
- **Module system**: ES modules (`"type": "module"` in package.json)
- **Framework HTTP**: Express 4.21
- **WebSocket**: Socket.io 4.8
- **DB Driver**: `pg` 8.13 (node-postgres)
- **Validazione**: built-in + eventuale `zod` (da valutare in M2)
- **Logger**: `console` strutturato (no libreria pesante in M1)
- **Test runner**: `node --test` (built-in, no dipendenze)

### Database
- **PostgreSQL 16.14** (Ubuntu 24.04 nativo, installato come servizio systemd)
- **Connessione**: `pg.Pool` con max 10 connessioni (configurabile via `DB_POOL_MAX`)
- **URL**: da `DATABASE_URL` (env), MAI hardcoded
- **Indici**: B-tree su `length`, composti `(length, source)`, parziale su `winner_name`
- **Estensioni**: `pgcrypto` (per `gen_random_bytes`)

### Frontend
- **Zero framework**: vanilla JS con moduli ES6
- **CSS**: puro, variabili CSS in `:root`
- **Layout**: CSS Grid + Flexbox
- **Audio**: Web Audio API (OscillatorNode)
- **No build step**: il browser esegue i moduli ES6 direttamente (in dev WSL)
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
- ✅ Node.js 24.19 (`node --version`)
- ✅ npm 11.17 (`npm --version`)
- ✅ Git 2.43 (`git --version`)
- ✅ PostgreSQL 16.14 (`psql --version`)
- ✅ Caddy 2.11.4 (predisposto, NON toccato)
- ❌ Docker (NON usato, per scelta)
- ❌ Python venv (NON usato, Node only)

### Comandi npm principali
```bash
npm run dev          # avvia backend con --watch
npm start            # avvia backend (no watch)
npm test             # test runner built-in
npm run db:init      # inizializza schema
npm run db:import    # scarica e importa dizionario
npm run db:check     # verifica stato DB
npm run db:reset     # DROP + ricrea schema (ATTENZIONE)
```

### Variabili d'ambiente chiave
- `DATABASE_URL` — connessione PostgreSQL (formato `postgresql://user:pass@host:port/db`)
- `DEEPSEEK_API_KEY` — chiave API DeepSeek per M3 (placeholder per ora)
- `PORT` — porta backend (default 8090)
- `NODE_ENV` — development | production
- `SESSION_SECRET` — segreto per generazione ID (placeholder in dev)
- Tutte elencate in `.env.example`

## 🌍 Differenze Dev vs Prod

| Aspetto | Dev (WSL) | Prod (Ubuntu) |
|---|---|---|
| Porta | 8090 (diretta) | 3000 (dietro Caddy) |
| Accesso | `http://localhost:8090` | `https://parolemutanti.maxster.top` |
| Caddy | NON usato | Reverse proxy + TLS |
| Database | localhost:5432 | localhost:5432 (bind 127.0.0.1) |
| User DB | `parole_user` | `parole_user` (stesso) |
| Env file | `./.env` (gitignored) | `/etc/parole-mutanti/.env` |
| Process | `npm run dev` | systemd `parole-mutanti.service` |
| Logs | stdout (terminale) | journald |
| SSL/TLS | no | sì (Let's Encrypt) |
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
- **SSL DB**: off in dev, on in prod (`sslmode=require`)

## 🚀 Prossimi Step Tecnici (M2)
- Server.js: Express + Socket.io + health check
- GameManager: state in RAM, validazione ibrida DB + AI
- Validator: Levenshtein distance 1 + normalizzazione
- WordMutator: helper per generare/parole
- AI Client: DeepSeek wrapper con cache e rate limit
- Test: unit test Validator, integration test GameManager
