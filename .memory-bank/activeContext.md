# Active Context — Focus Corrente

## 🎯 Focus Corrente
**Stato progetto**: M1 ✅ M2 ✅ M3 ✅ M4b ✅ — Frontend M4+M5 completato. Bug fix M5 conclusi (desincronizzazione `3437de2`, **M5c anti-ripetizione + elenco parole**, **validazione a tre fasi DB+morfologia+AI**). **M6 Deploy in preparazione**: `VERSION` 1.0.0 attivato, `sync-to-prod.sh` + `deploy/deploy.sh` creati, `deploy/backup.sh` + cron (incluso nel deploy completo), repo pubblico `paroleMutanti_prod` popolato e pushato. **Rifiniture post-M5 fatte**: audio migliorato (envelope, arpeggio, buzzer) + test E2E multi-context a 4 giocatori verificato (stessa parola per tutti). Resta: deploy reale su server (Caddy TLS).

## ✅ Cosa è stato fatto (riepilogo cronologico)

### M1 — Setup & DB ✅
- 539.780 parole italiane caricate (filtro 3-10 lettere), performance query 45.84ms
- 3 tabelle + 1 vista + 4 script Node + 9 .clinerules + 6 MCP configurati

### M2 — Backend Core ✅
- Server Express + Socket.io + health check `/health`
- GameManager (state RAM), TurnManager (timer ottimistico/lockless), Validator (3-step)
- Lobby events: createGame, joinGame, ready
- 28/28 test unit pass, smoke test E2E ok

### M3 — AI Integration ✅
- Benchmark DeepSeek: 343ms media, timeout 1500ms
- Modulo AI completo: client + cache + rateLimiter
- Validator esteso a 4-step con fallback AI
- Test E2E reale con parola inesistente → AI → risposta

### M4b — Dizionario Ibrido ✅ (in sostituzione del DDL M4 "plain")
- **Push**: dizionario napolux sostituito con **LO (LibreOffice) + HF (HuggingFace)**
- 184.393 parole totali (poi 185.723 dopo fix lettere straniere)
- Script import/update/check +ETag e ON CONFLICT
- Schema source enum: `('LO', 'HF', 'DB', 'AI')`

### M4b-fix — Lettere Straniere ✅
- Charset esteso a `a-zàèéìòùjkwxy`
- +1.330 nuove parole (j/k/w/x/y: wifi, weekend, jazz, kiwi, yogurt...)
- Totale dizionario: **185.723 parole**

### M4 — Frontend Base (in parte, fino a M4.4) ✅
- `frontend/index.html` shell con view switching
- `css/base.css`, `components.css`, `views.css`
- `js/main.js`, `router.js`, `state.js`, `api.js`, `socket.js`
- `js/views/home.js`, `create.js`, `join.js`, `lobby.js`, `game.js`
- `js/audio.js` (Web Audio API)
- (end.js creata in M5, vedi sotto)

### M5-bugfix — Refresh in partita + parola corrente ✅
- Persistenza `pm-gameId` + `pm-nome` in localStorage
- `tentaRipristinoPartita()` al boot con overlay + timeout 5s
- Parola al centro = ultima valida (`currentWord`)

### M5-bugfix2 — Sweeper + Ripristino Robusto ✅
- Sweeper ogni 60s: waiting >5min, running 0 socket >2min, finished >1min
- `partitaPerLobby(p)` helper con payload completo
- Overlay ripristino + attesa connessione socket (max 3s) + alert chiari

### Fix lobby "partita senza codice" — commit `6a9b3a3` ✅
- **Bug**: `partitaPerLobby(p)` ritornava `gameId: p.id` ma NON `id: p.id`. `views/lobby.js` usa `partita.id || ''` → code-display vuoto.
- **Fix**: aggiunto `id: p.id` accanto a `gameId: p.id` (retrocompatibilità mantenuta).

