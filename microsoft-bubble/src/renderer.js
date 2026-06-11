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
  drawAmmo(g, SX, SY, ammoQueue && ammoQueue.length ? ammoQueue[selectedIdx] : null, 0.75);
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

/* Positions des 4 emplacements du plateau de sélection.
   QUEUE_Y=657 : les billes démarrent à y=637, soit 3px sous la base du canon (y=634). */
const QUEUE_Y = 657;
const QUEUE_XS = [120, 180, 240, 300];  // centrés sur SX=210, espacement 60px

const PU_NAMES = { bomb: 'Bombe', rainbow: 'Arc-en-ciel', laser: 'Laser', fire: 'Feu', ice: 'Glace' };

function drawAmmoTray(g) {
  if (!ammoQueue || !ammoQueue.length) return;

  g.save();
  g.fillStyle = 'rgba(10,25,80,0.72)';
  g.beginPath();
  g.roundRect(QUEUE_XS[0] - R - 10, QUEUE_Y - R - 3,
              QUEUE_XS[3] - QUEUE_XS[0] + D + 20, D + 6, 12);
  g.fill();
  g.strokeStyle = 'rgba(100,180,255,0.18)';
  g.lineWidth = 1;
  g.stroke();
  g.restore();

  for (let i = 0; i < ammoQueue.length; i++) {
    const x = QUEUE_XS[i], y = QUEUE_Y;
    const isPU = ammoQueue[i] && ammoQueue[i].pu;
    if (i === selectedIdx) {
      g.save();
      g.beginPath();
      g.arc(x, y, R + 4, 0, Math.PI * 2);
      g.strokeStyle = isPU ? '#FFD700' : '#7FDBFF';
      g.lineWidth = 2.5;
      g.shadowColor = isPU ? '#FFD700' : '#7FDBFF';
      g.shadowBlur = 14;
      g.stroke();
      g.shadowBlur = 0;
      g.restore();
    } else if (isPU) {
      g.save();
      g.beginPath();
      g.arc(x, y, R + 3, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,210,50,0.55)';
      g.lineWidth = 1.5;
      g.shadowColor = '#FFD700';
      g.shadowBlur = 8;
      g.stroke();
      g.shadowBlur = 0;
      g.restore();
    }
    const scale = i === selectedIdx ? (isPU ? 0.90 : 0.82) : (isPU ? 0.78 : 0.68);
    drawAmmo(g, x, y, ammoQueue[i], 1, scale);
  }

  /* légende du power-up sélectionné (à droite du plateau) */
  const selPU = ammoQueue[selectedIdx] && ammoQueue[selectedIdx].pu;
  if (selPU) {
    const icon = POWERUP_ICONS[selPU], name = PU_NAMES[selPU];
    const lx = QUEUE_XS[3] + 10, ly = QUEUE_Y;
    g.save();
    g.fillStyle = 'rgba(20,40,100,0.88)';
    g.beginPath();
    g.roundRect(lx, ly - 17, 88, 34, 6);
    g.fill();
    g.strokeStyle = 'rgba(255,210,50,0.45)';
    g.lineWidth = 1;
    g.stroke();
    g.font = '15px serif';
    g.fillStyle = '#FFD700';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, lx + 14, ly);
    g.font = 'bold 10px "Segoe UI",sans-serif';
    g.fillStyle = 'rgba(255,230,100,0.9)';
    g.textAlign = 'left';
    g.fillText(name, lx + 27, ly);
    g.restore();
  }
}

/* Bulle épineuse : obstacle gris sombre avec pointes triangulaires */
function drawSpikeBubble(g, x, y, scale = 1) {
  const r = R * scale;
  g.save();
  g.beginPath();
  g.arc(x, y, r * 0.82, 0, Math.PI * 2);
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r * 0.82);
  gr.addColorStop(0, '#888');
  gr.addColorStop(1, '#1a1a2e');
  g.fillStyle = gr;
  g.fill();
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const a1 = a - Math.PI / N * 0.5, a2 = a + Math.PI / N * 0.5;
    g.beginPath();
    g.moveTo(x + Math.cos(a1) * r * 0.82, y + Math.sin(a1) * r * 0.82);
    g.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
    g.lineTo(x + Math.cos(a2) * r * 0.82, y + Math.sin(a2) * r * 0.82);
    g.closePath();
    g.fillStyle = '#444';
    g.strokeStyle = '#777';
    g.lineWidth = 0.8;
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.arc(x - r * 0.25, y - r * 0.25, r * 0.18, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fill();
  g.restore();
}

/* Bulle caméléon : arc-en-ciel rotatif sans couleur, sinon colorée avec reflet vert */
function drawChameleonBubble(g, x, y, color, scale = 1) {
  const r = R * scale;
  g.save();
  if (color) {
    drawBubbleBody(g, x, y, r, color);
    g.beginPath();
    g.arc(x, y, r + 1.5, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(180,255,180,0.45)';
    g.lineWidth = 1.5;
    g.stroke();
  } else {
    const h = (performance.now() / 1000 * 60) % 360;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    gr.addColorStop(0,   `hsl(${h},100%,80%)`);
    gr.addColorStop(0.4, `hsl(${(h + 90) % 360},100%,60%)`);
    gr.addColorStop(1,   `hsl(${(h + 200) % 360},100%,40%)`);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = gr;
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = `hsla(${h},100%,75%,0.7)`;
    g.lineWidth = 2;
    g.stroke();
  }
  g.beginPath();
  g.arc(x - r * 0.27, y - r * 0.27, r * 0.22, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fill();
  g.restore();
}

/* Bille bonus Power Line (rangée du haut) : anneau électrique pulsant + éclair.
   L'éclater en cluster fait tomber toutes les billes restantes. */
function drawPowerMark(g) {
  if (!powerCell || !grid[powerCell.r] || grid[powerCell.r][powerCell.c] === null) return;
  const x = colX(powerCell.c, powerCell.r), y = rowY(powerCell.r);
  const pulse = REDUCED_MOTION ? 0.8 : 0.6 + 0.4 * Math.sin(performance.now() / 200);
  g.save();
  g.strokeStyle = `rgba(127,219,255,${pulse})`;
  g.lineWidth = 3;
  g.shadowColor = '#7FDBFF';
  g.shadowBlur = 12;
  g.beginPath();
  g.arc(x, y, R + 2.5, 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  g.font = '15px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('⚡', x, y + 1);
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
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell === null) continue;
      const cx = colX(c, r), cy = rowY(r), sc = bubbleScale(r, c);
      if (typeof cell === 'string') drawBubble(ctx, cx, cy, cell, 1, sc);
      else if (cell.type === 'spike') drawSpikeBubble(ctx, cx, cy, sc);
      else if (cell.type === 'chameleon') drawChameleonBubble(ctx, cx, cy, cell.color, sc);
    }
  drawPowerMark(ctx);
  ctx.restore();

  drawParticles(ctx);
  drawDanger(ctx);

  if (gameState === 'play' || gameState === 'pause') {
    drawAimGuide(ctx);
    drawAmmoTray(ctx);   // plateau d'abord (derrière)
    drawShooter(ctx);    // canon par-dessus
    if (projectile) {
      if (projectile.pu === 'laser') drawLaser(ctx, projectile);
      else drawAmmo(ctx, projectile.x, projectile.y, projectile, 1);
    }
  }

  drawFloatTexts(ctx);
}
