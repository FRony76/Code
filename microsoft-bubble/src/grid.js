'use strict';
/* ── grid.js ─ géométrie de la grille hexagonale et état de la grille ── */

const CV = document.getElementById('c');
const ctx = CV.getContext('2d');
const W = CV.width, H = CV.height;           // 420 × 680

const R = 20;                                 // rayon d'une bulle
const D = R * 2;                              // diamètre
const COLS = 10;                              // bulles par rangée
const ROW_H = R * Math.sqrt(3);               // ≈ 34.64 px entre rangées
const SX = W / 2;                             // centre du lanceur
const SY = H - 70;
const NX = 54;                                // position de l'aperçu « SUIVANT »
const NY = SY;
const SPD = 14;                               // vitesse du projectile (px/frame)
const DLIM = SY - R * 4;                      // ligne de danger

const BASE_COLORS = ['#E74C3C', '#2980B9', '#27AE60', '#F1C40F',
                     '#8E44AD', '#E67E22', '#1ABC9C', '#E91E8C'];

let grid = [];      // grid[i][c] = couleur hex ou null
let topAbs = 0;     // index absolu de grid[0] ; décrémente à chaque descente de rangée

/* Les rangées d'index ABSOLU impair sont décalées de +R vers la droite.
   topAbs garde les positions visuelles stables quand on insère une rangée en haut. */
function absRow(gi) { return gi + topAbs; }
function isOddAbs(gi) { return (((absRow(gi) % 2) + 2) % 2) !== 0; }
function colX(col, gi) { return R + col * D + (isOddAbs(gi) ? R : 0); }
function rowY(gi) { return R + gi * ROW_H; }

function makeRow(palette) {
  return Array.from({ length: COLS },
    () => palette[Math.floor(Math.random() * palette.length)]);
}
function makeGrid(rows, palette) {
  return Array.from({ length: rows }, () => makeRow(palette));
}

function countBubbles() {
  let n = 0;
  for (const row of grid) for (const v of row) if (v !== null) n++;
  return n;
}

function lowestBubbleY() {
  let y = -Infinity;
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] !== null) y = Math.max(y, rowY(r) + R);
  return y;
}
function isTooLow() { return lowestBubbleY() > DLIM; }
