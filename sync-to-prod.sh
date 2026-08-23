#!/usr/bin/env bash
# =============================================================================
# Parole Mutanti — sincronizzazione dev -> prod (repo pubblico)
# =============================================================================
# Copia SOLO i file di produzione da paroleMutanti/ al repo pubblico affiancato
# ../paroleMutanti_prod/, usando una WHITELIST esplicita. Tutto ciò che non
# compare nella whitelist (memory-bank, tests, .clinerules, ecc.) viene
# ignorato di default.
#
# Traccia l'ultimo commit di dev sincronizzato in un file locale
# (.last-sync-dev-commit, NON committato) e, ad ogni sync, mostra i commit
# pendenti dall'ultima sincronizzazione, generando anche un messaggio di
# commit composito suggerito per il repo di produzione.
#
# Utilizzo (dalla root di paroleMutanti):
#   ./sync-to-prod.sh            # sincronizza, mostra commit pendenti + messaggio
#   ./sync-to-prod.sh --dry-run  # prova senza applicare modifiche né aggiornare marker
#   ./sync-to-prod.sh --help     # mostra questo aiuto
#
# Dopo la sync, entrare in ../paroleMutanti_prod, verificare `git status`,
# committare (es. con `git commit -F /tmp/parole-sync-msg.txt`) e pushare.
# =============================================================================
set -euo pipefail

PROD_DIR="${PROD_DIR:-../paroleMutanti_prod}"
MARKER=".last-sync-dev-commit"
MSG_FILE="${MSG_FILE:-/tmp/parole-sync-msg.txt}"
DRY_RUN=0

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --help|-h) sed -n '1,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Opzione sconosciuta: $arg (usa --help)" >&2; exit 1 ;;
    esac
done

if [ ! -d "$PROD_DIR" ]; then
    echo "ERRORE: $PROD_DIR non esiste. Clona il repo pubblico affiancato a paroleMutanti." >&2
    echo "  git clone <url-paroleMutanti_prod> $PROD_DIR" >&2
    exit 1
fi
if [ ! -d "$PROD_DIR/.git" ]; then
    echo "ERRORE: $PROD_DIR non è un repository Git." >&2
    exit 1
fi

echo "[sync] Sorgente:  $(pwd)"
echo "[sync] Destinazione: $PROD_DIR"

# --- Commit pendenti dall'ultima sync ----------------------------------------
DEV_HEAD="$(git rev-parse HEAD)"
PENDING=""
if [ -f "$MARKER" ]; then
    LAST_SYNC="$(cat "$MARKER")"
    if [ -n "$LAST_SYNC" ] && git cat-file -e "$LAST_SYNC^{commit}" 2>/dev/null; then
        PENDING="$(git log --oneline "$LAST_SYNC"..HEAD 2>/dev/null || true)"
    else
        echo "[sync] AVVISO: marker non valido (${LAST_SYNC:-vuoto}). Tracciamento riparte da questo commit."
        PENDING=""
    fi
else
    echo "[sync] Prima sync senza baseline: non ci sono commit 'pendenti' da elencare."
    echo "[sync] Il marker verrà creato a questa esecuzione e i prossimi commit su dev saranno tracciati."
fi

COUNT="$(printf '%s\n' "$PENDING" | sed '/^$/d' | wc -l | tr -d ' ')"
if [ "$COUNT" -gt 0 ]; then
    echo
    echo "[sync] $COUNT commit pendenti dall'ultima sync:"
    printf '%s\n' "$PENDING" | sed '/^$/d' | sed 's/^/   /'
else
    echo "[sync] Nessun commit pendente."
fi

# --- Generazione messaggio composito ------------------------------------------
HEAD_SUBJECT="$(git log -1 --format=%s)"
{
    echo "$HEAD_SUBJECT"
    echo
    echo "Sync cumulativa da paroleMutanti ($COUNT commit):"
    echo
    printf '%s\n' "$PENDING" | sed '/^$/d' | sed 's/^/- /'
} > "$MSG_FILE"
echo "[sync] Messaggio di commit suggerito salvato in $MSG_FILE"

echo

# --- Sincronizzazione rsync (whitelist) ---------------------------------------
echo "[sync] Copia dei file di produzione..."
RSYNC_ARGS=(-a --delete)
if [ "$DRY_RUN" = "1" ]; then
    RSYNC_ARGS+=(--dry-run)
    echo "[sync] MODALITÀ DRY-RUN (nessuna modifica applicata)"
fi

# Nota: se aggiungi una NUOVA cartella root di produzione, aggiungi qui
# una riga --include='cartella/' e una --include='cartella/***'.
rsync "${RSYNC_ARGS[@]}" \
    --include='backend/' --include='backend/src/' --include='backend/src/***' \
    --include='frontend/' --include='frontend/***' \
    --include='db/' \
    --exclude='db/data/' --exclude='db/data/***' \
    --exclude='db/dumps/' --exclude='db/dumps/***' \
    --exclude='db/.last-*' \
    --include='db/***' \
    --include='deploy/' --include='deploy/***' \
    --include='package.json' \
    --include='package-lock.json' \
    --include='.env.example' \
    --include='.gitignore' \
    --include='README.md' \
    --include='VERSION' \
    --exclude='*' \
    ./ "$PROD_DIR/"

# --- Aggiornamento marker (solo sync reale) ------------------------------------
if [ "$DRY_RUN" = "0" ]; then
    echo "$DEV_HEAD" > "$MARKER"
    echo "[sync] Marker aggiornato a $DEV_HEAD"
fi

echo
echo "[sync] Completato."
echo "[sync] Stato del repo di produzione ($PROD_DIR):"
cd "$PROD_DIR"
git status --short
