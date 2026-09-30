# Progress — Stato Avanzamento

## 🕘 Storico Milestone (sunto)

| Milestone | Esito | Nota breve |
|---|---|---|
| M1 — Setup & DB | ✅ | PostgreSQL 16, dizionario, script DB, file deploy |
| M2 — Backend Core | ✅ | Express + Socket.io, health check, 28/28 test |
| M3 — AI Integration | ✅ | DeepSeek, cache + rate limit, Validator 4-step |
| M4b — Dizionario Ibrido | ✅ | LO + HF, 185.723 parole, script import/update |
| M4 — Frontend Base | ✅ | SPA + CSS + JS, views home/create/join/lobby/game/end |
| M5 — Gioco Realtime | ✅ | game view, end view, home lista, modello round/turno/limbo + bugfix |
| M6 — Deploy | ✅ | live in produzione (1.2.9+), Caddy TLS, systemd, backup, test 08 |
| **M7 — Dockerizzazione** | ✅ | **deploy primario = Docker Compose** (app + PostgreSQL), dizionario cotto in build, fine del modello a due repository, porta 8081, `docs/DEPLOY.md` |

## 📊 Overall Status
- **Milestone 1 (Setup & DB)**: ✅ **COMPLETATA**
- **Milestone 2 (Backend Core)**: ✅ **COMPLETATA**
- **Milestone 3 (AI Integration)**: ✅ **COMPLETATA**
- **Milestone 4b (Dizionario Ibrido)**: ✅ **COMPLETATA**
- **Milestone 4 (Frontend Base)**: ✅ **COMPLETATA** (home, crea, unisciti, lobby, game, end)
- **Milestone 5 (Gioco Realtime)**: ✅ **COMPLETATA** (game view rifinita, end view, home lista auto-aggiornata, animazioni CSS, feedback AI)
- **Milestone 6 (Deploy)**: ✅ **COMPLETATA, STORICA** (live su `parolemutanti.maxster.top` con systemd + Caddy fino a 1.5.0; percorso ora sostituito da M7)
- **Milestone 7 (Dockerizzazione)**: ✅ **COMPLETATA lato repo** — verifica sul server a cura dell'utente (`docs/DEPLOY.md`). Vedi `.memory-bank/M7-docker-migration.md`

## ✅ Cosa Funziona (Done)

### M1 — Setup & DB
- [x] Repo, PostgreSQL 16.14, 539.780 parole (poi sostituite), performance 45.84ms
- [x] 9 file `.clinerules/`, 6 file memory bank core
- [x] 6 MCP server configurati
- [x] Deploy files Caddy + systemd predisposti

### M2 — Backend Core
- [x] 11 file backend (server, logger, config, db/, game/, sockets/, utils/)
- [x] 28/28 test unit pass
- [x] Smoke test E2E: create → join → ready → submit
- [x] GameManager con validazione 3-step, TurnManager con timer, Validator

### M3 — AI Integration
- [x] Benchmark DeepSeek: 343ms media, 1500ms timeout
- [x] Modulo AI completo: client + cache + rateLimiter
- [x] Validator esteso a 4-step con fallback AI
- [x] Test E2E reale: parola inesistente → AI chiamata → risposta corretta
- [x] 0 regressioni sui test esistenti

### M4b — Dizionario Ibrido
- [x] Dizionario napolux sostituito con **LO (LibreOffice) + HF (HuggingFace)**
- [x] **184.393 parole** totali (dopo fix: **185.723**) — validità semantica alta
- [x] Script: `import-lo-dict.mjs`, `import-hf-dict.mjs`, `update-lo.mjs`, `check-update.mjs`
- [x] Schema source enum: `('LO', 'HF', 'DB', 'AI')`

### M4b-fix — Lettere Straniere
- [x] Charset esteso a `a-zàèéìòùjkwxy`
- [x] +1.330 parole con j/k/w/x/y (wifi, jazz, kiwi...)
- [x] Test aggiornato, 27 test pass

### M4 — Frontend Base
- [x] `frontend/index.html` shell con view switching
- [x] `css/base.css`, `components.css`, `views.css`
- [x] `js/main.js`, `router.js`, `state.js`, `api.js`, `socket.js`
- [x] `js/views/home.js`, `create.js`, `join.js`, `lobby.js` (viste principali)
- [x] `js/views/game.js`, `js/audio.js`

