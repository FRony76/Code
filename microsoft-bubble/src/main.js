'use strict';
/* ── main.js ─ état du jeu, boucle principale, tirs, résolution, entrées ── */

let mode = 'classic';          // 'classic' | 'adventure' | 'daily'
let gameState = 'menu';        // 'menu' | 'play' | 'pause' | 'over'
let score = 0;
let hiScore = getHi();
let level = 1;
let combo = 0;                 // pops consécutifs → multiplicateur
let levelMiss = false;         // un tir raté annule le bonus « Perfect »
let stock = 0;                 // réserve de billes (mode Classique, persiste entre niveaux)
let shotsLeft = 0;             // tirs restants (Aventure / Défi du jour)
let currentLevel = null;       // niveau Adventure/Daily en cours
let currentPalette = BASE_COLORS.slice(0, 4);
let ammoQueue = [];     // 4 billes sélectionnables
let selectedIdx = 0;   // index de la bille chargée dans le canon
let projectile = null;
let aimX = SX, aimY = 0;
let powerCell = null;          // bille bonus Power Line {r, c} sur la rangée du haut
let powerTriggered = false;    // la bille bonus vient d'être éclatée
let rafId = 0;

const START_STOCK = 30;        // billes de départ en Classique
let gridIntroTarget = 0;  // gridScrollY cible à la fin de l'animation d'entrée
let introActive = false;  // empêche le tir pendant l'animation

/* ── Progression de difficulté (mode Classique) ─────────────────────────── */
function classicColors(lv) {
  const n = lv <= 3 ? 4 : lv <= 10 ? 5 : lv <= 15 ? 6 : lv < 20 ? 7 : 8;
  return BASE_COLORS.slice(0, n);
}
function classicRows(lv) {
  if (lv <= 1)  return 4;
  if (lv <= 2)  return 5;
  if (lv <= 4)  return 6;
  if (lv <= 6)  return 7;
  if (lv <= 9)  return 8;
  if (lv <= 12) return 9;
  if (lv <= 15) return 10;
  if (lv <= 19) return 11;
  if (lv <= 24) return 12;
  if (lv <= 30) return 13;
  return 14;
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

/* Couleurs effectivement présentes sur la grille (évite les billes inutilisables) */
function activeColors() {
  const s = new Set();
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++) {
      const col = effectiveColor(grid[r][c]);
      if (col) s.add(col);
    }
  return s.size > 0 ? [...s] : currentPalette;
}

function genAmmo() {
  const colors = activeColors();
  return { color: colors[Math.floor(Math.random() * colors.length)] };
}

/* Insère un power-up aléatoire dans le dernier slot non sélectionné du plateau */
function awardPowerup() {
  if (!ammoQueue.length) return;
  let slot = ammoQueue.length - 1;
  if (slot === selectedIdx) slot = Math.max(0, slot - 1);
  ammoQueue[slot] = randomPowerup();
}

function gridDensity(lv) {
  if (lv <= 2) return 0.75;
  if (lv <= 5) return 0.85;
  if (lv <= 10) return 0.92;
  return 0.97;
}

/* Place des billes spéciales (épines et caméléons) selon le niveau */
function scatterSpecialBubbles() {
  if (mode !== 'classic') return;
  const spikeCount = level < 3 ? 0 : level <= 6 ? 1 : level <= 12 ? 2 : 3;
  const chamCount  = level < 5 ? 0 : level <= 9 ? 1 : 2;
  const candidates = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell !== null && typeof cell === 'string'
          && !(powerCell && r === powerCell.r && c === powerCell.c))
        candidates.push([r, c]);
    }
  function place(obj) {
    if (!candidates.length) return;
    const idx = Math.floor(Math.random() * candidates.length);
    const [r, c] = candidates.splice(idx, 1)[0];
    grid[r][c] = obj;
  }
  for (let i = 0; i < spikeCount; i++) place({ type: 'spike' });
  for (let i = 0; i < chamCount; i++)  place({ type: 'chameleon', color: null });
}

/* Lance l'animation d'entrée de la grille (glisse depuis le haut vers Y=0).
   Row 0 atterrit à Y=R=20px : Power Line toujours visible après l'intro. */
function initLevelScroll() {
  gridIntroTarget = 0;
  gridScrollY = H * 0.85;   // démarre hors écran en haut
  introActive = true;
}

/* Le bonus Power Line est placé dans une bille aléatoire de la rangée du haut.
   L'éclater en l'associant à d'autres billes fait tomber tout le tableau. */
