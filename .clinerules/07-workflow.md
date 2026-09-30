# 07 — Workflow Rules: Task Misti Backend / Frontend

## Principio Fondamentale

Ogni task che coinvolge **sia logica di gioco/backend sia interfaccia web** deve essere affrontato separando esplicitamente i due ambiti.

Non trattare mai un task misto come "un'unica modifica indistinta".

Per questo progetto è inoltre **obbligatorio procedere per milestone incrementali** (M1 → M6), con conferma esplicita prima di passare alla milestone successiva.

---

## Flusso di Lavoro Obbligatorio

### Fase 0 — Lettura Contesto Persistente

Prima di qualunque analisi o modifica:
1. Leggere **tutti** i file in `.memory-bank/`.
2. Estrarre:
   - stato corrente del progetto
   - decisioni tecniche attive
   - milestone corrente
   - rischi aperti
   - prossimi passi già concordati
3. Se il memory bank non esiste, segnalarlo e creare la baseline documentale.

### Fase 1 — Analisi e Separazione

Classificare gli impatti in due aree distinte:

**Area Applicativa (Backend / Logica di Gioco / Stato / DB / AI)**
- Server Express e middleware
- Handler eventi Socket.io
- Validazione dati (parole, mosse)
- Logica di gioco (turni, timer, vincita)
- Database e query
- Configurazione e variabili d'ambiente
- Rate limiting DeepSeek
- Side-effect su DB / AI

**Area UI (Frontend / HTML / CSS / Componenti / Audio)**
- Pagine HTML
- CSS (mobile-first, variabili)
- JavaScript client-side (state, api, socket, audio)
- Visualizzazione: lobby, gioco, timer, player card
- Audio feedback (Web Audio API)
- Responsive behavior
- Accessibilità base
- Coerenza grafica tra viste

### Fase 2 — Pianificazione di Milestone

Mappare il task contro la roadmap (vedi `progress.md`):
- **M1**: Setup & DB
- **M2**: Backend Core (Express + Socket.io + validazione)
- **M3**: AI Integration (DeepSeek fallback)
- **M4**: Frontend Base (Home, Crea, Unisciti)
- **M5**: Gioco Realtime (timer, turni, audio)
- **M6**: Deploy systemd + Caddy HTTPS *(storico, sostituito da M7)*
- **M7**: **Dockerizzazione** — docker-compose (app + PostgreSQL), dizionario cotto
  in build, fine del modello a due repository, deploy su `/srv/apps/parolemutanti`
  con Caddy sull'host → `127.0.0.1:8081`

Ogni task deve dichiarare:
- in quale milestone ricade
- se anticipa dipendenze di milestone successive
- se introduce debito tecnico accettato temporaneamente

### Fase 3 — Ricerca Parallela (per task ampi)

Se il task è **ampio** (≥3 file per area) o **poco chiaro**:

1. Lanciare subagents distinti:
   - Subagent #1 — backend / logica di gioco
   - Subagent #2 — frontend / UI / audio
2. Sintetizzare i risultati in un piano unico.
3. Presentare il piano in checklist o task progress.

Per task **piccoli** (1-2 file per area), i subagents non sono necessari.