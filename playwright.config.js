/**
 * playwright.config.js — Configurazione test e2e browser (Parole Mutanti)
 *
 * Richiede un backend in esecuzione (di default http://localhost:8090).
 * Se il server non è raggiungibile, i test e2e vengono SKIPPATI (non falliscono).
 *
 * Esegui:   npm run test:e2e:browser   (con il backend avviato)
 * Ambiente: E2E_BASE_URL per puntare a un altro host.
 *
 * @module playwright.config
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8090',
    headless: true,
  },
});
