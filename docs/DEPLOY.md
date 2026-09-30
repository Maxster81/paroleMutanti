# Deploy di Parole Mutanti

Guida operativa per mettere in produzione **Parole Mutanti**
(Node 20+/24 + Express + Socket.io + PostgreSQL 16) su un server **Ubuntu LTS**,
dove Caddy gira **sull'host** come reverse proxy con HTTPS automatico.

| Strada | Stato | Quando usarla |
| ------ | ----- | ------------- |
| **A. Docker Compose** | **PRIMARIA (questa guida)** | Immagine immutabile, isolamento, aggiornamenti in un comando |
| **B. Bare-metal + systemd** | alternativa secondaria ([`deploy/README.md`](../deploy/README.md)) | Server senza Docker |

Tutto ciò che riguarda Docker vive nella root del repository:

```
deploy/Dockerfile           # immagine multi-stage (node:24-alpine)
docker-compose.yml          # stack: app + db (build dalla root)
.dockerignore               # esclude dal context il contesto di sviluppo e i segreti
.env.example                # modello di .env (copiato in .env, non committato)
deploy/docker-entrypoint.sh # bootstrap del container (attesa DB, schema, seed dizionario)
deploy/backup-docker.sh     # pg_dump dal container `db` + rotazione
docs/DEPLOY.md              # questo file
```

---

## 1. Architettura

```
                       INTERNET
                           │  https://parolemutanti.maxster.top
                           ▼
        ┌──────────────────────────────────────────────┐
        │  Caddy (HOST, systemd) — TLS Let's Encrypt   │
        │  encode zstd gzip                            │
        │  reverse_proxy 127.0.0.1:8081                │
        └───────────────────┬──────────────────────────┘
                            │  (solo loopback: 127.0.0.1:8081)
                            ▼
        ┌──────────────────────────────────────────────┐
        │  container `parolemutanti-app` (node:24)     │
        │  Express + Socket.io + frontend statico      │
        │  utente non root (uid 10001), dumb-init      │
        │  healthcheck: GET /health                    │
        └───────────────────┬──────────────────────────┘
                            │ rete interna di Compose (hostname `db`)
                            ▼
        ┌──────────────────────────────────────────────┐
        │  container `parolemutanti-db` (postgres:16)  │
        │  volume `parolemutanti-pgdata`               │
        │  NESSUNA porta pubblicata sull'host          │
        └──────────────────────────────────────────────┘
```

Punti chiave:

- **Un solo container applicativo**: il backend Node serve anche il frontend
  (`frontend/`), quindi non serve nginx né un container statico.
- **Porta 8081 su loopback**: l'unico ingresso pubblico è Caddy. (La 8080 è
  occupata da un'altra app dello stesso server; la 8081 è stata scelta libera.)
- **PostgreSQL in container con volume nominato**: non si tocca il PostgreSQL
  dell'host e non ci sono conflitti di porta sulla 5432.
- **Nessun dato da migrare**: le partite vivono in RAM e il dizionario delle
  parole viene rigenerato in build. L'unico dato persistente è la tabella
  `feedback` (nella propria installazione parte vuota).
