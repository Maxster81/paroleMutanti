/**
 * Test unit per il client DeepSeek (fallback AI).
 *
 * Coprono il contratto con la Chat Completions API DeepSeek (reference 2026-11):
 * - body: thinking DISABILITATO, modello valido, max_tokens/stop/temperature;
 * - `finish_reason` diverso da `stop` = errore transitorio, MAI "parola non valida";
 * - risposta non interpretabile = errore, mai un NO silenzioso;
 * - alias ritirati (`deepseek-chat`) rimappati dalla config.
 *
 * Nessuna chiamata di rete: `fetch` è sostituito da un mock.
 *
 * Esegue con: node --test backend/tests/deepseekClient.test.js
 * (serve DATABASE_URL: config.js la valida all'import)
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// L'ambiente va impostato PRIMA di importare i moduli: config.js valida
// DATABASE_URL all'import e termina il processo se manca.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'test';
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-test-chiave-1234567890';
process.env.DEEPSEEK_ENABLED = 'true';
process.env.DEEPSEEK_MODEL = 'deepseek-flash';

const { verificaParolaAI } = await import('../src/ai/deepseekClient.js');

const fetchOriginale = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

/**
 * Sostituisce fetch con un mock. `risposta(n)` riceve il numero di chiamata
 * (1-based) e ritorna `{ ok, status, json }`. Ritorna l'array delle chiamate
 * registrate (url + body parsato).
 */
function mockFetch(risposta) {
  const chiamate = [];
  globalThis.fetch = async (url, opzioni) => {
    chiamate.push({ url, body: JSON.parse(opzioni.body), headers: opzioni.headers });
    const r = (await risposta(chiamate.length)) ?? {};
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json ?? {},
      text: async () => JSON.stringify(r.json ?? {}),
    };
  };
  return chiamate;
}

/** Risposta chat "pulita" con il contenuto dato. */
function chatOk(content, extra = {}) {
  return {
    json: {
      choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { prompt_tokens: 62, completion_tokens: 1 },
      ...extra,
    },
  };
}

test('body della richiesta: thinking disabilitato + parametri sicuri', async () => {
  const chiamate = mockFetch(() => chatOk('YES'));

  const r = await verificaParolaAI('smartphone');

  assert.equal(r.errore, null);
  assert.equal(r.valida, true);
  assert.equal(chiamate.length, 1);

  const body = chiamate[0].body;
  assert.deepEqual(body.thinking, { type: 'disabled' }, 'thinking deve essere esplicitamente disabilitato');
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.max_tokens, 8);
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
  assert.deepEqual(body.stop, ['\n', '.', ',', ';']);
  assert.equal(body.response_format, undefined, 'nessun JSON mode: non serve per un verdetto YES/NO');
});

test('risposta NO → parola non valida', async () => {
  mockFetch(() => chatOk('NO'));

  const r = await verificaParolaAI('xyzqwe');

  assert.equal(r.errore, null);
  assert.equal(r.valida, false);
  assert.equal(r.risposta, 'NO');
});

test('finish_reason "length" → errore transitorio, non un NO', async () => {
  const chiamate = mockFetch(() => ({
    json: { choices: [{ finish_reason: 'length', message: { content: '' } }] },
  }));

  const r = await verificaParolaAI('smartphone');

  assert.equal(r.valida, false);
  assert.match(r.errore, /risposta_non_completa/);
  assert.equal(chiamate.length, 2, 'un errore transitorio va ritentato una volta');
});

test('content vuoto con finish_reason "stop" → errore, non un NO', async () => {
  mockFetch(() => chatOk(''));

  const r = await verificaParolaAI('smartphone');

  assert.equal(r.valida, false);
  assert.match(r.errore, /risposta_non_riconosciuta/);
});

test('risposta non interpretabile ("MAYBE") → errore, non un NO', async () => {
  mockFetch(() => chatOk('MAYBE'));

  const r = await verificaParolaAI('smartphone');

  assert.equal(r.valida, false);
  assert.match(r.errore, /risposta_non_riconosciuta/);
});

test('testo con punteggiatura/seguito ("Sì, esiste.") → valida', async () => {
  mockFetch(() => chatOk('Sì, esiste.'));

  const r = await verificaParolaAI('esiste');

  assert.equal(r.errore, null);
  assert.equal(r.valida, true);
});

test('HTTP 500 → errore (con retry), mai un NO silenzioso', async () => {
  const chiamate = mockFetch(() => ({ ok: false, status: 500, json: { error: 'boom' } }));

  const r = await verificaParolaAI('smartphone');

  assert.equal(r.valida, false);
  assert.match(r.errore, /HTTP 500/);
  assert.equal(chiamate.length, 2);
});

test('config: alias ritirato deepseek-chat → deepseek-flash', async () => {
  const precedente = process.env.DEEPSEEK_MODEL;
  process.env.DEEPSEEK_MODEL = 'deepseek-chat';
  try {
    const { config } = await import('../src/config.js?modello=deepseek-chat');
    assert.equal(config.deepseek.model, 'deepseek-flash');
  } finally {
    process.env.DEEPSEEK_MODEL = precedente;
  }
});

test('config: alias ritirato deepseek-reasoner → deepseek-flash', async () => {
  const precedente = process.env.DEEPSEEK_MODEL;
  process.env.DEEPSEEK_MODEL = 'deepseek-reasoner';
  try {
    const { config } = await import('../src/config.js?modello=deepseek-reasoner');
    assert.equal(config.deepseek.model, 'deepseek-flash');
  } finally {
    process.env.DEEPSEEK_MODEL = precedente;
  }
});

test('config: modello sconosciuto passato così com\'è (errore esplicito dall\'API)', async () => {
  const precedente = process.env.DEEPSEEK_MODEL;
  process.env.DEEPSEEK_MODEL = 'deepseek-modello-inesistente';
  try {
    const { config } = await import('../src/config.js?modello=sconosciuto');
    assert.equal(config.deepseek.model, 'deepseek-modello-inesistente');
  } finally {
    process.env.DEEPSEEK_MODEL = precedente;
  }
});
