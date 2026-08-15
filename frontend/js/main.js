/**
 * main.js — Entry point del frontend
 *
 * Bootstrap: state, socket, audio, render home.
 * View switching completo in M4.3+.
 */

import { state } from './state.js';
import { connect as socketConnect, on as socketOn } from './socket.js';
import { click as audioClick, beep } from './audio.js';
import { healthCheck } from './api.js';

console.log('[main] Parole Mutanti frontend avviato');

const app = document.getElementById('app');

/* ============================================================
   Status dot connessione
   ============================================================ */
const statusDot = document.getElementById('connection-status');
function refreshStatusDot(connessione) {
  if (!statusDot) return;
  statusDot.classList.remove('status-offline', 'status-connecting', 'status-online');
  statusDot.classList.add(`status-${connessione}`);
  statusDot.title = {
    offline: 'Disconnesso dal server',
    connecting: 'Connessione in corso…',
    online: 'Connesso',
  }[connessione] || '';
}

/* ============================================================
   Theme toggle
   ============================================================ */
const themeToggle = document.getElementById('theme-toggle');
const SOUND_KEY = 'pm-audio';
const THEME_KEY = 'pm-tema';

function refreshThemeIcon() {
  if (!themeToggle) return;
  const tema = state.get().tema;
  themeToggle.textContent = tema === 'dark' ? '🌙' : '☀️';
  themeToggle.title = tema === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro';
}

function toggleTheme() {
  audioClick();
  const nuovoTema = state.get().tema === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nuovoTema);
  localStorage.setItem(THEME_KEY, nuovoTema);
  state.update({ tema: nuovoTema });
}

if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// Applica tema iniziale
document.documentElement.setAttribute('data-theme', state.get().tema);
refreshThemeIcon();

/* ============================================================
   Sound toggle
   ============================================================ */
const soundToggle = document.getElementById('sound-toggle');
function refreshSoundIcon() {
  if (!soundToggle) return;
  const attivo = state.get().audioAbilitato;
  soundToggle.textContent = attivo ? '🔊' : '🔇';
  soundToggle.title = attivo ? 'Audio attivo (clicca per disattivare)' : 'Audio disattivato (clicca per attivare)';
}

function toggleSound() {
  // Niente audioClick (sennò si attiverebbe da solo)
  const nuovo = !state.get().audioAbilitato;
  localStorage.setItem(SOUND_KEY, nuovo ? 'on' : 'off');
  state.update({ audioAbilitato: nuovo });
  if (nuovo) {
    // Beep di conferma attivazione
    setTimeout(() => beep(880, 100), 50);
  }
}

if (soundToggle) {
  soundToggle.addEventListener('click', toggleSound);
}
refreshSoundIcon();

/* ============================================================
   Reactivity: re-render su state change
   ============================================================ */
function render() {
  refreshStatusDot(state.get().connessione);
  refreshThemeIcon();
  refreshSoundIcon();
  // Home placeholder (M4.3 sostituirà con router)
  app.innerHTML = renderHome();
}

state.subscribe(render);

/* ============================================================
   Home placeholder (M4.3)
   ============================================================ */
function renderHome() {
  const s = state.get();
  return `
    <div class="home-view">
      <div class="home-hero">🎮 Parole Mutanti</div>
      <p class="home-tagline">Gioco multiplayer realtime di modifica parole italiane. Vinci l'ultimo che resta in gioco.</p>
      <div class="home-actions">
        <button class="btn btn-primary btn-block" disabled>📝 Crea partita (M4.3)</button>
        <div class="home-divider">oppure</div>
        <button class="btn btn-secondary btn-block" disabled>🔑 Unisciti con codice (M4.3)</button>
        <button class="btn btn-ghost btn-block" disabled>📋 Lista partite aperte (M4.3)</button>
      </div>
      <p class="text-muted text-small">
        M4.2 — State + Socket.io client. Stato:
        <span class="badge ${s.connessione === 'online' ? 'badge-success' : s.connessione === 'connecting' ? 'badge-warn' : 'badge-error'}">${s.connessione}</span>
        · Tema: <span class="badge badge-muted">${s.tema}</span>
        · Audio: <span class="badge ${s.audioAbilitato ? 'badge-success' : 'badge-muted'}">${s.audioAbilitato ? 'on' : 'off'}</span>
      </p>
      <p class="text-muted text-small">M4.2 — State + Socket client + theme/audio toggle. Prossimo step: views.</p>
    </div>
  `;
}

/* ============================================================
   Bootstrap
   ============================================================ */
(async () => {
  // Health check iniziale
  const health = await healthCheck();
  console.log('[main] health:', health.ok ? 'OK' : 'KO', health.db || '');
  if (!health.ok) {
    console.warn('[main] Backend non raggiungibile');
  }

  // Connetti socket
  socketConnect();

  // Eventi di stato globale
  socketOn('partita_avviata', (data) => {
    console.log('[main] partita avviata', data);
    state.update({ partita: { ...data, type: 'running' } });
  });
  socketOn('game_over', (data) => {
    console.log('[main] game over', data);
    state.update({ partita: { ...data, type: 'finished' } });
  });
  socketOn('lobby_updated', (data) => {
    console.log('[main] lobby updated', data);
    state.update({ partita: { ...data } });
  });

  // Re-render iniziale
  render();
})();
