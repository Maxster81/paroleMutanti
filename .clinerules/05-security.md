# 05 — Security Rules

## Autenticazione
- **NON prevista per design**: i giocatori usano nomi sessione-only (no account, no password).
- Nessuna segregazione per utente: lo stato di gioco è effimero e vive in RAM.
- I log e le stats aggregate NON contengono PII reale (solo nomi scelti dal giocatore, che sono volatili).

## Secrets
- **Tutti i secrets** (DB password, API key DeepSeek, SESSION_SECRET) letti da `process.env`.
- MAI hardcodati in sorgenti.
- `.env` in `.gitignore` (vedi root `.gitignore`) **e** in `.dockerignore`: i segreti
  non entrano nel context della build, quindi non possono finire nell'immagine.
- `.env.example` committato con placeholder (vuoti per `SESSION_SECRET` e
  `POSTGRES_PASSWORD`: `docker compose` si ferma se non sono valorizzati).
- Docker (produzione): secrets nel `.env` della root (`600`) letti via `env_file:`;
  `POSTGRES_*` vengono usati da Compose anche per costruire `DATABASE_URL`.
- Bare-metal (alternativa): secrets in `/etc/parole-mutanti/.env` via `EnvironmentFile=`.

## Validazione Input
- **Server-side SEMPRE** (anche se c'è validazione client).
- Validare: tipo, lunghezza, charset (solo lettere italiane a-z, accentate, apostrofo).
- Mai fidarsi di input da Socket.io (mittente può essere qualsiasi client connesso).

## Rate Limiting
- **DeepSeek API**: max 10 chiamate/min per partita (configurabile via env).
- **Eventi Socket.io**: max 5 submit/secondo per socket (anti-spam).
- **Health check**: no rate limit (necessario per monitoraggio).

## Sicurezza Applicativa
- **CORS**: in dev aperto (`*`); in Docker/bare-metal dietro Caddy lasciare
  `CORS_ORIGIN` vuoto (app same-origin: nessun CORS cross-origin necessario).
- **CSP**: header di base in Express (via `helmet` se aggiunto in M2).
- **Payload size limit**: 100KB max per eventi Socket.io.
- **No eval, no Function()** lato server.

## Sicurezza Rete
- **Dev WSL**: backend bind su `0.0.0.0:8081` (porta libera) SOLO per test locali.
- **Docker**: nel container il bind è `0.0.0.0` (necessario), ma la porta è pubblicata
  **solo su loopback** (`127.0.0.1:8081`) e il container `db` **non pubblica porte**:
  dall'esterno si passa solo da Caddy (TLS).
- **Bare-metal**: bind `127.0.0.1` + Caddy davanti (reverse proxy + TLS).
- L'immagine gira come **utente non root** (uid 10001) e con `init: true`/`dumb-init`.

## Logging
- MAI loggare: API key, password, contenuto completo eventi (possono contenere parola + nome utente → basta nome).
- Loggare: event name, gameId, userId (socket.id), esito, durata.
- Struttura JSON per facile parsing.

## Dipendenze
- `npm audit` eseguito ad ogni install (vedi pipeline).
- Aggiornamenti major review manuale.
