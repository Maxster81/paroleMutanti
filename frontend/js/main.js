/**
 * main.js — Entry point del frontend
 *
 * Bootstrap: state, socket, audio, router, view rendering.
 * Re-render reattivo su cambi di state E di route.
 */

import { state } from './state.js';
import { connect as socketConnect, on as socketOn } from './socket.js';
import { click as audioClick, beep } from './audio.js';
import { healthCheck } from './api.js';
import { route, start as routerStart, onRouteChange, navigate } from './router.js';

import { renderHome, attachHomeHandlers } from './views/home.js';
import { renderCreate, attachCreateHandlers } from './views/create.js';
import { renderJoin, attachJoinHandlers } from './views/join.js';
import { renderLobby, attachLobbyHandlers } from './views/lobby.js';

console.log('[main] Parole Mutanti frontend avviato');

const app = document.getElementById('app');

/* ============================================================
   Header: status dot, theme toggle, sound toggle
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
document.documentElement.setAttribute('data-theme', state.get().tema);
refreshThemeIcon();

const soundToggle = document.getElementById('sound-toggle');
function refreshSoundIcon() {
  if (!soundToggle) return;
  const attivo = state.get().audioAbilitato;
  soundToggle.textContent = attivo ? '🔊' : '🔇';
  soundToggle.title = attivo ? 'Audio attivo' : 'Audio disattivato';
}

function toggleSound() {
  const nuovo = !state.get().audioAbilitato;
  localStorage.setItem(SOUND_KEY, nuovo ? 'on' : 'off');
  state.update({ audioAbilitato: nuovo });
  if (nuovo) setTimeout(() => beep(880, 100), 50);
}

if (soundToggle) {
  soundToggle.addEventListener('click', toggleSound);
}
refreshSoundIcon();

/* ============================================================
   Router: registrazione routes + render reattivo
   ============================================================ */
route('#home', renderHome);
route('#create', renderCreate);
route('#join', renderJoin);
route('#lobby', renderLobby);

onRouteChange((renderFn, params) => {
  // Renderizza la view
  app.innerHTML = renderFn(params);

  // Refresh header dinamici
  refreshStatusDot(state.get().connessione);
  refreshThemeIcon();
  refreshSoundIcon();

  // Attach handlers specifici per view corrente
  const routeCorrente = location.hash.split('?')[0] || '#home';
  switch (routeCorrente) {
    case '#home': attachHomeHandlers(); break;
    case '#create': attachCreateHandlers(); break;
    case '#join': attachJoinHandlers(); break;
    case '#lobby': attachLobbyHandlers(); break;
  }
});

/* ============================================================
   Setup routes eventi Socket.io
   ============================================================ */
socketOn('lobby_updated', (data) => {
  console.log('[main] lobby_updated', data);
  // Ricarica partita nello state, mantieni gameId
  const currentGameId = state.get().gameId;
  if (data.gameId === currentGameId) {
    state.update({ partita: { ...state.get().partita, ...data } });
    // Se siamo già sulla lobby, forza re-render
    if (location.hash.startsWith('#lobby')) navigate('#lobby');
  }
});

socketOn('partita_avviata', (data) => {
  console.log('[main] partita_avviata', data);
  // Aggiungi flag running alla partita
  state.update({ partita: { ...data, state: 'running' } });
  alert(`🎉 Partita avviata!\n\nParola iniziale: ${data.parolaIniziale}\nTocca a: ${data.giocatoreCorrente}`);
  // In M5: navigate('#game'). Per ora resta in lobby (M4.3 finisce qui)
});

socketOn('game_over', (data) => {
  console.log('[main] game_over', data);
  alert(`🏆 Vince: ${data.vincitore}!\n\nDurata: ${(data.durataMs / 1000).toFixed(1)}s\nTurni totali: ${data.history.length}`);
  state.update({ partita: { ...data, state: 'finished' } });
});

/* ============================================================
   Bootstrap
   ============================================================ */
(async () => {
  // Health check
  const health = await healthCheck();
  console.log('[main] health:', health.ok ? 'OK' : 'KO', health.db || '');

  // Connetti socket
  socketConnect();

  // Avvia router
  routerStart();
})();
