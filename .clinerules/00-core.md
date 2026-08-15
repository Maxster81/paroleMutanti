# 00 — Core Rules: Lingua, Comunicazione e Meta-Regole

## Lingua e Internazionalizzazione
- **UI e stringhe nelle pagine:** italiano
- **Commenti nel codice:** italiano
- **Documentazione:** italiano
- **Messaggi di commit:** italiano
- **Risposte all'utente:** in italiano, salvo diversa indicazione.

## Meta-Regola: Regole Sovrascrivibili
Ogni regola in questo workspace può essere messa in discussione. Se Cline identifica un approccio migliore:
1. Propone l'alternativa con analisi dettagliata di **vantaggi e svantaggi**
2. L'utente valuta e decide
3. Se approvato, la regola viene aggiornata con breve documentazione della decisione

**Nessuna regola è talmente rigida da non poter essere migliorata.**

## Regola di Progetto — Parole Mutanti
- Questo workspace serve a costruire un **gioco multiplayer realtime** di modifica parole italiane.
- Eseguibile su **WSL in dev** e **Ubuntu in produzione** (no Docker, no Python venv).
- **Stack**: Node.js 20+ (ES modules) + Express + Socket.io + PostgreSQL 16 + DeepSeek API (fallback AI).
- **Frontend**: vanilla JS, mobile-first (360x800), niente framework pesante, Web Audio API.
- **Auth**: NON prevista (nomi sessione-only per design).
- **Deploy**: systemd + Caddy (HTTPS in prod, HTTP in dev).
- Ogni decisione tecnica deve privilegiare: semplicità operativa, latenza bassa, mobile UX, codice didattico/legibile.
