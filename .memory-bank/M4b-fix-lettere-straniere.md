# M4b-fix — Rimozione Filtro Lettere Straniere ✅ COMPLETATA

> **STATO**: ✅ Fix completato. Parole con j, k, w, x, y ora accettate. 1.330 nuove parole nel dizionario.

## 🎯 Cosa è Stato Cambiato

### Motivazione
L'utente ha notato correttamente che parole come **wifi**, **weekend**, **jazz**, **kiwi**, **yogurt** sono ormai parte del vocabolario italiano comune (prestiti consolidati). Il filtro iniziale che escludeva j/k/w/x/y era troppo aggressivo.

### File Modificati
- `backend/src/utils/normalizza.js` → regex charset esteso a `a-zàèéìòùjkwxy`
- `db/import-lo-dict.mjs` → stesso fix regex
- `db/import-hf-dict.mjs` → stesso fix regex
- `db/update-lo.mjs` → stesso fix regex
- `backend/tests/normalizza.test.js` → test aggiornato, parola "wifi" ora attesa come valida

### Rimozione di `RE_LETTERE_STRANIERE`
La funzione `validaParola` ora NON controlla più contro `/[jkwxy]/`. Solo:
- Lunghezza 3-10
- Charset (esteso a jkwxy)
- No numeri/simboli/spazi

## 📊 Risultati Reimport

| Metrica | Prima | Dopo | Delta |
|---|---|---|---|
| LO totale | 58.857 | 59.537 | +680 nuove |
| HF totale | 125.536 | 126.186 | +650 nuove |
| **TOTALE** | **184.393** | **185.723** | **+1.330 nuove** |
| Test pass | 27 | 27 | OK |
| Latenza AI | invariata | invariata | OK |

### Distribuzione Lettere Straniere nel DB

| Source | Parole con j/k/w/x/y |
|---|---|
| LO (LibreOffice) | 680 |
| HF (HuggingFace) | 650 |
| **Totale** | **1.330** |

## 🎯 Decisione Architetturale

**Aggiungiamo j, k, w, x, y al charset italiano riconosciuto**, perché:
1. Sono prestiti ormai consolidati in italiano contemporaneo (Zingarelli 2024 li include)
2. Parole comuni (wifi, weekend, jazz, kiwi, yogurt) sono ormai italianissime
3. L'utente giustamente le vuole nel vocabolario di gioco
4. La validazione semantica è comunque garantita dal dizionario (LibreOffice + HuggingFace Wiktionary)
5. L'AI (DeepSeek) fa da fallback per qualsiasi parola dubbia

## ⏭️ Prossima Milestone

Il dizionario è ora completo e corretto. Possiamo procedere con:
- **M4 Frontend Base** (vanilla JS mobile-first: HTML + CSS + JS + Views)
- Oppure: altre ottimizzazioni

Quando vuoi, fai il **toggle in Act mode** (o dimmi cosa preferisci).
