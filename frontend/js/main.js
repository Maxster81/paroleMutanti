/**
 * main.js — Entry point del frontend
 *
 * Bootstrap: log + mount placeholder home. View switching completo in M4.2+.
 */

console.log('[main] Parole Mutanti frontend avviato');

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <div class="home-view">
      <div class="home-hero">🎮 Parole Mutanti</div>
      <p class="home-tagline">Gioco multiplayer realtime di modifica parole italiane. Vinci l'ultimo che resta in gioco.</p>
      <div class="home-actions">
        <button class="btn btn-primary btn-block" disabled>📝 Crea partita (M4.3)</button>
        <div class="home-divider">oppure</div>
        <button class="btn btn-secondary btn-block" disabled>🔑 Unisciti con codice (M4.3)</button>
        <button class="btn btn-ghost btn-block" disabled>📋 Lista partite aperte (M4.3)</button>
      </div>
      <p class="text-muted text-small">M4.1 — Setup CSS + index.html. Prossimo step: state + Socket.io client.</p>
    </div>
  `;
}
