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
const skinSelect = document.getElementById('skin-select');

const THEMES = {
  dark:  { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#e3e6f0', highlight: 'rgba(255,255,255,0.35)' },
};
let theme = 'dark';

// ---- Skins: paleta (índices 1–8), fondo, rejilla y función de dibujo de celda ----
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (context.roundRect) { context.roundRect(x, y, w, h, r); return; }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    label: 'Retro',
    colors: null, // usa COLORS tal cual
    boardBg: null, // sigue el tema claro/oscuro (CSS)
    grid: null,
    drawCell(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = THEMES[theme].highlight;
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neón',
    colors: [null, '#00f0ff', '#fff200', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#c0c8d0'],
    boardBg: '#000000',
    grid: '#16162a',
    drawCell(context, px, py, size, color) {
      context.save();
      context.shadowColor = color;
      context.shadowBlur = size * 0.45;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px + 5, py + 5, size - 10, 3);
      context.restore();
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8f0', '#b9eac0', '#f7b9b9', '#b3d4fa', '#fcd3a4', '#cfd8dc'],
    boardBg: '#fff8f3',
    grid: '#f0e4dc',
    drawCell(context, px, py, size, color) {
      const r = size * 0.28;
      context.fillStyle = color;
      roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.lineWidth = 2;
      roundRectPath(context, px + 3.5, py + 3.5, size - 7, size - 7, r * 0.6);
      context.stroke();
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#29c5d6', '#f2c400', '#9c3fc0', '#43a047', '#d32f2f', '#1e6fd9', '#ef7d00', '#78909c'],
    boardBg: '#1b1b2b',
    grid: '#26263c',
    drawCell(context, px, py, size, color) {
      const u = Math.max(2, Math.round(size / 10)); // "píxel" del bloque
      const n = Math.floor((size - 2) / u);
      const x0 = px + 1, y0 = py + 1;
      context.fillStyle = color;
      context.fillRect(x0, y0, n * u, n * u);
      // damero determinista
      context.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 1; i < n - 1; i++)
        for (let j = 1; j < n - 1; j++)
          if ((i + j) % 2 === 0) context.fillRect(x0 + i * u, y0 + j * u, u, u);
      // bisel claro arriba/izquierda, oscuro abajo/derecha
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(x0, y0, n * u, u);
      context.fillRect(x0, y0, u, n * u);
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(x0, y0 + (n - 1) * u, n * u, u);
      context.fillRect(x0 + (n - 1) * u, y0, u, n * u);
    },
  },
};
const SKIN_KEYS = Object.keys(SKINS);
const SKIN_STORAGE_KEY = 'tetris.skin';
let skin = 'retro';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextPowerAt, powerPending, freezeLeft, tintLeft, lastPower;

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
  clearLines();
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
  let text = lastPower || '—';
  if (freezeLeft > 0) text = `❄ ${(freezeLeft / 1000).toFixed(1)}s`;
  else if (tintLeft > 0) text = '🎨 ...';
  powerEl.textContent = text;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const palette = SKINS[skin].colors;
  const color = colorIndex === WILD
    ? `hsl(${(performance.now() / 5 + (x + y) * 40) % 360}, 90%, 60%)`
    : (palette && palette[colorIndex]) || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  SKINS[skin].drawCell(context, x * size, y * size, size, color);
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
  ctx.strokeStyle = SKINS[skin].grid || THEMES[theme].grid;
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

function setSkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = name;
  const bg = SKINS[skin].boardBg;
  for (const c of [canvas, nextCanvas]) c.style.background = bg || '';
  skinSelect.value = skin;
  try { localStorage.setItem(SKIN_STORAGE_KEY, skin); } catch (e) { /* sin almacenamiento */ }
  // El bucle puede estar cancelado (pausa / game over): redibujar a mano
  draw();
  drawNext();
}

function cycleSkin() {
  setSkin(SKIN_KEYS[(SKIN_KEYS.indexOf(skin) + 1) % SKIN_KEYS.length]);
}

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    return SKINS[saved] ? saved : 'retro';
  } catch (e) { return 'retro'; }
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

function init() {
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
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) {
    if (e.code === 'Escape' || e.code === 'Enter') e.target.blur(); // devuelve el foco al juego
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyK') { cycleSkin(); return; }
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

restartBtn.addEventListener('click', init);
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur(); // evita que Space active el botón
});

for (const k of SKIN_KEYS) skinSelect.add(new Option(SKINS[k].label, k));
skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que flechas/Space cambien el select durante el juego
});

init();
setSkin(loadSkin());
setTheme(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
