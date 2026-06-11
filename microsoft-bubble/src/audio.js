'use strict';
/* ── audio.js ─ sons synthétiques via Web Audio API, aucun fichier audio ── */

let audioCtx = null;
let musicTimer = null;
let musicStep = 0;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/* Oscillateur simple avec enveloppe exponentielle décroissante */
function tone(freq, dur, type = 'sine', vol = 0.25, when = 0) {
  if (!settings.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur);
}

/* Bruit blanc court (tir) */
function noiseBurst(dur = 0.05, vol = 0.12) {
  if (!settings.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.value = vol;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start();
}

const sfx = {
  shoot() { noiseBurst(0.05, 0.12); },
  /* Hauteur du pop liée à la couleur éclatée */
  pop(colorIndex = 0) { tone(440 + Math.max(0, colorIndex) * 40, 0.18, 'sine', 0.25); },
  combo(n) {
    [523, 659, 784].slice(0, Math.min(3, n))
      .forEach((f, i) => tone(f, 0.15, 'triangle', 0.2, i * 0.06));
  },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.12)); },
  gameOver() { tone(220, 0.5, 'sawtooth', 0.16); tone(147, 0.7, 'sawtooth', 0.16, 0.25); },
  /* Arpège pentatonique */
  powerup() { [392, 440, 523, 587, 659].forEach((f, i) => tone(f, 0.12, 'sine', 0.2, i * 0.05)); }
};

/* Boucle musicale douce : arpège lent, désactivable dans les paramètres */
const MUSIC_NOTES = [262, 330, 392, 330, 294, 370, 440, 370];

function startMusic() {
  stopMusic();
  if (!settings.music) return;
  musicTimer = setInterval(() => {
    if (!settings.music) return;
    tone(MUSIC_NOTES[musicStep % MUSIC_NOTES.length], 0.6, 'sine', 0.05);
    musicStep++;
  }, 750);
}
function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