- **Un solo repository**: non esiste più il modello dev→prod con script di sync.
  Con Docker la separazione la fanno `deploy/Dockerfile` + `.dockerignore`
  (nell'immagine entra solo ciò che serve a runtime).

---

## 2. Prerequisiti

| Requisito | Dettaglio |
| --------- | --------- |
| Server | VPS Ubuntu LTS, 1 vCPU / 1 GB RAM (2 GB comodi per la build) |
| Disco | ≥ 10 GB liberi (immagine ~250 MB + volume DB ~150 MB) |
| Accesso | utente con `sudo` |
| DNS | record A `parolemutanti.maxster.top` → IP del server |
| Porte | 22 (SSH), 80, 443 aperte; **8081 libera su loopback** |
| Runtime | Docker + plugin Compose già installati (verifica: `docker compose version`) |
| Repo | `github.com/Maxster81/paroleMutanti` è **pubblico**: il clone non richiede credenziali |
| Rete in build | la build scarica i dizionari (~90 MB da Hugging Face + 1,3 MB da GitHub) |

Verifica rapida prima di iniziare:

```bash
docker --version && docker compose version
lsb_release -a && free -h && df -h /
getent hosts parolemutanti.maxster.top    # deve già risolvere a questo server
sudo ss -tlnp | grep -E ':(8080|8081)\s'  # 8081 deve essere LIBERA
```

---

## 3. Primo deploy (Docker)
### 3.1 Clona il repo (branch corretto)

Il repo è **pubblico**, quindi nessuna credenziale da configurare.

```bash
sudo mkdir -p /srv/apps
cd /srv/apps
sudo git clone https://github.com/Maxster81/paroleMutanti.git parolemutanti
sudo chown -R "$USER":"$USER" /srv/apps/parolemutanti
cd /srv/apps/parolemutanti
```

Il comando sopra porta giù il branch **`main`**. Se il lavoro non è ancora unito a
`main` e vuoi deployare un **branch specifico** (es. `cline/x4fjnsby`), clona
direttamente quel branch:

```bash
# opzione A: clonare SOLO quel branch (tracking automatico)
git clone --branch cline/x4fjnsby --single-branch \
  https://github.com/Maxster81/paroleMutanti.git parolemutanti

# opzione B: hai già clonato main → passa al branch
cd parolemutanti
git fetch origin
git checkout cline/x4fjnsby      # crea il branch locale che traccia origin/cline/x4fjnsby
git branch --show-current        # verifica: deve stampare il branch atteso
```

> Da qui in avanti `git pull` (in §7) aggiorna **il branch su cui sei**. Quando il
> branch sarà unito a `main`, conviene passare a `main` (`git checkout main && git pull`)
> così gli aggiornamenti seguono la linea principale.

### 3.2 Genera i segreti (`.env`)

```bash
cp .env.example .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
chmod 600 .env
```

> `POSTGRES_PASSWORD` e `SESSION_SECRET` sono **obbligatorie**: se restano vuote
> `docker compose` si ferma subito con un messaggio esplicito (interpolazione
> `${VAR:?}`) invece di avviare uno stack rotto. Sono generate qui: non serve
> ricordarle.

### 3.3 Variabili opzionali (DeepSeek e Telegram)

Sono tutte opzionali: senza di esse il gioco funziona (il fallback AI si disattiva
e il form di feedback salva comunque nel DB, solo senza notifica).

```bash
nano .env
```

**DeepSeek** (fallback di validazione delle parole):

```dotenv
DEEPSEEK_API_KEY=sk-...      # pannello DeepSeek → API keys (platform.deepseek.com)
```

**Telegram** (notifica dei feedback — come recuperare il token che non ricordi):

1. **Token del bot** — su Telegram scrivi a **@BotFather**:
   - se il bot esiste ancora: `/mybots` → scegli il bot → **API Token** (mostra il
     token attuale e permette di revocarlo); in alternativa `/token` + seleziona il bot;
   - se non lo trovi più: `/newbot` → nome + username (deve finire con `bot`) →
     BotFather risponde con `Use this token to access the HTTP API: 123456789:AA...`.

2. **Chat ID** (dove arrivano i messaggi) — due modi:
   - scrivi un messaggio qualsiasi al tuo bot, poi:
     ```bash
     curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*'
     ```
     il numero che esce è il `TELEGRAM_CHAT_ID` (per i gruppi è negativo: aggiungi
     il bot al gruppo e invia un messaggio lì);
   - oppure apri **@userinfobot** e leggi l'`Id` che ti risponde (chat privata).

3. **Verifica prima di andare in produzione**:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
     -d chat_id=<CHAT_ID> -d text="test da Parole Mutanti"
   # → {"ok":true,...}  (se ricevi il messaggio, i due valori sono giusti)
   ```

4. Nel `.env`:
   ```dotenv
   TELEGRAM_BOT_TOKEN=123456789:AA...
   TELEGRAM_CHAT_ID=123456789
   ```

Dopo ogni modifica al `.env` applica con `docker compose up -d` (ricrea il container
`app`; il volume del DB non viene toccato). Prova poi il form di feedback nell'app:
`/api/feedback` risponde `{"ok":true,...,"telegram":true}`.

### 3.4 Build e avvio

```bash
# il primo avvio applica lo schema e importa il dizionario cotto nell'immagine
docker compose up -d --build

# stato
docker compose ps
docker compose logs -f app     # attesa DB → schema → seed dizionario → server avviato
```



---

## 4. Verifica

```bash
# Container (entrambi devono essere "healthy")
docker compose ps

# Endpoint di salute (JSON: stato, database, uptime, versione)
curl -s http://127.0.0.1:8081/health
# → {"status":"ok",...,"database":"ok","version":"1.6.0","env":"production"}

# Frontend servito dallo stesso processo
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/     # 200

# Dizionario nel DB (conteggio parole, distribuzione, query random)
docker compose exec app npm run db:check

# Log applicativi (json-file, rotazione 10m x 5)
docker compose logs --tail=50 app
```

Poi la verifica funzionale:

1. apri `https://parolemutanti.maxster.top` (dopo il blocco Caddy, §8);
2. crea una partita, entra con un secondo browser/dispositivo, rendetevi pronti
   e invia una parola modificata di una lettera → deve essere accettata;
3. invia una parola inventata → deve essere respinta.

---

## 5. Il dizionario delle parole (VERIFICA DB)

Il gioco **non parte** con la tabella `words` vuota: la parola iniziale di ogni
partita arriva dal dizionario. Per questo il dizionario è **cotto
nell'immagine** durante la build, così il primo avvio del container non dipende
dalla rete.

| Passo | Dove | Cosa fa |
| ----- | ---- | ------- |
| 1. `db/export-dicts.mjs` | **build** (stage `builder`) | scarica LibreOffice `it_IT.dic` + Hugging Face `dictionary_sorted.json`, filtra (3-10 lettere, charset italiano) e scrive `dict/words.tsv.gz` (~0,5 MB, 185.723 parole) |
| 2. `db/init-db.js` | avvio container | applica `db/init-db.sql` (idempotente: tabelle, indici, vista) |
| 3. `db/seed-words.mjs` | avvio container | se `words` è vuota importa l'artefatto locale in batch (~2 s); se è già popolata **non fa nulla** |
| 4. `db/wait-for-db.mjs` | avvio container | attende che PostgreSQL risponda (timeout `DB_WAIT_SECONDS`, default 60s) |

I passi 2-4 sono orchestrati da `deploy/docker-entrypoint.sh` e sono visibili in
`docker compose logs app`.

```bash
# Verifica rapida del dizionario
docker compose exec app npm run db:check

# Conteggio per lunghezza direttamente nel container DB
docker compose exec db psql -U parole_user -d parole_mutanti \
  -c "SELECT length, COUNT(*) FROM words GROUP BY length ORDER BY length"

# Rigenerare il dizionario da zero (DISTRUTTIVO: tocca solo 'words')
docker compose exec app node db/seed-words.mjs --force

# Aggiornare le fonti dentro il container (richiede rete)
docker compose exec app npm run db:check-update
docker compose exec app npm run db:update

# Ricostruire l'artefatto cotto nell'immagine (in locale, poi rebuild)
npm run db:export-dicts
docker compose up -d --build
```

---

## 6. Aggiornamenti

```bash
cd /srv/apps/parolemutanti
git pull                      # il repo di sviluppo è l'unica fonte (nessun sync)
docker compose up -d --build  # ricostruisce l'immagine e ricrea i container
docker compose ps             # attendi "healthy"
curl -s http://127.0.0.1:8081/health
```

Cosa succede al riavvio: l'entrypoint riapplica lo schema (idempotente, quindi
eventuali tabelle nuove vengono create senza toccare i dati) e salta il seed
perché `words` è già popolata. Il volume `parolemutanti-pgdata` non viene mai
toccato da `up -d --build`.

