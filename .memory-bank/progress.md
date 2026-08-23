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
| M6 — Deploy | ⏳ | da validare Caddy/systemd, backup, TLS |

## 📊 Overall Status
- **Milestone 1 (Setup & DB)**: ✅ **COMPLETATA**
- **Milestone 2 (Backend Core)**: ✅ **COMPLETATA**
- **Milestone 3 (AI Integration)**: ✅ **COMPLETATA**
- **Milestone 4b (Dizionario Ibrido)**: ✅ **COMPLETATA**
- **Milestone 4 (Frontend Base)**: ✅ **COMPLETATA** (home, crea, unisciti, lobby, game, end)
- **Milestone 5 (Gioco Realtime)**: ✅ **COMPLETATA** (game view rifinita, end view, home lista auto-aggiornata, animazioni CSS, feedback AI)
- **Milestone 6 (Deploy)**: ⏳ **NON INIZIATA** (file predisposti, da validare)

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


## ❌ Cosa resta da fare

### M6 (Deploy)
- [ ] `deploy/Caddyfile.prod.snippet` (già fatto, validare)
- [ ] `deploy/parole-mutanti.service` (già fatto, validare)
- [ ] Script backup DB (`deploy/backup.sh`)
- [ ] Bind prod `127.0.0.1` + DNS `parolemutanti.maxster.top`
- [ ] TLS Let's Encrypt
- [ ] Test produzione

### Post-M5 (opzionali / rifiniture)
- [ ] Test Playwright multi-context per flusso 4 giocatori (per evitare il localStorage condiviso tra tab)
- [ ] Rifiniture audio se richieste
- [ ] Attivazione versioning SemVer (post-M5, come da regola .clinerules/04)

## 📈 Metriche di Avanzamento
```
M1 (Setup & DB):       [██████████] 100%  ✅ COMPLETATA
M2 (Backend Core):     [██████████] 100%  ✅ COMPLETATA
M3 (AI Integration):   [██████████] 100%  ✅ COMPLETATA
M4b (Dizionario):      [██████████] 100%  ✅ COMPLETATA
M4 (Frontend Base):    [██████████] 100%  ✅ COMPLETATA
M5 (Gioco Realtime):   [██████████] 100%  ✅ COMPLETATA
M6 (Deploy):           [░░░░░░░░░░]  0%   ⏳ da iniziare
```

## 🏆 Risultati per Milestone

| KPI | M1 | M2 | M3 | M4b/M4b-fix |
|---|---|---|---|---|
| Parole nel DB | 539.780 → sostituite | - | - | 185.723 ✅ |
| Performance query | 45.84ms ✅ | - | - | - |
| Test unit | - | 28/28 ✅ | 28/28 ✅ | 27/27 ✅ |
| Smoke E2E | - | PASS | PASS | PASS |
| AI integrata | - | - | ✅ | - |
| Latenza AI media | - | - | 343ms | 370ms |

## 🐛 Issue Aperte
- **MCP filesystem**: config già aggiornata per includere `/home/death/paroleMutanti`; **serve riavvio di Cline** (o "Retry" sul banner) perché diventi effettivo.
- **Sweeper vs pareggi automatici**: i pareggi automatici (0 socket reali) aggiornano `lastActivityAt` → una partita orfana che fa pareggi continui non viene mai ripulita dallo sweeper (richiede `socketConnessi === 0` E `etaSenzaAttivita > 2min`). Attualmente mitigato dal riavvio del server (svuota la RAM). Valutare in futuro un criterio basato sui socket senza contare i pareggi automatici come attività.

## 🚀 Pronto per M6 (Deploy)

Il gioco è **giocabile end-to-end**:
- ✅ Server + Socket.io + DB + AI integrati
- ✅ Frontend completo (home con lista auto-aggiornata, crea, unisciti, lobby, game, end)
- ✅ Bug fix: refresh partita, submit turnista post-refresh, abbandono multi-giocatore, code-display lobby, lista partite home
- ✅ Feedback "verifica in corso…" durante validazione AI
- Manca: deploy in produzione (Caddy + systemd + backup + TLS)
