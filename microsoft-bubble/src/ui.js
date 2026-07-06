'use strict';
/* ── ui.js ─ overlays DOM : menus, pause, fin de partie, carte, paramètres ── */

const OV = document.getElementById('overlay');
const HUD = document.getElementById('hud');
const hudScore = document.getElementById('hud-score');
const hudMid = document.getElementById('hud-mid');
const hudRight = document.getElementById('hud-right');
const pauseBtn = document.getElementById('pause-btn');

/* Petits constructeurs DOM — textContent uniquement, jamais d'innerHTML */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label, onClick, cls = 'btn') {
  const b = el('button', cls, label);
  b.addEventListener('click', () => { ensureAudio(); onClick(); });
  return b;
}

function clearOverlay() { OV.replaceChildren(); }
function showOverlay() { OV.style.display = 'flex'; }
function hideOverlay() { OV.style.display = 'none'; }

function fmt(n) { return n.toLocaleString('fr-FR'); }

function updateHUD() {
  hudScore.textContent = `Score : ${fmt(score)}`;
  if (mode === 'classic') {
    hudMid.textContent = `Niveau ${level}`;
    hudRight.textContent = `Billes : ${stock}`;
  } else {
    hudMid.textContent = currentLevel ? currentLevel.name : '';
    hudRight.textContent = `Tirs : ${shotsLeft}`;
  }
}

/* ── Menu principal ─────────────────────────────────────────────────────── */
function dailyDone() { return getDailyBest(todayKey()) > 0; }

function showMenu() {
  gameState = 'menu';
  cancelAnimationFrame(rafId);
  stopMusic();
  HUD.hidden = true;
  clearOverlay();

  const h1 = el('h1', 'title');
  h1.append('Microsoft', document.createElement('br'), 'Bubble');
  OV.append(
    h1,
    el('p', 'subtitle', 'Visez, tirez, alignez 3 bulles ou plus de la même couleur pour les faire éclater !'),
    btn('🏆 Classique', startClassic),
    btn('🗺️ Aventure', showAdventureMap),
    btn(dailyDone() ? '📅 Défi du jour ✓' : '📅 Défi du jour', startDaily),
    btn('🥇 Classement', showLeaderboard, 'btn small'),
    btn('⚙️ Paramètres', () => showSettings('menu'), 'btn small'),
    el('p', 'stats',
      `Meilleur score : ${fmt(getHi())} — Niveau max : ${Store.get('bubbleMaxLvl', 1)}`)
  );
  showOverlay();
}

/* ── Carte Aventure ─────────────────────────────────────────────────────── */
function showAdventureMap() {
  clearOverlay();
  OV.append(el('h2', 'h2', '🗺️ Aventure'));
  const map = el('div', 'map');
  const progress = getAdvProgress();
  const unlocked = advUnlockedCount();
  for (const lvl of ADVENTURE_LEVELS) {
    const locked = lvl.id > unlocked;
    const cell = el('button', 'map-cell' + (locked ? ' locked' : ''));
    cell.append(el('span', 'map-num', locked ? '🔒' : String(lvl.id)));
    const st = progress.stars[lvl.id] || 0;
    cell.append(el('span', 'map-stars', '★'.repeat(st) + '☆'.repeat(3 - st)));
    cell.disabled = locked;
    cell.setAttribute('aria-label',
      locked ? `Niveau ${lvl.id} verrouillé` : `Jouer le niveau ${lvl.id} : ${lvl.name}`);
    if (!locked) cell.addEventListener('click', () => { ensureAudio(); startAdventure(lvl.id); });
    map.append(cell);
  }
  OV.append(map, btn('← Retour', showMenu, 'btn small'));
  showOverlay();
}

/* ── Pause ──────────────────────────────────────────────────────────────── */
function showPause() {
  clearOverlay();
  OV.append(
    el('h2', 'h2', '⏸ Pause'),
    el('p', 'big-score', `Score : ${fmt(score)}`),
    el('p', 'best-score', `Meilleur : ${fmt(hiScore)}`),
    btn('▶ Reprendre', resumeGame),
    btn('↻ Recommencer', restartRound),
    btn('⚙️ Paramètres', () => showSettings('pause'), 'btn small'),
    btn('🏠 Menu', showMenu, 'btn small')
  );
  showOverlay();
}