### M5 — Gioco Realtime (completata)
- [x] `views/game.js` rifinita: lista giocatori rimasti, feedback "Verifica in corso…" (turn_paused/resumed), submit
- [x] `views/end.js` creata: vincitore, durata, turni, verifiche AI, pulsanti
- [x] `main.js`: `game_over` → `#end` (niente alert), route #end
- [x] Home: lista partite visibile di default + polling 5s (auto-fermo fuori dalla home)
- [x] CSS: end view + home list + `.btn-success` (era usato ma non definito)
- [x] Jingle vittoria (success() in audio.js, già presente)

### M5-bugfix — Refresh in partita + parola corrente
- [x] Persistenza `pm-gameId` + `pm-nome` in localStorage
- [x] `tentaRipristinoPartita()` al boot con overlay + timeout 5s
- [x] Parola al centro = ultima valida (`currentWord`)

### M5-bugfix2 — Sweeper + Ripristino Robusto
- [x] Sweeper ogni 60s (waiting >5min, running 0 socket >2min, finished >1min)
- [x] `partitaPerLobby(p)` helper con payload completo
- [x] Overlay ripristino + attesa connessione socket (max 3s) + alert chiari

### Contatore TURNO sopra il timer (modifica UI verificata)
- [x] Aggiunto contatore `TURNO n · Round m/x` in `frontend/js/views/game.js` sopra il timer circolare (fallback sicuri: `turno ?? 1`, `round ?? 1`, `roundsTotali ?? giocatori.length`)
- [x] Verificato con Playwright su partita reale 2 giocatori: `TURNO 1 · Round 1/2` all'avvio → `TURNO 1 · Round 2/2` dopo "Passa il turno" (turnista Mario→Luigi). Console pulita. Screenshot `contatore-turno.png`
- [x] Nota test: evento pronto giocatore = `set_ready` (`{ nome, ready: true }`), NON `toggle_ready`; script riutilizzabile `/tmp/luigi-join.mjs`

### Fix refresh (M5) — commit successivi
- [x] `request_state` ora ri-registra il socket nella partita (room + tracking `socketToGame`) → dopo il refresh si continuano a ricevere tick/turn_update
- [x] `request_state` include `id`/`gameId` nello stato → il giocatore di turno può di nuovo inviare parole dopo il refresh
- [x] Abbandono durante partita running (2 giocatori): resta 1 solo → decretato il vincitore (`game_over`). Test E2E passato (Alice vince dopo abbandono di Bob)
- [x] Nuovo metodo `GameManager.abbandonaGiocatore()` + `_eliminaGiocatore()` centralizzato (riusa logica timeout)
- [x] `leave_game` ora gestisce anche lo stato `running`, non solo `waiting`
### M5b-fix — Desincronizzazione turno/round (commit 3437de2)
- [x] `socket.js`: aggiunti a `EVENTI` `round_start`, `round_passato`, `round_limbo`, `pareggio`, `turno_finito` (erano mancanti → nuova parola/turno mai ricevuti dopo un pareggio)
- [x] `gameHandler.js`: `turn_update` emesso solo se `turnManager.attivo === true` (niente più stato "stale" che sovrascriveva il pareggio)
- [x] `GameManager.js`: `turn_update` con stato CORRETTO post-`nuovoTurno` nel caso pareggio (allinea i client che ascoltano solo `turn_update`)
- [x] `views/game.js`: pulsante "⏭ Passa il turno" → "⏭ Passa il round"
- [x] E2E node sync-test: Alice/Bob allineati (stessa parola + turnista) per 27 turni di pareggi; verifica browser senza interazioni (TURNO 1→4, parola `cerei → vinile`, 0 errori console)

### M5c — Regola anti-ripetizione + elenco "Parole già scritte"
- [x] `Validator.validaMossa` rifiuta parole già usate (`parola_gia_usata`, check prima della distanza) via `paroleUsate` (Set)
- [x] `GameManager` mantiene `paroleUsate` + `history` (aggiornati a ogni submit valido e sul pareggio)
- [x] `TurnManager.statoCorrente()` espone `history` → propagata a turn_update/round_start/request_state
- [x] `partita_avviata` payload include `history`; `main.js` round_start copia `stato.history`
- [x] UI "📜 Parole già scritte" (catena completa, scrollabile, sopra "Giocatori rimasti", **più recente in cima ma numerazione assoluta 1→N**) in `views/game.js`
- [x] Fix ack submit in `views/game.js` (guardia `if (inputParola)` — niente più TypeError dopo re-render)
- [x] Unit test `backend/tests/validator.test.js` (3 casi) → **31/31**; E2E node reale (`membri`→`membra`, rifiuto `membri`); Playwright browser reale (`1. ariete (iniziale)` → `2. arieti · Alice`, console pulita)
- [x] **Controllo a tre fasi**: `1) DB → 2) morfologia (forme flesse, source 'MORF') → 3) AI`. Nuovo `utils/morfologia.js` (`candidatiFormeBase`); prompt AI su "esiste come lemma o forma flessa"; normalizzazione YES/SÌ/SI. Accetta `oziata`/`oziati` (lemma `oziato`); rifiuta il nonsense via AI. **38/38 test** (+7 in `morfologia.test.js`)


