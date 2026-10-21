'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - light blue
  '#ffb74d', // L - orange
  '#90a4ae', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Power-ups: bloques 1×1 cuyo índice de color (POWER_BASE + i) también los identifica
const POWER_EVERY = 5;   // líneas entre power-ups
const FREEZE_MS = 5000;
const TINT_MS = 1000;
const POWERUPS = [
  { name: 'Bomba',    icon: '💣', color: '#f06292' },
  { name: 'Rayo',     icon: '⚡', color: '#fff176' },
  { name: 'Tinte',    icon: '🎨', color: '#ce93d8' },
  { name: 'Gravedad', icon: '⬇',  color: '#a1887f' },
  { name: 'Congelar', icon: '❄',  color: '#80deea' },
];
const POWER_BASE = COLORS.length;
POWERUPS.forEach(p => COLORS.push(p.color));
const WILD = COLORS.length; // comodín del Tinte (se dibuja en arcoíris)
COLORS.push('#ffffff');
const [BOMB, LIGHTNING, TINT, GRAVITY, FREEZE] = POWERUPS.map((_, i) => i);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const powerEl = document.getElementById('power');
const comboEl = document.getElementById('combo');
const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const startBtn = document.getElementById('start-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordForm = document.getElementById('record-form');
const recordMsg = document.getElementById('record-msg');
const recordName = document.getElementById('record-name');
const recordSave = document.getElementById('record-save');
const overlayRecords = document.getElementById('overlay-records');

// ---- Records locales ----
const RECORDS_KEY = 'tetris.records';
const NAME_KEY = 'tetris.lastName';
const MAX_RECORDS = 5;

function loadRecords() {
  const rec = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return rec;
    const num = v => (Number.isFinite(v) && v >= 0 ? v : 0);
    rec.bestCombo = num(data.bestCombo);
    rec.maxLines = num(data.maxLines);
    if (Array.isArray(data.top)) {
      rec.top = data.top
        .filter(e => e && typeof e === 'object' && Number.isFinite(e.score))
        .map(e => ({
          name: String(e.name ?? '').slice(0, 12) || 'Anónimo',
          score: e.score, lines: num(e.lines), level: num(e.level),
          combo: num(e.combo), date: String(e.date ?? ''),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS);
    }
  } catch (err) { /* datos corruptos o localStorage no disponible */ }
  return rec;
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (err) { /* ignorar */ }
}

function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (err) { return ''; }
}

function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* ignorar */ }
}

// Posición (0-based) que ocuparía la puntuación en el top, o -1 si no entra
function recordRank(rec, pts) {
  if (pts <= 0) return -1;
  let i = rec.top.findIndex(e => pts > e.score);
  if (i === -1) i = rec.top.length;
  return i < MAX_RECORDS ? i : -1;
}

// Dibuja tabla + estadísticas en `container` usando solo textContent
function renderRecords(container, rec, highlight) {
  container.textContent = '';
  if (rec.top.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Aún no hay records';
    container.appendChild(p);
  } else {
    const table = document.createElement('table');
    const head = table.insertRow();
    ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS'].forEach(t => {
      const th = document.createElement('th');
      th.textContent = t;
      head.appendChild(th);
    });
    rec.top.forEach((e, i) => {
      const tr = table.insertRow();
      if (i === highlight) tr.className = 'highlight';
      [i + 1, e.name, e.score.toLocaleString(), e.lines].forEach(v => {
        tr.insertCell().textContent = v;
      });
    });
    container.appendChild(table);
  }
  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.textContent = `Mejor combo: ${rec.bestCombo} · Máx. líneas: ${rec.maxLines}`;
  container.appendChild(stats);
}

const THEMES = {
  dark:  { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#e3e6f0', highlight: 'rgba(255,255,255,0.35)' },
};
let theme = 'dark';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextPowerAt, powerPending, freezeLeft, tintLeft, lastPower;
let combo, maxComboThisGame, pendingRank;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerPiece() {
  const power = Math.floor(Math.random() * POWERUPS.length);
  return { type: POWER_BASE + power, power, shape: [[POWER_BASE + power]], x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    while (lines >= nextPowerAt) {
      nextPowerAt += POWER_EVERY;
      powerPending = true;
    }
    updateHUD();
  }
}

// Reapila hacia abajo las celdas no vacías de cada columna
function compactColumns() {
  for (let c = 0; c < COLS; c++) {
    const cells = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) cells.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = cells.pop() || 0;
  }
}

function destroyCell(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !board[r][c]) return;
  board[r][c] = 0;
  score += 10 * level;
}

function applyPower(power, x, y) {
  lastPower = POWERUPS[power].icon + ' ' + POWERUPS[power].name;
  switch (power) {
    case BOMB:
      for (let r = y - 1; r <= y + 1; r++)
        for (let c = x - 1; c <= x + 1; c++)
          destroyCell(r, c);
      break;
    case LIGHTNING:
      for (let r = 0; r < ROWS; r++) destroyCell(r, x);
      for (let c = 0; c < COLS; c++) destroyCell(y, c);
      break;
    case TINT: {
      let target = y + 1 < ROWS ? board[y + 1][x] : 0;
      if (!target) {
        const counts = {};
        for (const row of board) for (const v of row) if (v) counts[v] = (counts[v] || 0) + 1;
        target = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]) || 0;
      }
      if (!target) break;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] === target) board[r][c] = WILD;
      tintLeft = TINT_MS;
      break;
    }
    case GRAVITY:
      compactColumns();
      break;
    case FREEZE:
      freezeLeft = FREEZE_MS;
      break;
  }
}

