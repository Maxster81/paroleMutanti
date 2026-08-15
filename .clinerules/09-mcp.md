# 09 — MCP Rules: Server Disponibili e Pattern d'Uso

## Principio Generale

In questo workspace sono installati alcuni server MCP. Usali quando apportano un **beneficio reale** rispetto agli strumenti built-in (read_file, search_files, execute_command). Non usarli per operazioni banali o quando uno strumento nativo è più semplice.

Prima di usare un MCP, chiedersi:
- Questo tool fa qualcosa che uno strumento built-in non può fare (o fa in modo molto più efficiente)?
- L'uso del MCP aggiunge valore al task (accuratezza, velocità, tracciabilità)?

---

## MCP Disponibili

### Filesystem MCP
- **Capacità**: lettura/scrittura/ricerca file, operazioni batch (`read_multiple_files`, `directory_tree`, `search_files`).
- **Quando usarlo**:
  - Lettura multipla simultanea di file correlati (`read_multiple_files`).
  - Tree JSON dell'intero progetto o sotto-gerarchia.
  - Spostamenti/rinominazioni batch.
- **Quando NON usarlo**: lettura di un singolo file noto → `read_file` built-in.

### Memory MCP (Knowledge Graph)
- **Capacità**: grafo persistente di entità + relazioni + osservazioni.
- **Pattern d'uso per paroleMutanti**:
  - **Entità = modelli di dominio**: `Game`, `Player`, `Word`, `Turn`, `Validation`.
  - **Entità = componenti**: `Express`, `Socket.io`, `PostgreSQL`, `DeepSeek`, `WebAudio`.
  - **Relazioni**: es. `Game → Turn`, `Turn → Word`, `Word → validation DeepSeek`.
  - **Osservazioni**: decisioni architetturali, pattern, hack temporanei.
- **Rapporto con memory-bank**:
  - Il **memory-bank su file** (`.memory-bank/*.md`) resta la **fonte di verità** principale.
  - Il **Memory MCP** è complementare: utile per interrogazioni rapide su relazioni.
  - Quando usi il Memory MCP per decisioni, **salvale comunque nel memory-bank file** (mai divergenza).

### Playwright MCP
- **Capacità**: browser headless (Chromium) con navigazione, click, snapshot accessibilità, screenshot, console/network monitoring.
- **Pattern d'uso per paroleMutanti**:
  - **Verifica frontend post-modifica** (integrazione con checklist Sezione 1 di `08-post-change.md`).
  - Test flussi di gioco: `browser_navigate` → `browser_snapshot` → `browser_click`.
  - Test mobile-first: ridimensiona a 360x800 con `browser_resize`.
  - Verifica console errori dopo modifiche JS.
- **Quando NON usarlo**: task puramente backend.

### Context7 MCP
- **Capacità**: documentazione aggiornata e version-specifica di librerie (FastAPI-equivalent: Express, Socket.io, pg, ecc.).
- **Pattern d'uso**:
  - Doc aggiornata di Express, Socket.io, pg, dotenv quando serve API recente.
  - `resolve-library-id` (es. "Socket.io") → ID libreria → `query-docs`.
  - Specificare versione quando rilevante (es. "Socket.io 4.7").
- **Quando NON usarlo**: doc già nota/stabile, no vantaggio vs memoria consolidata.

### PostgreSQL MCP (da installare in M1)
- **Capacità**: query SQL dirette al DB durante sviluppo e test.
- **Pattern d'uso per paroleMutanti**:
  - Verifica rapida contenuto tabelle (`SELECT * FROM words LIMIT 10`).
  - Test query di gioco (`SELECT word FROM words WHERE length = 7 ORDER BY random() LIMIT 1`).
  - Debug stato partite (`SELECT * FROM games WHERE state = 'active'`).
- **Quando NON usarlo**: l'app stessa usa `pg` — non duplicare driver.

### Fetch MCP (da installare in M1)
- **Capacità**: chiamate HTTP esterne senza uscire dal contesto agente.
- **Pattern d'uso per paroleMutanti**:
  - Download dizionario italiano da `https://github.com/napolux/paroleitaliane` (in `import-words.js` o direttamente).
  - Test API DeepSeek durante integrazione M3.
- **Quando NON usarlo**: l'app Node usa `fetch` nativo in M2+.

---

## Riepilogo: quale MCP per quale scenario

| Scenario | MCP consigliato | Alternativa built-in |
|---|---|---|
| Analisi multi-file correlati | Filesystem (`read_multiple_files`) | read_file ripetuto |
| Visione struttura progetto | Filesystem (`directory_tree`) | list_files |
| Tracciare relazioni entità di gioco | Memory (create_entities/relations) | memory-bank su file |
| Verifica visuale/accessibilità pagina | Playwright (snapshot, screenshot) | analisi statica markup |
| Test flusso UI (click, form, viewport 360x800) | Playwright (resize, click, snapshot) | — |
| Doc aggiornata libreria (Express, Socket.io) | Context7 (`resolve-library-id` + `query-docs`) | memoria training |
| Query DB rapida in dev | postgres (da installare) | psql da terminale |
| Download file esterno (dizionario, API) | fetch (da installare) | curl/wget da terminale |
| Singolo file noto | — | read_file |
| Modifica file singolo | — | write_to_file / replace_in_file |

---

## Relazione con le altre regole

Questa regola è **normativa sugli strumenti**:
- `03-frontend.md` → la verifica browser di Playwright rispetta criteri mobile-first/accessibilità.
- `07-workflow.md` → Playwright si inserisce nella checklist di verifica frontend.
- `08-post-change.md` → la verifica frontend del controllo rapido può usare Playwright.
- `06-memory-bank.md` → il Memory MCP è complementare ma non sostituisce il memory-bank su file.
