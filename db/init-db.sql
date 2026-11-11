-- =====================================================================
-- init-db.sql — Schema iniziale "Parole Mutanti"
-- Eseguibile come utente `parole_user` (NON superuser).
-- Idempotente: `CREATE ... IF NOT EXISTS`.
-- =====================================================================

-- Estensione per gen_random_bytes (necessaria anche in setup-user.sql)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- Tabella: words
-- Dizionario italiano di parole valide (3-10 lettere).
-- Source: LO (LibreOffice), HF (Hugging Face), DB (legacy/altri), AI (DeepSeek)
-- =====================================================================
CREATE TABLE IF NOT EXISTS words (
    word TEXT PRIMARY KEY,
    length INTEGER NOT NULL CHECK (length BETWEEN 3 AND 20),
    source TEXT NOT NULL DEFAULT 'LO' CHECK (source IN ('LO', 'HF', 'DB', 'AI')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici per query random veloce per lunghezza
CREATE INDEX IF NOT EXISTS idx_words_length ON words(length);
-- Indice composto utile per le query di gioco più frequenti
CREATE INDEX IF NOT EXISTS idx_words_length_source ON words(length, source);
-- Indice per ordinamento per data (es. ultime parole aggiunte dall'AI)
CREATE INDEX IF NOT EXISTS idx_words_created_at ON words(created_at DESC);

-- =====================================================================
-- Tabella: games
-- =====================================================================
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'running', 'finished', 'cancelled')),
    params JSONB NOT NULL,
    players JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_word TEXT,
    current_player_index INTEGER,
    words_played JSONB NOT NULL DEFAULT '[]'::jsonb,
    winner_name TEXT,
    games_won JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

-- Aggiunta a DB già esistenti (CREATE TABLE IF NOT EXISTS non aggiunge colonne).
ALTER TABLE games ADD COLUMN IF NOT EXISTS abandonments INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_games_state ON games(state);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_winner_name ON games(winner_name) WHERE winner_name IS NOT NULL;

-- =====================================================================
-- Tabella: game_logs (LEGACY, non usata)
-- Lo storico partite/mosse ora vive in `games` (ciclo di vita) + `moves`
-- (validazioni). La tabella resta per compatibilità di schema.
-- =====================================================================
CREATE TABLE IF NOT EXISTS game_logs (
    id BIGSERIAL PRIMARY KEY,
    game_id UUID NOT NULL,
    words_played JSONB NOT NULL,
    winner_name TEXT,
    duration_seconds INTEGER,
    player_count INTEGER NOT NULL,
    total_turns INTEGER NOT NULL,
    ai_validations_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_logs_created_at ON game_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_winner_name ON game_logs(winner_name) WHERE winner_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_logs_game_id ON game_logs(game_id);

-- =====================================================================
-- Tabella: moves
-- Una riga per ogni TENTATIVO di parola (submit_word), valido o rifiutato.
-- Alimenta le statistiche di validazione: da dove arriva il verdetto
-- (DB / morfologia / AI), quali motivi di rifiuto, quanto costa l'AI.
--
-- PRIVACY: `parola` viene valorizzata SOLO quando la parola ha raggiunto il
-- percorso AI (ai_usata = true, oppure motivo 'rate_limit'): sono i candidati
-- utili per espandere il dizionario. Le mosse normali non salvano il testo
-- (coerente con la regola 8.C: niente parole nei log).
--
-- Nessuna FK verso `games`: le scritture sono fire-and-forget e non c'è
-- garanzia di ordine tra INSERT della partita e delle mosse; una FK farebbe
-- perdere statistiche senza dare nulla in cambio (game_id resta indicizzato).
-- =====================================================================
CREATE TABLE IF NOT EXISTS moves (
    id BIGSERIAL PRIMARY KEY,
    game_id UUID NOT NULL,
    manche INTEGER NOT NULL,
    turno INTEGER NOT NULL,
    giocatore TEXT NOT NULL,
    valida BOOLEAN NOT NULL,
    motivo TEXT,
    source TEXT CHECK (source IS NULL OR source IN ('DB', 'MORF', 'AI')),
    ai_usata BOOLEAN NOT NULL DEFAULT FALSE,
    ai_durata_ms INTEGER,
    tentativo INTEGER,
    parola TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_moves_created_at ON moves(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moves_ai ON moves(ai_usata) WHERE ai_usata;
CREATE INDEX IF NOT EXISTS idx_moves_parola ON moves(parola) WHERE parola IS NOT NULL;

-- =====================================================================
-- Tabella: feedback
-- Feedback/segnalazioni inviati dagli utenti (inoltro Telegram opzionale)
-- =====================================================================
CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    tipo TEXT NOT NULL DEFAULT 'altro' CHECK (tipo IN ('suggerimento', 'problema', 'altro')),
    sottocategoria TEXT,
    testo TEXT NOT NULL,
    nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tipo ON feedback(tipo);

-- =====================================================================
-- Vista di utilità
-- =====================================================================
CREATE OR REPLACE VIEW words_count_by_length AS
SELECT
    length,
    COUNT(*) AS count,
    MIN(created_at) AS first_added,
    MAX(created_at) AS last_added
FROM words
GROUP BY length
ORDER BY length;
