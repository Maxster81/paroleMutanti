# M1 — Setup & DB ✅ COMPLETATA

> **STATO**: ✅ **Milestone 1 completata con successo il 2026-08-15**.

## 📋 Checklist M1

### Setup Base
- [x] Ricognizione ambiente (WSL, Caddy, Node, PG assente)
- [x] Installazione PostgreSQL 16.14 via apt
- [x] Attivazione servizio systemd
- [x] `git init` + branch `main`
- [x] Struttura cartelle (`backend/`, `frontend/`, `db/`, `deploy/`, `.clinerules/`, `.memory-bank/`)
- [x] File base: `.gitignore`, `.env.example`, `.env`, `package.json`, `README.md`
- [x] `npm install` (135 packages + yauzl, 0 vulnerabilities)

### Configurazione
- [x] `.clinerules/` a 9 file (modellato su efftrack, adattato a Node/Vanilla)
- [x] `.memory-bank/` con 6 file core
- [x] `.env.example` con tutte le variabili documentate
- [x] `deploy/Caddyfile.prod.snippet` (per M6)
- [x] `deploy/parole-mutanti.service` (per M6)

### Schema Database
- [x] `db/init-db.sql` con tabelle `words`, `games`, `game_logs`
- [x] Indici: `idx_words_length`, `idx_words_length_source`, `idx_words_created_at`
- [x] Indici: `idx_games_state`, `idx_games_created_at`, `idx_games_winner_name`
- [x] Indici: `idx_game_logs_*`
- [x] Vista `words_count_by_length`
- [x] Script `db/init-db.js` (runner Node)

### Setup Utente DB
- [x] `db/setup-user.sql` idempotente (DROP IF EXISTS + CREATE)
- [x] Estensione `pgcrypto` abilitata per `gen_random_bytes`
- [x] Utente `parole_user` creato con password generata
- [x] Database `parole_mutanti` creato (encoding UTF8, template0)
- [x] Permessi completi su schema `public` per `parole_user`

### Import Dizionario
- [x] Script `db/import-words.js` con:
  - Download ZIP da `https://raw.githubusercontent.com/napolux/paroleitaliane/main/paroleitaliane.zip`
  - Estrazione `paroleitaliane/parole_uniche.txt` con `yauzl` (no `unzip` di sistema)
  - Filtro 3-10 lettere
  - Normalizzazione lowercase (accenti preservati)
  - Dedup con `Set`
  - Inserimento bulk con fallback a INSERT batch (COPY non supportato con stringa dal client pg)
- [x] **539.780 parole caricate con successo**

### Verifica
- [x] Script `db/check-db.js` con diagnostica completa
- [x] **Tabelle verificate**: `game_logs`, `games`, `words`, `words_count_by_length` (vista)
- [x] **Test query random** (5 lettere: `raoli`, `pepai`, `tetra`, `rappa`, `diale`)
- [x] **Test query random** (7 lettere: `aereera`, `spoliai`, `ciminna`)
- [x] **Performance query random**: 45.84ms (sotto soglia 50ms ✅)

## 📊 Metriche Finali

| Metrica | Valore | Atteso | Note |
|---|---|---|---|
| Parole totali | **539.780** | 500-700k | ✅ In range |
| Tempo import | **14.7s** | < 90s | ✅ Eccellente |
| Query random latency | **45.84ms** | < 50ms | ✅ Performance OK |
| ZIP scaricato | 6.71 MB | ~7MB | OK |
| Righe lette totali | 986.701 | ~700k | Più del previsto (parole_uniche.txt ha duplicati) |
| Parole scartate | 414.717 | ~200k | Filtro charset/lunghezza rimuove nomi propri, verbi coniugati, ecc. |
| Tempo lettura ZIP+filter | 2.5s | < 5s | ✅ Veloce |
| Tempo insert DB | 12.2s | < 60s | ✅ OK |

## 📈 Distribuzione per Lunghezza

| Lettere | Conteggio | % del totale |
|---|---|---|
| 3 | 1.615 | 0.30% |
| 4 | 8.288 | 1.54% |
| 5 | 25.182 | 4.66% |
| 6 | 48.486 | 8.98% |
| 7 | 84.553 | 15.66% |
| 8 | 106.083 | 19.65% |
| 9 | 129.338 | 23.96% |
| 10 | 136.235 | 25.24% |
| **Totale** | **539.780** | **100%** |

La distribuzione è come attesa: più lettere = più combinazioni = più parole.

## 🐛 Issues Risolte durante M1

1. **`gen_random_bytes` non esiste**: aggiunto `CREATE EXTENSION IF NOT EXISTS pgcrypto` prima dell'uso
2. **`CREATE DATABASE` non ammesso in DO block**: spostato come comando top-level
3. **URL `parole_uniche.txt` 404**: il file è dentro `paroleitaliane.zip` (non è standalone)
4. **`\echo` non supportato da `pg` client**: rimosso, logging in JS
5. **Errore "closed" di yauzl**: readStream va aperto PRIMA di chiudere zipFile
6. **COPY con stringa non funziona in `pg`**: fallback automatico a INSERT batch da 1000

## 📝 Learnings

- Il dizionario `parole_uniche.txt` di `napolux/paroleitaliane` include **nomi propri, verbi coniugati e forme flesse** che vanno filtrate con un check alfabetico rigoroso
- `yauzl` è una buona scelta per gestire ZIP senza dipendenze di sistema
- `COPY` con `pg` richiede uno stream, non una stringa → per script one-shot il batch INSERT è più semplice
- L'indice `idx_words_length` da solo non basta per `ORDER BY random()` efficienti: serve `TABLESAMPLE` o `idx_words_length_word` con copertura migliore (da valutare in M2 se performance degrada)
- WSL2 Ubuntu 24.04 ha systemd attivo → PostgreSQL si installa come servizio classico senza sorprese

## 🎯 Risultato Finale M1

✅ **Database PostgreSQL "Parole Mutanti" operativo con 539.780 parole italiane** (3-10 lettere), prestazioni ottimali per query random (~46ms), schema completo pronto per M2 (logica di gioco e validazione).

## ⏭️ Prossimo Step

→ **M2: Backend Core** (Express + Socket.io + Validator)
- Server.js con health check
- GameManager per gestione stato partite
- Validator con Levenshtein (distanza 1)
- Lobby + createGame + joinGame events
- Test unit
