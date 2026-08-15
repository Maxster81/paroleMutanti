# Product Context — Parole Mutanti

## 💡 Perché esiste
I giochi di parole esistenti (Ruzzle, Wordle, Paroliamo) hanno barriere alte (account, IAP, abbonamenti, single player). "Parole Mutanti" nasce per offrire un'alternativa:
- **Gratis e open source** (no paywall)
- **Multiplayer sociale** (fino a 8 amici in una stanza)
- **Nessun account** (entra, scegli nome, gioca)
- **Realtime** (latenza bassa, ritmo serrato)

## 🎯 Problemi che risolve
1. **Setup friction**: nessun login, si entra in 5 secondi
2. **Single player isolation**: il gioco è pensato per gruppi
3. **AI opaca**: la validazione è trasparente (DB + fallback AI solo se necessario)
4. **Lock-in tecnologico**: stack aperto, niente vendor lock-in

## 🧠 Esperienza Utente
- **Primo contatto**: home page → "Crea Partita" o "Unisciti" → scelta nome → lobby
- **Gameplay loop**: countdown 5s → turno giocatore corrente → tutti vedono timer e parola → submit → feedback immediato
- **Vittoria**: schermata fine con statistiche, "Nuova Partita" per rivincere
- **Delight**: audio feedback (beep, buzzer, success), animazioni CSS leggere, transizioni smooth

## 📱 Design Principles
1. **Mobile-first**: testato su 360x800, breakpoint progressivi
2. **Touch-friendly**: bottoni 44x44px, swipe-friendly dove possibile
3. **Reattivo**: feedback entro 200ms
4. **Leggibile**: contrasto WCAG AA, font 16px+ base
5. **Performante**: niente re-render completi, transizioni solo transform/opacity

## 🔮 Evoluzione futura (post-v1)
- Statistiche persistenti (record personale, vocabolario usato)
- Modalità "torneo" con bracket
- Classifica globale (richiede auth minima)
- Varianti di gioco (tempo ridotto, vocabolario limitato, ecc.)
- Internazionalizzazione (italiano + inglese)
