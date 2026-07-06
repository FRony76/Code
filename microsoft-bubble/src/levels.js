'use strict';
/* ── levels.js ─ niveaux Aventure (50) + Défi du jour, génération déterministe ── */

/* PRNG déterministe pour les niveaux générés et le défi quotidien */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LETTER_COLORS = {
  R: '#E74C3C', B: '#2980B9', G: '#27AE60', Y: '#F1C40F',
  P: '#8E44AD', O: '#E67E22', C: '#1ABC9C', K: '#E91E8C'
};

function rowsFromStrings(strs) {
  return strs.map(s => Array.from(s, ch => (ch === '.' ? null : LETTER_COLORS[ch])));
}

/* Niveaux dessinés à la main (1 à 6), motifs reconnaissables */
const HAND_LEVELS = [
  { name: 'Démarrage en douceur', maxShots: 30, colors: 'RBGY',
    grid: ['RRBGYRRBGY', 'BGRYBGRYBB', 'GYRRGYRRRG', 'YRBBYRBBYR'] },
  { name: 'Damier', maxShots: 28, colors: 'RBGY',
    grid: ['RBRBRBRBRB', 'BRBRBRBRBR', 'GYGYGYGYGY', 'YGYGYGYGYG'] },
  { name: 'Colonnes', maxShots: 26, colors: 'RBGY',
    grid: ['RRBBGGYYRR', 'RRBBGGYYRR', 'RRBBGGYYRR', 'BBGGYYRRBB'] },
  { name: 'La fenêtre', maxShots: 26, colors: 'RBGYP',
    grid: ['PPPPPPPPPP', 'P..RBGY..P', 'P..GYRB..P', 'PPPPPPPPPP'] },
  { name: 'Zigzag', maxShots: 24, colors: 'RBGYP',
    grid: ['RBGYPRBGYP', 'BGYPRBGYPR', 'GYPRBGYPRB', 'YPRBGYPRBG', 'PRBGYPRBGY'] },
  { name: 'Forteresse', maxShots: 24, colors: 'RBGYPO',
    grid: ['OOOOOOOOOO', 'ORBGYRBGYO', 'OGYRBGYRBO', 'OOOOOOOOOO', '..RGBYGR..'] }
];

function buildAdventureLevels() {
  const levels = [];
  const letters = 'RBGYPOCK';
  for (let id = 1; id <= 50; id++) {
    let rows, palette, name, maxShots;
    if (id <= HAND_LEVELS.length) {
      const h = HAND_LEVELS[id - 1];
      rows = rowsFromStrings(h.grid);
      palette = Array.from(h.colors, ch => LETTER_COLORS[ch]);
      name = h.name;
      maxShots = h.maxShots;
    } else {
      /* Niveaux générés de façon déterministe : seed = id */
      const rng = mulberry32(id * 7919);
      const nColors = Math.min(8, 4 + Math.floor((id - 1) / 10));
      palette = Array.from(letters.slice(0, nColors), ch => LETTER_COLORS[ch]);
      const nRows = Math.min(9, 4 + Math.floor((id - 1) / 8));
      const holeP = Math.min(0.25, (id - 6) * 0.01);
      rows = Array.from({ length: nRows }, () =>
        Array.from({ length: COLS },
          () => (rng() < holeP ? null : palette[Math.floor(rng() * palette.length)])));
      /* La rangée 0 doit être pleine pour servir d'ancrage */
      for (let c = 0; c < COLS; c++)
        if (rows[0][c] === null) rows[0][c] = palette[Math.floor(rng() * palette.length)];
      name = `Niveau ${id}`;
      maxShots = Math.max(18, 34 - Math.floor(id / 4) + nRows);
    }
    const bubbles = rows.flat().filter(v => v !== null).length;
    const tier = 1 + Math.floor((id - 1) / 10);   // palier de difficulté pour le score
    const base = bubbles * 10 * tier;
    levels.push({
      id, name, maxShots, palette, rows, tier,
      bonus: 500 * tier,
      stars: [Math.round(base * 0.8), Math.round(base * 1.6), Math.round(base * 2.6)]
    });
  }
  return levels;
}

const ADVENTURE_LEVELS = buildAdventureLevels();

/* Défi du jour : un niveau unique par date, identique pour tout le monde */
function todayKey() { return new Date().toDateString(); }

function dailyLevel() {
  const rng = mulberry32(hashStr(todayKey()));
  const nColors = 5 + Math.floor(rng() * 2);
  const palette = BASE_COLORS.slice(0, nColors);
  const nRows = 6 + Math.floor(rng() * 2);
  const rows = Array.from({ length: nRows }, () =>
    Array.from({ length: COLS },
      () => (rng() < 0.08 ? null : palette[Math.floor(rng() * palette.length)])));
  for (let c = 0; c < COLS; c++)
    if (rows[0][c] === null) rows[0][c] = palette[Math.floor(rng() * palette.length)];
  const bubbles = rows.flat().filter(v => v !== null).length;
  const base = bubbles * 10 * 3;
  return {
    id: 0, name: 'Défi du jour', maxShots: 30 + nRows, palette, rows, tier: 3,
    bonus: 1500,
    stars: [Math.round(base * 0.8), Math.round(base * 1.6), Math.round(base * 2.6)]
  };
}
