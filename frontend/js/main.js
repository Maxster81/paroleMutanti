/**
 * main.js — Entry point del frontend
 *
 * Bootstrap: state, socket, audio, router, view rendering.
 * Re-render reattivo su cambi di state E di route.
 */

import { state } from './state.js';
import { connect as socketConnect, on as socketOn } from './socket.js';
import { click as audioClick, beep, tick as audioTick } from './audio.js';
import { healthCheck } from './api.js';
import { route, start as routerStart, onRouteChange, navigate } from './router.js';

import { renderHome, attachHomeHandlers } from './views/home.js';
import { renderCreate, attachCreateHandlers } from './views/create.js';
import { renderJoin, attachJoinHandlers } from './views/join.js';
import { renderLobby, attachLobbyHandlers } from './views/lobby.js';
import { renderGame, attachGameHandlers } from './views/game.js';

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
  themeToggle.textContent = state.get().tema === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  audioClick();
  const nuovoTema = state.get().tema === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nuovoTema);
  localStorage.setItem(THEME_KEY, nuovoTema);
  state.update({ tema: nuovoTema });
}

if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
document.documentElement.setAttribute('data-theme', state.get().tema);
refreshThemeIcon();

const soundToggle = document.getElementById('sound-toggle');
function refreshSoundIcon() {
  if (!soundToggle) return;
  soundToggle.textContent = state.get().audioAbilitato ? '🔊' : '🔇';
}

function toggleSound() {
  const nuovo = !state.get().audioAbilitato;
  localStorage.setItem(SOUND_KEY, nuovo ? 'on' : 'off');
  state.update({ audioAbilitato: nuovo });
  if (nuovo) setTimeout(() => beep(880, 100), 50);
}

if (soundToggle) soundToggle.addEventListener('click', toggleSound);
refreshSoundIcon();

/* ============================================================
   Router
   ============================================================ */
route('#home', renderHome);
route('#create', renderCreate);
route('#join', renderJoin);
route('#lobby', renderLobby);
route('#game', renderGame);

let currentTickSecond = -1;

onRouteChange((renderFn, params) => {
  app.innerHTML = renderFn(params);
  refreshStatusDot(state.get().connessione);
  refreshThemeIcon();
  refreshSoundIcon();

  const routeCorrente = location.hash.split('?')[0] || '#home';
  switch (routeCorrente) {
    case '#home': attachHomeHandlers(); break;
    case '#create': attachCreateHandlers(); break;
    case '#join': attachJoinHandlers(); break;
    case '#lobby': attachLobbyHandlers(); break;
    case '#game': attachGameHandlers(); break;
  }
});

/* ============================================================
   Socket events → state + re-render
   ============================================================ */
socketOn('lobby_updated', (data) => {
  if (data.gameId === state.get().gameId) {
    state.update({ partita: { ...state.get().partita, ...data } });
    if (location.hash.startsWith('#lobby')) navigate('#lobby');
  }
});

socketOn('partita_avviata', (data) => {
  console.log('[main] partita_avviata', data);
  state.update({ partita: { ...data, state: 'running' } });
  // Naviga alla game view
  navigate(`#game?gameId=${data.gameId}`);
});

socketOn('turn_update', (data) => {
  console.log('[main] turn_update', data);
  if (data.gameId === state.get().gameId) {
    // Update parita con nuovi dati turno
    state.update({ partita: { ...state.get().partita, ...data } });
    // Re-render se siamo sulla game view
    if (location.hash.startsWith('#game')) navigate('#game');
  }
});

socketOn('tick', (data) => {
  // Aggiorna solo il numero del timer senza re-render completo
  const timerText = document.getElementById('timer-text');
  const timerCircle = document.getElementById('timer-circle');
  if (timerText && data.gameId === state.get().gameId) {
    timerText.textContent = data.timeLeft;
    if (timerCircle) {
      timerCircle.classList.remove('timer-circle-warning', 'timer-circle-danger');
      if (data.timeLeft <= 5) timerCircle.classList.add('timer-circle-danger');
      else if (data.timeLeft <= 10) timerCircle.classList.add('timer-circle-warning');
    }
    // Beep solo al cambio di secondo, max una volta al secondo
    if (data.timeLeft !== currentTickSecond && data.timeLeft > 0 && data.timeLeft <= 10) {
      audioTick();
      currentTickSecond = data.timeLeft;
    }
  }
});

socketOn('beep', () => {
  // Suono addizionale di countdown (ridondante con tick, ok)
  audioTick();
});

socketOn('mossa_rifiutata', (data) => {
  console.log('[main] mossa rifiutata', data);
  // Mostra alert temporaneo
  const errorBox = document.getElementById('submit-error');
  if (errorBox) {
    errorBox.textContent = data.messaggio || 'Mossa rifiutata';
    errorBox.style.display = 'block';
    setTimeout(() => { errorBox.style.display = 'none'; }, 4000);
  }
});

socketOn('giocatore_eliminato', (data) => {
  console.log('[main] giocatore_eliminato', data);
  if (data.gameId === state.get().gameId) {
    state.update({ partita: { ...state.get().partita, giocatori: data.giocatoriRimanenti } });
    if (location.hash.startsWith('#game')) navigate('#game');
  }
});

socketOn('game_over', (data) => {
  console.log('[main] game_over', data);
  state.update({ partita: { ...data, state: 'finished' } });
  alert(`🏆 Vince: ${data.vincitore}!\n\nDurata: ${(data.durataMs / 1000).toFixed(1)}s\nTurni totali: ${data.history.length}`);
  navigate('#home');
});

socketOn('partita_cancellata', () => {
  alert('La partita è stata cancellata');
  state.update({ gameId: null, partita: null });
  navigate('#home');
});

/* ============================================================
   Bootstrap
   ============================================================ */
(async () => {
  const health = await healthCheck();
  console.log('[main] health:', health.ok ? 'OK' : 'KO', health.db || '');
  socketConnect();
  routerStart();
})();