### Contatore TURNO visibile sopra il timer (✅ verificato)
- **Nuova feature frontend (sola UI)**: aggiunto in `frontend/js/views/game.js` (righe ~51-52) un div `#turno-counter` sopra il timer circolare che mostra `TURNO n · Round m/x`.
- Proprietà usate con fallback sicuri: `partita.turno ?? 1`, `partita.round ?? 1`, `partita.roundsTotali ?? (partita.giocatori?.length ?? 1)`.
- **Verifica Playwright su partita reale (2 giocatori) PASS**: all'avvio mostra `TURNO 1 · Round 1/2`; dopo "Passa il turno" si aggiorna a `TURNO 1 · Round 2/2` (turnista passato da Mario a Luigi). Console pulita (0 errori, 0 warning). Screenshot: `contatore-turno.png`.
- **Nota test (importante)**: per marcare un giocatore pronto l'evento socket corretto è **`set_ready`** con `{ nome, ready: true }` (NON `toggle_ready`). Script riutilizzabile: `/tmp/luigi-join.mjs` (simula secondo giocatore join + set_ready, resta in ascolto per `partita_avviata`).
- Lo script usa `set_ready` e attende `partita_avviata` (usa l'evento corretto emesso da `lobbyHandler`).

### Fix refresh completo (M5) ✅
- **Bug 1**: dopo il refresh, `request_state` non ri-registrava il socket → il client non riceveva più tick/turn_update.
- **Fix 1**: `request_state` ora chiama `registraSocketInPartita(socket, gameId, partita)` (nuovo helper in `lobbyHandler.js`).
- **Bug 2**: `request_state` non includeva `id`/`gameId` → il giocatore di turno dopo il refresh inviava `submit_word` con `gameId: undefined` → errore generico.
- **Fix 2**: lo stato restituito include `id: partita.id` e `gameId: partita.id`.
- **Bug 3**: abbandonando 1 giocatore su 2 durante la partita, l'altro restava in gara fino allo scadere (niente vincitore).
- **Fix 3**: nuovo `GameManager.abbandonaGiocatore()` + `_eliminaGiocatore()` centralizzato; `leave_game` ora gestisce anche lo stato `running`. Test E2E passato: Alice vince dopo abbandono di Bob.
- **Decisione**: la disconnessione socket NON è trattata come abbandono durante running (altrimenti un refresh farebbe vincere l'avversario); le disconnessioni involontarie restano gestite dal sweeper.

### Modello round/turno/limbo (M5b) ✅
- **Bug**: in una partita a 3, due giocatori non rispondevano e il terzo vinceva senza giocare.
- **Modello implementato**: `TurnManager` con round sequenziali ed **evoluzione a catena** della parola.
  - Ogni round: il giocatore corrente ha TOT secondi per rispondere con parola a distanza 1.
  - Stato per round: `passato` (ha risposto valido) o `limbo` (timeout).
  - Fine turno:
    - Tutti `limbo` → **pareggio**: nuova parola base, tutti restano in gioco.
    - ≥1 `passato` → `limbo` eliminati; `passati` vanno avanti con l'ultima parola valida.
    - Dopo elim, se resta 1 solo → **vince**.
  - **Abbandono**: 2 giocatori → l'altro vince subito; ≥3 → si prosegue, valutazione a fine turno.
- **Test E2E**: 3 turni tutti in limbo → pareggio + nuova parola (PASS).
- **Eventi socket**: `round_passato`, `round_limbo`, `round_start`, `pareggio`, `turno_finito`.
### M5b-fix — Desincronizzazione turno/round tra client (✅ commit 3437de2)
- **Bug 1 (frontend)**: `frontend/js/socket.js` aveva una lista `EVENTI` che NON includeva `round_start`, `pareggio`, `round_*` → il client, pur avendo i listener in `main.js`, non riceveva mai la nuova parola né l'aggiornamento turno/round dopo un pareggio (schermo "bloccato" sulla parola vecchia, "entrambi attivi", mossa rifiutata).
- **Fix 1**: aggiunti a `EVENTI` gli eventi mancanti (`round_start`, `round_passato`, `round_limbo`, `pareggio`, `turno_finito`).
- **Bug 2 (backend)**: `gameHandler.js` emetteva `turn_update` "stale" (stato calcolato PRIMA che l'async `_gestisciFineTurno` completasse il pareggio), sovrascrivendo lo stato corretto.
- **Fix 2**: `turn_update` ora emesso solo se `turnManager.attivo === true`; quando il round chiude il turno lo stato corretto arriva da GameManager.
- **Fix 3**: `GameManager.js` nel caso pareggio emette un `turn_update` con stato CORRETTO (post-`nuovoTurno`) per allineare anche i client che ascoltano solo `turn_update`.
- **UX**: `views/game.js` rinomina il pulsante "⏭ Passa il turno" → "⏭ Passa il round".
- **Verifica**: E2E node (sync-test) Alice/Bob stessa parola+turnista per 27 turni di pareggi → ALLINEATO ✅; browser reale Mario+Bob timeout automatico → `TURNO 1 → TURNO 4 · Round 1/2`, parola `cerei → vinile`, turnista corretto, form attivo solo a chi tocca, "Passa il round". Console 0 errori.
- **⚠️ Nota sweeper**: i pareggi automatici aggiornano `lastActivityAt` → una partita orfana che fa pareggi continui (0 socket reali) non viene mai ripulita dallo sweeper (richiede `socketConnessi === 0` E `etaSenzaAttivita > 2min`). Attualmente mitigato dal riavvio del server (svuota la RAM). Valutare in futuro un criterio basato sui socket senza contare i pareggi automatici come attività.

### M5c — Regola anti-ripetizione + elenco "Parole già scritte" (✅)
- **Regola nuova**: un giocatore NON può riscrivere una parola già usata nella stessa partita (evita i loop `ARIDO → ARIDI → ARIDO`).
  - `Validator.validaMossa` riceve `paroleUsate` (Set di parole normalizzate) e rifiuta con `parola_gia_usata` PRIMA del check di distanza (messaggio specifico).
  - `GameManager` mantiene `partita.paroleUsate` (Set, lookup O(1)) e `partita.history` (array ordinato), aggiornati a ogni submit valido e sul pareggio.
- **Elenco parole**: la UI mostra "📜 Parole già scritte" con l'intera catena (iniziale, parole dei giocatori, base da pareggio), scrollabile, **sopra** "Giocatori rimasti" (deciso in plan mode: l'elenco è lo strumento di riferimento del turnista). Ordinata con **più recente in cima** ma numerazione assoluta 1→N (1 = iniziale).
  - `TurnManager.statoCorrente()` ora espone `history` → fluisce a `turn_update`/`round_start`/`request_state`.
  - `partita_avviata` payload include `history` (lobbyHandler); handler `round_start` di `main.js` copia `stato.history`.
- **Fix preesistente (M5c)**: in `views/game.js` l'ack di submit non crasha più quando il round avanza e rimuove il form → guardia `if (inputParola)` (prima: `TypeError: Cannot set properties of null (setting 'value')`).
- **Controllo a TRE fasi (M5c)**: la validazione ora è `1) DB → 2) forme flesse/derivate → 3) AI`.
  - **Fase 2 (nuova)**: `utils/morfologia.js` (`candidatiFormeBase`) deriva il lemma da forme flesse regolari (femminile/plurale/participio) e lo verifica nel DB (`source='MORF'`). Risolve i falsi negativi dell'AI su parole come `oziata`/`oziati` → lemma `oziato` (presente nel DB).
  - **Fase 3 (AI)**: solo se nemmeno il lemma è nel DB. Prompt cambiato da "di senso compiuto" a "esiste come lemma o forma flessa"; normalizzazione risposta robusta a YES/SÌ/SI (inglese o italiano, univoca).
  - **Verifica**: 38/38 test (7 nuovi in `morfologia.test.js`); validaMossa diretto: `oziato→oziata` e `oziato→oziati` → `source=MORF, lemma=oziato`; `oziato→oziatq` → AI la rifiuta.
  - **Nota**: l'LLM (DeepSeek) si è dimostrato incoerente sulle forme flesse (chat log: si contraddice, inventa esempi sbagliati) → la morfologia deterministica lo rimuove dal percorso delle forme comuni.
- **Verifica**: unit test `backend/tests/validator.test.js` (3 casi) → **31/31 test**; E2E node reale (`membri`→`membra`, rifiuto di `membri` con `parola_gia_usata`, history propagata ai client); Playwright browser reale (elenco `1. ariete (iniziale)` → `2. arieti · Alice`, console pulita dopo submit con re-render).


### M5 — Frontend: Game view rifinita + End view + Home lista (✅)
- **Home**: lista partite visibile di default (rimosso il pulsante), **polling 5s** tramite `list_games`, auto-fermo quando si lascia la home.
- **game.js**: lista giocatori rimasti + feedback "Verifica in corso…" (consuma `turn_paused`/`turn_resumed`, disabilita submit).
- **end.js** (nuova): vincitore, durata, turni, verifiche AI, pulsanti "Nuova partita"/"Home", jingle vittoria.
- **main.js**: `game_over` → `#end` (niente alert), route `#end` registrata.
- **CSS**: stili end-view + home-list + aggiunto `.btn-success` (era usato in lobby ma non definito).
- Test: home con polling funzionante (partita visibile, "aggiornato HH:MM:SS"), nessun errore console.
- Nota test: UI multi-tab a 2 giocatori limitata dal localStorage condiviso tra tab (non è un bug dell'app).

## 📍 Decisioni attive
- **Porta dev WSL**: 8090 (no Caddy, accesso diretto) ← confermato utente; in produzione bind `127.0.0.1` + Caddy
- **Caddy prod**: blocco separato per `parolemutanti.maxster.top` ← predisposto in `deploy/`
- **Range parole iniziali**: 5-8 lettere ← confermato utente
- **Audio**: Web Audio API (no file .mp3) ← confermato utente
- **Versioning SemVer**: attivazione post-M5 ← confermato utente
- **Default games_to_win**: 2 (configurabile 1-4) ← confermato utente
- **Logica turni/timer**: ottimistica (lockless) ← confermato utente
- **Dizionario**: LO + HF (ridondanza, no napolux) ← confermato utente
- **Charset**: accettate j/k/w/x/y (prestiti consolidati) ← confermato utente
- **SemVer attivato (M6)**: `VERSION` = 1.0.0 in root; `package.json` allineato; bump obbligatorio ad ogni commit funzionale (regola .clinerules/04)
- **Repo produzione**: `paroleMutanti_prod` (pubblico) affiancato in `../paroleMutanti_prod`; popolato via `sync-to-prod.sh` (whitelist, esclude rules/memory-bank/tests/ref personali); deploy con `deploy/deploy.sh`
- **Porta prod canonica**: 8090 (Caddy `reverse_proxy 127.0.0.1:8090`); dominio placeholder `__DOMAIN__`
- **HOST prod**: default `127.0.0.1` quando `NODE_ENV=production` (config.js)

## 🛠️ MCP Attivi nel Progetto (6 totali)
- ✅ **filesystem** (config aggiornata per includere `/home/death/paroleMutanti` — **serve riavvio di Cline** perché diventi effettivo)
- ✅ **memory** (knowledge graph, complementare al memory-bank file)
- ✅ **playwright** (test e2e browser con Chromium headless)
- ✅ **context7** (docs aggiornate librerie)
- ✅ **postgres** (query DB dirette connesso a `parole_mutanti`)
- ✅ **fetch** (chiamate HTTP esterne)

## ⚠️ Rischi aperti / da verificare
1. **Allineamento MCP filesystem**: config già aggiornata (file Linux `/home/death/.vscode-server/data/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`) per includere `/home/death/paroleMutanti`. **Serve riavviare Cline** (o "Retry" sul banner) perché il server MCP ricarichi la nuova lista di percorsi.
2. **Performance Levenshtein in game loop**: mitigata con query `WHERE length = newWordLength ± 1` poi Levenshtein sul subset.
3. **Gestione concorrenza GameManager**: approccio ottimistico (lockless, ultima submit vince).
4. **Rate limit submit**: 5/sec per socket — implementato custom in `utils/rateLimiter.js`.

## 📚 Learnings
- Ambiente con 4 web services Python (uvicorn) attivi: non toccare
- WSL2 Ubuntu 24.04.4 con systemd attivo (Postgres come servizio classico)
- L'utente preferisce "io lancio i comandi sudo, tu prepari il codice"
- `yauzl` gestisce ZIP senza dipendenze di sistema
- `pg` client non supporta `COPY` con stringa → INSERT batch
- Cline MCP config vive in Windows, raggiungibile da WSL via `/mnt/c/Users/death/AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Dopo modifica config MCP, serve riavviare Cline** (o "Retry" sul banner di errore)
- Il backend si avvia con `npm start` (no watch) o `npm run dev` (watch); nessun processo attivo prima del riavvio manuale
- Health check su `http://localhost:8090/health`