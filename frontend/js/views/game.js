/**
 * views/game.js — Game view (M5 light)
 *
 * Mostra: timer circle, parola corrente, input submit, history turni recenti.
 * Listener Socket: turn_update, tick, beep, mossa_rifiutata, game_over.
 *
 * **M5-bugfix**: mostra `currentWord` (l'ultima parola valida) invece di
 * `parolaIniziale` (la prima parola della partita), così il giocatore
 * di turno vede da quale parola partire.
 *
 * @module frontend/js/views/game
 */

import { navigate } from '../router.js';
import { state } from '../state.js';
import { emit, on as socketOn } from '../socket.js';
import { click as audioClick, tick as audioTick, buzzer, success, beep } from '../audio.js';

let lastBeepSecond = -1;

export function renderGame(params = {}) {
  const s = state.get();
  const partita = s.partita;

  if (!partita || partita.state !== 'running') {
    return `
      <div class="form-view">
        <div class="alert alert-error">Nessuna partita in corso.</div>
        <button class="btn btn-secondary btn-block" id="btn-back-lobby">← Torna alla lobby</button>
      </div>
    `;
  }

  // M5-bugfix: currentWord è l'ultima parola valida, NON la iniziale
  // La parola iniziale rimane in partita.parolaIniziale per la lobby
  const word = partita.currentWord || partita.parolaIniziale || '?';
  const giocatore = partita.giocatore || partita.giocatoreCorrente || '?';
  const timeLeft = partita.timeLeft ?? 30;
  const history = (partita.history || []).slice(-5);

  const timerClass = timeLeft <= 5 ? 'timer-circle-danger' :
                     timeLeft <= 10 ? 'timer-circle-warning' : '';

  const mioNome = localStorage.getItem('pm-nome') || '';
  const ioSonoTurnista = giocatore === mioNome;

  return `
    <div class="form-view" style="text-align: center;">
      <div class="timer-circle ${timerClass}" id="timer-circle">
        <div class="timer-text" id="timer-text">${timeLeft}</div>
      </div>
      <p class="text-small text-dim">secondi</p>

      <div class="card" style="margin-top: var(--spacing-lg); text-align: left;">
        <div class="text-small text-dim">Parola corrente (l'ultima valida)</div>
        <div style="font-size: 2rem; font-weight: 700; color: var(--primary); margin: var(--spacing-sm) 0;">
          ${escapeHtml(word)}
        </div>
        <div class="text-small">
          Tocca a: <strong>${escapeHtml(giocatore)}</strong>
          ${ioSonoTurnista ? '<span class="badge badge-success">TU!</span>' : ''}
        </div>
      </div>

      ${ioSonoTurnista ? `
        <form id="submit-form" style="margin-top: var(--spacing-md);">
          <div class="form-group">
            <input class="form-input" type="text" id="input-parola" placeholder="La tua parola (a distanza 1)" autocomplete="off" autocapitalize="none" spellcheck="false" autofocus>
          </div>
          <div id="submit-error" class="alert alert-error" style="display: none;"></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" id="btn-submit-word">📤 Invia parola</button>
            <button type="button" class="btn btn-ghost btn-block" id="btn-pass">⏭ Passa il turno</button>
          </div>
        </form>
      ` : `
        <div class="alert alert-info" style="margin-top: var(--spacing-md);">
          Aspetta che <strong>${escapeHtml(giocatore)}</strong> faccia la sua mossa.
        </div>
        <button class="btn btn-ghost btn-block" id="btn-leave-game">🚪 Esci (abbandona)</button>
      `}

      ${history.length > 0 ? `
        <div class="card" style="margin-top: var(--spacing-md); text-align: left;">
          <div class="text-small text-dim">Ultime mosse</div>
          ${history.slice().reverse().map(h => `
            <div class="text-small" style="margin-top: 4px;">
              <strong>${escapeHtml(h.giocatore)}</strong>: ${escapeHtml(h.parola)}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

export function attachGameHandlers() {
  document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
    navigate('#lobby');
  });

  const form = document.getElementById('submit-form');
  const errorBox = document.getElementById('submit-error');
  const submitBtn = document.getElementById('btn-submit-word');

  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      audioClick();
      const parola = document.getElementById('input-parola').value.trim();
      if (!parola) {
        if (errorBox) {
          errorBox.textContent = 'Inserisci una parola';
          errorBox.style.display = 'block';
        }
        return;
      }
      if (errorBox) errorBox.style.display = 'none';

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Invio...';

      const partita = state.get().partita;
      emit('submit_word', {
        gameId: partita.gameId || partita.id,
        nome: localStorage.getItem('pm-nome') || '',
        parola,
      }, (resp) => {
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 Invia parola';

        if (!resp || !resp.ok) {
          if (errorBox) {
            errorBox.textContent = resp?.messaggio || 'Errore sconosciuto';
            errorBox.style.display = 'block';
          }
          buzzer();
          return;
        }
        if (resp.valida) {
          success();
          document.getElementById('input-parola').value = '';
          lastBeepSecond = -1;
        } else {
          if (errorBox) {
            errorBox.textContent = resp.messaggio || 'Mossa rifiutata';
            errorBox.style.display = 'block';
          }
          buzzer();
        }
      });
    });
  }

  document.getElementById('btn-pass')?.addEventListener('click', () => {
    audioClick();
    const partita = state.get().partita;
    emit('pass_turn', {
      gameId: partita.gameId || partita.id,
      nome: localStorage.getItem('pm-nome') || '',
    });
  });

  document.getElementById('btn-leave-game')?.addEventListener('click', () => {
    if (confirm('Vuoi abbandonare la partita?')) {
      const partita = state.get().partita;
      emit('leave_game', { nome: localStorage.getItem('pm-nome') || '' });
      state.update({ gameId: null, partita: null });
      navigate('#home');
    }
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;'
  }[c]));
}
