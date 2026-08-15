# Active Context — Focus Corrente

## 🎯 Focus Corrente
**Milestone 2: Backend Core** — 🔄 **IN CORSO** (2026-08-15). M1 chiusa, 6 MCP configurati.

## ✅ Cosa è stato fatto (oggi)
- M1 ✅ Setup & DB completato (539.780 parole, performance OK)
- 6 MCP server configurati in `cline_mcp_settings.json`:
  - `filesystem` (limitato a C:\Users\death\paroleMutanti + www + efftrack-dev)
  - `memory` (knowledge graph)
  - `playwright` (test e2e browser)
  - `context7` (docs aggiornate)
  - `postgres` (connesso a parole_mutanti)
  - `fetch` (chiamate HTTP)

## 🎯 Risultati M1 (per memoria)
- ✅ **539.780 parole italiane** caricate (filtro 3-10 lettere)
- ✅ Performance query random: **45.84ms** (target < 50ms)
- ✅ Tempo import: **14.7s**
- ✅ 3 tabelle + 1 vista + 4 script Node + 9 .clinerules + 6 MCP

## 🔄 Milestone 2: Backend Core (IN CORSO)

### Obiettivi
- Server Express + Socket.io funzionante
- Health check endpoint (`/health`)
- GameManager: gestione stato partite in RAM
- Validator: validazione ibrida (DB + Levenshtein distanza 1)
- TurnManager: gestione turni e timer (lockless, ottimistica)
- Lobby events: createGame, joinGame
- Test unit Validator

### Step 1 — Utility (logger, rateLimiter, normalizza, levenshtein) + test
- `backend/src/logger.js` — logger strutturato JSON
- `backend/src/utils/levenshtein.js` — wrapper package `levenshtein`
- `backend/src/utils/normalizza.js` — lowercase, trim, validateCharset
- `backend/src/utils/rateLimiter.js` — sliding window per socket (5/sec default)
- `backend/tests/levenshtein.test.js`
- `backend/tests/normalizza.test.js`

### Step 2 — DB queries
- `backend/src/db/wordQueries.js` — `parolaEsistente(word)`, `paroleCasuali(length, n)`

### Step 3 — Game Logic
- `backend/src/game/WordPicker.js` — sceglie parola iniziale random 5-8 lettere
- `backend/src/game/Validator.js` — validazione ibrida
- `backend/src/game/TurnManager.js` — timer, tick, timeout, cambio turno
- `backend/src/game/GameManager.js` — state RAM partite, CRUD

### Step 4 — Socket handlers
- `backend/src/sockets/lobbyHandler.js` — createGame, joinGame, ready
- `backend/src/sockets/gameHandler.js` — submitWord, passTurn
- `backend/src/sockets/index.js` — attachSocketHandlers(io)

### Step 5 — Server + smoke test
- `backend/src/server.js` — Express + Socket.io attached + static frontend
- Smoke test con `wscat` o `node -e "..."` per verificare health + connessione

### Step 6 — Aggiornamento memory bank
- `M2-backend-core.md` con risultati e decisioni

## 📍 Decisioni attive
- **Porta dev WSL**: 8090 (no Caddy, accesso diretto) ← confermato utente
- **Caddy prod**: blocco separato per `parolemutanti.maxster.top` ← predisposto in `deploy/`
- **Range parole iniziali**: **5-8 lettere** ← confermato utente
- **Audio**: Web Audio API (no file .mp3) ← confermato utente
- **Versioning SemVer**: attivazione post-M5 ← confermato utente
- **Default games_to_win**: 2 (configurabile 1-4) ← confermato utente
- **Logica turni/timer**: ottimistica (lockless) ← confermato utente

## 🛠️ MCP Attivi nel Progetto (6 totali)
- ✅ **filesystem** (limitato a `C:\Users\death\paroleMutanti` + `www` + `efftrack-dev`)
- ✅ **memory** (knowledge graph, complementare al memory-bank file)
- ✅ **playwright** (test e2e browser, da usare in M4+)
- ✅ **context7** (docs aggiornate librerie, da usare in M2+)
- ✅ **postgres** (query DB dirette connesso a `parole_mutanti`)
- ✅ **fetch** (chiamate HTTP esterne, utile per DeepSeek API in M3)

## ⚠️ Rischi aperti per M2
1. **Performance Levenshtein in game loop**: per partite con ~30 turni, calcolare distanza edit su 540k parole potrebbe essere lento. Strategia: query DB con `WHERE length = newWordLength ± 1` poi Levenshtein solo su quel subset (~50k parole max).
2. **Gestione concorrenza GameManager**: più partite attive in RAM richiedono lock o strutture dati thread-safe. Node single-thread aiuta ma serve async discipline. **Approccio scelto: ottimistico** (lockless, ultima submit vince).
3. **Rate limit submit**: 5/sec per socket — implementato custom in `utils/rateLimiter.js`.

## 📚 Learnings
- L'ambiente ha già 4 web services Python (uvicorn) attivi, niente deve essere toccato
- WSL2 Ubuntu 24.04.4 con systemd attivo (Postgres si installa come servizio classico)
- Caddy 2.11.4 in ascolto su :8080 (HTTP) — il nostro servizio sarà separato
- L'utente preferisce workflow "io lancio i comandi sudo, tu prepari il codice"
- Le regole di efftrack sono state adattate: 9 file invece di 11, focalizzate su Node/Vanilla invece che Python/Jinja2
- `yauzl` gestisce ZIP senza dipendenze di sistema
- `pg` client non supporta `COPY` con stringa → INSERT batch è la strada
- Il dizionario `parole_uniche.txt` di napolux ha 986k righe, ne usiamo 540k (53%) dopo filtro 3-10 lettere e dedup
- WSL2 ha `unzip` non installato di default
- `\echo` psql non funziona con `pg` client
- **Cline MCP config vive in Windows** (`%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`), raggiungibile da WSL via `/mnt/c/Users/death/AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Dopo modifica config MCP, serve riavviare Cline** (o cliccare "Retry" sul banner di errore se i server non partono)
- **6 MCP ora configurati**: aggiunti filesystem/memory/playwright/context7 in aggiunta a postgres/fetch
