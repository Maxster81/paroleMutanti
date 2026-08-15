# Progetto: Web App Gioco "Parole Mutanti"

## 🎯 Obiettivo
Sviluppa un gioco multiplayer realtime per 2-8 giocatori, basato su modifiche a parole italiane valide. Mobile-first (verticale 360x800px min), responsive per landscape/tablet/PC. Hosting su server Ubuntu interno (Caddy reverse proxy, porta 8192, no Docker, systemd).

## 🤖 Il Tuo Ruolo (Cline come Agente)
- Agisci come sviluppatore full-stack senior esperto in Node.js, WebSockets, PostgreSQL, AI integration.
- **Metodo Agente**:
  1. Analizza requisiti, identifica ambiguità → chiedi chiarimenti prima di codificare.
  2. Crea piano step-by-step con milestone chiare.
  3. Implementa una milestone alla volta, chiedi conferma prima di commit/push.
  4. Testa ogni step (unit + e2e).
  5. Aggiorna `memory bank` dopo ogni milestone completata (file: `.memory-bank/*.md`).
  6. Usa `.clinerules` per convenzioni (codice modulare, commenti in italiano, no hardcode).
  7. Se errori, rollback e spiega causa.
- Output: Codice pronto per WSL (dev) e Ubuntu (prod).

## 🛠️ MCP (Model Context Protocol) Integration

- **MCP Esistenti**: Utilizza tutti gli MCP già configurati nel progetto (es. filesystem, memory bank, terminale) per leggere/scrivere file, tracciare progressi, eseguire comandi.
- **MCP Suggeriti**: Analizza il task e suggerisci l'installazione di MCP aggiuntivi che possano migliorare lo sviluppo, ad esempio:
  - `@modelcontextprotocol/server-postgres`: Per query dirette al DB PostgreSQL durante dev/test.
  - `@modelcontextprotocol/server-fetch`: Per chiamare API DeepSeek o scaricare liste parole da GitHub senza uscire dal contesto.
  - `@modelcontextprotocol/server-puppeteer`: Per test e2e automatizzati su browser (opzionale).
  - Altri MCP utili per Node.js, Socket.io, o testing.
- **Installazione**: Se un MCP è utile, chiedi conferma per installarlo (`npx -y @modelcontextprotocol/cli install <mcp-name>`) e aggiorna `.clinerules` o config progetto.
- **Uso**: Sfrutta gli MCP per automatizzare task ripetitivi (es. import DB, test realtime, deploy script) e documenta nel memory bank quali MCP sono attivi e come usarli.

## 📜 Regole del Gioco
- **Giocatori**: 2-8, nessun auth (nomi sessione-only).
- **Start**: Computer genera parola iniziale (5-8 lettere per difficoltà).
- **Turno**: Modifica parola precedente con UNA azione:
  - Cambia 1 lettera (es. BANANA → BANANE)
  - Aggiungi 1 lettera (POTARE → PORTARE)
  - Rimuovi 1 lettera (BARARE → BARRE)
- **Validità**: Parola deve esistere in italiano (DB + fallback AI DeepSeek).
- **Tempo**: 5-60 sec/turno (config). Timer visibile a tutti.
- **Passa Turno**: Pulsante manuale "Passa" (scala timer a 0).
- **Vittoria Partita**: Ultimo con risposta corretta se successivi falliscono.
- **Vittoria Gioco**: Chi vince X partite (1-4 config).
- **Fine**: Log statistiche, reset dati sessione.

## 🏗️ Architettura

### Frontend
- **Tech**: HTML5 + CSS3 (Grid/Flex) + Vanilla JS (no framework per leggerezza).
- **Mobile-First**: Viewport verticale priority, media queries per landscape.
- **UI**:
  - Home: "Crea Partita", "Unisciti", "Guida".
  - Crea: Form (giocatori 2-8, partite 1-4, tempo 5-60s, difficoltà F/M/D/I, nome).
  - Unisciti: Input ID + nome.
  - Lobby: Lista giocatori, "PRONTO", chat, "Annulla" (creator).
  - Gioco: Countdown 5s ordine, parola corrente, timer globale, input + "Valida" + "Passa" (solo turnista), feedback visivo/sonoro scadenza.
  - Fine: Vincitore, stats, "Nuova Partita".
- **Realtime**: Socket.io client per eventi (join, ready, turn, submit, gameOver).
- **Audio**: HTML5 Audio (beep 10s剩余， buzzer scadenza).

### Backend
- **Tech**: Node.js 20+ + Express + Socket.io.
- **DB**: PostgreSQL (parole, partite, logs).
  - Table `words`: word TEXT PRIMARY KEY, length INT, source (DB/AI).
  - Table `games`: id UUID, params JSONB, players JSONB, state ENUM, created_at.
  - Table `game_logs`: id, game_id, words_played JSONB, winner, duration, timestamp.
