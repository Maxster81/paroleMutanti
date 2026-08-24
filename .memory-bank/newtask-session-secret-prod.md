# NEWTASK — SESSION_SECRET fallisce in produzione (app non parte) — RISOLTO ✅

## ⚠️ CAUSA RADICE (trovata in questa sessione)
**Bug di percorso in `backend/src/config.js` riga 52.**

Il valore è salvato in `cfg.security.sessionSecret` (riga 117), ma `validaConfig` lo leggeva dal livello sbagliato `cfg.sessionSecret` (che è `undefined`). Quindi `!cfg.sessionSecret` è sempre `true` → l'errore "SESSION_SECRET deve essere almeno 32 caratteri" scattava SEMPRE in produzione, a prescindere dal valore reale.

**Fix applicato**: riga 52 → `cfg.security.sessionSecret`.
**Commit**: dev `bfecf46`, prod `6e6da3c`.

## Perché il debug ha tratto in inganno
- **dev "funziona"** perché gira con `NODE_ENV=development`, che SALTA il blocco `if (nodeEnv === 'production')`. Il check sbagliato non viene mai eseguito.
- **Non è la versione Node**: riprodotto su dev (v24) e prod (v22) → bug di logica, indipendente da Node.
- **Non è dotenv**: no-op verificato (statico e dinamico, `len=64`, `injecting env (0)`).
- **Non è systemd**: il bug si riproduce fuori da systemd.
- **Non è sync**: `config.js` è identico ovunque (md5), quindi il bug è identico ovunque.
- La memory bank precedente aveva già indizi (il "test decisivo" usava `config.security.sessionSecret` → 64), ma non aveva notato il percorso errato in `validaConfig`.

## Lezioni (da NON ripetere)
1. Controllare SEMPRE che il percorso letto in validazione coincida con quello di salvataggio (path-mismatch `cfg.x` vs `cfg.security.x`).
2. Un test che "passa in isolamento" ma fallisce nell'import reale → cercare differenze nel codice del modulo, non nell'ambiente.
3. Intercettare `process.exit` (override) per ispezionare lo stato reale senza modificare i file.

## Sintomo originale (archivio)
In produzione, `parole-mutanti.service` entra in **restart loop**:
```
❌ [config] Errori di configurazione:
   - SESSION_SECRET deve essere almeno 32 caratteri in produzione
Main process exited, code=exited, status=1/FAILURE
```
L'app esce subito → `curl http://127.0.0.1:8090/health` → "Could not connect".

## Configurazione attuale (server Ubuntu)
- Env: `/etc/parole-mutanti/.env`, **owner `parole-mutanti`**, permessi `600`, leggibile dall'utente del servizio.
- Contiene `SESSION_SECRET=3bf421153f9f69c2f17e7551603754e0264651a9942e288d0d1a630b73b7f493` (64 caratteri, valido).
- Servizio `parole-mutanti.service`: `User=parole-mutanti`, `WorkingDirectory=/opt/paroleMutanti`, `EnvironmentFile=/etc/parole-mutanti/.env`,
  `ExecStart=/bin/bash -c 'set -a; . /etc/parole-mutanti/.env; set +a; exec /usr/bin/node backend/src/server.js'`.
- `/opt/paroleMutanti/.env` **NON esiste** (nessun file fantasma).
- `config.js`: `import 'dotenv/config'`; `sessionSecret: process.env.SESSION_SECRET || ''`; in produzione esige `length >= 32`.

## Fatti accertati (test manuali, tutti con `sudo -u parole-mutanti bash -c 'set -a; . /etc/parole-mutanti/.env; set +a; ...'`)
1. `echo ${#SESSION_SECRET}` in bash → **64** (il source carica bene l'env).
2. `node --input-type=module -e "import 'dotenv/config'; console.log(process.env.SESSION_SECRET.length)"` → **64**.
3. Con `timeout` attorno al punto 2 → ancora **64** (`timeout` è innocuo).
4. `node backend/src/server.js` → **FALLISCE** con "SESSION_SECRET < 32".

⇒ **Contraddizione**: un semplice `import 'dotenv/config'` + lettura vede `SESSION_SECRET=64`, ma `config.js` (importato da `server.js`) vede `< 32`. Il problema è **dentro `config.js`/`server.js` al momento dell'import**, non in dotenv, non nel file env, non in `timeout`.

## Ipotesi aperte
- Ordine/caching di import ESM che fa caricare a `dotenv` un `.env` da un path diverso.
- `config.js` nel deploy stantio/diverso (verificare `cat /opt/paroleMutanti/backend/src/config.js` righe ~1-20 e ~45-60, 110-120).
- `DOTENV_CONFIG_PATH` o un `.env` in una cartella padre di `/opt/paroleMutanti`.

## Test decisivo (ancora da eseguire)
```bash
sudo -u parole-mutanti bash -c 'set -a; . /etc/parole-mutanti/.env; set +a; cd /opt/paroleMutanti && NODE_ENV=development node --input-type=module -e "import { config } from \"./backend/src/config.js\"; console.log(\"SESSION_LEN=\" + config.security.sessionSecret.length); console.log(\"DB=\" + (config.database.url ? config.database.url.slice(0,20) : \"NULL\"))"'
```
- `SESSION_LEN=64` → config.js legge bene; indagare altrove (es. validaConfig prod).
- `SESSION_LEN=0` o NULL → config.js non riceve SESSION_SECRET all'import (probabile fix: in produzione far leggere a `config.js` il path esplicito `/etc/parole-mutanti/.env` invece di `dotenv/config` dalla CWD).

## Fix probabile (se confermato)
In `config.js` non usare `import 'dotenv/config'` (legge `.env` dalla CWD `/opt/paroleMutanti`, che non esiste), ma in produzione caricare esplicitamente `/etc/parole-mutanti/.env` (o affidarsi solo a `process.env` fornito da systemd/bash).

## Regola per questo task
Risolvere SOLO questo problema. Non toccare altro.
