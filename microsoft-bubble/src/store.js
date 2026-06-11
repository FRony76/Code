'use strict';
/* ── store.js ─ persistance localStorage : paramètres, scores, progression ── */

const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / mode privé */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
};

const REDUCED_MOTION = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Paramètres utilisateur */
const settings = Object.assign({
  sound: true, music: false, vibrate: true, guide: true, gfxHigh: true
}, Store.get('bubbleSettings', {}));

function saveSettings() { Store.set('bubbleSettings', settings); }

/* Meilleur score (mode Classique) */
function getHi() { return Store.get('bubbleHi', 0); }
function setHi(v) { Store.set('bubbleHi', v); }

/* Progression Aventure : étoiles par niveau */
function getAdvProgress() { return Store.get('bubbleAdv', { stars: {} }); }
function saveAdvProgress(p) { Store.set('bubbleAdv', p); }
function advUnlockedCount() {
  const p = getAdvProgress();
  let maxDone = 0;
  for (const id of Object.keys(p.stars)) maxDone = Math.max(maxDone, +id);
  return maxDone + 1;
}

/* Leaderboard local : 10 entrées max */
function getLeaderboard() { return Store.get('bubbleLB', []); }
function addLeaderboardEntry(name, score, level) {
  const lb = getLeaderboard();
  lb.push({ name, score, level, date: new Date().toISOString().slice(0, 10) });
  lb.sort((a, b) => b.score - a.score);
  lb.length = Math.min(lb.length, 10);
  Store.set('bubbleLB', lb);
}
function leaderboardQualifies(score) {
  const lb = getLeaderboard();
  return score > 0 && (lb.length < 10 || score > lb[lb.length - 1].score);
}

/* Défi du jour : meilleur score par date */
function getDailyBest(dateKey) { return Store.get('bubbleDaily', {})[dateKey] || 0; }
function setDailyBest(dateKey, score) {
  const d = Store.get('bubbleDaily', {});
  if (score > (d[dateKey] || 0)) { d[dateKey] = score; Store.set('bubbleDaily', d); }
}