## ❌ Cosa resta da fare

### M6 (Deploy)
- [x] `deploy/deploy.sh` creato (flag-based: `--install/--env/--service/--caddy/--update`, `--domain/--port/--dir/--env-file`)
- [x] `deploy/parole-mutanti.service` pulito (niente `Documentation` personale; note su PORT/HOST)
- [x] `VERSION` = `1.0.0` (SemVer attivato post-M5; `package.json` allineato)
- [x] `backend/src/config.js`: default `HOST=127.0.0.1` quando `NODE_ENV=production`
- [x] Caddy integrato via `import` modulare: `deploy.sh --caddy` scrive `/etc/caddy/sites/parole-mutanti.conf` (da template), aggiunge `import /etc/caddy/sites/*.conf` al Caddyfile se assente, valida e ricarica. Supporto `--tls-cert/--tls-key` (certificati esistenti, come `efftrack`) o Let's Encrypt automatico. HSTS senza `includeSubDomains`.
- [x] `deploy/backup.sh` (pg_dump + gzip + rotazione 7) + cron automatico installato da `deploy.sh` nel deploy completo (ogni notte alle 3:00)
- [x] `deploy/README.md` (guida passo-passo primo deploy + architettura + aggiornamenti + backup)
- [x] Home: "📖 Come si gioca" aggiornata (3 fasi, non ripetere parole, pareggio) e resa sezione apribile (accordion con freccina ▸, `aria-expanded`, chiusa di default)
- [x] Fix deploy.sh: DB setup spostato in un passo `--db` DOPO `--env` (DATABASE_URL prima generata automaticamente); password DB generata nel shell e passata a setup-user.sql via `-v db_password` (psql \if/\set); niente più copia manuale password
- [x] Deploy reale su server (Caddy TLS, DNS, test produzione) — live dal 1.2.9, aggiornato fino a 1.3.3
### M7 (Dockerizzazione) — ✅ completata lato repo
- [x] **Dismesso il modello a due repository**: `sync-to-prod.sh` eliminato; rimossi i
  riferimenti al repo di produzione da `README.md`, `deploy/README.md`, `.clinerules/*`,
  `.memory-bank/*`; rimosso `.last-sync-dev-commit` da `.gitignore`
- [x] `deploy/Dockerfile` multi-stage (node:24-alpine; builder con `npm ci --omit=dev` +
  artefatto dizionario; runtime con dumb-init, utente non root uid 10001, healthcheck)
- [x] `.dockerignore` completo (segreti, `.git`, `node_modules`, `.clinerules/`,
  `.memory-bank/`, `docs/`, test, `e2e/`, file bare-metal)
- [x] `docker-compose.yml` (root): app + db (postgres:16-alpine), volume nominato,
  `restart: unless-stopped`, `init: true`, `env_file`, `depends_on: service_healthy`,
  healthcheck, logging json-file 10m×5, porta **127.0.0.1:8081**
- [x] **Dizionario cotto in build**: `db/export-dicts.mjs` → `dict/words.tsv.gz`
  (185.723 parole, 0,48 MB) + `db/seed-words.mjs` (import in ~2 s al primo avvio,
  no-op se la tabella è già popolata) + `db/wait-for-db.mjs`
- [x] `deploy/docker-entrypoint.sh`: attesa DB → schema idempotente → seed → `exec` del server
- [x] `deploy/backup-docker.sh` (pg_dump dal container `db`, rotazione 7)
- [x] `docs/DEPLOY.md`: architettura, primo deploy, **verifica dizionario**, aggiornamenti,
  backup, blocco Caddy, migrazione dal vecchio systemd + lista di pulizia, troubleshooting
- [x] `README.md` («Deploy con Docker» primario + bare-metal secondario) e
  `deploy/README.md` (riscritto come guida bare-metal)
- [x] `.env.example` riscritto per Docker (`POSTGRES_*`, `PORT=8081`, fail-fast) con
  sezione bootstrap avanzata; `npm run db:export-dicts|db:seed|db:wait|db:bootstrap`
