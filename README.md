# 🎮 Parole Mutanti

Gioco multiplayer realtime (2-8 giocatori) di modifica parole italiane. Mobile-first, vanilla JS, Node.js + Express + Socket.io + PostgreSQL + DeepSeek AI fallback.

## 📋 Stato progetto

**Milestone corrente**: 1 — Setup & DB

Vedi `.memory-bank/M1-setup-db.md` per i dettagli.

## 🏗️ Architettura

- **Frontend**: HTML5 + CSS3 + Vanilla JS (no framework), mobile-first 360x800px
- **Backend**: Node.js 20+ + Express + Socket.io
- **Database**: PostgreSQL 16
- **AI**: DeepSeek API per fallback validazione parole
- **Deploy**: Ubuntu + Caddy (HTTPS) + systemd (vedi `deploy/`)

## 🚀 Setup rapido (WSL dev)

### Prerequisiti
- Node.js >= 20
- PostgreSQL >= 14
- Git

### Installazione

```bash
# 1. Clona il repo
cd /home/death/paroleMutanti

# 2. Installa dipendenze
npm install

# 3. Configura le variabili d'ambiente
cp .env.example .env
# Modifica .env con le tue credenziali (DB, API key DeepSeek, ecc.)

# 4. Installa PostgreSQL (se non presente)
sudo apt install postgresql postgresql-contrib

# 5. Crea utente e database
sudo -u postgres psql -f db/setup-user.sql

# 6. Inizializza schema
npm run db:init

# 7. Importa dizionario italiano (3-10 lettere)
npm run db:import

# 8. Verifica
npm run db:check

# 9. Avvia server dev
npm run dev
```

## 🎯 Regole del gioco

- 2-8 giocatori per partita
- Computer genera parola iniziale (5-8 lettere per difficoltà)
- Ogni turno: modifica parola precedente con UNA azione
  - Cambia 1 lettera (es. `BANANA` → `BANANE`)
  - Aggiungi 1 lettera (es. `POTARE` → `PORTARE`)
  - Rimuovi 1 lettera (es. `BARARE` → `BARRE`)
- Validità: parola deve esistere in italiano (DB + fallback AI DeepSeek)
- Tempo per turno: 5-60 secondi (configurabile)
- Vince chi resta ultimo in piedi

## 📂 Struttura repo

```
paroleMutanti/
├── frontend/           # HTML/CSS/JS vanilla
├── backend/            # Node.js + Express + Socket.io
│   ├── src/
│   │   ├── server.js   # Entry point
│   │   ├── config.js   # Env loader
│   │   ├── db/         # Pool pg, query helpers
│   │   ├── game/       # Logica: GameManager, Validator
│   │   ├── sockets/    # Handler eventi Socket.io
│   │   ├── ai/         # Client DeepSeek + cache
│   │   └── utils/      # Levenshtein, normalizzazione
│   └── tests/          # Jest unit
├── db/
│   ├── init-db.sql     # Schema tabelle
│   ├── setup-user.sql  # Creazione user/DB
│   ├── import-words.js # Import dizionario
│   ├── init-db.js      # Runner init schema
│   ├── reset-db.js     # Drop + recreate
│   └── check-db.js     # Verifica stato
├── deploy/             # File per produzione
├── .memory-bank/       # Stato milestone
├── .clinerules         # Convenzioni codice
├── .env.example        # Template env vars
└── README.md
```

## 🧪 Test

```bash
# Unit test (Node test runner nativo, niente dipendenze extra)
npm test

# Verifica DB
npm run db:check
```

## 📦 Milestone

Vedi `ParoleMutantiMasterPrompt.md` per il piano completo.

- [x] **M1**: Setup & DB (in corso)
- [ ] **M2**: Backend Core (Express + Socket.io + validazione)
- [ ] **M3**: AI Integration (DeepSeek fallback)
- [ ] **M4**: Frontend Base (Home, Crea, Unisciti)
- [ ] **M5**: Gioco Realtime (timer, turni, audio)
- [ ] **M6**: Deploy (systemd + Caddy HTTPS)

## 🔐 Sicurezza

- `.env` mai committato
- API key DeepSeek letta solo da `process.env`
- Validazione input sia client che server
- Rate limit: max 10 chiamate DeepSeek/min per partita

## 📝 Licenza

MIT
