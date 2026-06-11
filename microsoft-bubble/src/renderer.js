'use strict';
/* ── renderer.js ─ rendu canvas : bulles 3D, fond, viseur, lanceur, frame ── */

/* Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur hex */
function adjColor(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawBubbleBody(g, x, y, r, color) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.05, x, y, r);
  gr.addColorStop(0, adjColor(color, 70));
  gr.addColorStop(0.4, color);
  gr.addColorStop(1, adjColor(color, -50));
  g.fillStyle = gr;
  g.fill();
}

function drawBubble(g, x, y, color, alpha = 1, scale = 1) {
  const r = R * scale;
  g.save();
  g.globalAlpha = alpha;
  drawBubbleBody(g, x, y, r, color);
  /* reflet */
  g.beginPath();
  g.arc(x - r * 0.27, y - r * 0.27, r * 0.22, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fill();
  /* contour subtil */
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
}

/* Animation d'apparition (scale 0 → 1 en 150 ms) des bulles nouvellement posées */
const appearAnim = new Map();   // clé r*100+c → timestamp

function markAppear(r, c) { appearAnim.set(r * 100 + c, performance.now()); }

function easeOutBack(t) {
  const s = 1.70158;
  t -= 1;
  return t * t * ((s + 1) * t + s) + 1;
}

function bubbleScale(r, c) {
  const t0 = appearAnim.get(r * 100 + c);
  if (t0 === undefined) return 1;
  const t = (performance.now() - t0) / 150;
  if (t >= 1) { appearAnim.delete(r * 100 + c); return 1; }
  return REDUCED_MOTION ? 1 : Math.max(0.05, easeOutBack(Math.max(0, t)));
}

function drawBG(g) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1A2E6B');
  bg.addColorStop(1, '#0D1B4B');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
}

function drawDanger(g) {
  g.save();
  g.strokeStyle = 'rgba(255,60,60,0.35)';
  g.lineWidth = 1;
  g.setLineDash([5, 7]);
  g.beginPath();
  g.moveTo(0, DLIM);
  g.lineTo(W, DLIM);
  g.stroke();
  g.restore();
}

function wouldCollide(x, y) {
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === null) continue;
      const dx = x - colX(c, r), dy = y - rowY(r);
      if (dx * dx + dy * dy < (D - 2) * (D - 2)) return true;
    }
  return false;
}

/* Trajectoire pointillée avec rebonds, interrompue à la première collision */
function drawAimGuide(g) {
  if (!settings.guide || projectile) return;
  let dx = aimX - SX, dy = aimY - SY;
  if (dy >= -8) return;
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;

  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 1.5;
  g.setLineDash([8, 10]);
  g.beginPath();
  let x = SX, y = SY;
  g.moveTo(x, y);
  for (let i = 0; i < 300 && y > R; i++) {
    x += dx * 14;
    y += dy * 14;
    if (x - R < 0) { x = R + (R - x); dx = -dx; }
    if (x + R > W) { x = W - R - (x - (W - R)); dx = -dx; }
    g.lineTo(x, y);
    if (wouldCollide(x, y)) break;
  }
  g.stroke();
  g.restore();
}

function drawAmmo(g, x, y, ammo, scale = 1) {
  if (!ammo) return;
  if (ammo.pu) drawPowerupBubble(g, x, y, ammo.pu, scale);
  else drawBubble(g, x, y, ammo.color, 1, scale);
}

function drawShooter(g) {
  let dx = aimX - SX, dy = aimY - SY;
  if (dy >= 0) { dx = 0; dy = -1; }
  const ang = Math.atan2(dy, dx);
  g.save();
  g.translate(SX, SY);
  /* base circulaire */
  g.beginPath();
  g.arc(0, 0, 24, 0, Math.PI * 2);
  const bg = g.createRadialGradient(-6, -6, 2, 0, 0, 24);
  bg.addColorStop(0, '#7FB7FF');
  bg.addColorStop(1, '#1F3C8C');
  g.fillStyle = bg;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.stroke();
  /* canon orienté */
  g.rotate(ang + Math.PI / 2);
  g.fillStyle = '#4A9EFF';
  g.fillRect(-6, -R - 22, 12, R + 22);
  g.fillStyle = '#8AC2FF';
  g.fillRect(-3, -R - 22, 6, R + 22);
  g.restore();
  drawAmmo(g, SX, SY, shootAmmo, 0.75);
}

function drawNext(g) {
  g.save();
  g.font = '10px "Segoe UI", sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.textAlign = 'center';
  g.fillText('SUIVANT', NX, NY - R - 10);
  g.restore();
  drawAmmo(g, NX, NY, nextAmmo, 0.62);
}

function drawLaser(g, p) {
  g.save();
  g.strokeStyle = '#FFE14A';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.shadowColor = '#FFE14A';
  g.shadowBlur = 14;
  g.beginPath();
  g.moveTo(p.x - p.vx * 3, p.y - p.vy * 3);
  g.lineTo(p.x, p.y);
  g.stroke();
  g.restore();
}

/* Barre de progression de la prochaine descente (mode Classique) */
function drawDropBar(g) {
  if (mode !== 'classic') return;
  const frozen = performance.now() < freezeUntil;
  const ratio = Math.min(1, dropTimer / tierInterval(level));
  g.save();
  g.fillStyle = frozen ? 'rgba(127,219,255,0.8)' : 'rgba(74,158,255,0.6)';
  g.fillRect(0, 0, W * (frozen ? 1 : 1 - ratio), 3);
  if (frozen) {
    g.font = '13px "Segoe UI", sans-serif';
    g.textAlign = 'right';
    g.fillStyle = '#7FDBFF';
    g.fillText(`❄ ${Math.ceil((freezeUntil - performance.now()) / 1000)}s`, W - 8, 18);
  }
  g.restore();
}

function render() {
  drawBG(ctx);

  /* tremblement léger quand la grille frôle la ligne de danger */
  const danger = grid.length > 0 && lowestBubbleY() > DLIM - ROW_H;
  const shakeX = danger && !REDUCED_MOTION && gameState === 'play'
    ? Math.sin(performance.now() / 50) * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, 0);
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] !== null)
        drawBubble(ctx, colX(c, r), rowY(r), grid[r][c], 1, bubbleScale(r, c));
  ctx.restore();

  drawParticles(ctx);
  drawDanger(ctx);

  if (gameState === 'play' || gameState === 'pause') {
    drawDropBar(ctx);
    drawAimGuide(ctx);
    drawShooter(ctx);
    drawNext(ctx);
    if (projectile) {
      if (projectile.pu === 'laser') drawLaser(ctx, projectile);
      else drawAmmo(ctx, projectile.x, projectile.y, projectile, 1);
    }
  }

  drawFloatTexts(ctx);
}
