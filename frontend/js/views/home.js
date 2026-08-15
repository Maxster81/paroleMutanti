/**
 * views/home.js — Home view
 *
 * 3 azioni: Crea partita, Unisciti, Lista partite aperte.
 *
 * @module frontend/js/views/home
 */

import { navigate } from '../router.js';
import { state } from '../state.js';
import { emit } from '../socket.js';

export function renderHome(params = {}) {
  const s = state.get();
  return `
    <div class="home-view">
      <div class="home-hero">🎮 Parole Mutanti</div>
      <p class="home-tagline">Gioco multiplayer realtime di modifica parole italiane. Vinci l'ultimo che resta in gioco.</p>
      <div class="home-actions">
        <button class="btn btn-primary btn-block" id="btn-create">📝 Crea partita</button>
        <div class="home-divider">oppure</div>
        <button class="btn btn-secondary btn-block" id="btn-join">🔑 Unisciti con codice</button>
        <button class="btn btn-ghost btn-block" id="btn-list">📋 Lista partite aperte</button>
      </div>
      <div id="games-list" style="margin-top: var(--spacing-lg);"></div>
      <p class="text-muted text-small" style="margin-top: var(--spacing-lg);">
        Stato:
        <span class="badge ${s.connessione === 'online' ? 'badge-success' : s.connessione === 'connecting' ? 'badge-warn' : 'badge-error'}">${s.connessione}</span>
        · <span class="badge badge-muted">${s.tema}</span>
        · audio <span class="badge ${s.audioAbilitato ? 'badge-success' : 'badge-muted'}">${s.audioAbilitato ? 'on' : 'off'}</span>
      </p>
    </div>
  `;
}

/**
 * Attacca gli event listener dopo che la view è stata renderizzata.
 * Chiamato dal main.js dopo aver impostato app.innerHTML.
 */
export function attachHomeHandlers() {
  document.getElementById('btn-create')?.addEventListener('click', () => {
    navigate('#create');
  });
  document.getElementById('btn-join')?.addEventListener('click', () => {
    navigate('#join');
  });
  document.getElementById('btn-list')?.addEventListener('click', () => {
    caricaListaPartite();
  });
}

/**
 * Carica e renderizza la lista delle partite aperte.
 */
function caricaListaPartite() {
  const container = document.getElementById('games-list');
  if (!container) return;
  container.innerHTML = '<div class="loading">Caricamento…</div>';

  emit('list_games', {}, (resp) => {
    if (!resp || !resp.ok) {
      container.innerHTML = '<div class="alert alert-error">Impossibile caricare la lista</div>';
      return;
    }
    if (!resp.partite || resp.partite.length === 0) {
      container.innerHTML = '<div class="empty"><div class="empty-icon">🎲</div>Nessuna partita aperta. Sii il primo a crearne una!</div>';
      return;
    }
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Partite aperte (${resp.partite.length})</div>
        ${resp.partite.map(p => `
          <div class="player-card">
            <div>
              <div class="player-name">${escapeHtml(p.creator)}</div>
              <div class="text-small text-dim">${p.params.max_players} giocatori, ${p.params.turn_seconds}s/turno, ${p.giocatori.length}/${p.params.max_players}</div>
            </div>
            <button class="btn btn-sm btn-secondary btn-join-game" data-game-id="${p.id}">Unisciti</button>
          </div>
        `).join('')}
      </div>
    `;
    // Attach handlers
    container.querySelectorAll('.btn-join-game').forEach(btn => {
      btn.addEventListener('click', () => {
        const gameId = btn.dataset.gameId;
        navigate(`#join?gameId=${gameId}`);
      });
    });
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;'
  }[c]));
}
