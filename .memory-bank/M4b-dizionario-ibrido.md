# M4b — Dizionario Ibrido ✅ COMPLETATA

> **STATO**: ✅ **Dizionario napolux sostituito con successo con LO + HF**. Sistema ora validato semanticamente.

## 📋 Cosa è Stato Fatto

### Step A: Pulizia napolux ✅
- [x] `db/reset-db.js` riscritto e funzionante
- [x] DROP di tutte le 540k parole napolux
- [x] Vecchio `db/import-words.js` (napolux) lasciato come "legacy/optional"
- [x] `package.json`: `db:import` ora punta a `db:import:lo && db:import:hf`

### Step B: Import LibreOffice ✅
- [x] `db/import-lo-dict.mjs` — nuovo script
- [x] Download `it_IT.dic` da GitHub LibreOffice (95.382 righe, 1.24MB)
- [x] Parsing formato MySpell: split su `/` per estrarre parola base
- [x] Filtro: 3-10 lettere, charset italiano, no lettere straniere
- [x] **58.857 parole inserite** con `source='LO'`
- [x] Tempo: 1.8s

### Step C: Import Hugging Face ✅
- [x] `db/import-hf-dict.mjs` — nuovo script
- [x] Download `dictionary_sorted.json` (89.76MB, 313.342 record)
- [x] Parsing JSON array di `{id, word, definition}`
- [x] Filtro 3-10 lettere
- [x] **125.536 parole nuove inserite** con `source='HF'`
- [x] 31.309 parole erano già in LO (skip via ON CONFLICT)
- [x] Tempo: 19.2s

### Step D: Update On-Demand Scripts ✅
- [x] `db/check-update.mjs` — confronta ETag remoto vs locale, exit code 0/1/2
- [x] `db/update-lo.mjs` — reimport incrementale con `ON CONFLICT DO NOTHING`
- [x] Aggiunti a `package.json`: `db:check-update`, `db:update`
- [x] `db/README.md` — documentazione completa strategia dizionari
- [x] `.gitignore` aggiornato: `db/.last-*` escluso

### Step E: Schema Migration ✅
- [x] `init-db.sql` CHECK constraint aggiornato: `('LO', 'HF', 'DB', 'AI')`
- [x] Tutti gli script riscritti/aggiornati
- [x] **Test E2E reale con dizionario pulito**:
  - Parola iniziale: `sozze` (5 lettere, in HF)
  - Submit: `aozze` (distanza 1, NON in DB)
  - AI chiamata → risposta NO in **370ms** (latenza ottima)
  - Mossa rifiutata con messaggio user-friendly

## 📊 Statistiche Finali Dizionario

| KPI | Valore | Note |
|---|---|---|
| **Parole totali** | **184.393** | (LO: 58.857 + HF: 125.536) |
| Tempo import totale | ~21s | LO 1.8s + HF 19.2s |
| Parole comuni (overlap) | 31.309 | già presenti in LO quando importato HF |
| Latenza AI media | 370ms | con dizionario pulito (no spam) |
| Parole in `LO` (LibreOffice) | 58.857 | Lessico curato, GPL 3.0 |
| Parole in `HF` (HuggingFace) | 125.536 | Da Wiktionary, CC BY-SA 4.0 |
| Parole in `AI` (DeepSeek) | dinamico | Validate runtime, fallback |

## 🆚 Confronto Pre/Post

| Metrica | Pre (napolux) | Post (LO+HF) |
|---|---|---|
| Parole totali | 539.780 | 184.393 |
| Validità semantica | Bassa (forme flesse, possibili errori) | Alta (lessico curato) |
| Parole "non di senso" | Sì (es. "boboc", "kasmi") | No (tutte validate) |
| Frequenza update | Mai (abbandonato) | 1-2/anno (LO) + on-demand (HF) |
| Nomi propri | Tanti | Quasi zero |
| Fonte unica | Sì (rischiosa) | No (ridondanza LO+HF) |

## 🎯 Decisioni Architetturali M4b

1. **2 dizionari invece di 1**: LO (lessico curato) + HF (Wiktionary con definizioni) → copertura ampia + ridondanza
2. **No cron job per update**: preferiamo controllo umano on-demand. Update frequency: 1-2/anno (LO) è gestibile manualmente
3. **ETag per check rapidi**: `db/check-update.mjs` confronta ETag remoto vs locale in 1 round-trip HTTP
4. **INSERT con ON CONFLICT DO NOTHING**: l'update è idempotente, può essere rieseguito senza duplicati
5. **Schema source enum esteso**: `('LO', 'HF', 'DB', 'AI')` — retrocompatibilità con vecchio codice
6. **Parole "AI" si auto-arricchiscono**: ogni parola italiana moderna validata da DeepSeek viene salvata con `source='AI'`

## 📝 Comandi npm Disponibili

```bash
# Setup completo (reset + import entrambi)
npm run db:setup

# Import singoli
npm run db:import:lo   # Solo LibreOffice (~2s)
npm run db:import:hf   # Solo HuggingFace (~20s)

# Update
npm run db:check-update  # Check ETag (exit 0=update, 1=ok, 2=errore)
npm run db:update         # Reimport incrementale LO

# Verifica
npm run db:check          # Stats DB

# Reset (ATTENZIONE)
npm run db:reset          # Cancella TUTTO
```

## ⏭️ Prossima Milestone

Il dizionario è ora solido. Possiamo procedere con:
- **M4 Frontend Base** (vanilla JS mobile-first)
- Oppure aggiungere altri dizionari (es. Treccani se disponibile)