- **API DeepSeek**:
  - Endpoint: `https://api.deepseek.com/v1/chat/completions`
  - Prompt: "La parola '[WORD]' esiste in italiano come parola di senso compiuto? Rispondi solo YES/NO."
  - Cache: Se YES, inserisci in `words` (source: AI).
  - Rate limit: Max 10 chiamate/min per partita.
- **Eventi Socket.io**:
  - `createGame`, `joinGame`, `ready`, `submitWord`, `passTurn`, `chatMessage`, `gameOver`.
  - Rooms: ID partita.
- **Validazione**:
  1. Check edit distance =1 (Levenshtein lib).
  2. Check in DB (query veloce).
  3. Se manca → DeepSeek API (fallback).
  4. Normalizza: lowercase, rimuovi accenti.

### Database
- **Init**: Script `init-db.sql` per tabelle.
- **Import Parole**: Script Node per caricare https://github.com/napolux/paroleitaliane (parole_uniche.txt, ~900k, lowercase).
- **Connessione**: Env var `DATABASE_URL=postgresql://user:pass@localhost:5432/parole_mutanti`.

### Hosting
- **Dev (WSL)**: `npm run dev` (nodemon, hot reload).
- **Prod (Ubuntu)**:
  - Build: `npm run build`.
  - Systemd: `/etc/systemd/system/parole-mutanti.service` (restart always, user www-data).
  - Caddy: Rule `:8192 { reverse_proxy localhost:3000 }`.
  - Logs: `/var/log/parole-mutanti/*.log`.

## 📦 Dipendenze
```json
{
  "express": "^4.18.0",
  "socket.io": "^4.7.0",
  "pg": "^8.11.0",
  "deepseek": "^1.0.0", // o axios per API
  "levenshtein": "^1.0.0",
  "uuid": "^9.0.0",
  "dotenv": "^16.0.0"
}
```

## 🚀 Milestone (Step-by-Step)

### Milestone 1: Setup & DB
- [ ] Crea repo Git, struttura cartelle (frontend/, backend/, db/).
- [ ] Script `init-db.sql` + import parole da GitHub.
- [ ] Test: Query parola random per lunghezza.
- [ ] Update memory bank: "DB pronto, 900k parole caricate".

### Milestone 2: Backend Core
- [ ] Express server + Socket.io.
- [ ] Eventi: createGame, joinGame, ready.
- [ ] Validazione parole (DB + Levenshtein).
- [ ] Test: Unit test validazione.
- [ ] Update memory bank: "Backend lobby + validazione OK".

### Milestone 3: AI Integration
- [ ] Integrazione DeepSeek API (fallback).
- [ ] Cache risultati in DB.
- [ ] Test: Parole borderline (es. "selfie", "wifi").
- [ ] Update memory bank: "AI fallback attivo, cache OK".

### Milestone 4: Frontend Base
- [ ] HTML/CSS mobile-first (Home, Crea, Unisciti).
- [ ] Socket.io client, eventi base.
- [ ] Test: Join lobby da 2 browser.
- [ ] Update memory bank: "Frontend lobby responsive".

### Milestone 5: Gioco Realtime
- [ ] UI gioco (timer, input, feedback).
- [ ] Logica turni, passa manuale.
- [ ] Audio feedback (beep/buzzer).
- [ ] Test: Partita 4 giocatori, timer sync.
- [ ] Update memory bank: "Gioco realtime completo".

### Milestone 6: Deploy
- [ ] Script systemd per Ubuntu.
- [ ] Config Caddy porta 8192.
- [ ] Test: Accesso da mobile esterno.
- [ ] Update memory bank: "Deploy prod OK, accessibile su :8192".

## ✅ Criteri Accettazione
- Mobile-first: Test su Chrome DevTools (360x800).
- Realtime: 4 giocatori, latenza <200ms.
- Validazione: 99% parole DB, AI fallback <1s.
- Log: Stats salvate in `game_logs`.
- Codice: Commenti in italiano, modulare, no hardcode.

## 📝 Output Attesi
- Repo Git con README (setup WSL/Ubuntu, env vars).
- Codice commentato, test unitari.
- Istruzioni deploy (systemd, Caddy).
- Memory bank aggiornato post-milestone.

## ❓ Domande?
Prima di iniziare, chiedi:
- API key DeepSeek (da env var)?
- Credenziali PostgreSQL (user/pass/db)?
- Preferenze audio (file .mp3 o beep generato)?

Inizia con Milestone 1. Buon lavoro! 🚀