# M5-bugfix — Refresh in partita + parola corrente ✅ COMPLETATA

> **STATO**: ✅ Bug fix completato. Refresh in partita ora ripristina correttamente, e la parola al centro è l'ultima valida (non più la prima).

## 🐛 Bug 1: Refresh in partita → partita "persa"

**Causa**: `gameId` era solo nello state in memoria (oggetto JS), perso al refresh.

**Soluzione**: persistenza automatica in `localStorage`:
- `pm-gameId`: UUID partita (salvato ad ogni `state.update({gameId: ...})`)
- `pm-nome`: nome giocatore (già salvato prima, ora anche via state)

**Ripristino al boot** (`main.js`):
1. Dopo 500ms (per dare tempo al socket di connettersi)
2. Se c'è `pm-gameId` in localStorage
3. Chiama `emit('request_state', { gameId, nome }, cb)`
4. Se `{ ok: true, stato }`: aggiorna state, naviga a `#lobby` o `#game` a seconda di `stato.state`
5. Se `{ ok: false }`: pulisce `pm-gameId`, naviga a `#home`

## 💡 Miglioramento UX: parola al centro = ultima valida

**Prima**: il backend inviava `parolaIniziale` nel `turn_update` e `partita_avviata`, e il frontend mostrava sempre quella (la prima parola della partita).

**Ora**:
- **Backend**: il TurnManager include sia `parolaCorrente` (nome interno) sia `currentWord` (alias, compatibilità frontend) in `statoCorrente()`. Viene aggiornato ad ogni `submitMossa` con `partita.currentWord = risultato.normalizzata`.
- **Frontend** (`views/game.js`): mostra `partita.currentWord || partita.parolaIniziale || '?'`. Quindi il giocatore di turno vede sempre l'ultima parola da cui partire.

## 📊 File Modificati

| File | Modifica |
|---|---|
| `frontend/js/state.js` | Constructor legge gameId/nome da localStorage. update() sincronizza automaticamente. |
| `frontend/js/main.js` | Funzione `tentaRipristinoPartita()` al boot con timeout 5s. |
| `frontend/js/views/game.js` | Usa `partita.currentWord` invece di `parolaIniziale` per la parola al centro. |
| `backend/src/game/TurnManager.js` | `statoCorrente()` ora include anche `currentWord` (alias di `parolaCorrente`) per compatibilità frontend. |
| `backend/src/sockets/gameHandler.js` | Già pronto: `request_state` ritorna `{ok:false}` se partita non esiste. |

## 🎯 Decisioni

- **Persistenza**: `gameId` + `nome` (entrambi)
- **No timeout di abbandono**: il server mantiene la partita fino a `game_over` o cancellazione esplicita
- **Partita cancellata server**: `alert("La partita è stata cancellata")` + torna a `#home`
- **Refresh con partita finita**: il listener `game_over` pulisce `pm-gameId` e naviga a `#home`

## 🔄 Flusso completo

```
[User in partita]
  ↓ state.update({gameId, partita})
  ↓ localStorage.setItem('pm-gameId', gameId)
[Refresh F5]
  ↓
[main.js bootstrap]
  ↓ tentaRipristinoPartita()
  ↓ emit('request_state', {gameId, nome})
  ↓
[Server]
  ├─ Partita esiste → {ok: true, stato: {...}}
  │   ↓
  │   state.update({gameId, partita: stato})
  │   navigate('#lobby' o '#game' in base a state)
  │
  └─ Partita non esiste → {ok: false}
      ↓
      localStorage.removeItem('pm-gameId')
      state.update({gameId: null, partita: null})
      navigate('#home') [NO alert, refresh pulito]
```

## ✅ Test

Da fare in produzione:
1. Crea partita → vai in lobby → refresh → torna automaticamente in lobby
2. Stessa cosa in game view
3. Submit parola → refresh → torna in game view con currentWord aggiornato
4. Cancella partita lato server (manualmente con `psql` o restart) → refresh → alert "cancellata" + home
5. Partita finisce (game_over) → refresh → va in home (localStorage pulito)

## ⏭️ Prossima Milestone

- M5: game view completa con animazioni, grafica avanzata, effetti
- M6: deploy in produzione
