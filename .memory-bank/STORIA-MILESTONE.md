# STORIA MILESTONE — Parole Mutanti (sunto unico)

> Cronologia consolidata delle milestone e dei bugfix M1–M5. Aggiornato 2026-08-16.
> Per dettaglio live su focus e stato corrente, vedere `activeContext.md` e `progress.md`.

## 🏁 M1 — Setup & DB ✅
- PostgreSQL 16.14 configurato, pool `pg` (max 10), query parametrizzate.
- Dizionario iniziale napolux (539.780 parole, poi **sostituito** in M4b), performance query random 45.84ms.
- 3 tabelle + 1 vista + 4 script Node (`init-db`, `reset-db`, `import-words`, `check-db`) + 9 `.clinerules` + 6 MCP.
- Predisposti file deploy (Caddy + systemd).

## ⚙️ M2 — Backend Core ✅
- Server Express + Socket.io + health check `/health` su `:8090` (bind 0.0.0.0 dev).
- 11 file backend: `config`, `logger`, `db/pool`, `game/` (GameManager, TurnManager, Validator, WordPicker), `sockets/` (lobbyHandler, gameHandler, index), `utils/` (levenshtein, normalizza, rateLimiter).
- Validazione 3-step, turni lockless/ottimistici, rooms per gameId + ack callback.
- 28/28 test unit + smoke E2E (create → join → ready → submit).

## 🤖 M3 — AI Integration ✅
- Client DeepSeek con cache + rate limiter (10/min/partita), timeout 1500ms, benchmark media 343ms.
- Validator esteso a 4-step con fallback AI; auto-arricchimento dizionario con `source='AI'`.
- Test E2E reale (parola inesistente → AI → risposta corretta), 0 regressioni.

## 📚 M4b — Dizionario Ibrido ✅
- **Sostituito napolux** con LO (LibreOffice) + HF (HuggingFace) → **184.393 parole** (poi 185.723 con lettere straniere).
- Script: `import-lo-dict.mjs`, `import-hf-dict.mjs`, `update-lo.mjs`, `check-update.mjs` (ETag), `db:setup`.
- Schema source enum: `('LO', 'HF', 'DB', 'AI')`.

## 🔤 M4b-fix — Lettere Straniere ✅
- Charset esteso a `a-zàèéìòùjkwxy` (prestiti: wifi, jazz, kiwi…).
- +1.330 parole (totale **185.723**), test aggiornati (27/27).

## 🖥️ M4 — Frontend Base ✅
- `index.html` SPA + CSS (`base`, `components`, `views`) + JS (`main`, `router`, `state`, `api`, `socket`, `audio`).
- Views: `home`, `create`, `join`, `lobby`, `game`, `end` (con guida "Come si gioca" in home).

## 🎮 M5 — Gioco Realtime + Bugfix ✅
### Game view rifinita + End view + Home lista
- **home** (`views/home.js`): regole "Come si gioca" in alto + lista partite **visibile di default** + **polling 5s** via `list_games` (auto-fermo fuori dalla home); rimosso pulsante lista e rimossa tagline.
- **game** (`views/game.js`): lista giocatori rimasti + feedback "Verifica in corso…" (turn_paused/resumed), submit, history.
- **end** (`views/end.js`, nuova): vincitore, durata, turni, verifiche AI, pulsanti, jingle vittoria.
- **main.js**: `game_over` → `#end` (niente alert), route #end registrata.
- **CSS**: end view + home list + aggiunto `.btn-success` (era usato in lobby ma non definito).

### Modello round/turno/limbo (M5b) ✅
- `TurnManager` con round sequenziali ed **evoluzione a catena** della parola.
- Ogni round: il giocatore corrente ha TOT secondi per rispondere con una parola a distanza 1 dalla parola corrente.
- Stato per round: `passato` (ha risposto valido) o `limbo` (timeout).
- **Regole di fine turno**:
  - Tutti in `limbo` → **pareggio**: nuova parola base, tutti restano in gioco.
  - ≥1 `passato` → `limbo` eliminati; `passati` vanno avanti con l'ultima parola valida.
  - Dopo elim, se resta 1 solo → **vince**.
- **Abbandono**: in 2 giocatori l'altro vince subito; in ≥3 si prosegue con il turno e si valuta a fine turno.
- Test E2E: **3 turni tutti in limbo → pareggio + nuova parola** (PASS).
- Eventi socket: `round_passato`, `round_limbo`, `round_start`, `pareggio`, `turno_finito`.

### M5-bugfix — Refresh in partita + parola corrente
- Persistenza `pm-gameId`/`pm-nome` in localStorage; `tentaRipristinoPartita()` al boot con overlay + timeout.
- Parola al centro = ultima valida (`currentWord`).

### M5-bugfix2 — Sweeper + Ripristino robusto
- Sweeper 60s: waiting >5min, running 0 socket >2min, finished/cancelled >1min.
- `partitaPerLobby(p)` con payload completo; attesa connessione socket + alert chiari.

### M5-bugfix3 — Lobby "partita senza codice" (commit 6a9b3a3)
- `partitaPerLobby(p)` includeva `gameId` ma non `id` → code-display vuoto. Aggiunto `id: p.id`.

### Fix refresh completo + abbandono multi-giocatore
- `request_state` ri-registra il socket (room + tracking) → dopo il refresh si ricevono di nuovo tick/turn_update.
- `request_state` include `id`/`gameId` → il giocatore di turno può inviare parola dopo il refresh.
- `GameManager.abbandonaGiocatore()` + `_eliminaGiocatore()` centralizzato; `leave_game` gestisce anche `running`.
- Abbandono: se resta 1 → vince; 0 → partita cancellata; ≥2 → si continua (test E2E: Alice vince dopo abbandono di Bob; test 3 giocatori ok).
- **Decisione**: disconnessione socket ≠ abbandono durante running (evita vittoria per un refresh); involontarie gestite dal sweeper.

## ⏳ M6 — Deploy (da fare)
- Validare `deploy/parole-mutanti.service` e `deploy/Caddyfile.prod.snippet`.
- Creare `deploy/backup.sh` (pg_dump); bind prod 127.0.0.1 + Caddy + TLS + DNS.