# 04 — Git & Version Control Rules

## Repository Unico (Docker come deploy)

Il progetto usa **UN SOLO repository**: `paroleMutanti` (privato, branch `main`).
Il vecchio modello a due repository (sviluppo + `paroleMutanti_prod` con script di
sincronizzazione `sync-to-prod.sh`) è stato **dismesso in M7** insieme al passaggio
a Docker: con Docker la separazione tra codice di sviluppo e artefatto di deploy
la fanno `deploy/Dockerfile` + `.dockerignore` (nell'immagine entra solo ciò che
serve a runtime). Dettagli del passaggio: `.memory-bank/M7-docker-migration.md`.

| Flusso | Come funziona ora |
|---|---|
| Sviluppo | commit su `main` (o branch temporanei, poi distrutti) |
| Deploy (Docker, **primario**) | sul server: `git pull && docker compose up -d --build` in `/srv/apps/parolemutanti` |
| Deploy (bare-metal, alternativa) | sul server: `git pull` nel clone + `sudo ./deploy/deploy.sh --update` |

### Regole operative
- **Commit su `main`**: LIBERI, NON richiedono l'approvazione dell'utente.
- **Push/deploy verso la PRODUZIONE** (server, `docker compose up`, `deploy.sh`):
  SEMPRE su richiesta esplicita dell'utente.
- **NON reintrodurre** script di sync tra repository né repo di produzione:
  se serve escludere file dall'immagine, si aggiorna `.dockerignore`.
- Commit con Conventional Commits in italiano (vedi sotto).

## Branching

- **Branch principale**: `main` (sempre stabile e deployabile). Si lavora normalmente direttamente su `main`.
- **Branch di feature**: `feature/<nome-descrittivo>` (es. `feature/socket-game-events`) — opzionale, temporaneo.
- **Branch di fix**: `fix/<breve-descrizione>`.
- **Merge strategy**: squash o merge commit, deciso per branch.
- **Commit e merge su `main`**: consentiti in autonomia, NON serve l'approvazione dell'utente.

### Regola operativa
Se Cline sta lavorando su un branch di feature/fix:
1. Il **merge su `main`** avviene in autonomia, senza chiedere conferma.
2. Il **push verso la produzione** (deploy sul server) richiede SEMPRE approvazione.
3. **NON fare commit di file non correlati** alla feature in corso sul branch.
4. Un branch nato per **salvare il lavoro** (es. `cline/<id>`): si pusha spesso, e
   **mai** si pusha su `main` senza ok dell'utente.

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
- `docs(deploy): guida deploy Docker e migrazione dal vecchio systemd`

## Messaggi
- **In italiano**.
- **Descrizione breve** (max ~72 caratteri).
- **Corpo opzionale** per dettagli aggiuntivi.

## Versioning (SemVer) — ATTIVO da M6

- **MAJOR** — breaking changes.
- **MINOR** — nuove funzionalità retrocompatibili (es. `1.6.0` = dockerizzazione).
- **PATCH** — bug fix, refactoring.

Regole attuali:
1. `VERSION` in root e `package.json` devono restare **allineati**
   (`/health` espone la versione letta da `package.json`).
2. Bump obbligatorio ad ogni commit funzionale.
3. Tag annotati `vX.Y.Z` su `main` (quando si taglia una release).
