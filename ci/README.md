# CI (GitHub Actions) — istruzioni di installazione

Il workflow è **già pronto** ma vive qui (`ci/workflows/ci.yml`) e **non** in
`.github/workflows/`: il token dell'infrastruttura usato in sviluppo non ha il
permesso di creare file in quella cartella. Va copiato una volta sola dal tuo
account (o dalla UI di GitHub).

## Attivazione (una volta)

```bash
cd /srv/apps/parolemutanti          # o il tuo clone locale
mkdir -p .github/workflows
cp ci/workflows/ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "ci: aggiungi workflow GitHub Actions"
git push
```

Dopo il push la pipeline parte da sola su ogni **push** e **pull request** verso
`main`; si può anche lanciare a mano da GitHub → **Actions** → **CI** → *Run workflow*.
Il repo è pubblico, quindi i minuti dei runner GitHub-hosted sono gratuiti.

## Cosa fa la pipeline

| Job | Cosa verifica |
|---|---|
| `test` | `npm ci` + `npm test` (unit test `node --test`) su Node 24 |
| `docker` | `docker compose up -d --build` con `.env` generato come in `docs/DEPLOY.md` §3.2 → attesa `healthy` di `parolemutanti-app` e `parolemutanti-db` → `GET /health` (`status` e `database` = ok) → `npm run db:check` con **≥ 180.000 parole** nel dizionario → controllo che l'immagine **non** contenga `.env`, `.clinerules`, `.memory-bank`, test o `e2e` e che giri come **uid 10001** → e2e Socket.io contro lo stack → e2e browser Playwright (fallisce se il test viene *skippato*, così non passa "a vuoto") → log dello stack in caso di errore e `docker compose down -v` finale |

Tempo tipico: ~1 minuto per `test`, ~5-7 minuti per `docker` (build + download dei
dizionari + Playwright Chromium).

## Note

- Se in futuro la CI deve girare su un runner self-hosted o su un altro provider,
  la logica dei comandi resta valida: sono gli stessi passi di `docs/DEPLOY.md` §4.
- Il workflow **non** esegue deploy: il deploy resta manuale e approvato
  (`git pull && docker compose up -d --build` sul server).

## Se il file sorgente cambia

La copia in `.github/workflows/` **non si aggiorna da sola**: dopo ogni modifica a
`ci/workflows/ci.yml` ricopia e pusha (stesso comando dell'attivazione):

```bash
cp ci/workflows/ci.yml .github/workflows/ci.yml
git commit -am "ci: aggiorna workflow" && git push
```
