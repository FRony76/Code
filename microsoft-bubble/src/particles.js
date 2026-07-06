'use strict';
/* ── particles.js ─ particules d'explosion, textes flottants, confettis ── */

const MAX_PARTICLES = 200;

let particles = [];
let floatTexts = [];

function burstCount() { return settings.gfxHigh ? 12 : 6; }

function trimParticles() {
  if (particles.length > MAX_PARTICLES)
    particles.splice(0, particles.length - MAX_PARTICLES);
}

/* Explosion radiale à la position d'une bulle éclatée */
function burst(x, y, color, count = burstCount()) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    particles.push({
      x, y,
      vx: Math.cos(a) * (2 + Math.random() * 4),
      vy: Math.sin(a) * (2 + Math.random() * 4),
      r: 3 + Math.random() * 4,
      color,
      life: 1.0
    });
  }
  trimParticles();
}

/* Texte « +X0 » qui monte et s'estompe depuis le point d'impact */
function spawnFloatText(x, y, text, color = '#FFD700') {
  floatTexts.push({ x, y, text, color, life: 1.0 });
}

/* Pluie de confettis multicolores (victoire / nouveau record) */
function spawnConfetti() {
  if (REDUCED_MOTION) return;
  const n = settings.gfxHigh ? 80 : 40;
  for (let i = 0; i < n; i++) {
    particles.push({
      x: Math.random() * W,
      y: -10 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 2,
      vy: 1 + Math.random() * 2.5,
      r: 3 + Math.random() * 3,
      color: BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)],
      life: 1.6
    });
  }
  trimParticles();
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;       // gravité
    p.life -= 0.04;
    p.r *= 0.97;        // rétrécissement
  }
  particles = particles.filter(p => p.life > 0 && p.y < H + 20);

  for (const t of floatTexts) {
    t.y -= 0.8;
    t.life -= 0.02;
  }
  floatTexts = floatTexts.filter(t => t.life > 0);
}

function drawParticles(g) {
  for (const p of particles) {
    g.save();
    g.globalAlpha = Math.min(1, p.life) * 0.9;
    g.beginPath();
    g.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2);
    g.fillStyle = p.color;
    g.fill();
    g.restore();
  }
}

function drawFloatTexts(g) {
  for (const t of floatTexts) {
    g.save();
    g.globalAlpha = Math.min(1, t.life);
    g.font = 'bold 17px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = t.color;
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 4;
    g.fillText(t.text, t.x, t.y);
    g.restore();
  }
}