function setPowerBubble() {
  powerTriggered = false;
  const cols = [];
  if (grid.length > 0)
    for (let c = 0; c < COLS; c++) if (grid[0][c] !== null) cols.push(c);
  powerCell = cols.length > 0
    ? { r: 0, c: cols[Math.floor(Math.random() * cols.length)] }
    : null;
}

/* À appeler à chaque retrait de bille : déclenche le bonus si c'était elle */
function checkPowerCell(r, c) {
  if (powerCell && r === powerCell.r && c === powerCell.c) {
    powerTriggered = true;
    powerCell = null;
  }
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
  aimX = SX;
  aimY = 0;
  hiScore = getHi();
}

function beginPlay() {
  ammoQueue = [genAmmo(), genAmmo(), genAmmo(), genAmmo()];
  selectedIdx = 0;
  initLevelScroll();
  gameState = 'play';
  hideOverlay();
  HUD.hidden = false;
  updateHUD();
  nextMusicTrack();
  startMusic();
  rafId = requestAnimationFrame(loop);
}

function startClassic() {
  resetCommon();
  mode = 'classic';
  level = 1;
  stock = START_STOCK;
  currentLevel = null;
  currentPalette = classicColors(level);
  topAbs = 0;
  grid = makeGrid(classicRows(level), currentPalette, gridDensity(level));
  setPowerBubble();
  scatterSpecialBubbles();
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
  setPowerBubble();
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
function loop() {
  if (gameState !== 'play') return;
  /* animation d'entrée : la grille descend depuis le haut */
  if (introActive) {
    gridScrollY = Math.max(0, gridScrollY - 10);
    if (gridScrollY <= 0) { introActive = false; gridScrollY = 0; }
  }
  if (projectile) stepProjectile();
  updateParticles();
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

    let hitCell = null, bestD = Infinity, spikeCell = null, spikeD = Infinity;
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (cell === null) continue;
        const dx = p.x - colX(c, r), dy = p.y - rowY(r);
        const d2 = dx * dx + dy * dy;
        if (d2 < (D - 1) * (D - 1)) {
          if (d2 < bestD) { bestD = d2; hitCell = [r, c]; }
          if (typeof cell === 'object' && cell.type === 'spike' && d2 < spikeD) {
            spikeD = d2; spikeCell = [r, c];
          }
        }
      }
    /* une bille ordinaire/arc-en-ciel qui frôle une bille à pics s'y empale,
       même si une voisine est marginalement plus proche */
    if (spikeCell && (!p.pu || p.pu === 'rainbow')) hitCell = spikeCell;
    if (hitCell) { settle(hitCell); return; }
  }
}

/* Bille éclatée : explosion, pas de récupération */
function popCell(r, c, pts) {
  const cell = grid[r][c];
  if (cell === null) return;
  burst(colX(c, r), rowY(r), effectiveColor(cell) || '#777');
  grid[r][c] = null;
  checkPowerCell(r, c);
  if (pts) score += pts;
}

/* Bille qui tombe : chute visuelle, récupérée dans le stock en Classique */
function fallBubble(r, c, pts) {
  const cell = grid[r][c];
  if (cell === null) return;
  const color = effectiveColor(cell) || '#777';
  particles.push({
    x: colX(c, r), y: rowY(r),
    vx: (Math.random() - 0.5) * 1.5,
    vy: 1 + Math.random() * 2,
    r: R * 0.8, color, life: 1.4
  });
  trimParticles();
  grid[r][c] = null;
  checkPowerCell(r, c);
  if (pts) score += pts;
}

function dropFloating(lvl) {
  const fl = findFloating();
  let colorCount = 0;
  fl.forEach(([r, c]) => {
    const isColor = typeof grid[r][c] === 'string';
    fallBubble(r, c, isColor ? 5 * lvl : 0);
    if (isColor) colorCount++;
  });
  if (mode === 'classic' && colorCount > 0) {
    stock += colorCount;
    spawnFloatText(SX, SY - 60, `+${colorCount} bille${colorCount > 1 ? 's' : ''}`, '#7FDBFF');
  }
  if (fl.length >= 4) awardPowerup();
  return fl.length;
}

function vibrate(ms) {
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
}

/* ── Power Line ─────────────────────────────────────────────────────────── */
/* Déclenchée quand la bille bonus de la rangée du haut est éclatée :
   toutes les billes restantes tombent ; le bonus de fin = 5 + N/2. */
