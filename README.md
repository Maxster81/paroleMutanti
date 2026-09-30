# 🎮 Parole Mutanti

Gioco multiplayer realtime (2-8 giocatori) di modifica parole italiane.
Mobile-first, vanilla JS, Node.js + Express + Socket.io + PostgreSQL + DeepSeek AI fallback.

## 🏗️ Architettura

- **Frontend**: HTML5 + CSS3 + Vanilla JS (no framework), mobile-first 360×800px
- **Backend**: Node.js 20+ + Express + Socket.io (serve anche il frontend)
- **Database**: PostgreSQL 16
- **AI**: DeepSeek API come fallback di validazione delle parole
- **Deploy**: Docker Compose (app + PostgreSQL) su Ubuntu, con **Caddy sull'host**
  come reverse proxy HTTPS — guida in [`docs/DEPLOY.md`](docs/DEPLOY.md)

## 🎯 Regole del gioco

- 2-8 giocatori per partita, nessun account (solo nome di sessione)
- Ogni partita è **pubblica** (visibile in home) o **privata** (solo via codice): decisa alla creazione.
  In home compaiono solo le partite **pubbliche**; il default è `DEFAULT_PUBLIC` (true)
- Il server genera una parola iniziale (5-8 lettere, configurabile)
- A ogni **mano** il giocatore modifica la parola precedente con UNA sola mossa:
  - Cambiare 1 lettera (es. `BANANA` → `BANANE`)
  - Aggiungere 1 lettera (es. `POTARE` → `PORTARE`)
  - Rimuovere 1 lettera (es. `BARARE` → `BARRE`)
- Validità della parola: **controllo a tre fasi**
  1. Nel dizionario (DB)
  2. Forma flessa/derivata (il lemma deve esistere nel DB)
  3. Fallback AI (DeepSeek)
- Non si può riscrivere una parola già usata nella stessa partita
- **3 tentativi per mano** (5-60 secondi): al 3° errore (o a tempo scaduto) la mano si chiude
- Se in un **turno** nessuno supera la mano → **stallo**: si riparte con una nuova parola, nessun eliminato
- Chi resta ultimo in una **manche** vince il punto; la **partita è al meglio di N manche**
  (`games_to_win`, 1-4): vince chi arriva a N (o chi resta da solo se gli altri abbandonano)
- **Timer partenza lobby**: con **≥3 giocatori** e **≥2 pronti (ma non tutti)** parte un countdown
  (`LOBBY_TIMER_SECONDS`, default 30s, configurabile solo via env): allo scadere i non-pronti
  vengono esclusi e i pronti entrano in partita. Se tutti sono pronti, la partita parte subito

## 🚀 Setup di sviluppo

```bash
# 1. Clona il repo
git clone <repo> paroleMutanti && cd paroleMutanti

# 2. Installa dipendenze
npm install

# 3. Configura le variabili d'ambiente
cp .env.example .env
# Modifica .env con le tue credenziali (DB, API key DeepSeek, SESSION_SECRET)

# 4. Installa PostgreSQL (se non presente)
sudo apt install postgresql postgresql-contrib

# 5. Crea utente e database
sudo -u postgres psql -f db/setup-user.sql

# 6. Inizializza schema
npm run db:init

# 7. Importa dizionario italiano
npm run db:import

# 8. Verifica
npm run db:check

# 9. Avvia (dev con watch)
npm run dev
```

## 🐳 Deploy con Docker (primario)

Stack: container `app` (Node — serve API, Socket.io e frontend) + container `db`
(PostgreSQL 16 con volume nominato). Caddy gira **sull'host** e inoltra a
`127.0.0.1:8081` (loopback: il DB non pubblica porte e l'app non è esposta
direttamente).

> Guida completa — architettura, prime installazioni, **verifica del
> dizionario**, aggiornamenti, backup, migrazione dal vecchio servizio systemd,
> troubleshooting: [`docs/DEPLOY.md`](docs/DEPLOY.md)

