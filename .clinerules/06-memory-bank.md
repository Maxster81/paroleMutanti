# 06 — Cline's Memory Bank

Cline è un agente la cui memoria viene resettata tra sessioni. Il **Memory Bank** (cartella `.memory-bank/` in root) è l'unico collegamento con il lavoro precedente e va letto **all'inizio di OGNI task**.

## Struttura Memory Bank

File core, tutti in Markdown, in `.memory-bank/`:

1. **`projectbrief.md`**
   - Fondazione del progetto, requisiti e goal.
   - Source of truth per lo scope.

2. **`productContext.md`**
   - Perché esiste il progetto, problemi che risolve, UX goals.

3. **`activeContext.md`**
   - Focus corrente, modifiche recenti, prossimi passi, decisioni attive, learnings.

4. **`systemPatterns.md`**
   - Architettura sistema, decisioni tecniche chiave, design pattern, relazioni tra componenti.

5. **`techContext.md`**
   - Tecnologie usate, setup dev, vincoli tecnici, dipendenze, pattern d'uso tool.

6. **`progress.md`**
   - Cosa funziona, cosa resta da fare, stato corrente, issue note, evoluzione decisioni.

## File Aggiuntivi (se utili)
- `M<n>-<milestone>.md` — un file per milestone completata (storico).
- `Issue-Suggestion.md` — backlog voci aperte, da rimuovere quando risolte.
- Note di feature complesse, specifiche di integrazione, ecc.

## Regole Operative Obbligatorie

- **Inizio di ogni task**: leggere TUTTI i file `.memory-bank/*.md` prima di proporre modifiche.
- **Se memory bank non esiste**: crearlo come primo deliverable (soprattutto in M0/M1).
- **Ogni milestone completata** → aggiornare almeno:
  - `activeContext.md`
  - `progress.md`
- **Ogni decisione architetturale** → aggiornare anche:
  - `systemPatterns.md`
  - `techContext.md`
- **Ogni cambio di scope/priorità** → aggiornare:
  - `projectbrief.md` o `productContext.md`
- **`Issue-Suggestion.md`** è un backlog APERTO: quando una issue è risolta, **rimuoverla** nello stesso commit.

## Quando Aggiornare il Memory Bank

1. Dopo aver scoperto nuovi pattern.
2. Dopo modifiche significative.
3. Quando l'utente chiede "aggiorna memory bank" (rivedere TUTTI i file).
4. Quando il contesto ha bisogno di chiarimento.
5. Alla fine di ogni milestone completata.

**Ricorda**: dopo ogni reset di memoria, Cline parte da zero. Il Memory Bank è l'unico legame con il passato. Deve essere mantenuto con precisione.
