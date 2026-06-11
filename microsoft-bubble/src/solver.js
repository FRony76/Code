'use strict';
/* ── solver.js ─ voisins hexagonaux, flood-fill, bulles flottantes, snap ── */

/* Les 6 voisins d'une cellule ; les offsets dépendent de la parité de la rangée absolue */
function neighbours(gi, col) {
  const odd = isOddAbs(gi);
  return [
    [gi - 1, odd ? col : col - 1],
    [gi - 1, odd ? col + 1 : col],
    [gi, col - 1],
    [gi, col + 1],
    [gi + 1, odd ? col : col - 1],
    [gi + 1, odd ? col + 1 : col]
  ].filter(([r, c]) =>
    r >= 0 && r < grid.length && c >= 0 && c < COLS && grid[r][c] !== null);
}

/* Flood-fill itératif : toutes les cellules connectées de la même couleur */
function cluster(gi, col, color) {
  const seen = new Set(), stack = [[gi, col]], res = [];
  while (stack.length) {
    const [r, c] = stack.pop();
    const k = r * 100 + c;
    if (seen.has(k)) continue;
    if (r < 0 || r >= grid.length || c < 0 || c >= COLS) continue;
    if (effectiveColor(grid[r][c]) !== color) continue;
    seen.add(k);
    res.push([r, c]);
    for (const nb of neighbours(r, c)) stack.push(nb);
  }
  return res;
}

/* BFS depuis la rangée 0 : tout ce qui n'est pas atteint est flottant */
function findFloating() {
  const attached = new Set(), queue = [];
  for (let c = 0; c < COLS; c++) {
    if (grid.length > 0 && grid[0][c] !== null) {
      attached.add(c);
      queue.push([0, c]);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [nr, nc] of neighbours(r, c)) {
      const k = nr * 100 + nc;
      if (!attached.has(k)) { attached.add(k); queue.push([nr, nc]); }
    }
  }
  const floating = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] !== null && !attached.has(r * 100 + c)) floating.push([r, c]);
  return floating;
}

/* Cellule vide la plus proche du point d'impact (une rangée virtuelle sous la grille) */
function snapCell(px, py) {
  let bestR = -1, bestC = -1, bestD = Infinity;
  const maxR = grid.length + 1;
  for (let r = 0; r < maxR; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r < grid.length && grid[r][c] !== null) continue;
      const dx = px - colX(c, r), dy = py - rowY(r);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestR = r; bestC = c; }
    }
  }
  return [bestR, bestC];
}
