/**
 * e2e/game.spec.js — Test e2e browser del flusso completo
 *
 * Flusso: crea → join → ready → avvio automatico → abbandono → game_over.
 *
 * Usa DUE browser context separati (Alice e Bob), perché il backend
 * identifica i giocatori per nome e il client salva il nome in localStorage
 * (condiviso tra tab dello stesso context → bisogna separare i context).
 *
 * Richiede il backend in esecuzione su E2E_BASE_URL (default localhost:8090).
 * Se il server non è raggiungibile il test viene SKIPPATO.
 *
 * Esegui:  npm run test:e2e:browser
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8090';

/** Verifica che il backend risponda su /health. */
async function serverUp() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

test('e2e browser: crea → join → ready → avvio → abbandono → game_over', async ({ browser }) => {
  test.skip(!(await serverUp()), `Backend non raggiungibile su ${BASE}: avvia il server e rilancia`);

  const ctxAlice = await browser.newContext();
  const ctxBob = await browser.newContext();
  const alice = await ctxAlice.newPage();
  const bob = await ctxBob.newPage();

  // Accetta i confirm() (es. abbandono) senza bloccare.
  alice.on('dialog', (d) => d.accept());
  bob.on('dialog', (d) => d.accept());

  try {
    // 1. Alice crea una partita a 2 giocatori (games_to_win = 1)
    await alice.goto(BASE);
    await alice.click('#btn-create');
    await alice.fill('#input-nome', 'Alice');
    await alice.selectOption('#input-max', '2');
    await alice.selectOption('#input-vittorie', '1');
    await alice.click('#btn-submit-create');
    // Attende la lobby e legge il gameId dal codice mostrato.
    await alice.waitForSelector('#game-code');
    const gameId = (await alice.textContent('#game-code')).trim();
    expect(gameId).toMatch(/^[0-9a-f-]{36}$/i);

    // 2. Bob si unisce con il codice
    await bob.goto(`${BASE}/#join?gameId=${gameId}`);
    await bob.fill('#input-nome', 'Bob');
    await bob.click('#btn-submit-join');
    await bob.waitForSelector('#game-code');

    // 3. Entrambi "pronti" → il server auto-avvia (tutti pronti, min 2)
    await alice.click('#btn-ready');
    await bob.click('#btn-ready');

    // Attende che entrambe le pagine entrino nella game view.
    await expect(alice).toHaveURL(/#game/);
    await expect(bob).toHaveURL(/#game/);

    // 4. Bob (non di turno) abbandona → in 2 giocatori (gamesToWin=1) Alice vince
    //    e la partita TERMINA per tutti (game_over broadcast).
    await bob.click('#btn-leave-game');

    // Entrambi ricevono game_over → end view con vincitore Alice.
    await expect(alice).toHaveURL(/#end/);
    await expect(bob).toHaveURL(/#end/);
    await expect(alice.locator('.end-title')).toHaveText(/Vince Alice/);
  } finally {
    await ctxAlice.close();
    await ctxBob.close();
  }
});
