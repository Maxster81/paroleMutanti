# M2 — Backend Core ✅ COMPLETATA

> **STATO**: ✅ **Milestone 2 completata con successo il 2026-08-15**. Il backend è pienamente funzionante.

## 📋 Checklist M2

### Step 1: Utility ✅
- [x] `backend/src/logger.js` — logger strutturato JSON (4 livelli + child logger)
- [x] `backend/src/utils/levenshtein.js` — wrapper `distanzaEdit` + `isDistanzaUno`
- [x] `backend/src/utils/normalizza.js` — `normalizzaBase` + `validaParola` con regex italiana
- [x] `backend/src/utils/rateLimiter.js` — sliding window per-socket
- [x] `backend/tests/levenshtein.test.js` — 11 test (tutti pass)
- [x] `backend/tests/normalizza.test.js` — 17 test (tutti pass)
- [x] **28 test totali, 0 fail** in 213ms

### Step 2: DB Queries ✅
- [x] `backend/src/db/wordQueries.js`:
  - `parolaEsistente(word)` → boolean
  - `parolaEsistenteConSource(word)` → {esiste, source}
  - `paroleCasuali(lunghezza, n)` → string[]
  - `conteggioTotale()`, `conteggioPerLunghezza(l)`
  - `healthCheck()` → {ok, errore}

### Step 3: Game Logic ✅
- [x] `backend/src/game/WordPicker.js` — scelta pesata per disponibilità
- [x] `backend/src/game/Validator.js` — validazione 3-step (charset → distanza → DB)
- [x] `backend/src/game/TurnManager.js` — EventEmitter per tick/turn_change/timeout
- [x] `backend/src/game/GameManager.js` — singleton con CRUD + lifecycle (waiting → running → finished)

### Step 4: Socket Handlers ✅
- [x] `backend/src/sockets/lobbyHandler.js` — create_game, join_game, leave_game, set_ready, list_games
- [x] `backend/src/sockets/gameHandler.js` — submit_word, pass_turn, request_state
- [x] `backend/src/sockets/index.js` — `attachSocketHandlers(io)`
- [x] Rate limiter lobby: 10/sec, submit: 5/sec

### Step 5: Server + Smoke Test ✅
- [x] `backend/src/server.js` — Express + Socket.io + health check + graceful shutdown
- [x] `/health` ritorna JSON con `status, uptime, version, database, env`
- [x] `/` serve placeholder HTML (frontend arriva in M4)
- [x] **Smoke test E2E PASSATO**:
  - Alice crea partita → ack con ID
  - Bob join → 2 giocatori
  - Entrambi ready → auto-avvio con parola iniziale random
  - Broadcast `partita_avviata` ricevuto
  - Alice submit "porta" (vs "boboc") → rifiutata correttamente con motivo "distanza"
  - Messaggi user-friendly in italiano
  - Logger strutturato JSON
  - Graceful shutdown

## 📊 Statistiche Finali

| Metrica | Valore |
|---|---|
| File backend creati | 11 (5 src + 4 game + 3 socket + 1 db wordQueries) |
| Test unit | 28 (tutti pass) |
| Test E2E (smoke) | 1 (passa) |
| Linee codice stimate | ~1500 (commentate in italiano) |
| Tempo avvio server | <1s |
| Tempo risposta /health | ~35ms |
| Latenza validazione parola | <50ms (DB query) |
| Concorrenza | Ottimistica (lockless) |

## 🎯 Architettura Finale

```
backend/src/
├── server.js              # Express + Socket.io + health
├── logger.js              # JSON structured logger
├── config.js              # Env validation
├── db/
│   ├── pool.js            # pg.Pool singleton
│   └── wordQueries.js     # Query DB su words
├── game/
│   ├── GameManager.js     # State partite in RAM (singleton)
│   ├── TurnManager.js     # Timer + turni (EventEmitter)
│   ├── Validator.js       # Validazione 3-step
│   └── WordPicker.js      # Scelta parola iniziale
├── sockets/
│   ├── index.js           # attachSocketHandlers(io)
│   ├── lobbyHandler.js    # Lobby events
│   └── gameHandler.js     # Game events
└── utils/
    ├── levenshtein.js
    ├── normalizza.js
    └── rateLimiter.js
```

## 🐛 Issues Risolte durante M2

1. **Test `distanzaEdit("barare", "barre")`**: atteso 2, realtà 1 (Levenshtein conta una sostituzione). Corretto test.
2. **Test `distanzaEdit("banana", "ciliegia")`**: atteso 5, realtà 7. Corretto test.
3. **Regex italiana troppo permissiva**: accettava 'w' in "wifi". Aggiunto check esplicito per lettere straniere (j, k, w, x, y).
4. **socket.io-client non installato**: aggiunto come devDep per smoke test.

## 📝 Decisioni Architetturali

1. **GameManager singleton vs DI**: usato singleton per semplicità. Test in M2.1+ potranno usare DI con istanze mock.
2. **Validazione 3-step sequenziale**: charset → distanza → DB. Il DB è il passo più lento, gli altri sono fail-fast.
3. **Rate limiter per-socket**: identificato da `socket.id`, sliding window in RAM. Cleanup automatico ogni 60s.
4. **Event-driven TurnManager**: usa `EventEmitter` per disaccoppiare logica timer da broadcasting socket.
5. **Logger strutturato JSON**: niente librerie, solo `console.log/error/warn` con `JSON.stringify`.
6. **Graceful shutdown**: SIGINT/SIGTERM chiudono io, server, pool DB. Testato in smoke test.
7. **Auto-avvio partita**: quando tutti sono ready, il server avvia automaticamente (no UI click "start").
8. **5 sec cleanup post-game**: dopo game_over, la partita resta in RAM 5s per mostrare schermata fine, poi rimossa.

## 🏆 Eventi Socket.io Esposti

### Client → Server
- `create_game` (ack) → crea partita
- `list_games` (ack) → lista partite in lobby
- `join_game` (ack) → join partita
- `leave_game` (ack) → esce dalla lobby
- `set_ready` (ack) → toggle ready
- `submit_word` (ack) → proponi parola
- `pass_turn` (ack) → passa turno
- `request_state` (ack) → recupera stato corrente

### Server → Client
- `lobby_updated` → cambi in lobby (join/ready)
- `partita_avviata` → partita inizia, primi turni
- `turn_update` → cambio turno + validazione
- `tick` → ogni secondo (per timer UI)
- `beep` → ultimi 10 secondi (per audio)
- `turno_scaduto` → timeout
- `mossa_rifiutata` → mosse non valide
- `giocatore_eliminato` → timeout di un giocatore
- `game_over` → partita finita con vincitore
- `partita_cancellata` → annullata

## ⏭️ Prossima Milestone (M3)

**M3 — AI Integration**: DeepSeek API per fallback validazione
- `backend/src/ai/deepseekClient.js` — wrapper API
- `backend/src/ai/cache.js` — cache risultati in RAM
- `backend/src/ai/rateLimiter.js` — 10/min per partita
- Integrazione in Validator (se `parolaEsistente` false → DeepSeek)
- Test con parole borderline (es. "selfie", "wifi")
