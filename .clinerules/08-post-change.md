# 08 — Post-Change Rules: Controlli dopo ogni modifica

## Principio

Il progetto ha due livelli di verifica qualità:

1. **Controllo rapido post-modifica** — eseguito **sempre**, prima di ogni commit funzionale.
2. **Audit approfondito** — eseguito **solo su richiesta esplicita dell'utente**, perché impegnativo.

---

## Sezione 1 — Controllo rapido post-modifica (obbligatorio ad ogni commit funzionale)

Prima di committare qualsiasi modifica funzionale (backend o UI), verificare **in modo rapido** questa checklist (~30 secondi):

- [ ] **Input**: i nuovi campi utente hanno validazione server-side e sanitizzazione?
- [ ] **Socket events**: ogni nuovo evento ha validazione payload e ack callback con errore esplicito?
- [ ] **Rate limit**: nuovi endpoint/sono protetti da rate limiting (DeepSeek, submit_word)?
- [ ] **Verifica browser (se UI)**: se il task ha toccato CSS/HTML/JS, usare Playwright MCP (`browser_navigate` + `browser_snapshot`/`browser_take_screenshot`) per verificare resa, accessibilità, console pulita.
- [ ] **Logging**: nessuna password, API key, parola completa dell'utente nei log?
- [ ] **Config**: i nuovi parametri sono in `.env.example` con default sicuro?
- [ ] **Deploy**: se il task tocca env var, configurazione o architettura, verificare
      che siano allineati `docker-compose.yml`, `.env.example`, `deploy/Dockerfile`,
      `.dockerignore` e (per il percorso bare-metal) `deploy/parole-mutanti.service` +
      `deploy/Caddyfile.prod.snippet`?
- [ ] **Test**: `npm test` eseguibile e tutti verdi?
- [ ] **Audio (se UI)**: Web Audio API non inizia prima di un user gesture (politica autoplay dei browser)?
- [ ] **CORS/CSRF**: nuovi endpoint rispettano le policy di CORS e rate limit del progetto?

Se una verifica non è soddisfatta, correggere prima del commit.

---

## Sezione 2 — Audit approfondito su richiesta

Da eseguire **solo quando l'utente lo richiede esplicitamente** (es. "fai l'audit", "fai l'hardening", "prepariamo per la produzione", "fai i test e2e").

Ogni punto è **indipendente**: l'utente può chiederne uno solo, senza dover rifare tutto.

### 8.A — Sicurezza Web
- [ ] Nessun `eval`, `Function()` o `innerHTML` con dati utente.
- [ ] Validazione di TUTTI gli input Socket.io (anche ack callback).
- [ ] Rate limit attivo su submit e su chiamate DeepSeek.
- [ ] Payload size limit sugli eventi (max 100KB).

### 8.B — Performance
- [ ] Query DB con indici adeguati (vedi `.clinerules/02-database.md`).
- [ ] Niente N+1 nelle query di gioco (caricamento partita, lista giocatori).
- [ ] Socket.io: solo eventi necessari, no broadcast ridondanti.
- [ ] Frontend: niente re-render completo a ogni evento (usare event delegation).

### 8.C — Error Handling
- [ ] Nessuno stack trace esposto all'utente in produzione.
- [ ] Messaggi di errore user-friendly (in italiano).
- [ ] Log strutturati JSON con campi standardizzati.

### 8.D — Test
- [ ] Unit test su Validator (Levenshtein, distanza 1).
- [ ] Test integrazione su GameManager (turni, fine partita).
- [ ] Test e2e con Playwright su flusso completo (crea → join → gioca → fine).

### 8.E — Documentazione deploy
- [ ] `README.md` aggiornato con istruzioni complete.
- [ ] `deploy/parole-mutanti.service` verificato e aggiornato.
- [ ] `deploy/Caddyfile.prod.snippet` pronto per produzione.
- [ ] Note PostgreSQL aggiornate se lo stack/DB è cambiato.

### 8.F — Memory bank completo
- [ ] Tutti i file `.memory-bank/*.md` coerenti con lo stato attuale del progetto.
- [ ] `M<n>-<milestone>.md` aggiornato dopo ogni milestone completata.

---

## Relazione con le altre regole

Questa regola è **procedurale** (dice quando eseguire quali controlli):
- La **Sezione 1** si integra con `07-workflow.md` (verifiche per-area a ogni task).
- La **Sezione 2** riprende audit ciclici su richiesta.
- Complementare a `05-security.md` (normativo su secrets, validazione, rate limit).
