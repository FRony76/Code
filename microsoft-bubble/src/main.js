'use strict';
/* ── main.js ─ état du jeu, boucle principale, tirs, résolution, entrées ── */

let mode = 'classic';          // 'classic' | 'adventure' | 'daily'
let gameState = 'menu';        // 'menu' | 'play' | 'pause' | 'over'
let score = 0;
let hiScore = getHi();
let level = 1;
let combo = 0;                 // pops consécutifs → multiplicateur
let levelMiss = false;         // un tir raté annule le bonus « Perfect »
let shotsLeft = 0;
let currentLevel = null;       // niveau Adventure/Daily en cours
let currentPalette = BASE_COLORS.slice(0, 4);
let shootAmmo = null, nextAmmo = null;   // { color } ou { pu }
let projectile = null;
let aimX = SX, aimY = 0;
let dropTimer = 0, freezeUntil = 0;
let rafId = 0, lastTs = 0;

/* ── Progression de difficulté (mode Classique) ─────────────────────────── */
function tierInterval(lv) {
  if (lv <= 1) return 15000;
  if (lv <= 3) return 13000;
  if (lv <= 6) return 11000;
  if (lv <= 10) return 9000;
  if (lv <= 15) return 7000;
  return 5000;
}
function classicColors(lv) {
  const n = lv <= 3 ? 4 : lv <= 10 ? 5 : lv <= 15 ? 6 : lv < 20 ? 7 : 8;
  return BASE_COLORS.slice(0, n);
}
function classicRows(lv) {
  if (lv <= 1) return 4;
  if (lv <= 3) return 5;
  if (lv <= 6) return 6;
  if (lv <= 10) return 7;
  if (lv <= 15) return 8;
  return 9;
}
function powerupChance() {
  if (mode === 'adventure') return 0.08;
  if (mode === 'daily') return 0.10;
  if (level <= 1) return 0;
  if (level <= 3) return 0.05;
  if (level <= 6) return 0.08;
  if (level <= 10) return 0.10;
  if (level <= 15) return 0.12;
  return 0.15;
}
function scoreLevel() { return mode === 'classic' ? level : currentLevel.tier; }

function genAmmo() {
  if (Math.random() < powerupChance()) return randomPowerup();
  return { color: currentPalette[Math.floor(Math.random() * currentPalette.length)] };
}

/* ── Démarrage des parties ──────────────────────────────────────────────── */
function resetCommon() {
  cancelAnimationFrame(rafId);
  projectile = null;
  particles = [];
  floatTexts = [];
  appearAnim.clear();
  score = 0;
  combo = 0;
  levelMiss = false;
  freezeUntil = 0;
  dropTimer = 0;
  aimX = SX;
  aimY = 0;
  hiScore = getHi();
}

function beginPlay() {
  shootAmmo = genAmmo();
  nextAmmo = genAmmo();
  gameState = 'play';
  hideOverlay();
  HUD.hidden = false;
  updateHUD();
  startMusic();
  lastTs = performance.now();
  rafId = requestAnimationFrame(loop);
}

function startClassic() {
  resetCommon();
  mode = 'classic';
  level = 1;
  currentLevel = null;
  currentPalette = classicColors(level);
  topAbs = 0;
  grid = makeGrid(classicRows(level), currentPalette);
  beginPlay();
}

function loadLevel(lvl) {
  currentLevel = lvl;
  currentPalette = lvl.palette;
  shotsLeft = lvl.maxShots;
  topAbs = 0;
  grid = lvl.rows.map(r => r.slice());
  /* nettoie les éventuelles bulles flottantes du dessin initial */
  findFloating().forEach(([r, c]) => { grid[r][c] = null; });
}

function startAdventure(id) {
  resetCommon();
  mode = 'adventure';
  loadLevel(ADVENTURE_LEVELS[id - 1]);
  beginPlay();
}

function startDaily() {
  resetCommon();
  mode = 'daily';
  loadLevel(dailyLevel());
  beginPlay();
}

function restartRound() {
  if (mode === 'classic') startClassic();
  else if (mode === 'daily') startDaily();
  else startAdventure(currentLevel.id);
}

/* ── Boucle principale ──────────────────────────────────────────────────── */
function loop(ts) {
  if (gameState !== 'play') return;
  const dt = Math.min(ts - lastTs, 50);
  lastTs = ts;

  if (projectile) stepProjectile();
  updateParticles();

  /* descente périodique de la grille en mode Classique (gelable par ❄️) */
  if (gameState === 'play' && mode === 'classic') {
    if (performance.now() >= freezeUntil) dropTimer += dt;
    if (dropTimer >= tierInterval(level)) {
      dropTimer = 0;
      topAbs--;
      grid.unshift(makeRow(currentPalette));
      appearAnim.clear();
      for (let c = 0; c < COLS; c++) markAppear(0, c);
      if (isTooLow()) { endRound(false); return; }
    }
  }

  if (gameState !== 'play') return;   // une résolution a pu terminer la partie
  render();
  rafId = requestAnimationFrame(loop);
}