- [x] Versione `1.5.0` → **`1.6.0`**
- [x] **Verifica con PostgreSQL 16.14 reale** (sandbox, no Docker): schema idempotente,
  seed 185.723 parole in 2,0 s, secondo avvio no-op, `/health` ok, frontend 200,
  gioco e2e 11/11 (parola valida da DB `source=LO`, inventata respinta), `npm test` 64/64

### Post-M5 (opzionali / rifiniture)
- [x] Test Playwright multi-context a 4 giocatori: 4 contesti isolati (Alice/Bob/Carlo/Diana) → stessa parola per tutti, ognuno vede i 4 giocatori, nessun conflitto localStorage
- [x] Rifiniture audio: envelope anti-click, `success()` come arpeggio di Do maggiore, `buzzer()` a due toni, `tick()`/`click()` con forme d'onda dedicate

### Audit regola 08 (1.3.3)
- [x] Fix 8.A: CORS default ristretto in produzione (`CORS_ORIGIN`); validazioni server-side `gamesToWin`/`initialLength` (creaPartita) e `ready` booleano (setReady); `data-game-id` escapato in home.js
- [x] Fix 8.B: `broadcastAPartita` ora usa le room (`lobby:`/`game:`) al posto dell'iterazione della mappa (O(1))
- [x] Fix 8.C: parole complete rimosse dai log (`mossa_rifiutata`, `parola_iniziale_scelta`, `parola_accettata_morfologia`); log uniformati JSON in `pool.js`/`config.js`
- [x] Fix 8.D: aggiunto test di integrazione `backend/tests/gameManager.test.js` (ciclo vita: crea/validazioni/avvio/pareggio/abbandono) + test e2e socket `backend/tests/e2e-socket.test.js` (flusso crea→join→ready→avvio→game_over)
- [x] Fix 8.E: `.env.example` documenta `DB_POOL_MAX`, `DEEPSEEK_ENABLED`, `CORS_ORIGIN`
- [x] Fix 8.F: `progress.md` allineato allo stato reale (M6 completato/live)

### Feedback (1.3.4)
- [x] Home: link "💬 Invia un feedback" → `mailto:bartosh1981@outlook.it?subject=Feedback%20ParoleMutanti` (stile touch-friendly `.home-feedback`). In futuro diventerà un form con invio email (vedi nota soluzioni).