Per aggiornare anche il **dizionario** (nuove parole validate dall'AI, oppure
nuove release delle fonti):

```bash
docker compose exec app npm run db:update          # reimport incrementale LO
npm run db:export-dicts && docker compose up -d --build   # rigenera l'artefatto cotto
```

---

## 7. Backup

Il dizionario è rigenerabile, ma il DB contiene anche i **feedback** degli
utenti: conviene un dump periodico.

```bash
# Backup manuale (dal container `db`, dump compresso su host, rotazione ultimi 7)
./deploy/backup-docker.sh
ls -lh backups/

# Cron notturno (esempio: ogni notte alle 3:00)
echo '0 3 * * * root /srv/apps/parolemutanti/deploy/backup-docker.sh >> /var/log/parolemutanti-backup.log 2>&1' \
  | sudo tee /etc/cron.d/parolemutanti-backup
sudo chmod 644 /etc/cron.d/parolemutanti-backup
```

Ripristino:

```bash
gunzip -c backups/parole_mutanti-<timestamp>.sql.gz \
  | docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
      psql -h 127.0.0.1 -U parole_user -d parole_mutanti
```

---

## 8. Caddy (reverse proxy sull'host)

Aggiungi questo blocco al Caddyfile (o a un file incluso in `/etc/caddy/sites/`):

