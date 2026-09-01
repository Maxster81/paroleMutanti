# Regole di Gioco — Parole Mutanti

## Scopo del file

Documento di riferimento (source of truth) delle **regole del gioco** e della **nomenclatura**.
Ogni modifica significativa alla logica di gioco (GameManager / TurnManager / Validator) deve aggiornare questo
file nello stesso commit.

---

## Nomenclatura ufficiale

Le regole usano i termini italiani in UI, commenti e documentazione; gli identificatori nel codice usano
l'inglese standard per i concetti nuovi.

| Concetto | UI / commenti / docs (IT) | Identificatore nel codice | Significato |
|---|---|---|---|
| il singolo giocatore che agisce | **mano** | `round` | esistente, non rinominato |
| ciclo di tutte le mani | **turno** | `turno` | esistente, non rinominato |
| partita singola a eliminazione | **manche** | `game` | nuovo |
| insieme delle manche (best-of-N) | **partita** | `match` | nuovo |
| singola modifica della parola | **mossa** | `move` | nuovo |
| un invio di parola (max 3 per mano) | **tentativo** | `attempt` | nuovo |
| rinuncia volontaria | **passare** | `pass` | sostituisce `pass_turn` |
| turno senza eliminati | **stallo** | `stalemate` | sostituisce `pareggio` |
| rimosso dalla partita | **eliminato** | `eliminated` | — |

> **Mapping da ricordare** (non invertito rispetto al codice storico):
> `round` = mano, `turno` = turno, `game` = manche, `match` = partita.
>
> **Stato rinominazione**: nel **backend** l'oggetto di stato in RAM è `match`
> (`this.matches`, metodi `creaMatch`/`avviaMatch`/`getMatch`/`listaMatchAperti`/`rimuoviMatch`);
> gli **eventi wire e la UI** restano `partita` (`partita_avviata/finita/cancellata`, chiavi ack `partita`)
> per non rompere il protocollo col frontend.

---

## 1. Setup della partita

- **Numero giocatori**: da `MIN_PLAYERS` (default 2) a `MAX_PLAYERS` (default 8). La partita parte **solo**
  con almeno 2 giocatori **tutti "pronti"**.
- **Nessun account**: i giocatori si identificano solo con un nome **sessione-only** (1–20 caratteri, validato
  server-side). Nomi duplicati nella stessa partita non sono ammessi; un nome già presente in una partita
  `waiting` impedisce di crearne/entrarne in un'altra.
- **Parola iniziale**: scelta casualmente dal dizionario, con lunghezza random nell'intervallo configurato
  (default 5–8), pesata sulla disponibilità (`WordPicker.scegliParolaIniziale`).
- **Visibilità**: ogni partita è **pubblica** (visibile nella lista della home) o **privata**
  (solo via codice). Decisa al momento della creazione (`pubblico`, default `true`, configurabile
  via `DEFAULT_PUBLIC`). La lista in home mostra **solo le pubbliche**; le private si raggiungono
  esclusivamente con il codice (`join_game`).
- **Stati partita**: `waiting` → `running` → `finished` (oppure `cancelled`).

---

## 1.1 Timer partenza lobby (anti-attese inutili)

