# Issue-Suggestion — Backlog aperto

Voci **aperte** da sistemare. Quando una issue è risolta, **rimuoverla** nello stesso commit.

---

## 🔴 Aperta — "Giocatore fantasma": l'abbandono durante la partita può non arrivare al server

**Segnalazione utente (2026-10-12)**: partita PC + smartphone. Lo smartphone va in standby
durante la partita; al rientro la UI risulta corretta (secondi e parola allineati, turno passato
allo smartphone). Poi il giocatore smartphone "esce", ma **il PC non ha nessuna evidenza**:
la partita continua per minuti, ogni mano va in stallo/pareggio e lo smartphone risulta ancora
**attivo** tra i giocatori.

**Indagine (analisi del codice) — 3 problemi concreti:**

1. **Nessun pulsante "abbandona" durante il proprio turno** — `frontend/js/views/game.js`:
   `#btn-leave-game` è renderizzato **solo** nel ramo "non è il tuo turno". Quando è il tuo turno
   ci sono solo *Invia parola* e *Passa la mano* → nella situazione descritta (turno passato allo
   smartphone) il giocatore **non poteva** inviare `leave_game`.

2. **Fallimento silenzioso dell'abbandono** — `frontend/js/views/game.js` invia
   `emit('leave_game', { nome })` **senza `gameId`**; il server (`lobbyHandler.js`) identifica la
   partita da una mappa in RAM `socketToGame` (socketId → gameId). Se il mapping manca/è stantio
   (es. dopo una riconnessione), risponde `{ ok:false, errore:'non_in_partita' }` **senza rimuovere
   il giocatore** — ma il client naviga comunque alla home → il telefono "esce", il server no.
   Inoltre `socket.leave('lobby:'+gameId)` lascia la room sbagliata: in partita il socket è in
   `game:${gameId}` e resta iscritto ai broadcast.

3. **Disconnessione in partita ≠ abbandono, senza timeout → fantasma** — per design (un refresh non
   deve far vincere l'avversario) `disconnect` durante `running` non elimina il giocatore
   (`lobbyHandler.js`). Lo sweeper (`GameManager._sweepAbbandonate`) cancella solo le partite
   "running con **0** socket" dopo 2 min: con 1 socket ancora vivo (il PC) la partita **non viene
   mai ripulita** → l'avversario resta attivo all'infinito e la partita gira a vuoto.
   *Candidato più probabile del sintomo osservato*: standby → socket caduto; al tap di "esci" il
   telefono si è riaddormentato → l'`emit` è rimasto bufferizzato ed è andato perso.

**Fix proposti (da approvare):**
- **A. UI**: rendere sempre disponibile "abbandona" durante la partita (anche sul proprio turno).
- **B. Protocollo**: inviare `gameId` in `leave_game`; fallback server su `payload.gameId`;
  gestire l'ack (no fallimenti silenziosi); `socket.leave` anche di `game:${gameId}`.
- **C. Anti-fantasma**: grace timer sul disconnect durante `running` (es. 60 s): se il giocatore
  rientra → annulla; se non rientra → abbandono effettivo + notifica all'avversario.
  *(Cambia la semantica decisa in M5: da approvare.)*

**Stato**: 🔴 aperta — in attesa di decisione sullo scope (A+B vs A+B+C).
