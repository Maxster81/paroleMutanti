# Deploy bare-metal di Parole Mutanti (alternativa a Docker)

> ⚠️ **Questo è il percorso SECONDARIO.** Il deploy primario è **Docker Compose**:
> vedi [`docs/DEPLOY.md`](../docs/DEPLOY.md) e `docker-compose.yml` nella root.
> Usa questa guida solo su un server **senza Docker**.
>
> La sorgente è **questo** repository (non esiste più un repo di produzione
> separato né uno script di sincronizzazione dev→prod).

Guida passo-passo per installare e aggiornare **Parole Mutanti** su un server
Ubuntu con systemd + Caddy + PostgreSQL **dell'host**.

## 🏠 Architettura (dove va cosa)

| Elemento | Percorso |
|---|---|
| Clone sorgente (dove lanci `deploy.sh`) | a tua scelta (es. `/srv/apps/parolemutanti`, **anche `/tmp/`**) |
| Codice eseguito (runtime) | `/opt/paroleMutanti` |
| Segreti (env) | `/etc/parole-mutanti/.env` (permessi `600`) |
| Backup DB | `/opt/paroleMutanti/backups` |
| Blocco Caddy (via `import`) | `/etc/caddy/sites/parole-mutanti.conf` |
| Servizio | systemd: `parole-mutanti.service` |

> Il clone è **solo la sorgente** da cui lanci lo script: il deploy copia il codice
> in `/opt/paroleMutanti`, che è da dove parte il server.

## ✅ Prerequisiti
- Ubuntu con systemd
- Accesso root (`sudo`)
- PostgreSQL 16 installato sull'host
- Dominio che punta all'IP del server (es. `parolemutanti.maxster.top`)
- Certificati TLS (se riusi quelli esistenti) **oppure** Let's Encrypt automatico

## 🚀 Primo deploy

```bash
# 1. Clona il repo in una cartella a tua scelta (anche /tmp)
cd /srv/apps
git clone https://github.com/Maxster81/paroleMutanti.git parolemutanti
cd parolemutanti

# 2. Deploy completo (install + env + db + service + backup + caddy)
sudo ./deploy/deploy.sh \
  --domain parolemutanti.maxster.top \
  --port 8090 \
  --tls-cert /etc/caddy/certs/parolemutanti.maxster.top.crt \
  --tls-key /etc/caddy/certs/parolemutanti.maxster.top.key
```

### Durante il deploy
- `--env` genera **automaticamente** `DATABASE_URL` (password casuale per l'utente DB)
  e ti chiederà **solo** la chiave DeepSeek (opzionale, vuoto = AI disattivata).
- `--db` crea utente + database, inizializza lo schema e importa il dizionario
  (nel deploy completo viene eseguito da solo, subito dopo `--env`).
- Se **non** usi certificati esistenti, ometti `--tls-cert` / `--tls-key` → Caddy userà
  Let's Encrypt automatico.
- `--caddy` aggiunge `import /etc/caddy/sites/*.conf` al Caddyfile principale
  (solo se non già presente) e ricarica Caddy.

> **Porta**: in bare-metal la porta canonica è **8090** (la 8081 è quella dello
> stack Docker). Le due strade non vanno fatte convivere sulla stessa porta:
> usa Docker **oppure** il bare-metal.

## 🧪 Verifica

```bash
curl https://parolemutanti.maxster.top/health
systemctl status parole-mutanti
```

`/health` deve rispondere con `{"status":"ok", ..., "version":"..."}`.

## 🔁 Aggiornamenti

```bash
cd /srv/apps/parolemutanti              # il clone (non /opt/paroleMutanti)
sudo ./deploy/deploy.sh --update        # git pull (clone) + rsync + npm + schema idempotente + restart
```

> `--update` esegue, in ordine: `git pull --ff-only` nella **directory corrente** (il clone),
> l'rsync dei file di produzione in `/opt/paroleMutanti`, `npm install --production`,
> **`db:init` (schema idempotente**: crea le tabelle nuove, es. `feedback`, senza toccare i dati)
> e il restart del servizio. Il `git pull` NON va fatto in `/opt/paroleMutanti` (è una copia senza `.git`).

## 🟢 Versione Node

- **Dev** usa Node **v24** via nvm (`/home/<user>/.nvm/.../node`).
- **`deploy.sh --install`** installa il pacchetto `nodejs` di **apt**, che prende la versione
  della distro Ubuntu (es. `22.22.1`), potenzialmente **più vecchia** di dev.
- Per coerenza, allineare la produzione a **v24** (opzionale ma consigliato). Il modo più
  semplice è il **repo NodeSource v24**:

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node --version   # deve uscire v24.x
  sudo systemctl restart parole-mutanti
  ```

- Verifica: `node --version` e `curl http://127.0.0.1:8090/health`.

> **Con Docker non serve nulla di tutto questo**: l'immagine fissa Node
> `node:24-alpine` (vedi `deploy/Dockerfile`).

## 💾 Backup
- Installato **automaticamente** al deploy (cron ogni notte alle 3:00).
- Mantiene gli **ultimi 7** backup in `/opt/paroleMutanti/backups`.
- Backup manuale: `sudo /opt/paroleMutanti/deploy/backup.sh`.

## ⚙️ Porta e personalizzazione
- Porta interna default: **8090** (allinea `--port`, env `PORT` e `reverse_proxy` di Caddy).
- Tutti i percorsi sono sovrascrivibili con `--dir` / `--env-file`.
