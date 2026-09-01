# 04 — Git & Version Control Rules

## Modello a Due Repository (Dev + Prod)

Il progetto usa **due repository Git separati** (workflow tipo efftrack):

| Repository | Ruolo | Visibilità | Branch principale |
|---|---|---|---|
| `paroleMutanti` | Sviluppo | Privato | `main` |
| `paroleMutanti_prod` | Produzione (deploy) | Pubblico | `main` |

### Flusso di sync dev → prod
1. Su **dev** si lavora su `main` (o branch feature/fix temporanei, poi distrutti): commit, test, debug.
2. Quando si è a buon punto, **SOLO su richiesta esplicita dell'utente**, si esegue `./sync-to-prod.sh` (dalla root di dev):
   - Copia SOLO i file di produzione (whitelist rsync; esclude `.clinerules`, `.memory-bank`, test, file personali).
   - Traccia l'ultimo commit sincronizzato in `.last-sync-dev-commit` (non committato).
   - Genera il messaggio di commit composito in `/tmp/parole-sync-msg.txt` (elenca i commit di dev).
3. Nel repo `paroleMutanti_prod` si committa con `git commit -F /tmp/parole-sync-msg.txt` e si pusha.
4. **Produzione** (server Ubuntu) fa `git pull` dal repo pubblico `paroleMutanti_prod` e rilancia con `deploy/deploy.sh`.

### Regole operative
- **Commit su `main` (dev)**: LIBERI, NON richiedono l'approvazione dell'utente (regola aggiornata).
- **Sync dev → prod e PUSH verso la produzione**: SEMPRE richiedono l'approvazione esplicita dell'utente
  (il push verso `paroleMutanti_prod` / deploy va fatto solo su richiesta).
- La sync è una whitelist di file: se si aggiunge una cartella root di produzione, aggiungere una riga `--include='cartella/'` e `--include='cartella/***'` in `sync-to-prod.sh`.
- Commit su dev con Conventional Commits in italiano (vedi sotto).

## Branching

- **Branch principale**: `main` (sempre stabile e deployabile). Si lavora normalmente direttamente su `main`.
- **Branch di feature**: `feature/<nome-descrittivo>` (es. `feature/socket-game-events`) — opzionale, temporaneo.
- **Branch di fix**: `fix/<breve-descrizione>`.
- **Merge strategy**: squash o merge commit, deciso per branch.
- **Commit e merge su `main`**: consentiti in autonomia, NON serve l'approvazione dell'utente.

### Regola operativa
Se Cline sta lavorando su un branch di feature/fix:
1. Il **merge su `main`** avviene in autonomia, senza chiedere conferma.
2. Il **push verso la produzione** (`paroleMutanti_prod` / deploy) richiede SEMPRE approvazione.
3. **NON fare commit di file non correlati** alla feature in corso sul branch.

## Commit Convention (Conventional Commits in italiano)
Formato: `tipo(scope): descrizione`

| Tipo | Uso |
|---|---|
| `feat` | Nuova funzionalità |
| `fix` | Bug fix |
| `refactor` | Refactoring senza cambi funzionali |
| `chore` | Manutenzione, dipendenze, build |
| `docs` | Documentazione |
| `style` | Formattazione, spazi, virgolette |
| `test` | Aggiunta/correzione test |

Esempi:
- `feat(game): aggiungi logica validazione parola con Levenshtein`
- `fix(db): correggi indice su words.length`
- `docs(readme): aggiorna istruzioni setup PostgreSQL`

## Messaggi
- **In italiano**.
- **Descrizione breve** (max ~72 caratteri).
- **Corpo opzionale** per dettagli aggiuntivi.

## Versioning (SemVer) — Da attivare post-M5

- **MAJOR** — breaking changes.
- **MINOR** — nuove funzionalità retrocompatibili.
- **PATCH** — bug fix, refactoring.

**Regola attuale**: il versioning SemVer con tag verrà **attivato quando il gioco sarà giocabile end-to-end** (stimato: post-Milestone 5). Per ora niente tag, niente `VERSION` file.

Quando si attiverà:
1. Creare `VERSION` in root.
2. Bump obbligatorio ad ogni commit funzionale.
3. Tag annotati `vX.Y.Z` su `main`.
