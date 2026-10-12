/**
 * views/draw.js — "Pesca" del primo giocatore
 *
 * Mostrata all'avvio della partita (evento `partita_avviata`): anima i nomi dei
 * giocatori e si ferma sul primo che deve giocare. Il primo giocatore è deciso
 * **a caso dal server**, quindi tutti i client mostrano lo stesso risultato.
 *
 * Durata totale = `drawMs` (inviata dal server, default 2800 ms). Il turno sul
 * server diventa attivo poco prima della fine dell'animazione, così nessuno
 * perde secondi e non esiste una finestra in cui l'invio è "troppo presto".
 *
 * @module frontend/js/views/draw
 */

import { navigate } from '../router.js';
import { state } from '../state.js';
import { beep, success } from '../audio.js';

/** Timer attivi della view (azzerati a ogni ingresso in schermata). */
let timers = [];

/** Ferma tutti i timer della view. */
export function stopDrawTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

/** true se siamo ancora sulla schermata di pesca. */
function sullaDraw() {
  return window.location.hash.startsWith('#draw');
}

export function renderDraw() {
  const partita = state.get().partita || {};
  const giocatori = partita.giocatori || [];

  if (!partita.gameId || giocatori.length < 1) {
    return `
      <div class="form-view">
        <div class="alert alert-info">Avvio della partita…</div>
      </div>
    `;
  }

  return `
    <div class="form-view draw-view">
      <div class="draw-title">Chi inizia?</div>
      <div class="draw-subtitle text-dim">Estrazione a sorte del primo giocatore…</div>
      <div class="draw-players" id="draw-players">
        ${giocatori.map((g) => `
          <div class="draw-player" data-nome="${escapeHtml(g)}">
            <span class="draw-player__name">${escapeHtml(g)}</span>
            <span class="draw-player__tag" aria-hidden="true"></span>
          </div>
        `).join('')}
      </div>
      <div class="draw-result" id="draw-result" role="status" aria-live="polite"></div>
    </div>
  `;
}

export function attachDrawHandlers() {
  const partita = state.get().partita || {};
  const giocatori = partita.giocatori || [];
  const primo = partita.giocatoreCorrente;
  const gameId = partita.gameId;
  const drawMsRaw = Number(partita.drawMs);
  const drawMs = Number.isFinite(drawMsRaw) && drawMsRaw >= 0 ? drawMsRaw : 2800;

  stopDrawTimers();

  const nodi = Array.from(document.querySelectorAll('.draw-player'));
  const vaiAlGioco = () => {
    if (sullaDraw()) navigate(`#game?gameId=${gameId}`);
  };

  // drawMs = 0 → nessuna attesa (il server ha già attivato il turno).
  if (drawMs === 0) { vaiAlGioco(); return; }

  const mostraRisultato = () => {
    if (!sullaDraw()) return;
    nodi.forEach((el) => {
      el.classList.remove('draw-player--attivo');
      el.classList.toggle('draw-player--scelto', el.dataset.nome === primo);
    });
    const res = document.getElementById('draw-result');
    if (res) res.innerHTML = `🎯 Inizia <strong>${escapeHtml(primo)}</strong>!`;
    success();
  };

  const ridotto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Movimento ridotto (o un solo giocatore): niente animazione, solo il risultato.
  if (ridotto || giocatori.length <= 1 || !primo) {
    mostraRisultato();
    timers.push(setTimeout(vaiAlGioco, drawMs));
    return;
  }

  // Sequenza di evidenziazioni che si RALLENTA e termina sempre sul primo
  // giocatore: si sceglie un punto di partenza casuale e un numero di passi
  // tale che l'ultimo indice evidenziato coincida col primo giocatore.
  const n = giocatori.length;
  const targetIdx = Math.max(0, giocatori.indexOf(primo));
  const start = Math.floor(Math.random() * n);
  const giri = 3 + Math.floor(Math.random() * 3);
  const passi = giri * n + ((targetIdx - start + n) % n) + 1;

  // L'animazione occupa tutto tranne gli ultimi 600 ms (risultato a schermo).
  const animMs = Math.max(500, drawMs - 600);
  const pesi = [];
  for (let i = 0; i < passi; i += 1) pesi.push(Math.min(1 + i * 0.25, 4.5));
  const somma = pesi.reduce((a, b) => a + b, 0);

  let t = 0;
  for (let i = 0; i < passi; i += 1) {
    const idx = (start + i) % n;
    t += (pesi[i] / somma) * animMs;
    timers.push(setTimeout(() => {
      if (!sullaDraw()) return;
      nodi.forEach((el, k) => el.classList.toggle('draw-player--attivo', k === idx));
      beep(520 + (i % 6) * 40, 45);
    }, t));
  }
  timers.push(setTimeout(mostraRisultato, animMs));
  timers.push(setTimeout(vaiAlGioco, drawMs));
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
