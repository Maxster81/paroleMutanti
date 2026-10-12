import { readFileSync, writeFileSync } from 'node:fs';
const f = '/workspace/.memory-bank/progress.md';
let s = readFileSync(f, 'utf8');
const a = '- **File**: `frontend/js/views/game.js`, `frontend/css/views.css`.';
const b = '- **Ritocco (12/10)**: banner spostato **sotto il timer** (sopra la card della parola);\n  bordo della card "Parola corrente" portato a **3px** quando è il proprio turno.\n' + a;
if (!s.includes(a)) throw new Error('non trovato');
writeFileSync(f, s.replace(a, b));
console.log('ok');