- Se in lobby ci sono **≥3 giocatori** e **≥2 in stato PRONTO ma non tutti**, e quindi non può
  ancora partire da sola, parte un **countdown** (`LOBBY_TIMER_SECONDS`, default **30s**,
  configurabile **solo via env**, NON mostrato nell'app).
- **Appena tutti sono pronti** → la partita **parte subito** (senza attendere la fine del timer).
- **Allo scadere del timer**:
  - i giocatori **non pronti** vengono **espulsi** dalla lobby (evento `giocatore_espulso` → tornano alla home);
  - i giocatori **pronti** (≥2) **entrano in partita** (`avviaMatch`).
- **Interruzioni**: se si scende **sotto 2 pronti** (un "annulla pronto") il timer si **annulla**,
  e **riparte da 30** quando la condizione si ristabilisce. Se **entra un nuovo giocatore** il timer
  **riparte da 30**.
- Il countdown è emesso con l'evento `lobby_timer` (`timeLeft`, `tot`) per il conto alla rovescia in lobby.

---

## 2. Parametri di partita

| Parametro | Default | Range ammesso (server) | Note |
|---|---|---|---|
| `max_players` | `config.game.maxPlayers=8` | 2–8 (min `MIN_PLAYERS`) | "Numero massimo giocatori" |
| `turn_seconds` | `config.game.defaultTurnSeconds=30` | 5–60 (server); UI: 15/30/45/60 | tempo per singola mano |
| `games_to_win` | `config.game.defaultGamesToWin=2` | 1–4 (server); UI: 1/2/3 | 🔥 **ora effettivo**: best-of-N |
| `initial_length_min` | `config.game.initialWordMinLength=5` | 3–10 | parola iniziale: 5–6 / 5–8 / 6–8 |
| `initial_length_max` | `config.game.initialWordMaxLength=8` | 3–10 | — |

Validazione server-side in `creaPartita()` (`backend/src/game/GameManager.js`).

---

## 3. Validazione di una parola (`Validator.validaMossa`)

Una mossa è accettata solo se supera **tutti** i controlli in quest'ordine:

1. **Charset e lunghezza** (`normalizza.validaParola`):
   - solo lettere italiane `a-z àèéìòù`, più i prestiti consolidati `j k w x y`, più apostrofo;
   - lunghezza tra **3 e 10** caratteri.
2. **Anti-ripetizione**: la parola non deve essere già usata nella partita (`paroleUsate`).
3. **Distanza Levenshtein = 1** dalla parola precedente (`utils/levenshtein.isDistanzaUno`):
   cambia 1, aggiungi 1 oppure rimuovi 1 lettera.
4. **È una parola italiana** (controllo a 3 fasi progressive):
   - **Fase 1 — DB**: parola nel dizionario (`source='DB'`);
   - **Fase 2 — Morfologia**: se non in DB, ricerca del lemma (forme flesse/derivate) (`source='MORF'`);
   - **Fase 3 — AI fallback**: solo se nemmeno il lemma è in DB, si chiede DeepSeek; se conferma la parola
     viene inserita nel DB (`source='AI'`). Rate limit AI per partita.

**Esito**:
- **valida** → `{ valida: true, normalizzata, source, ... }`: parola aggiunta a `history`/`paroleUsate`,
  il giocatore risulta **«passato»**, la parola evolve.
- **non valida** → `{ valida: false, motivo, messaggio, ... }`: la mossa è un **tentativo fallito**. Dopo
  **3 tentativi** falliti nella stessa mano → il giocatore va in **`limbo`** e la mano passa al successivo.

---

## 4. Mano / turno / limbo (`TurnManager`)

- **Una mano = un giocatore** che ha `turn_seconds` secondi per fare una mossa.
- **Un turno = N mani** (N = numero di giocatori attivi), una per giocatore, in ordine.
- **Mossa valida** → esito mano = **`passato`**; la parola evolve.
- **Mossa non valida** → conta come **tentativo fallito** (il round resta aperto finché non si superano
  i **3 tentativi** oppure scade il tempo).
- **Al 3° tentativo fallito** → la mano si chiude in **`limbo`** e si passa al successivo.
- **Timeout** → la mano si chiude in **`limbo`**.
- **Passare** (rinuncia) → equivale a timeout: mano in **`limbo`** immediato.

---

## 5. Fine turno (`GameManager._gestisciFineTurno`)

- **Tutti in `limbo`** → **stallo**: nessun eliminato, si sceglie una nuova parola base e si riparte.
- **≥1 `passato`** → i giocatori `limbo` vengono **eliminati** dalla manche:
  - se resta **1 solo** giocatore → **vincitore della manche** (+1 punto);
  - se restano **2+** → si prosegue con l'ultima parola valida; i giocatori attivi sono solo i `passato`.

---

## 6. Best-of-N (manche → partita)

- **Manche** = insieme di turni; termina quando resta un solo giocatore (**vincitore di manche**, +1 punto).
- **Partita** = insieme di manche; vince chi raggiunge `games_to_win` manche vinte.
- A fine manche:
  - si incrementa `punteggio[vincitore]`;
  - si emette `manche_finita` (vincitore, punteggio);
  - se `punteggio[vincitore] >= games_to_win` → **fine partita** (`game_over`);
  - altrimenti → **nuova manche**: tutti i giocatori **non abbandonati** tornano in gioco al completo,
    nuova parola iniziale, si riparte (`mancheCorrente++`).

---

## 7. Abbandono volontario (`GameManager.abbandonaGiocatore`)

- **Definitivo**: chi abbandona **non rientra** nelle manche successive ("si attacca al tram").
- Il giocatore viene rimosso da `giocatori` (manche corrente) e da `giocatoriOriginali` (partita).
- **Fix indice**: quando si rimuove un giocatore, `currentRoundIndex` viene riallineato così la sequenza
  delle mani non salta né duplica nessuno.
- Dopo la rimozione:
  - se resta 1 solo giocatore → **vincitore della manche** (o fine partita se raggiunge `games_to_win`);
  - se resta 0 → partita cancellata.

> **Nota**: la **disconnessione** del socket NON è trattata come abbandono durante `running` (un refresh non
> deve far vincere l'avversario); le partite orfane vengono ripulite dal **sweeper** (auto).

---

## 8. Fine partita

- `_finePartita(gameId, vincitore)`:
  - stato → `finished`, `vincitore` impostato, timer fermato;
  - emette `game_over`; dopo 5s la partita viene rimossa dalla RAM (`gameHandler`).
- `game_logs` scritto solo all'evento finale `game_over`.