```bash
# Sul server (Ubuntu; Docker + plugin Compose già installati)
sudo mkdir -p /srv/apps && cd /srv/apps
sudo git clone https://github.com/Maxster81/paroleMutanti.git parolemutanti
sudo chown -R "$USER":"$USER" parolemutanti
cd parolemutanti

# Configurazione (le due variabili obbligatorie vengono generate qui)
cp .env.example .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
chmod 600 .env

# Build + avvio: al primo avvio il container applica lo schema e importa il
# dizionario delle parole (~185k parole, cotto nell'immagine in build)
docker compose up -d --build
docker compose ps                 # app e db devono essere "healthy"
curl -s http://127.0.0.1:8081/health
docker compose exec app npm run db:check
```

Blocco Caddy sull'host (HTTPS automatico Let's Encrypt):

```caddyfile
parolemutanti.maxster.top {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8081
}
```

Aggiornamenti: `git pull && docker compose up -d --build` (il volume del DB non
viene toccato; lo schema è idempotente). Backup: `./deploy/backup-docker.sh`.

## 🖥️ Deploy bare-metal (alternativa secondaria)

Su un server senza Docker resta disponibile il deploy con systemd + PostgreSQL
dell'host: [`deploy/README.md`](deploy/README.md). Anche in quel percorso la
fonte è **questo** repository: non esiste più un repo di produzione separato né
uno script di sincronizzazione.

## 📂 Struttura repo

```
paroleMutanti/
├── frontend/           # HTML/CSS/JS vanilla (serviti dal backend)
├── backend/            # Node.js + Express + Socket.io
│   ├── src/
│   │   ├── server.js   # Entry point (HTTP + Socket.io + statici)
│   │   ├── config.js   # Env loader validato
│   │   ├── db/         # Pool pg, query helpers
│   │   ├── game/       # Logica: GameManager, TurnManager, Validator, morfologia
│   │   ├── sockets/    # Handler eventi Socket.io
│   │   ├── ai/         # Client DeepSeek + cache + rate limit
│   │   ├── telegram/   # Notifica feedback (opzionale)
│   │   └── utils/      # Levenshtein, normalizzazione, morfologia, rate limit
│   └── tests/          # Unit test (node --test)
├── db/
│   ├── init-db.sql     # Schema tabelle (idempotente)
│   ├── setup-user.sql  # Utente/DB PostgreSQL (percorso bare-metal)
│   ├── export-dicts.mjs# Artefatto dizionario per l'immagine Docker (build)
│   ├── seed-words.mjs  # Popola `words` dall'artefatto (primo avvio container)
│   ├── wait-for-db.mjs # Attesa di PostgreSQL all'avvio del container
│   └── *.mjs|*.js      # Import/update/check dei dizionari
├── deploy/
│   ├── Dockerfile          # immagine multi-stage (Docker = deploy primario)
│   ├── docker-entrypoint.sh# bootstrap container: attesa DB, schema, seed
│   ├── backup-docker.sh    # backup del DB dello stack Docker
│   ├── deploy.sh           # deploy bare-metal (alternativa, systemd)
│   ├── parole-mutanti.service
│   ├── Caddyfile.prod.snippet
│   └── README.md           # guida bare-metal
├── docker-compose.yml  # stack: app + db (build dalla root)
├── .dockerignore       # esclude contesto di sviluppo e segreti dalla build
├── docs/DEPLOY.md      # guida deploy Docker + migrazione
├── .env.example        # Template env vars
└── README.md
```

## 🧪 Test

```bash
# Unit test (Node test runner nativo, nessuna dipendenza extra).
# Serve DATABASE_URL impostata: config.js la valida all'avvio anche nei test.
DATABASE_URL=postgresql://utente:password@127.0.0.1:5432/parole_mutanti npm test

# Contro lo stack Docker attivo (include i test e2e Socket.io)
docker compose exec app env E2E_URL=http://127.0.0.1:8081 npm test
```

## 🔐 Sicurezza

- `.env` mai committato (template con placeholder in `.env.example`; in Docker è
  escluso dal context della build da `.dockerignore`)
- API key DeepSeek letta solo da `process.env`
- Validazione input sia client che server
- Rate limit: max 10 chiamate DeepSeek/min per partita
- Esercizio: la porta del container è pubblicata **solo su loopback**
  (`127.0.0.1:8081`) e il DB non pubblica porte; l'unico ingresso pubblico è Caddy (TLS)

## 📝 Licenza

MIT