/* ── Vol du projectile ──────────────────────────────────────────────────── */
function stepProjectile() {
  const p = projectile;
  const steps = 2;                    // sous-pas anti-tunnel
  for (let s = 0; s < steps && projectile; s++) {
    p.x += p.vx / steps;
    p.y += p.vy / steps;
    if (p.x - R < 0) { p.x = R; p.vx = Math.abs(p.vx); }
    if (p.x + R > W) { p.x = W - R; p.vx = -Math.abs(p.vx); }

    if (p.pu === 'laser') {
      /* le laser traverse et détruit tout sur son passage */
      for (let r = 0; r < grid.length; r++)
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === null) continue;
          const dx = p.x - colX(c, r), dy = p.y - rowY(r);
          if (dx * dx + dy * dy < (D * 0.9) * (D * 0.9))
            popCell(r, c, 10 * scoreLevel());
        }
      if (p.y < -R) {
        projectile = null;
        dropFloating(scoreLevel());
        combo++;
        sfx.powerup();
        finishShot();
      }
      continue;
    }

    if (p.y - R <= 0) { p.y = R; settle(null); return; }

    let hitCell = null, bestD = Infinity;
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === null) continue;
        const dx = p.x - colX(c, r), dy = p.y - rowY(r);
        const d2 = dx * dx + dy * dy;
        if (d2 < (D - 1) * (D - 1) && d2 < bestD) { bestD = d2; hitCell = [r, c]; }
      }
    if (hitCell) { settle(hitCell); return; }
  }
}

function popCell(r, c, pts) {
  const color = grid[r][c];
  if (color === null) return;
  burst(colX(c, r), rowY(r), color);
  grid[r][c] = null;
  if (pts) score += pts;
}

function dropFloating(lvl) {
  const fl = findFloating();
  fl.forEach(([r, c]) => popCell(r, c, 5 * lvl));
  return fl.length;
}

function vibrate(ms) {
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
}

/* ── Résolution à l'impact ──────────────────────────────────────────────── */
function settle(hitCell) {
  const p = projectile;
  const mult = 1 + 0.5 * combo;
  const lvl = scoreLevel();

  if (p.pu === 'ice') {
    /* gèle la descente pendant 10 s (utile en Classique) */
    freezeUntil = performance.now() + 10000;
    burst(p.x, p.y, '#7FDBFF', 16);
    spawnFloatText(p.x, p.y, 'GEL !', '#7FDBFF');
    sfx.powerup();
    projectile = null;
    finishShot();
    return;
  }

  if (p.pu === 'bomb') {
    const cells = bombCells(p.x, p.y);
    cells.forEach(([r, c]) => popCell(r, c, Math.round(10 * lvl * mult)));
    if (cells.length > 0) {
      spawnFloatText(p.x, Math.max(30, p.y), `+${Math.round(cells.length * 10 * lvl * mult)}`);
      dropFloating(lvl);
      combo++;
    }
    sfx.powerup();
    vibrate(30);
    projectile = null;
    finishShot();
    return;
  }

  if (p.pu === 'fire') {
    /* détruit le cluster touché quelle que soit sa taille */
    if (hitCell) {
      const [hr, hc] = hitCell;
      const cells = cluster(hr, hc, grid[hr][hc]);
      cells.forEach(([r, c]) => popCell(r, c, Math.round(10 * lvl * mult)));
      spawnFloatText(p.x, Math.max(30, p.y), `+${Math.round(cells.length * 10 * lvl * mult)}`);
      dropFloating(lvl);
      combo++;
      sfx.powerup();
      vibrate(20);
    } else {
      burst(p.x, p.y, '#FF6B35', 14);
    }
    projectile = null;
    finishShot();
    return;
  }

  /* bulle normale ou arc-en-ciel : on snappe dans la grille */
  const [sr, sc] = snapCell(p.x, p.y);
  if (sr < 0) { projectile = null; finishShot(); return; }
  while (grid.length <= sr) grid.push(Array(COLS).fill(null));
  const color = p.pu === 'rainbow' ? bestRainbowColor(sr, sc) : p.color;
  grid[sr][sc] = color;
  markAppear(sr, sc);
  projectile = null;

  const hit = cluster(sr, sc, color);
  if (hit.length >= 3) {
    const pts = Math.round(hit.length * 10 * lvl * mult);
    hit.forEach(([r, c]) => popCell(r, c, 0));
    score += pts;
    spawnFloatText(colX(sc, sr), Math.max(30, rowY(sr)), `+${pts}`);
    sfx.pop(currentPalette.indexOf(color));
    vibrate(15);
    combo++;
    if (combo >= 2) sfx.combo(combo);
    dropFloating(lvl);
  } else {
    combo = 0;
    levelMiss = true;
  }
  finishShot();
}