### Feedback form + Telegram (1.3.5)
- [x] View `#feedback` (Tipo: suggerimento/problema/altro + sottocategoria dinamica, mobile-first) → `POST /api/feedback`
- [x] Endpoint `POST /api/feedback` (Express): validazione server-side + rate limit 3/min/IP, salva in tabella `feedback` (PostgreSQL), inoltra (opzionale) a un bot Telegram
- [x] Tabella `feedback` in `init-db.sql` (id, tipo, sottocategoria, testo, nome, created_at)
- [x] Modulo `backend/src/telegram/telegramClient.js` (fetch nativo, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` da env, testabile) + `backend/src/db/feedbackQueries.js`
- [x] Home: link feedback ora apre `#feedback` (form) al posto del mailto
- [x] Test unit `backend/tests/telegram.test.js` (formatter messaggio)

### Deploy: schema idempotente in --update (1.3.6)
- [x] `deploy.sh`: nuova funzione `do_schema()` (db:init idempotente con DATABASE_URL da env). Usata in `--db` (nuova installazione) e in `--update` (crea tabelle mancanti, es. `feedback`, senza toccare i dati)
- [x] `deploy/README.md` e header `deploy.sh` aggiornati (--update ora applica lo schema)

### Deploy: permessi env + do_schema rigoroso (1.3.7)
- [x] `do_env`: ripristina sempre `chown parole-mutanti` + `chmod 600` anche quando il file `.env` esiste già (evita che manualità/deploy lascino il file a root)
- [x] `do_schema`: ora `exit 1` con errore chiaro se manca `ENV_FILE`/`DATABASE_URL` (prima era un `return` silenzioso che faceva "riuscire" `--update` senza applicare lo schema); aggiunto `[schema] FATTO`

### Deploy: do_schema usa source dell'env (1.3.8)
- [x] Fix bug produzione: `do_schema` estraeva `DATABASE_URL` con `grep|cut`, che alterava l'URL se la password contiene caratteri speciali → `password authentication failed for user "paole_use"` (username troncato). Ora **sorgo l'intero file env** (`set -a; . "$ENV_FILE"; set +a`), stessa modalità del servizio in ExecStart (e del comando manuale che funzionava)

### Deploy: --update auto-re-exec (1.3.9)
- [x] Fix footgun "git pull dentro lo script in esecuzione": `do_update` ora al primo giro fa `git pull --ff-only` e poi **si ri-esegue con `exec "$0" --update`** (guardato da `PAROLE_REEXECED`), così carica sempre l'ULTIMA versione dello script senza doppie esecuzioni manuali

### Sweeper: pareggi automatici non contano come attività (1.3.10)
- [x] Fix: `_gestisciFineTurno` NON aggiorna più `lastActivityAt` nei percorsi automatici (pareggio e prosecuzione con ultima parola valida). `lastActivityAt` resta aggiornato solo dalle attività reali (submit valido, join, ready, avvio, abbandono)
- [x] Risultato: una partita orfana a 0 socket bloccata su pareggi infiniti ha `lastActivityAt` stantio → lo sweeper la cancella dopo 2 min. Test aggiunti: pareggio non tocca lastActivityAt + sweeper running a 0 socket → cancelled. Rimosso dalla Issue Aperte

### Frontend: toggle suono/tema aggiornano subito icona e badge (1.3.11)
- [x] Bug: `toggleSound()`/`toggleTheme()` aggiornavano lo state ma `refreshSoundIcon()`/`refreshThemeIcon()` erano chiamati solo all'avvio e al cambio rotta → icona header e badge home "audio on/off" restavano stantii (il suono però si togglava).
- [x] Fix: aggiunto `state.subscribe` in `main.js` che aggiorna icona header (suono+tema+status dot) e i badge della home (con `id` dedicati `stato-connessione`/`stato-tema`/`stato-audio` in `home.js`). Verificato con Playwright (icona 🔊/🔇, badge on/off, tema ☀️/🌙).

## 📈 Metriche di Avanzamento
```
M1 (Setup & DB):       [██████████] 100%  ✅ COMPLETATA
M2 (Backend Core):     [██████████] 100%  ✅ COMPLETATA
M3 (AI Integration):   [██████████] 100%  ✅ COMPLETATA
M4b (Dizionario):      [██████████] 100%  ✅ COMPLETATA
M4 (Frontend Base):    [██████████] 100%  ✅ COMPLETATA
M5 (Gioco Realtime):   [██████████] 100%  ✅ COMPLETATA
M6 (Deploy):           [██████████] 100%  ✅ COMPLETATA (storico, systemd)
M7 (Docker):           [██████████] 100%  ✅ COMPLETATA lato repo (verifica server: utente)
```

## 🏆 Risultati per Milestone

| KPI | M1 | M2 | M3 | M4b/M4b-fix | M7 |
|---|---|---|---|---|---|
| Parole nel DB | 539.780 → sostituite | - | - | 185.723 ✅ | 185.723 (cotte in immagine) ✅ |
| Performance query | 45.84ms ✅ | - | - | - | - |
| Test unit | - | 28/28 ✅ | 28/28 ✅ | 27/27 ✅ | 64/64 (con e2e socket) ✅ |
| Smoke E2E | - | PASS | PASS | PASS | PASS (create→join→ready→submit) |
| AI integrata | - | - | ✅ | - | - |
| Latenza AI media | - | - | 343ms | 370ms | - |

## 🐛 Issue Aperte
- **MCP filesystem**: config già aggiornata per includere `/home/death/paroleMutanti`; **serve riavvio di Cline** (o "Retry" sul banner) perché diventi effettivo.
- **Verifica sul server (M7)**: ✅ **SUPERATA il 2026-09-30** — due container `healthy`,
  `/health` ok (v1.6.0), seed 185.723 parole, `db:check` e `--force` ok; evidenze in
  `.memory-bank/M7-docker-migration.md` §6. Restano da confermare: Caddy su
  `https://parolemutanti.maxster.top` e partita reale a due giocatori dal browser.

## 🚀 Stato e prossimi passi

Il gioco è **giocabile end-to-end** e **live in produzione**:
- ✅ Server + Socket.io + DB + AI integrati
- ✅ Frontend completo (home con lista auto-aggiornata, crea, unisciti, lobby, game, end)
- ✅ Deploy **Docker Compose** (M7): app + PostgreSQL in container, dizionario cotto in
  build e importato al primo avvio, Caddy sull'host su `127.0.0.1:8081`
- ✅ Repo **unico**: nessun repo di produzione, nessuno script di sincronizzazione
- ➡️ Passi a cura dell'utente: blocco Caddy + partita reale dal browser
  (`docs/DEPLOY.md` §8), opzionali DeepSeek/Telegram (§3.3), cron di backup (§7)