```caddyfile
parolemutanti.maxster.top {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8081
}
```

Poi:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -sI https://parolemutanti.maxster.top/health | head -3   # → HTTP/2 200
```

Note:

- **WebSocket**: Caddy gestisce automaticamente l'upgrade di Socket.io, non
  servono direttive aggiuntive.
- Se vuoi anche gli header di sicurezza (HSTS/CSP), puoi aggiungere un blocco
  `header { ... }` dentro il site — non è necessario per il funzionamento.
- Se sul server gira già un'altra app (es. sulla 8080), il suo blocco Caddy resta
  **separato**: un site block per dominio.

---

## 9. Porta e personalizzazione

| Cosa | Dove si cambia |
| ---- | -------------- |
| Porta host (loopback) | `docker-compose.yml` → `app.ports` (es. `127.0.0.1:8081:8081`) **e** il blocco Caddy |
| Porta interna del container | `docker-compose.yml` → `app.environment.PORT`, `app.healthcheck`, `ports` (devono restare allineate) |
| Nome progetto/cartella | `docker-compose.yml` → `name:` e `container_name:` |
| Credenziali DB | `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) |
| AI/Telegram/log/gioco | `.env` (vedi `.env.example`, tutte commentate) |

La porta interna è **8081** in tre punti del compose (environment, healthcheck,
ports): se la cambi, aggiorna tutti e tre e ricorda che la 8080 dell'host è
occupata da un'altra app.

---

## 10. Alternativa bare-metal (systemd)

Se su un server non è disponibile Docker, il deploy con systemd + PostgreSQL
dell'host resta possibile: vedi [`deploy/README.md`](../deploy/README.md).
Anche in quel percorso la sorgente è **questo** repository (nessun repo di
produzione separato): `deploy/deploy.sh` copia i file in `/opt/paroleMutanti` e
installa il servizio.

---

## 11. Troubleshooting

| Sintomo | Diagnosi / rimedio |
| ------- | ------------------ |
| `docker compose up` si ferma con `definisci POSTGRES_PASSWORD in .env` | manca `POSTGRES_PASSWORD` (o `SESSION_SECRET`) in `.env`: rigenera con i comandi di §3 |
| `app` in `restarting` e nei log `errori_di_configurazione` | `SESSION_SECRET` < 32 caratteri con `NODE_ENV=production`, oppure `DATABASE_URL` assente |
| `wait-for-db` va in timeout | il container `db` non è sano: `docker compose logs db`; verifica il volume e i permessi |
| Il gioco rifiuta la parola iniziale / `db:check` mostra 0 parole | seed non eseguito: `docker compose exec app node db/seed-words.mjs` (e controlla che `SEED_WORDS` non sia `0`) |
| Il container è `unhealthy` ma risponde | `/health` risponde **503** quando il DB non risponde: guarda `database` nel JSON |
| `bind: address already in use` all'avvio di Caddy o della porta | `sudo ss -tlnp \| grep :8081`: qualcosa occupa la porta |
| Il sito risponde ma le partite non si aggiornano | WebSocket bloccato: verifica di passare da Caddy (non da un altro proxy) e che il browser non blocchi `wss:` |
| Build fallita per RAM (`Killed` durante `npm ci`/JSON parse) | la build usa `node --max-old-space-size=1024`: aumenta la RAM o lo swap, oppure builda l'immagine su un'altra macchina |

Comandi di diagnosi rapida:

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=50 db
docker compose exec app node -e "fetch('http://127.0.0.1:8081/health').then(r=>r.text()).then(console.log)"
docker inspect --format '{{.State.Health.Status}}' parolemutanti-app
docker stats --no-stream