/* Vérifications communes après chaque tir résolu */
function finishShot() {
  if (countBubbles() === 0) { winLevel(); return; }
  if (isTooLow()) { endRound(false); return; }
  if (mode !== 'classic' && shotsLeft <= 0) { endRound(false); return; }
  updateHUD();
}

/* ── Victoire de niveau ─────────────────────────────────────────────────── */
function winLevel() {
  const lvl = scoreLevel();
  score += 500 * lvl;                                   // bonus de niveau
  if (!levelMiss) {
    score += 1000;                                       // bonus « Perfect »
    spawnFloatText(SX, H / 2, 'PERFECT ! +1000', '#FFD700');
  }
  sfx.levelUp();

  if (mode === 'classic') {
    /* en Classique on enchaîne : nouvelle grille plus difficile */
    spawnConfetti();
    level++;
    Store.set('bubbleMaxLvl', Math.max(Store.get('bubbleMaxLvl', 1), level));
    levelMiss = false;
    combo = 0;
    currentPalette = classicColors(level);
    topAbs = 0;
    grid = makeGrid(classicRows(level), currentPalette);
    appearAnim.clear();
    dropTimer = 0;
    freezeUntil = 0;
    spawnFloatText(SX, H / 2 - 40, `NIVEAU ${level} !`, '#4A9EFF');
    updateHUD();
  } else {
    endRound(true);
  }
}

/* ── Fin de manche ──────────────────────────────────────────────────────── */
function endRound(win) {
  gameState = 'over';
  cancelAnimationFrame(rafId);
  stopMusic();

  if (mode === 'classic') {
    sfx.gameOver();
    if (score > hiScore) { hiScore = score; setHi(score); }
    render();
    if (leaderboardQualifies(score)) promptName(score, level, showGameOver);
    else showGameOver();
    return;
  }

  if (win) {
    const earned = Math.max(1, currentLevel.stars.filter(s => score >= s).length);
    if (mode === 'adventure') {
      const p = getAdvProgress();
      p.stars[currentLevel.id] = Math.max(p.stars[currentLevel.id] || 0, earned);
      saveAdvProgress(p);
    } else {
      setDailyBest(todayKey(), score);
    }
    spawnConfetti();
    render();
    showLevelComplete(earned);
  } else {
    sfx.gameOver();
    render();
    showGameOver();
  }
}

/* ── Tir ────────────────────────────────────────────────────────────────── */
function shoot(tx, ty) {
  if (gameState !== 'play' || projectile) return;
  const dx = tx - SX, dy = ty - SY;
  if (dy >= -8) return;                       // pas de tir vers le bas
  if (mode !== 'classic') {
    if (shotsLeft <= 0) return;
    shotsLeft--;
  }
  const len = Math.hypot(dx, dy);
  projectile = Object.assign(
    { x: SX, y: SY, vx: (dx / len) * SPD, vy: (dy / len) * SPD },
    shootAmmo
  );
  shootAmmo = nextAmmo;
  nextAmmo = genAmmo();
  sfx.shoot();
  updateHUD();
}

/* ── Pause / reprise ────────────────────────────────────────────────────── */
function pauseGame() {
  if (gameState !== 'play') return;
  gameState = 'pause';
  cancelAnimationFrame(rafId);
  stopMusic();
  showPause();
}
function resumeGame() {
  if (gameState !== 'pause') return;
  gameState = 'play';
  hideOverlay();
  startMusic();
  lastTs = performance.now();
  rafId = requestAnimationFrame(loop);
}

/* ── Entrées souris / tactile ───────────────────────────────────────────── */
function cxy(e) {
  const rect = CV.getBoundingClientRect();
  const sx = W / rect.width, sy = H / rect.height;
  const src = e.touches && e.touches.length ? e.touches[0]
    : e.changedTouches && e.changedTouches.length ? e.changedTouches[0]
    : e;
  return [(src.clientX - rect.left) * sx, (src.clientY - rect.top) * sy];
}

CV.addEventListener('mousemove', e => { [aimX, aimY] = cxy(e); });
CV.addEventListener('click', e => { ensureAudio(); shoot(...cxy(e)); });

/* Tactile : glisser pour viser, relâcher pour tirer */
CV.addEventListener('touchstart', e => {
  e.preventDefault();
  [aimX, aimY] = cxy(e);
}, { passive: false });
CV.addEventListener('touchmove', e => {
  e.preventDefault();
  [aimX, aimY] = cxy(e);
}, { passive: false });
CV.addEventListener('touchend', e => {
  e.preventDefault();
  ensureAudio();
  shoot(aimX, aimY);
}, { passive: false });

pauseBtn.addEventListener('click', pauseGame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameState === 'play') pauseGame();
});

/* ── Mise à l'échelle responsive ────────────────────────────────────────── */
function fitStage() {
  const scale = Math.min(1,
    (window.innerWidth - 8) / 424,
    (window.innerHeight - 12) / 728);
  document.getElementById('wrapper').style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);

/* ── Démarrage ──────────────────────────────────────────────────────────── */
fitStage();
render();
showMenu();
