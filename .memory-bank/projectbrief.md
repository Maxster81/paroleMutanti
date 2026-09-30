# Project Brief — Parole Mutanti

## 🎯 Visione
Gioco multiplayer realtime (2-8 giocatori) di modifica parole italiane, mobile-first, vanilla JS, niente account.

## 🧩 Scope
- **In scope**: server di gioco realtime, validazione parole (DB + DeepSeek AI), frontend mobile-first, deploy su Ubuntu con Caddy.
- **Out of scope** (per la v1): autenticazione persistente, mobile app nativa, social/condivisione, analytics avanzati.

## 👥 Target Utenti
- Gruppi di amici italiani (2-8) che vogliono un passatempo rapido e competitivo.
- Fascia d'età: 14+ (no contenuti espliciti, vocabolario di base).
- Dispositivi: smartphone (primario) + tablet/desktop (secondario).

## 🎮 Regole del Gioco
- Giocatori: 2-8, nessun auth.
- Start: computer genera parola iniziale (5-8 lettere).
- Turno: modifica parola precedente con UNA azione:
  - Cambia 1 lettera
  - Aggiungi 1 lettera
  - Rimuovi 1 lettera
- Validità: parola in italiano (DB ~500k parole + fallback AI DeepSeek).
- Tempo: 5-60 sec/turno (configurabile).
- Vince chi resta ultimo in piedi.

## 🛠️ Stack Tecnico
- **Backend**: Node.js 20+ ESM, Express, Socket.io 4.x
- **Database**: PostgreSQL 16 (pg driver, no ORM)
- **AI**: DeepSeek API (fallback validazione)
- **Frontend**: Vanilla JS, HTML semantico, CSS Grid/Flex, Web Audio API
- **Deploy**: **Docker Compose** (container app + container PostgreSQL) su Ubuntu,
  con **Caddy sull'host** come reverse proxy HTTPS. Alternativa secondaria:
  bare-metal systemd (`deploy/README.md`). Guida: `docs/DEPLOY.md`.

## 📐 Vincoli
- **Docker** come tecnologia di deploy (dal M7); il bare-metal resta come alternativa
- **NO framework pesanti** (React/Vue/Angular)
- **NO auth** (per design)
- **Mobile-first** (360x800 px target)
- **Latenza < 200ms** tra submit e feedback
- **Vocabolario italiano 3-10 lettere** (decisione utente)
- **AI fallback < 1s** (rate limit 10/min/partita)

## 📅 Roadmap (Milestone)
- **M1**: Setup & DB ✅
- **M2**: Backend Core (Express + Socket.io + validazione) ✅
- **M3**: AI Integration (DeepSeek fallback) ✅
- **M4**: Frontend Base (Home, Crea, Unisciti) ✅
- **M5**: Gioco Realtime (timer, turni, audio) ✅
- **M6**: Deploy systemd + Caddy HTTPS ✅ *(storico)*
- **M7**: **Dockerizzazione** + fine del modello a due repository ✅
  (dettagli: `.memory-bank/M7-docker-migration.md`)