function endTint() {
  tintLeft = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === WILD) destroyCell(r, c);
  compactColumns();
  clearLines();
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.power !== undefined) applyPower(current.power, current.x, current.y);
  else merge();
  const linesBefore = lines;
  clearLines();
  combo = lines > linesBefore ? combo + 1 : 0;
  maxComboThisGame = Math.max(maxComboThisGame, combo);
  updateHUD();
  spawn();
}

function spawn() {
  current = next;
  next = powerPending ? randomPowerPiece() : randomPiece();
  powerPending = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo;
  let text = lastPower || '—';
  if (freezeLeft > 0) text = `❄ ${(freezeLeft / 1000).toFixed(1)}s`;
  else if (tintLeft > 0) text = '🎨 ...';
  powerEl.textContent = text;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === WILD
    ? `hsl(${(performance.now() / 5 + (x + y) * 40) % 360}, 90%, 60%)`
    : COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = THEMES[theme].highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex >= POWER_BASE && colorIndex < WILD) {
    context.fillStyle = '#000';
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWERUPS[colorIndex - POWER_BASE].icon, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = THEMES[theme].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  // congelar
  if (freezeLeft > 0) {
    ctx.fillStyle = 'rgba(128, 222, 234, 0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function setTheme(name) {
  theme = name;
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
  // El bucle puede estar cancelado (pausa / game over): redibujar a mano
  draw();
  drawNext();
}

function toggleTheme() {
  setTheme(theme === 'dark' ? 'light' : 'dark');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  const rec = loadRecords();
  pendingRank = recordRank(rec, score);
  rec.bestCombo = Math.max(rec.bestCombo, maxComboThisGame);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  if (pendingRank >= 0) {
    recordMsg.textContent = `¡Nuevo récord! #${pendingRank + 1}`;
    recordName.value = loadName();
    recordForm.classList.remove('hidden');
    overlayRecords.classList.add('hidden');
    // Pequeño retardo: evita que teclas aún pulsadas (Space/flechas) caigan en el campo
    setTimeout(() => {
      if (gameOver && pendingRank >= 0) { recordName.focus(); recordName.select(); }
    }, 500);
  } else {
    renderRecords(overlayRecords, rec, -1);
    overlayRecords.classList.remove('hidden');
  }
}

function submitRecord() {
  if (!gameOver || pendingRank < 0) return;
  const name = recordName.value.trim().slice(0, 12) || 'Anónimo';
  saveName(name);
  const rec = loadRecords();
  // El top pudo cambiar (otra pestaña): recalcular posición
  const rank = recordRank(rec, score);
  let hl = -1;
  if (rank >= 0) {
    rec.top.splice(rank, 0, {
      name, score, lines, level, combo: maxComboThisGame,
      date: new Date().toISOString(),
    });
    rec.top = rec.top.slice(0, MAX_RECORDS);
    hl = rank;
    saveRecords(rec);
  }
  pendingRank = -1;
  recordForm.classList.add('hidden');
  renderRecords(overlayRecords, rec, hl);
  overlayRecords.classList.remove('hidden');
  recordName.blur();
}

function showStartScreen() {
  renderRecords(startRecordsEl, loadRecords(), -1);
  startScreen.classList.remove('hidden');
  startBtn.focus();
}

function startGame() {
  startScreen.classList.add('hidden');
  init();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (tintLeft > 0) {
    tintLeft -= dt;
    if (tintLeft <= 0) endTint();
  }
  if (freezeLeft > 0) {
    freezeLeft = Math.max(0, freezeLeft - dt);
    updateHUD();
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() se llamó dentro de este frame; no reprogramar
  animId = requestAnimationFrame(loop);
}

function init(autostart = true) {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  nextPowerAt = POWER_EVERY;
  powerPending = false;
  freezeLeft = 0;
  tintLeft = 0;
  lastPower = null;
  combo = 0;
  maxComboThisGame = 0;
  pendingRank = -1;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  recordForm.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  cancelAnimationFrame(animId);
  if (autostart) animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (!startScreen.classList.contains('hidden')) {
    if (e.code === 'Enter' && tag !== 'BUTTON' && !e.repeat) startGame();
    else if (e.code === 'KeyT') toggleTheme();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  submitRecord(); // si hay un récord pendiente, guardarlo antes de reiniciar
  init();
});
startBtn.addEventListener('click', startGame);
resetRecordsBtn.addEventListener('click', () => {
  if (confirm('¿Borrar todos los records?')) {
    try { localStorage.removeItem(RECORDS_KEY); } catch (err) { /* ignorar */ }
    renderRecords(startRecordsEl, loadRecords(), -1);
  }
  startBtn.focus(); // evita que Enter/Space vuelvan a pulsar «Borrar records»
});
recordSave.addEventListener('click', submitRecord);
recordName.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); submitRecord(); }
});
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur(); // evita que Space active el botón
});

init(false); // prepara el tablero; el bucle arranca al pulsar «Jugar»
showStartScreen();
setTheme(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
