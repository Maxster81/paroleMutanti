# 01 — Backend Rules (Node.js + Express + Socket.io)

## Stile di Codice
- **Moduli ES6** (`import`/`export`), MAI CommonJS.
- **Node 20+** con prefisso `node:` per moduli nativi (`import { readFile } from 'node:fs/promises'`).
- **async/await** ovunque, MAI callback annidate o `.then()` concatenati.
- **JSDoc** (stile TypeScript-light) sui parametri di funzioni esportate, soprattutto quelle di dominio.
- **Configurazione**: centralizzata in `backend/src/config.js`, validata all'avvio.
- **Validazioni input**: SEMPRE server-side prima di toccare DB o servizi esterni.

## Architettura Servizi
- **Un singolo servizio Node** in dev (backend/).
- **Struttura modulare per dominio**:
  - `db/` → Pool pg, query helpers, transazioni
  - `game/` → GameManager, TurnManager, Validator, WordMutator
  - `sockets/` → Handler eventi Socket.io (uno per dominio)
  - `ai/` → Client DeepSeek, cache, rate limiter
  - `utils/` → Levenshtein, normalizzazione, costanti
- **Entry point**: `backend/src/server.js` (HTTP + Socket.io attached).

## Host e Binding
- **Sviluppo WSL**: bindare `0.0.0.0` per accessibilità da rete locale, WSL o VM.
- **Docker**: nel container `HOST` DEVE essere `0.0.0.0` (lo impone `docker-compose.yml`);
  la porta host è pubblicata **solo su loopback** (`127.0.0.1:8081`) e Caddy sta davanti.
- **Bare-metal**: `HOST=127.0.0.1` + Caddy come reverse proxy.
- Quando viene avviato il servizio, **annotare nella chat** quale binding è attivo.

## Health Check
- **Path**: `/health` (GET).
- Deve restituire JSON con: stato app, stato DB (`SELECT 1`), uptime, versione.

## Socket.io
- **Eventi wire**: snake_case (`submit_word`, `join_game`).
- **Handler codice**: camelCase (`handleSubmitWord`).
- **Ack callback**: usare il pattern `socket.emit(event, payload, ack)` per richiesta/risposta.
- **Rooms**: una room per `gameId` (state isolate).
- **Validazione payload**: SEMPRE prima di qualsiasi effetto (no trust client).

## Error Handling
- try/catch su OGNI operazione I/O.
- Errori centralizzati in middleware Express e wrapper Socket.io.
- Log strutturato: `logger.error({ event, gameId, userId, error })`.
- Mai esporre stack trace al client in produzione.