/* ── Fin de partie ──────────────────────────────────────────────────────── */
function showGameOver() {
  HUD.hidden = true;
  clearOverlay();
  OV.append(
    el('h2', 'h2 over', 'Game Over'),
    el('p', 'big-score', `Score : ${fmt(score)}`)
  );
  if (mode === 'classic') OV.append(el('p', 'best-score', `Meilleur : ${fmt(hiScore)}`));
  else OV.append(el('p', 'best-score', 'Plus de tirs ou ligne franchie !'));
  OV.append(btn('↻ Rejouer', restartRound), btn('🏠 Menu', showMenu, 'btn small'));
  showOverlay();
}

function showLevelComplete(starsEarned) {
  HUD.hidden = true;
  clearOverlay();
  OV.append(
    el('h2', 'h2 win', 'Niveau réussi !'),
    el('p', 'stars-big', '★'.repeat(starsEarned) + '☆'.repeat(3 - starsEarned)),
    el('p', 'big-score', `Score : ${fmt(score)}`)
  );
  if (mode === 'adventure' && currentLevel.id < ADVENTURE_LEVELS.length)
    OV.append(btn('Suivant →', () => startAdventure(currentLevel.id + 1)));
  if (mode === 'daily')
    OV.append(el('p', 'best-score', `Meilleur du jour : ${fmt(getDailyBest(todayKey()))}`));
  OV.append(btn('↻ Rejouer', restartRound, 'btn small'), btn('🏠 Menu', showMenu, 'btn small'));
  showOverlay();
}

/* ── Paramètres ─────────────────────────────────────────────────────────── */
function toggleRow(label, key, onChange) {
  const row = el('div', 'set-row');
  row.append(el('span', null, label));
  const b = el('button', 'toggle' + (settings[key] ? ' on' : ''), settings[key] ? 'ON' : 'OFF');
  b.setAttribute('aria-label', `${label} : ${settings[key] ? 'activé' : 'désactivé'}`);
  b.addEventListener('click', () => {
    settings[key] = !settings[key];
    saveSettings();
    b.textContent = settings[key] ? 'ON' : 'OFF';
    b.classList.toggle('on', settings[key]);
    if (onChange) onChange();
  });
  row.append(b);
  return row;
}

function showSettings(backTo) {
  clearOverlay();
  OV.append(el('h2', 'h2', '⚙️ Paramètres'));
  const box = el('div', 'set-box');
  box.append(
    toggleRow('Son', 'sound'),
    toggleRow('Musique', 'music', () => (settings.music ? startMusic() : stopMusic())),
    toggleRow('Vibrations', 'vibrate'),
    toggleRow('Guide de visée', 'guide'),
    toggleRow('Qualité graphique haute', 'gfxHigh')
  );
  OV.append(
    box,
    btn('Réinitialiser la progression', () => {
      Store.remove('bubbleAdv');
      Store.remove('bubbleMaxLvl');
      showSettings(backTo);
    }, 'btn danger small'),
    btn('Effacer les scores', () => {
      Store.remove('bubbleHi');
      Store.remove('bubbleLB');
      Store.remove('bubbleDaily');
      hiScore = 0;
      showSettings(backTo);
    }, 'btn danger small'),
    btn('← Retour', backTo === 'pause' ? showPause : showMenu, 'btn small')
  );
  showOverlay();
}

/* ── Classement ─────────────────────────────────────────────────────────── */
function showLeaderboard() {
  clearOverlay();
  OV.append(el('h2', 'h2', '🥇 Classement'));
  const list = el('div', 'lb');
  const lb = getLeaderboard();
  if (lb.length === 0) list.append(el('p', 'subtitle', 'Aucun score enregistré pour le moment.'));
  lb.forEach((entry, i) => {
    const row = el('div', 'lb-row');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    row.append(
      el('span', 'lb-rank', medal),
      el('span', 'lb-name', entry.name),
      el('span', 'lb-score', fmt(entry.score))
    );
    list.append(row);
  });
  OV.append(list, btn('← Retour', showMenu, 'btn small'));
  showOverlay();
}

/* Saisie du nom quand le score entre dans le top 10 */
function promptName(finalScore, finalLevel, after) {
  clearOverlay();
  OV.append(
    el('h2', 'h2 win', 'Nouveau record !'),
    el('p', 'big-score', `Score : ${fmt(finalScore)}`)
  );
  const input = el('input', 'name-input');
  input.maxLength = 12;
  input.placeholder = 'Votre nom';
  input.setAttribute('aria-label', 'Votre nom pour le classement');
  OV.append(input, btn('Valider', () => {
    addLeaderboardEntry(input.value.trim() || 'Joueur', finalScore, finalLevel);
    after();
  }));
  showOverlay();
  input.focus();
}
