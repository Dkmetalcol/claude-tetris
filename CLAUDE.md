# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris on HTML5 Canvas. No `package.json`, bundler, linter, or tests — there is no build/lint/test step. The README and UI text are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`, `npx serve .`) and visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, and `game.js` (all logic, loaded as a plain script with `'use strict'`, no modules).

`game.js` uses module-level mutable globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …) declared once and reset in `init()`. Key points that span the file:

- `board` is a `ROWS × COLS` matrix; cells are `0` or a piece type index 1–7. That same index selects the entry in `COLORS` and `PIECES` (index 0 is `null` in both), and is written directly into the shape matrices, so shapes carry their own color index.
- Piece lifecycle: `spawn()` promotes `next` → `current` and ends the game if the new piece immediately collides; `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. Both gravity (`loop`), `softDrop`, and `hardDrop` funnel through `lockPiece()`.
- Gravity runs in `loop(ts)` via `requestAnimationFrame`, accumulating `dropAccum` against `dropInterval`. Pause/game over stop it with `cancelAnimationFrame(animId)`; resume (`togglePause`) and `init()` restart it, so any new state transition must manage `animId`/`lastTime` the same way.
- Leveling lives in `clearLines()`: level = `floor(lines/10)+1`, `dropInterval = max(100, 1000 - (level-1)*90)`.
- Rotation (`tryRotate`) is `rotateCW` plus horizontal kicks `[0,-1,1,-2,2]` only (no vertical kicks, no SRS).
- Keyboard handling is a single `keydown` listener using `e.code`; it ignores input when `paused || gameOver`, and calls `updateHUD()` after every key.

## Gotchas

- Canvas size is hard-coded in `index.html` (`board` 300×600, `next-canvas` 120×120). If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, update the canvas `width`/`height` to `COLS*BLOCK` × `ROWS*BLOCK`.
- The next-piece preview uses a hard-coded 4×4 cell area with `NB = 30` inside `drawNext()`.
- The README's controls table mentions `X` as an alternate rotate key; the in-page controls list in `index.html` does not.
