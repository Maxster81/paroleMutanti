# Changelog — Parole Mutanti

Modifiche rilevanti del progetto. Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/);
versioning [SemVer](https://semver.org/lang/it/). `VERSION` e `package.json` restano allineati.

## [1.8.0] — 2026-10-12

### Added
- **Primo giocatore casuale**: l'ordine di gioco di ogni manche è estratto a sorte (non parte più
  sempre il creatore della partita).
- **Schermata di "pesca" del primo giocatore**: all'avvio della partita i client mostrano una breve
  animazione che sorteggia chi inizia (stesso risultato per tutti). Il turno sul server diventa attivo
  al termine dell'animazione (`drawMs`, default 2800 ms), così nessuno perde secondi.

### Fixed
- **Avvio prematuro con lobby incompleta**: in una partita per ≥3 giocatori il gioco partiva subito
  appena i presenti erano pronti, anche se la lobby non era completa. Ora si parte subito **solo a
  lobby completa e pronta**; altrimenti parte il **countdown** (≥2 pronti), che scatta anche se non
  tutti i giocatori attesi sono entrati.
- **Avvio via timer lobby non notificava i client**: `partita_avviata` è ora inviata da un listener unico
  del GameManager, valido per entrambi i percorsi di avvio ("tutti pronti" e timer lobby).

## [1.7.0] — 2026-10-12

### Added
- **Grace timer anti-fantasma** (`DISCONNECT_GRACE_SECONDS`, default 60s, `0`=off): se un giocatore
  resta disconnesso durante una partita (`running`), dopo il grace viene trattato come **abbandono**
  e l'avversario viene avvisato (`giocatore_eliminato` → `game_over`). Il rientro entro il grace
  (refresh/standby breve, via `request_state`) **annulla** il timer.
- **Banner di turno full-width** in partita: `🎯 Tocca a te!` (fascia verde + glow pulsante) quando è
  il tuo turno, `⏳ In attesa di <nome>…` (fascia neutra tratteggiata) altrimenti. La card
  "Parola corrente" e il timer si "accendono" (bordo/glow) col proprio turno.
- Asserzione **e2e browser** sul banner di turno; **2 test e2e socket** (fallback `gameId` su
  `leave_game`; abbandono dopo il grace).

### Changed
- Il pulsante **"abbandona"** è ora **sempre** disponibile in partita (prima mancava sul proprio turno).
- Banner di turno posizionato **sotto il timer**, sopra la card della parola; bordo della card parola a 3px.
- Card **"Punteggio"** spostata **sotto** la card "Giocatori rimasti".
- **"Tentativi rimasti"** spostato **sotto** il pulsante "Invia parola" e ora si **aggiorna** a ogni errore.

### Fixed
- **Larghezza card instabile su PC** (≥900px): `.app-main`, essendo un flex item con `margin: 0 auto`
  sull'asse trasversale, si dimensionava *fit-content* → le card cambiavano larghezza col contenuto
  (proprio turno vs attesa). Fix: `width: 100%` nella media query ≥900px.
- **"Tentativi rimasti" non si aggiornava**: il broadcast `mossa_rifiutata` non includeva
  `tentativi`/`maxTentativi` (aggiunti; `round_start` aggiorna i tentativi).
- **Abbandono non affidabile**: `leave_game` ora invia il `gameId` (fallback lato server), i fallimenti
  vengono loggati (niente più esiti silenziosi) e il socket lascia anche la room `game:<id>`.

## [1.6.0] — 2026-09-30

### Changed
- **Dockerizzazione (M7)**: deploy primario con **Docker Compose** (container `app` + PostgreSQL 16),
  dizionario cotto nell'immagine in build, Caddy sull'host (`reverse_proxy 127.0.0.1:8081`).
  Dismesso il modello a due repository (niente repo di produzione né script di sync).