function activatePowerLine() {
  const preCount = countBubbles();   // compté AVANT la chute
  const lvl = scoreLevel();
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] !== null) fallBubble(r, c, 5 * lvl);
  if (preCount > 0) {
    spawnFloatText(SX, DLIM - 60, 'POWER LINE !', '#7FDBFF');
    sfx.powerup();
    vibrate(40);
  }
  winLevel(preCount);
}

/* ── Résolution à l'impact ──────────────────────────────────────────────── */
function settle(hitCell) {
  const p = projectile;
  const mult = 1 + 0.5 * combo;
  const lvl = scoreLevel();

  if (p.pu === 'ice') {
    /* gèle et brise la rangée occupée la plus basse */
    let lowest = -1;
    for (let r = grid.length - 1; r >= 0 && lowest < 0; r--)
      if (grid[r].some(v => v !== null)) lowest = r;
    if (lowest >= 0) {
      let n = 0;
      for (let c = 0; c < COLS; c++)
        if (grid[lowest][c] !== null) { popCell(lowest, c, 10 * lvl); n++; }
      spawnFloatText(p.x, Math.max(30, p.y), `❄ +${n * 10 * lvl}`, '#7FDBFF');
      dropFloating(lvl);
      combo++;
    }
    sfx.powerup();
    vibrate(20);
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
    /* détruit TOUTES les billes de la même couleur sur toute la grille */
    if (hitCell) {
      const [hr, hc] = hitCell;
      const fireColor = effectiveColor(grid[hr][hc]);
      const cells = [];
      if (fireColor) {
        for (let r = 0; r < grid.length; r++)
          for (let c = 0; c < COLS; c++)
            if (effectiveColor(grid[r][c]) === fireColor) cells.push([r, c]);
      } else {
        cells.push([hr, hc]);
      }
      cells.forEach(([r, c]) => popCell(r, c, Math.round(10 * lvl * mult)));
      spawnFloatText(p.x, Math.max(30, p.y), `🔥 ×${cells.length}`);
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

  /* bulle normale ou arc-en-ciel : une spike détruit la bille entrante */
  if (hitCell) {
    const [hr, hc] = hitCell;
    const cell = grid[hr][hc];
    if (cell && typeof cell === 'object' && cell.type === 'spike') {
      burst(p.x, p.y, p.color || '#AAAAAA', 16);
      burst(colX(hc, hr), rowY(hr), '#C0392B', 8);
      spawnFloatText(p.x, Math.max(30, p.y), '✸ AÏE !', '#E74C3C');
      sfx.spike();
      vibrate(35);
      combo = 0;
      levelMiss = true;
      projectile = null;
      finishShot();
      return;
    }
  }

  /* snappe dans la grille */
  const [sr, sc] = snapCell(p.x, p.y);
  if (sr < 0) { projectile = null; finishShot(); return; }
  while (grid.length <= sr) grid.push(Array(COLS).fill(null));

  /* cas 2 : la bille se snappe DANS UN SLOT ADJACENT à une spike
     (la bille a touché un voisin de la spike avant de l'atteindre) */
  for (const [nr, nc] of neighbours(sr, sc)) {
    const nb = grid[nr][nc];
    if (nb && typeof nb === 'object' && nb.type === 'spike') {
      burst(p.x, p.y, p.color || '#AAAAAA', 16);
      burst(colX(nc, nr), rowY(nr), '#C0392B', 8);
      spawnFloatText(p.x, Math.max(30, p.y), '✸ AÏE !', '#E74C3C');
      sfx.spike();
      vibrate(35);
      combo = 0;
      levelMiss = true;
      projectile = null;
      finishShot();
      return;
    }
  }

  const color = p.pu === 'rainbow' ? bestRainbowColor(sr, sc) : p.color;
  grid[sr][sc] = color;
  markAppear(sr, sc);
  projectile = null;

  const hit = cluster(sr, sc, color);
  if (hit.length >= 3) {
    /* caméléons adjacents au cluster : capturer avant le pop */
    const adjCham = new Set();
    hit.forEach(([r, c]) => {
      for (const [nr, nc] of neighbours(r, c)) {
        const nb = grid[nr][nc];
        if (nb && typeof nb === 'object' && nb.type === 'chameleon') adjCham.add(nr * 100 + nc);
      }
    });
    const pts = Math.round(hit.length * 10 * lvl * mult);
    hit.forEach(([r, c]) => popCell(r, c, 0));
    score += pts;
    /* colore les caméléons adjacents avec la couleur qui vient d'éclater */
    adjCham.forEach(k => {
      const nr = Math.floor(k / 100), nc = k % 100;
      if (grid[nr][nc] && grid[nr][nc].type === 'chameleon') grid[nr][nc] = { type: 'chameleon', color };
    });
    spawnFloatText(colX(sc, sr), Math.max(30, rowY(sr)), `+${pts}`);
    sfx.pop(currentPalette.indexOf(color));
    vibrate(15);
    combo++;
    if (combo >= 2) sfx.combo(combo);
    dropFloating(lvl);
    if (hit.length >= 5) awardPowerup();
  } else {
    combo = 0;
    levelMiss = true;
  }
  finishShot();
}

/* Vérifications communes après chaque tir résolu */
function finishShot() {
  if (powerTriggered) { powerTriggered = false; activatePowerLine(); return; }
  if (countBubbles() === 0) { winLevel(); return; }
  if (isTooLow()) { endRound(false); return; }
  if (mode !== 'classic' && shotsLeft <= 0) { endRound(false); return; }
  if (mode === 'classic' && stock <= 0) { endRound(false); return; }
  updateHUD();
}

/* ── Victoire de niveau ─────────────────────────────────────────────────── */
/* preCount : billes présentes juste avant la chute finale (Power Line).
   0 quand le tableau a été entièrement nettoyé bille par bille. */
function winLevel(preCount = 0) {
  const lvl = scoreLevel();
  score += 500 * lvl;                                   // bonus de niveau
  if (!levelMiss) {
    score += 1000;                                       // bonus « Perfect »
    spawnFloatText(SX, H / 2, 'PERFECT ! +1000', '#FFD700');
  }
  sfx.levelUp();

  if (mode === 'classic') {
    /* bonus = 5 + moitié des billes restantes juste avant la chute */
    const bonus = 5 + Math.floor(preCount / 2);
    stock += bonus;
    spawnFloatText(SX, H / 2 + 30, `+${bonus} billes`, '#7FDBFF');
    spawnConfetti();
    level++;
    Store.set('bubbleMaxLvl', Math.max(Store.get('bubbleMaxLvl', 1), level));
    levelMiss = false;
    combo = 0;
    currentPalette = classicColors(level);
    topAbs = 0;
    grid = makeGrid(classicRows(level), currentPalette, gridDensity(level));
    setPowerBubble();
    scatterSpecialBubbles();
    appearAnim.clear();
    initLevelScroll();
    nextMusicTrack();
    startMusic();
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

/* ── Sélection / tir ─────────────────────────────────────────────────────── */

/* Retourne l'index du slot si (x, y) est dans le plateau, -1 sinon */
function hitAmmoSlot(x, y) {
  if (gameState !== 'play' || !ammoQueue.length) return -1;
  for (let i = 0; i < QUEUE_XS.length; i++) {
    const dx = x - QUEUE_XS[i], dy = y - QUEUE_Y;
    if (dx * dx + dy * dy <= (R + 8) * (R + 8)) return i;
  }
  return -1;
}

function selectAmmo(idx) {
  if (idx >= 0 && idx < ammoQueue.length && idx !== selectedIdx) {
    selectedIdx = idx;
    updateHUD();
  }
}

function shoot(tx, ty) {
  if (gameState !== 'play' || projectile || introActive) return;
  const dx = tx - SX, dy = ty - SY;
  if (dy >= -8) return;                       // pas de tir vers le bas
  if (mode === 'classic') {
    if (stock <= 0) return;
    stock--;
  } else {
    if (shotsLeft <= 0) return;
    shotsLeft--;
  }
  const len = Math.hypot(dx, dy);
  projectile = Object.assign(
    { x: SX, y: SY, vx: (dx / len) * SPD, vy: (dy / len) * SPD },
    ammoQueue[selectedIdx]
  );
  ammoQueue.splice(selectedIdx, 1);
  ammoQueue.push(genAmmo());
  /* selectedIdx reste valide : si on tirait le dernier, on reste à l'index
     qui pointe maintenant sur la nouvelle bille en fin de tableau */
  if (selectedIdx >= ammoQueue.length) selectedIdx = ammoQueue.length - 1;
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
CV.addEventListener('click', e => {
  ensureAudio();
  const [x, y] = cxy(e);
  const slot = hitAmmoSlot(x, y);
  if (slot >= 0) selectAmmo(slot); else shoot(x, y);
});

/* Tactile : glisser pour viser, relâcher pour tirer ou sélectionner */
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
  const [x, y] = cxy(e);
  const slot = hitAmmoSlot(x, y);
  if (slot >= 0) selectAmmo(slot); else shoot(aimX, aimY);
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
