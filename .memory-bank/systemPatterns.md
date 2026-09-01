# System Patterns — Architettura

## 🏗️ Architettura ad alto livello

```
┌─────────────────────────────────────────────────────────────┐
│                       FRONTEND (Browser)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Home   │  │  Lobby   │  │   Game   │  │   End    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │           │
│       └─────────────┴──────┬──────┴─────────────┘           │
│                            │                                 │
│                  ┌─────────▼──────────┐                     │
│                  │   state.js (state) │                     │
│                  │   api.js  (fetch)  │                     │
│                  │   socket.js  (io)  │                     │
│                  │   audio.js  (wa)   │                     │
│                  └─────────┬──────────┘                     │
└────────────────────────────┼────────────────────────────────┘
                             │ WebSocket (Socket.io)
                             │ HTTP REST (health)
┌────────────────────────────▼────────────────────────────────┐
│                  BACKEND (Node.js + Express)                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │  server.js (HTTP + Socket.io attached)             │    │
│  │  ├── /health (GET)                                  │    │
│  │  └── Socket.io events: createGame, joinGame, ...    │    │
│  └────┬─────────────┬──────────────┬──────────────┬───┘    │
│       │             │              │              │         │
│  ┌────▼────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼────┐  │
│  │  game/  │  │ sockets/  │  │   ai/     │  │   db/    │  │
│  │ Manag.  │  │  Handler  │  │ DeepSeek  │  │  pool.js │  │
│  │ + Turn  │  │  eventi   │  │ + cache   │  │  + query │  │
│  │ + Valid.│  │           │  │ + rate-l. │  │  + trans │  │
│  └─────────┘  └───────────┘  └───────────┘  └──────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ pg.Pool (TCP)
┌────────────────────────────▼────────────────────────────────┐
│              PostgreSQL 16 (Database)                        │
│  ┌────────┐  ┌────────┐  ┌──────────┐                      │
│  │ words  │  │ games  │  │game_logs │                      │
│  │ ~500k  │  │  meta  │  │  stats   │                      │
│  └────────┘  └────────┘  └──────────┘                      │
└──────────────────────────────────────────────────────────────┘
```

## 🎮 Pattern di Gioco

### 1. **Validazione parola (ibrida DB + AI)**
```
submit_word(word):
  1. Normalizza (lowercase, no accenti)
  2. Check distanza Levenshtein da parola precedente (deve essere 1)
  3. Query DB: SELECT FROM words WHERE word = $1
     → Se trovata: VALIDA, ritorna
     → Se non trovata: vai a 4
  4. Cache check (Map in RAM)
     → Se in cache: usa risultato precedente
  5. DeepSeek API: "La parola 'X' esiste in italiano?"
     → YES: INSERT INTO words (source='AI'), VALIDA
     → NO: RIFIUTA
```

### 2. **Ciclo di turno**
```
TurnManager:
  - state: { currentPlayerIndex, currentWord, timeLeft, turnHistory }
  - startTurn(playerIndex):
      * Imposta timer (es. 30s)
      * Notifica tutti: "turn_started" { player, timeLimit, currentWord }
  - tick(): decrementa timeLeft
      * Se timeLeft <= 10s: beep
      * Se timeLeft <= 0: passa turno (timeout)
  - submitWord(playerId, word):
      * Valida (vedi sopra)
      * Se valida: aggiorna currentWord, history, next player
      * Se invalida: notifica solo il mittente
  - passTurn(playerId):
      * Solo turnista può chiamare
      * Riduce timeLeft a 0 → trigger nextTurn
```

### 3. **Stato partita (State Machine)**
```
Game States:
  waiting    → partita creata, in attesa giocatori (min 2)
  running    → partita attiva, turni/manche in corso
  finished   → partita terminata con vincitore
  cancelled  → creator ha annullato prima dell'inizio

Transitions:
  waiting → running  (tutti ready, parola iniziale generata)
  waiting → cancelled (creator esce)
  running → finished (un solo giocatore rimasto, o raggiunto games_to_win)
  running → cancelled (disconnessione creator + abbandono)
```

**Nomenclatura (best-of-N)**: mano=`round`, turno=`turno`, manche=`game`, partita=`match`.
Gerarchia: **mano** (un giocatore) → **turno** (N mani) → **manche** (vittoria +1 punto) → **partita**
(vincitore = chi raggiunge `games_to_win`, oppure resta un solo non-abbandonato).
Regole decise: 3 tentativi/mano (3° errore → limbo); abbandono DEFINITIVO (non rientra); lo stallo
(ex "pareggio") non chiude nulla (solo nuova parola).

## 🔐 Pattern di Sicurezza
- **Validazione input** sia lato client (UX) che server (sicurezza)
- **Rate limit** per evento Socket.io (anti-spam: 5 submit/sec)
- **Rate limit DeepSeek** (10/min/partita, anti-abuso costi)
- **No eval, no Function()**, no innerHTML con dati utente
- **CSP header** per vanilla JS (no CDN)
- **Payload limit 100KB** su eventi Socket.io

## 📊 Pattern di Persistenza
- **words**: persistenza completa (validità permanente, cache)
- **games**: solo metadati + snapshot. Lo state-of-truth è in RAM (GameManager) per performance
- **game_logs**: scritto solo a `game_over` (evento finale)

## 🎵 Pattern Audio
- **AudioContext singleton** creato al primo user gesture (per autoplay policy)
- **Funzioni riusabili**: `beep()`, `buzzer()`, `success()`, `tick()`
- **Volume master** a 0.3 + toggle muto (localStorage)

## 🌐 Pattern di Comunicazione
- **Eventi wire** (lato Socket.io): `snake_case`
- **Handler codice** (lato Node): `camelCase`
- **Ack callback**: pattern `socket.emit(event, payload, (err, result) => {...})`
- **Rooms**: una per `gameId` (state isolato tra partite)
- **Broadcast**: `io.to(gameId).emit(...)` per notifiche a tutti i giocatori della partita
