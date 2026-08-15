# M5-bugfix2 — Sweeper + Ripristino Robusto ✅ COMPLETATA

> **STATO**: ✅ 3 problemi risolti e committati. Partite abbandonate vengono pulite automaticamente, refresh in partita è robusto.

## 🐛 Problemi risolti

### 1. Partita "Mario" sempre aperta in RAM
**Causa**: il `GameManager` manteneva TUTTE le partite in RAM per sempre. I test precedenti avevano creato partite mai chiuse.
**Fix**: `_sweepAbbandonate()` con `setInterval` ogni 60s:
- `waiting` da >5min → cancellata
- `running` con 0 socket da >2min → cancellata
- `finished`/`cancelled` da >1min → rimossa definitivamente

### 2. Parola al centro non cambia
**Causa**: `lobby_updated` non includeva `currentWord`. Il client non vedeva la parola aggiornata dopo ogni submit.
**Fix**:
- `lobbyHandler.js`: nuova funzione `partitaPerLobby(p)` include TUTTO (currentWord, params, timeLeft, turno, vincitore, etc.)
- Tutti i broadcast passano per `partitaPerLobby()`
- Backend `TurnManager.statoCorrente()` include `currentWord` (alias di `parolaCorrente`)

### 3. Refresh in partita → Caricamento o form Join confusi
**Causa**: il ripristino partita non gestiva correttamente il caso "partita non esiste più".
**Fix** (`main.js`):
- Aspetta connessione socket PRIMA di qualsiasi cosa (max 3s)
- Overlay "Ripristino partita in corso…" durante il tentativo
- Timeout 5s → alert "Connessione lenta, riprova" + pulisce + home
- `{ok: false}` → alert chiaro + pulisce localStorage + navigate home
- Success → naviga a `#lobby` o `#game` in base a `stato.state`

## 📦 File modificati

| File | Modifica |
|---|---|
| `backend/src/game/GameManager.js` | Sweeper automatico + socket tracking + lastActivityAt + partita completa |
| `backend/src/sockets/lobbyHandler.js` | partitaPerLobby() helper con payload completo |
| `frontend/js/main.js` | Overlay, attesa socket, alert chiaro, navigate home |

## 🎯 Decisioni

- **Sweeper ogni 60s** (non troppo aggressivo, non troppo lento)
- **Timeout waiting 5min** (tempo standard per riunirsi a una partita)
- **Timeout running 2min con 0 socket** (rileva "tutti disconnessi" → partita inutile)
- **Timeout finished 1min** (cleanup veloce dopo fine partita)
- **Alert sempre** quando la partita non esiste (no refresh "silenzioso" confuso)

## 🔄 Flusso completo refresh in partita

```
[Refresh F5 durante partita]
  ↓
[main.js bootstrap]
  ↓ aspetta connessione socket (max 3s)
  ↓ tentaRipristinoPartita()
  ↓
[mostraOverlay "Ripristino partita..."]
  ↓ emit('request_state', {gameId, nome})
  ↓
[Server]
  ├─ {ok: true, stato: ...} → state.update + navigate #lobby/#game → nascondi overlay ✅
  └─ {ok: false} → alert "partita non esiste" + pulisci localStorage + home → nascondi overlay ✅
  └─ timeout 5s → alert "connessione lenta" + pulisci + home → nascondi overlay ✅
```

## ✅ Test da fare in produzione

1. Crea partita con utente A → resta in lobby 6 minuti → dovrebbe essere cancellata dal sweeper
2. Crea partita con utente A → esci dal browser → dopo 2 minuti → partita rimossa
3. Partita finita → dopo 1 minuto → rimossa dalla RAM
4. Refresh in partita che esiste → overlay + redirect automatico
5. Refresh in partita che NON esiste più → alert + home

## ⏭️ Prossima Milestone

- M5: game view completa con animazioni, grafica avanzata
- M6: deploy in produzione
