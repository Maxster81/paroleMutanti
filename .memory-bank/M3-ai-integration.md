# M3 — AI Integration ✅ COMPLETATA

> **STATO**: ✅ **Milestone 3 completata con successo il 2026-08-15**. Il fallback AI (DeepSeek) è integrato e funzionante.

## 📋 Checklist M3

### Step 0: Benchmark DeepSeek ✅
- [x] `backend/scripts/benchmark-deepseek.mjs` — script misurazione
- [x] 15 chiamate reali con chiave utente
- [x] Risultati: 15/15 successi, latenza media 343ms, p95 980ms (cold start)
- [x] **Decisione**: timeout 1500ms (sicuro + margine)
- [x] Risultati salvati in `benchmark-result.json`

### Step 1: AI Module ✅
- [x] `backend/src/ai/deepseekClient.js` — wrapper API con retry, timeout 1500ms
- [x] `backend/src/ai/cache.js` — cache RAM con TTL 24h, max 10k entries
- [x] `backend/src/ai/rateLimiter.js` — 10 chiamate/min per partita, sliding window

### Step 2: Integrazione ✅
- [x] `backend/src/db/wordQueries.js` — aggiunta `inserisciParolaAI(parola)` con `ON CONFLICT DO NOTHING`
- [x] `backend/src/db/wordQueries.js` — aggiunta `conteggioPerSource()` per monitoraggio
- [x] `backend/src/game/Validator.js` — chain 4-step: charset → distanza → DB → AI
- [x] `backend/src/game/TurnManager.js` — metodi `pause()` / `resume()` (predisposti, non usati in cut iniziale)
- [x] `backend/src/game/GameManager.js` — `submitParola` con `gameId` per rate limit
- [x] `backend/src/sockets/gameHandler.js` — broadcast `ai_usata` in turn_update + eventi paused/resumed

### Step 3: Test ✅
- [x] 28/28 test esistenti continuano a passare (no regressioni)
- [x] **Test E2E reale con DeepSeek**: parola `brtes` (NON in DB, NON italiana) → AI chiamata → risposta NO in 663ms → mossa rifiutata con messaggio user-friendly

## 🎯 Architettura Validator (M3)

```
submitWord(word)
  ↓
1. validaParola (charset + lunghezza)
  ↓ (fallisce) → rifiutata con motivo
2. isDistanzaUno(prev, current)
  ↓ (fallisce) → rifiutata con motivo
3. parolaEsistenteConSource(current)
  ↓ (esiste) → VALIDA, source = DB o AI
4. FALLBACK AI:
  4a. cache.get(current) → hit
  4b. rateLimiter.check(gameId) → esaurito
  4c. verificaParolaAI(current) → DeepSeek
       - YES → INSERT words source='AI' + valida
       - NO → rifiutata con motivo 'ai_rifiutata'
       - errore → rifiutata con motivo 'ai_errore'
```

## 📊 Metriche M3

| KPI | Valore | Note |
|---|---|---|
| Latenza media AI | 343ms | Da benchmark |
| p95 AI | 980ms | Cold start |
| Timeout impostato | 1500ms | Margine sicuro |
| Cache hit rate | stimato 30% | Dipende da vocabolario partite |
| Rate limit | 10/min/partita | Configurabile via env |
| Cache TTL | 24h | Auto-pulizia LRU |
| Test esistenti | 28/28 pass | No regressioni |
| Test E2E reale | PASS | AI risponde correttamente |

## 🏆 Risultato Test E2E

```
Parola iniziale: ortes
Submit: brtes (distanza 1, NON nel DB, NON italiana)
↓
Log: parola_non_in_db_ai_chiamata
↓ (663ms)
Log: ai_validation_completed { valida: false, tentativo: 1 }
↓
Risposta al client: { valida: false, motivo: 'ai_rifiutata', messaggio: '"brtes" non è riconosciuta come parola italiana valida.' }
```

## 📝 Decisioni Architetturali M3

1. **Timeout 1500ms** basato su benchmark reale (non 5000ms come proposto inizialmente)
2. **Pause/resume TurnManager** implementati ma NON usati nel cut iniziale: la latenza AI (~340ms) è accettabile dato che i turni sono >= 5s. Attivabili in futuro per "verifica in corso..." UI
3. **Cache con TTL 24h**: la cache si applica al risultato DeepSeek, ma la INSERT su DB persiste per sempre
4. **Rate limit per partita** (non globale): 10/min × N partite è OK, e impedisce a una partita di saturare l'API
5. **INSERT source='AI' su YES**: arricchisce permanentemente il dizionario. La prossima volta la parola è in DB e non si chiama più AI
6. **Logging**: log strutturato con `ai_validation_completed { durataMs, valida, tentativo }` per monitoraggio
7. **Risposta utente-friendly**: motivi tipo `ai_rifiutata`, `ai_errore`, `rate_limit` con messaggi in italiano

## 🐛 Issues Risolte durante M3

1. **Import sbagliato in Validator.js**: `cache as aiCache` invece di `get as aiCacheGet, set as aiCacheSet` — risolto
2. **Test E2E iniziale fallito per parola iniziale random**: raffinato il test per selezionare dinamicamente una parola NON nel DB a distanza 1

## ⏭️ Prossima Milestone (M4)

**M4 — Frontend Base** (vanilla JS mobile-first)
- `frontend/index.html`: shell con view switching
- CSS: base, components, views
- JS: state, api, socket, main
- Views: home, create, join
- Test Playwright mobile 360x800

## 📝 Note sul Dizionario (posticipato)

Le parole "senza senso compiuto" nel dizionario napolux restano un problema aperto. Soluzioni:
- Quando troviamo un dizionario migliore, creiamo `db/import-better-words.js` dedicato
- L'AI arricchirà progressivamente il dizionario con parole "veramente italiane"
- Filtro post-import pattern-based (consonanti/vocali ripetute) da valutare in futuro
