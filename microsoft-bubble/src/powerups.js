'use strict';
/* ── powerups.js ─ bombe, arc-en-ciel, laser, boule de feu, glace ── */

const POWERUP_TYPES = ['bomb', 'rainbow', 'laser', 'fire', 'ice'];
const POWERUP_ICONS = { bomb: '💣', rainbow: '🌈', laser: '⚡', fire: '🔥', ice: '❄️' };
const POWERUP_BASE = { bomb: '#555566', laser: '#FFE14A', fire: '#FF6B35', ice: '#7FDBFF' };

function randomPowerup() {
  return { pu: POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)] };
}

/* Cellules détruites par la bombe : rayon primaire 4R, puis chaque bille
   détruite génère une micro-explosion secondaire à 1.5R (double explosion). */
function bombCells(x, y) {
  const r1sq = (R * 4) * (R * 4);
  const r2sq = (R * 1.5) * (R * 1.5);
  const killed = new Set();

  /* Passe 1 : rayon primaire 4R */
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === null) continue;
      const dx = x - colX(c, r), dy = y - rowY(r);
      if (dx * dx + dy * dy <= r1sq) killed.add(r * 100 + c);
    }

  /* Passe 2 : micro-explosion 1.5R autour de chaque bille primaire */
  const primary = [...killed];
  for (const k of primary) {
    const pr = Math.floor(k / 100), pc = k % 100;
    const ex = colX(pc, pr), ey = rowY(pr);
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === null || killed.has(r * 100 + c)) continue;
        const dx = ex - colX(c, r), dy = ey - rowY(r);
        if (dx * dx + dy * dy <= r2sq) killed.add(r * 100 + c);
      }
  }

  return [...killed].map(k => [Math.floor(k / 100), k % 100]);
}

/* Arc-en-ciel : essaie chaque couleur voisine et garde celle
   qui produit le plus grand cluster autour de la cellule snappée */
function bestRainbowColor(sr, sc) {
  const tried = new Set();
  let best = null, bestLen = 0;
  for (const [nr, nc] of neighbours(sr, sc)) {
    const col = effectiveColor(grid[nr][nc]);
    if (!col || tried.has(col)) continue;
    tried.add(col);
    grid[sr][sc] = col;
    const len = cluster(sr, sc, col).length;
    if (len > bestLen) { bestLen = len; best = col; }
  }
  grid[sr][sc] = null;
  return best || currentPalette[Math.floor(Math.random() * currentPalette.length)];
}

/* Rendu d'une bulle power-up : halo pulsant + icône centrée */
function drawPowerupBubble(g, x, y, type, scale = 1) {
  const r = R * scale;
  const pulse = REDUCED_MOTION ? 1 : 1 + 0.08 * Math.sin(performance.now() / 180);
  g.save();
  g.beginPath();
  g.arc(x, y, r * pulse + 4, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fill();
  if (type === 'rainbow') {
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
      g.closePath();
      g.fillStyle = BASE_COLORS[i];
      g.fill();
    }
  } else {
    drawBubbleBody(g, x, y, r, POWERUP_BASE[type]);
  }
  g.font = `${Math.round(r * 1.1)}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(POWERUP_ICONS[type], x, y + 1);
  g.restore();
}
