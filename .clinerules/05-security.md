# 05 — Security Rules

## Autenticazione
- **NON prevista per design**: i giocatori usano nomi sessione-only (no account, no password).
- Nessuna segregazione per utente: lo stato di gioco è effimero e vive in RAM.
- I log e le stats aggregate NON contengono PII reale (solo nomi scelti dal giocatore, che sono volatili).

## Secrets
- **Tutti i secrets** (DB password, API key DeepSeek, SESSION_SECRET) letti da `process.env`.
- MAI hardcodati in sorgenti.
- `.env` in `.gitignore` (vedi root `.gitignore`).
- `.env.example` committato con placeholder.
- In produzione Ubuntu: secrets in `/etc/parole-mutanti/.env` caricati via `EnvironmentFile=` in systemd.

## Validazione Input
- **Server-side SEMPRE** (anche se c'è validazione client).
- Validare: tipo, lunghezza, charset (solo lettere italiane a-z, accentate, apostrofo).
- Mai fidarsi di input da Socket.io (mittente può essere qualsiasi client connesso).

## Rate Limiting
- **DeepSeek API**: max 10 chiamate/min per partita (configurabile via env).
- **Eventi Socket.io**: max 5 submit/secondo per socket (anti-spam).
- **Health check**: no rate limit (necessario per monitoraggio).

## Sicurezza Applicativa
- **CORS**: in dev aperto a `localhost:8090`, in prod limitato al dominio.
- **CSP**: header di base in Express (via `helmet` se aggiunto in M2).
- **Payload size limit**: 100KB max per eventi Socket.io.
- **No eval, no Function()** lato server.

## Sicurezza Rete (dev WSL)
- Backend in dev bind su `0.0.0.0:8090` SOLO per test locali.
- In produzione: bind `127.0.0.1` + Caddy davanti (reverse proxy + TLS).

## Logging
- MAI loggare: API key, password, contenuto completo eventi (possono contenere parola + nome utente → basta nome).
- Loggare: event name, gameId, userId (socket.id), esito, durata.
- Struttura JSON per facile parsing.

## Dipendenze
- `npm audit` eseguito ad ogni install (vedi pipeline).
- Aggiornamenti major review manuale.
