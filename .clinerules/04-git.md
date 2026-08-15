# 04 — Git & Version Control Rules

## Modello a Repository Singolo

Il progetto usa **un solo repository Git**:

| Repository | Ruolo | Visibilità | Branch principale |
|---|---|---|---|
| `paroleMutanti` | Dev + Prod (stesso repo) | Privato | `main` |

- Lo sviluppo e il deploy condividono lo stesso repo.
- La produzione fa `git pull` direttamente (vedi `deploy/` per systemd/Caddy).

## Branching

- **Branch principale**: `main` (sempre stabile e deployabile).
- **Branch di feature**: `feature/<nome-descrittivo>` (es. `feature/socket-game-events`).
- **Branch di fix**: `fix/<breve-descrizione>`.
- **Merge strategy**: squash o merge commit, deciso per branch.
- **NO commit direttamente su main** se si sta lavorando a una feature (usare PR o merge esplicito).

### Regola operativa
Se Cline sta lavorando su un branch di feature/fix:
1. **NON merge** su `main` in autonomia: chiedere sempre conferma.
2. **NON push** su `main` direttamente.
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
