# 03 — Frontend Rules (Vanilla JS + CSS Mobile-First)

## Tecnologia
- **NO framework pesante** (no React, no Vue, no Angular). Vanilla JS puro con moduli ES6.
- **CSS puro** (no Tailwind, no Bootstrap). Variabili CSS per theming.
- **HTML semantico**: `<header>`, `<main>`, `<section>`, `<nav>`, `<button>`, `<label>`.
- **Audio**: Web Audio API (OscillatorNode), MAI file .mp3/.wav.

## Mobile-First
- **Viewport target**: 360x800px (smartphone verticali).
- **Media queries progressive**: partire da mobile, aggiungere breakpoint per tablet/desktop.
- **Touch-friendly**: bottoni min 44x44px, padding generoso, niente hover-only.
- **Landscape mode**: layout adattato (orizzontale, timer/lista laterale).

## Struttura File
```
frontend/
├── index.html          # SPA-like con view switching
├── css/
│   ├── base.css        # Reset, variabili, tipografia
│   ├── components.css  # Bottoni, card, input
│   └── views.css       # Stili specifici per view
├── js/
│   ├── main.js         # Entry, router
│   ├── state.js        # State manager centrale
│   ├── api.js          # Wrapper fetch
│   ├── socket.js       # Wrapper Socket.io client
│   ├── audio.js        # Web Audio API wrapper
│   └── views/          # Una funzione render per view
│       ├── home.js
│       ├── create.js
│       ├── join.js
│       ├── lobby.js
│       ├── game.js
│       └── end.js
```

## State Management
- **Oggetto centrale** `state` in `state.js` con `update(partial)`.
- Dopo ogni update: emit evento `state-changed` per le view.
- Niente librerie esterne (no Redux, no MobX).

## CSS Conventions
- **Variabili CSS** in `:root {}` per colori, spacing, font-size, transizioni.
- **Classi kebab-case**: `.btn-primary`, `.game-timer`, `.player-card`.
- **BEM semplificato**: `.card__header`, `.card__body` solo se necessario.
- **NO inline style**, MAI.
- **Transizioni**: solo `transform` e `opacity` (performanti).

## Accessibilità
- **Label associati** a ogni input (`<label for="...">`).
- **ARIA**: solo quando semantic HTML non basta.
- **Focus visible**: outline personalizzato ma sempre presente.
- **Contrasto**: WCAG AA minimo.

## Tema
- Predisporre fin da subito variabili CSS per supportare tema dark/light in futuro.
- Default: dark (più adatto a gaming).

## Audio (Web Audio API)
- **Context**: unico AudioContext creato al primo user gesture.
- **Funzioni**: `beep(freq, duration)`, `buzzer()`, `success()`, `tick()`.
- **Volume**: pre-set a 0.3 (non fastidioso).
- **Toggle muto**: pulsante in header, stato in localStorage.
